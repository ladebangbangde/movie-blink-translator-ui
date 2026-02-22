import fs from 'node:fs';
import path from 'node:path';
import { Worker } from 'bullmq';
import { connection } from '../queue/subtitleQueue.js';
import { extractSubtitle } from '../services/ffmpegService.js';
import { filterAssContent, filterSrtContent } from '../services/subtitleParser.js';
import { cleanupOlderThanHours } from '../services/storageService.js';

function resolveInputPath(fileId) {
  const candidates = ['.mkv', '.mp4'].map((ext) => path.resolve(`storage/uploads/${fileId}${ext}`));
  return candidates.find((candidate) => fs.existsSync(candidate));
}

const worker = new Worker('subtitle-jobs', async (job) => {
  const { fileId, subtitleIndex, mode } = job.data;
  const inputPath = resolveInputPath(fileId);
  if (!inputPath) {
    throw new Error('Input file not found');
  }

  cleanupOlderThanHours(24);
  await job.updateProgress(10);

  const ext = '.srt';
  const rawOutputPath = path.resolve(`storage/outputs/${job.id}-raw${ext}`);
  const finalOutputPath = path.resolve(`storage/outputs/${job.id}${ext}`);

  await extractSubtitle(inputPath, subtitleIndex, rawOutputPath);
  await job.updateProgress(70);

  const rawContent = fs.readFileSync(rawOutputPath, 'utf-8');
  const filtered = ext === '.ass' ? filterAssContent(rawContent, mode) : filterSrtContent(rawContent, mode);
  fs.writeFileSync(finalOutputPath, filtered, 'utf-8');
  fs.rmSync(rawOutputPath, { force: true });

  await job.updateProgress(100);
  return { output: finalOutputPath };
}, {
  connection,
  concurrency: 3
});

worker.on('completed', (job) => {
  console.log(`job ${job.id} completed`);
});

worker.on('failed', (job, err) => {
  console.error(`job ${job?.id} failed`, err);
});

console.log('subtitle worker started');
