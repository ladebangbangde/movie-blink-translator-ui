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
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join(' ')
    .trim();
}

function buildSrtBlocks(lines, intervalSec) {
  const merged = [];
  for (const item of lines) {
    const last = merged[merged.length - 1];
    if (last && last.text === item.text && item.startSec - last.endSec <= 1.1) {
      last.endSec = item.endSec;
      continue;
    }
    merged.push({ ...item });
  }

  return merged.map((item, idx) => {
    const start = formatSrtTime(item.startSec);
    const end = formatSrtTime(Math.max(item.endSec, item.startSec + intervalSec));
    return `${idx + 1}\n${start} --> ${end}\n${item.text}`;
  }).join('\n\n');
}

export async function extractHardSubtitleWithOcr(inputPath, outputPath, options = {}) {
  const intervalSec = options.intervalSec || 2;
  const lang = options.lang || 'chi_sim+eng';
  const onProgress = options.onProgress;

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mbt-ocr-'));
  const framePattern = path.join(tmpDir, 'frame-%06d.png');

  try {
    await runCommand('ffmpeg', [
      '-y',
      '-i', inputPath,
      '-vf', `fps=1/${intervalSec},crop=iw:ih*0.32:0:ih*0.68,scale=1280:-1`,
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
      const { stdout } = await runCommand('tesseract', [framePath, 'stdout', '-l', lang, '--psm', '6']);
      const text = normalizeLine(stdout);
      if (!text) continue;
      lines.push({
        text,
        startSec: i * intervalSec,
        endSec: (i + 1) * intervalSec
      });

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
