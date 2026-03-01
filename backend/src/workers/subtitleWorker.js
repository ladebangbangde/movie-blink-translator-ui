import fs from 'node:fs';
import path from 'node:path';
import { Worker } from 'bullmq';
import { connection } from '../queue/subtitleQueue.js';
import { extractSubtitle, composeVideoWithSubtitle } from '../services/ffmpegService.js';
import { filterAssContent, filterSrtContent } from '../services/subtitleParser.js';
import { cleanupOlderThanHours } from '../services/storageService.js';
import { extractHardSubtitleWithOcr } from '../services/ocrSubtitleService.js';
import { env } from '../config/env.js';

function resolveInputPath(fileId) {
  const candidates = ['.mkv', '.mp4'].map((ext) => path.join(env.uploadDir, `${fileId}${ext}`));
  return candidates.find((candidate) => fs.existsSync(candidate));
}

const worker = new Worker('subtitle-jobs', async (job) => {
  const { fileId, subtitleIndex, mode, source = 'embedded', outputVideo = false } = job.data;
  const inputPath = resolveInputPath(fileId);
  if (!inputPath) {
    throw new Error('Input file not found');
  }

  cleanupOlderThanHours(env.fileTtlHours);
  await job.updateProgress(10);

  const ext = '.srt';
  const rawOutputPath = path.join(env.outputDir, `${job.id}-raw${ext}`);
  const finalOutputPath = path.join(env.outputDir, `${job.id}${ext}`);

  if (source === 'ocr') {
    await extractHardSubtitleWithOcr(inputPath, rawOutputPath, {
      intervalSec: env.ocrIntervalSec,
      lang: env.ocrLang,
      minConfidence: env.ocrMinConfidence,
      psm: env.ocrPsm,
      cropBottomRatio: env.ocrCropBottomRatio,
      minStableFrames: env.ocrMinStableFrames,
      maxGapFrames: env.ocrMaxGapFrames,
      ocrEngine: env.ocrEngine,
      ocrHttpUrl: env.ocrHttpUrl,
      ocrHttpTimeoutMs: env.ocrHttpTimeoutMs,
      ocrHttpBatchSize: env.ocrHttpBatchSize,
      onProgress: async (current, total) => {
        const ocrProgress = 10 + Math.floor((current / total) * 60);
        await job.updateProgress(Math.min(70, ocrProgress));
      }
    });
  } else {
    await extractSubtitle(inputPath, subtitleIndex, rawOutputPath);
    await job.updateProgress(70);
  }

  await job.updateProgress(70);

  const rawContent = fs.readFileSync(rawOutputPath, 'utf-8');
  const filtered = ext === '.ass' ? filterAssContent(rawContent, mode) : filterSrtContent(rawContent, mode);
  fs.writeFileSync(finalOutputPath, filtered, 'utf-8');
  fs.rmSync(rawOutputPath, { force: true });

  let outputVideoPath = null;
  if (outputVideo) {
    outputVideoPath = path.join(env.outputDir, `${job.id}.mkv`);
    await composeVideoWithSubtitle(inputPath, finalOutputPath, outputVideoPath);
  }

  await job.updateProgress(100);
  return { output: finalOutputPath, outputVideo: outputVideoPath, source };
}, {
  connection,
  concurrency: env.workerConcurrency
});

worker.on('completed', (job) => {
  console.log(`job ${job.id} completed`);
});

worker.on('failed', (job, err) => {
  console.error(`job ${job?.id} failed`, err);
});

console.log('subtitle worker started');
