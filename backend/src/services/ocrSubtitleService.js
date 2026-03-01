import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

function runCommand(bin, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args);
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (buf) => { stdout += buf.toString(); });
    child.stderr.on('data', (buf) => { stderr += buf.toString(); });
    child.on('close', (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${bin} failed: ${stderr}`));
    });
  });
}

function formatSrtTime(sec) {
  const s = Math.max(0, sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = Math.floor(s % 60);
  const ms = Math.floor((s - Math.floor(s)) * 1000);
  const pad = (n, w = 2) => String(n).padStart(w, '0');
  return `${pad(h)}:${pad(m)}:${pad(ss)},${pad(ms, 3)}`;
}

function normalizeLine(text) {
  return String(text || '')
    .replace(/[|`~^_*<>]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .trim();
}

function isMostlyNoise(text) {
  if (!text) return true;
  const compact = text.replace(/\s+/g, '');
  if (compact.length < 2) return true;

  const usefulMatches = compact.match(/[\p{Script=Han}A-Za-z0-9，。！？、：；“”‘’《》【】（）()\-—]/gu) || [];
  const usefulRatio = usefulMatches.length / compact.length;
  return usefulRatio < 0.6;
}

function similarity(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const la = a.length;
  const lb = b.length;
  const dp = Array.from({ length: la + 1 }, () => new Array(lb + 1).fill(0));

  for (let i = 0; i <= la; i += 1) dp[i][0] = i;
  for (let j = 0; j <= lb; j += 1) dp[0][j] = j;

  for (let i = 1; i <= la; i += 1) {
    for (let j = 1; j <= lb; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }

  const dist = dp[la][lb];
  return 1 - dist / Math.max(la, lb);
}

function parseTesseractTsv(tsv, minConfidence) {
  const rows = tsv.trim().split(/\r?\n/);
  if (rows.length <= 1) return { text: '', confidence: 0 };

  const words = [];
  let confSum = 0;
  let confCount = 0;

  for (let i = 1; i < rows.length; i += 1) {
    const cols = rows[i].split('\t');
    if (cols.length < 12) continue;

    const conf = Number.parseFloat(cols[10]);
    const rawText = cols[11] || '';
    const text = normalizeLine(rawText);
    if (!text || Number.isNaN(conf)) continue;

    if (conf >= minConfidence) {
      words.push(text);
      confSum += conf;
      confCount += 1;
    }
  }

  const merged = normalizeLine(words.join(' '));
  const confidence = confCount > 0 ? confSum / confCount : 0;
  return { text: merged, confidence };
}

function chooseBestCandidate(candidates) {
  const valid = candidates.filter((it) => it.text && !isMostlyNoise(it.text));
  if (valid.length === 0) return { text: '', confidence: 0 };
  valid.sort((a, b) => {
    if (b.confidence !== a.confidence) return b.confidence - a.confidence;
    return b.text.length - a.text.length;
  });
  return valid[0];
}

function smoothFrameTexts(frames) {
  if (frames.length < 3) return frames;
  const out = [...frames];
  for (let i = 1; i < frames.length - 1; i += 1) {
    const prev = frames[i - 1].text;
    const cur = frames[i].text;
    const next = frames[i + 1].text;
    if (!prev || !next) continue;
    if (similarity(prev, next) > 0.9 && similarity(cur, prev) < 0.6) {
      out[i] = { ...out[i], text: prev, confidence: (frames[i - 1].confidence + frames[i + 1].confidence) / 2 };
    }
  }
  return out;
}

function buildSegmentsFromFrames(frames, fps, options) {
  const minStableFrames = options.minStableFrames || Math.max(2, Math.round(fps * 0.35));
  const maxGapFrames = options.maxGapFrames || Math.max(1, Math.round(fps * 0.25));

  const segments = [];
  let current = null;

  for (let i = 0; i < frames.length; i += 1) {
    const item = frames[i];
    const text = item.text;

    if (!text) {
      if (current) {
        current.gapFrames += 1;
        if (current.gapFrames > maxGapFrames) {
          if (current.frameCount >= minStableFrames) segments.push(current);
          current = null;
        }
      }
      continue;
    }

    if (!current) {
      current = {
        text,
        startFrame: i,
        endFrame: i,
        frameCount: 1,
        gapFrames: 0
      };
      continue;
    }

    const sim = similarity(current.text, text);
    if (sim >= 0.82) {
      current.endFrame = i;
      current.frameCount += 1;
      current.gapFrames = 0;
      if (text.length > current.text.length) current.text = text;
    } else {
      if (current.frameCount >= minStableFrames) segments.push(current);
      current = {
        text,
        startFrame: i,
        endFrame: i,
        frameCount: 1,
        gapFrames: 0
      };
    }
  }

  if (current && current.frameCount >= minStableFrames) segments.push(current);

  return segments.map((seg) => ({
    text: seg.text,
    startSec: seg.startFrame / fps,
    endSec: (seg.endFrame + 1) / fps
  }));
}

function buildSrtBlocks(lines, minDurationSec) {
  return lines
    .map((item, idx) => {
      const start = formatSrtTime(item.startSec);
      const end = formatSrtTime(Math.max(item.endSec, item.startSec + minDurationSec));
      return `${idx + 1}\n${start} --> ${end}\n${item.text}`;
    })
    .join('\n\n');
}

async function recognizeFrameWithTesseract(framePath, { lang, psm, minConfidence }) {
  const candidates = [];
  for (const currentPsm of new Set([psm, 7])) {
    const { stdout } = await runCommand('tesseract', [
      framePath,
      'stdout',
      '-l', lang,
      '--psm', String(currentPsm),
      'tsv'
    ]);
    candidates.push(parseTesseractTsv(stdout, minConfidence));
  }
  return chooseBestCandidate(candidates);
}

async function recognizeFramesWithHttpEngine(framePaths, options) {
  const {
    ocrHttpUrl,
    ocrHttpTimeoutMs,
    ocrHttpBatchSize,
    lang,
    minConfidence,
    psm
  } = options;

  if (!ocrHttpUrl) {
    throw new Error('OCR_ENGINE=http requires OCR_HTTP_URL');
  }

  const frameResults = [];

  for (let i = 0; i < framePaths.length; i += ocrHttpBatchSize) {
    const batch = framePaths.slice(i, i + ocrHttpBatchSize);
    const images = batch.map((filePath) => fs.readFileSync(filePath).toString('base64'));

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ocrHttpTimeoutMs);

    let data;
    try {
      const response = await fetch(ocrHttpUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          images,
          lang,
          minConfidence,
          psm
        }),
        signal: controller.signal
      });
      if (!response.ok) {
        throw new Error(`OCR HTTP engine returned ${response.status}`);
      }
      data = await response.json();
    } finally {
      clearTimeout(timer);
    }

    const results = Array.isArray(data) ? data : data.results;
    if (!Array.isArray(results) || results.length !== batch.length) {
      throw new Error('OCR HTTP engine response size mismatch');
    }

    for (const item of results) {
      frameResults.push({
        text: normalizeLine(item?.text || ''),
        confidence: Number.isFinite(item?.confidence) ? Number(item.confidence) : 0
      });
    }
  }

  return frameResults;
}

