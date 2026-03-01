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
  return text
    .replace(/[|`~^_*<>]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isMostlyNoise(text) {
  if (!text) return true;
  const compact = text.replace(/\s+/g, '');
  if (compact.length < 2) return true;

  const usefulMatches = compact.match(/[\p{Script=Han}A-Za-z0-9，。！？、：；“”‘’《》【】（）()\-—]/gu) || [];
  const usefulRatio = usefulMatches.length / compact.length;
  return usefulRatio < 0.5;
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
  if (rows.length <= 1) return '';

  const words = [];
  for (let i = 1; i < rows.length; i += 1) {
    const cols = rows[i].split('\t');
    if (cols.length < 12) continue;
    const conf = Number.parseFloat(cols[10]);
    const text = normalizeLine(cols[11] || '');
    if (!text || Number.isNaN(conf) || conf < minConfidence) continue;
    words.push(text);
  }

  return normalizeLine(words.join(' '));
}

function buildSrtBlocks(lines, minDurationSec) {
  const merged = [];

  for (const item of lines) {
    const text = normalizeLine(item.text);
    if (!text || isMostlyNoise(text)) continue;

    const last = merged[merged.length - 1];
    if (last) {
      const sim = similarity(last.text, text);
      if (sim >= 0.84 && item.startSec - last.endSec <= 1.0) {
        last.endSec = item.endSec;
        if (text.length > last.text.length) last.text = text;
        continue;
      }
    }

    merged.push({ ...item, text });
  }

  return merged
    .map((item, idx) => {
      const start = formatSrtTime(item.startSec);
      const end = formatSrtTime(Math.max(item.endSec, item.startSec + minDurationSec));
      return `${idx + 1}\n${start} --> ${end}\n${item.text}`;
    })
    .join('\n\n');
}

export async function extractHardSubtitleWithOcr(inputPath, outputPath, options = {}) {
  const intervalSec = options.intervalSec || 1.0;
  const lang = options.lang || 'chi_sim+eng';
  const onProgress = options.onProgress;
  const minConfidence = options.minConfidence ?? 60;
  const psm = options.psm || 6;
  const cropBottomRatio = options.cropBottomRatio || 0.35;

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mbt-ocr-'));
  const framePattern = path.join(tmpDir, 'frame-%06d.png');
  const cropExpr = `crop=iw:ih*${cropBottomRatio}:0:ih*(1-${cropBottomRatio})`;

  try {
    await runCommand('ffmpeg', [
      '-y',
      '-i', inputPath,
      '-vf', `fps=1/${intervalSec},${cropExpr},scale=1920:-1,format=gray,eq=contrast=1.35:brightness=0.02,unsharp=5:5:1.0:5:5:0.0`,
      '-q:v', '2',
      framePattern
    ]);

    const frames = fs.readdirSync(tmpDir)
      .filter((f) => f.endsWith('.png'))
      .sort();

    if (frames.length === 0) {
      throw new Error('No frames extracted for OCR');
    }

    const lines = [];
    for (let i = 0; i < frames.length; i += 1) {
      const framePath = path.join(tmpDir, frames[i]);
      const { stdout } = await runCommand('tesseract', [
        framePath,
        'stdout',
        '-l', lang,
        '--psm', String(psm),
        'tsv'
      ]);

      const text = parseTesseractTsv(stdout, minConfidence);
      if (text && !isMostlyNoise(text)) {
        lines.push({
          text,
          startSec: i * intervalSec,
          endSec: (i + 1) * intervalSec
        });
      }

      if (typeof onProgress === 'function') {
        await onProgress(i + 1, frames.length);
      }
    }

    if (lines.length === 0) {
      throw new Error('OCR finished but no subtitle text recognized');
    }

    const srt = buildSrtBlocks(lines, intervalSec);
    fs.writeFileSync(outputPath, srt, 'utf-8');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}