export async function extractHardSubtitleWithOcr(inputPath, outputPath, options = {}) {
  const intervalSec = options.intervalSec || 0.5;
  const fps = 1 / intervalSec;
  const lang = options.lang || 'chi_sim';
  const onProgress = options.onProgress;
  const minConfidence = options.minConfidence ?? 60;
  const psm = options.psm || 6;
  const cropBottomRatio = options.cropBottomRatio || 0.22;
  const ocrEngine = options.ocrEngine || 'tesseract';
  const ocrHttpUrl = options.ocrHttpUrl || '';
  const ocrHttpTimeoutMs = options.ocrHttpTimeoutMs || 15000;
  const ocrHttpBatchSize = options.ocrHttpBatchSize || 8;

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mbt-ocr-'));
  const framePattern = path.join(tmpDir, 'frame-%06d.png');
  const cropExpr = `crop=iw:ih*${cropBottomRatio}:0:ih*(1-${cropBottomRatio})`;

  try {
    await runCommand('ffmpeg', [
      '-y',
      '-i', inputPath,
      '-vf', `fps=${fps},${cropExpr},scale=1920:-1,format=gray,eq=contrast=1.45:brightness=0.03,unsharp=7:7:1.2:7:7:0.0`,
      '-q:v', '2',
      framePattern
    ]);

    const frames = fs.readdirSync(tmpDir)
      .filter((f) => f.endsWith('.png'))
      .sort()
      .map((f) => path.join(tmpDir, f));

    if (frames.length === 0) {
      throw new Error('No frames extracted for OCR');
    }

    let frameTexts = [];
    if (ocrEngine === 'http') {
      frameTexts = await recognizeFramesWithHttpEngine(frames, {
        ocrHttpUrl,
        ocrHttpTimeoutMs,
        ocrHttpBatchSize,
        lang,
        minConfidence,
        psm
      });
      for (let i = 0; i < frames.length; i += 1) {
        if (typeof onProgress === 'function') await onProgress(i + 1, frames.length);
      }
    } else {
      for (let i = 0; i < frames.length; i += 1) {
        const best = await recognizeFrameWithTesseract(frames[i], { lang, psm, minConfidence });
        frameTexts.push(best);
        if (typeof onProgress === 'function') await onProgress(i + 1, frames.length);
      }
    }

    const smoothed = smoothFrameTexts(frameTexts);
    const segments = buildSegmentsFromFrames(smoothed, fps, {
      minStableFrames: options.minStableFrames,
      maxGapFrames: options.maxGapFrames
    });

    if (segments.length === 0) {
      throw new Error('OCR finished but no stable subtitle text recognized');
    }

    const srt = buildSrtBlocks(segments, intervalSec);
    fs.writeFileSync(outputPath, srt, 'utf-8');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}
