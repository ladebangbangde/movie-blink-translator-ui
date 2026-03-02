import fs from 'node:fs';
import path from 'node:path';
import { Worker } from 'bullmq';
import { connection } from '../queue/subtitleQueue.js';
import { extractSubtitle, composeVideoWithSubtitle, trimVideoForDemo } from '../services/ffmpegService.js';
import { filterAssContent, filterSrtContent } from '../services/subtitleParser.js';
import { cleanupOlderThanHours } from '../services/storageService.js';
import { extractHardSubtitleWithOcr } from '../services/ocrSubtitleService.js';
import { env } from '../config/env.js';

function resolveInputPath(fileId) {
  const candidates = ['.mkv', '.mp4'].map((ext) => path.join(env.uploadDir, `${fileId}${ext}`));
  return candidates.find((candidate) => fs.existsSync(candidate));
}

const worker = new Worker('subtitle-jobs', async (job) => {
  const { fileId, subtitleIndex, mode, source = 'embedded', outputVideo = false, demoMode = false } = job.data;
  let demoClipPath = null;

  try {
    await job.log(`job started: source=${source}, mode=${mode}, outputVideo=${Boolean(outputVideo)}, demoMode=${Boolean(demoMode)}`);

    const inputPath = resolveInputPath(fileId);
    if (!inputPath) {
      throw new Error('Input file not found');
    }

    await job.log(`input resolved: ${inputPath}`);
    let processingInputPath = inputPath;
    if (demoMode) {
      demoClipPath = path.join(env.outputDir, `${job.id}-demo-input.mp4`);
      await job.log(`demo mode enabled: trimming first ${env.demoDurationSec}s`);
      await trimVideoForDemo(inputPath, demoClipPath, env.demoDurationSec);
      processingInputPath = demoClipPath;
      await job.log(`demo clip generated: ${demoClipPath}`);
    }

    cleanupOlderThanHours(env.fileTtlHours);
    await job.updateProgress(10);

    const ext = '.srt';
    const rawOutputPath = path.join(env.outputDir, `${job.id}-raw${ext}`);
    const finalOutputPath = path.join(env.outputDir, `${job.id}${ext}`);

    if (source === 'ocr') {
      await job.log(`ocr started: engine=${env.ocrEngine}, lang=${env.ocrLang}, interval=${env.ocrIntervalSec}s`);
      await extractHardSubtitleWithOcr(processingInputPath, rawOutputPath, {
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
          if (current % 20 === 0 || current === total) {
            await job.log(`ocr progress: ${current}/${total}`);
          }
        }
      });
      await job.log(`ocr output generated: ${rawOutputPath}`);
    } else {
      await job.log(`embedded extraction started: subtitleIndex=${subtitleIndex}`);
      await extractSubtitle(processingInputPath, subtitleIndex, rawOutputPath);
      await job.updateProgress(70);
      await job.log(`embedded subtitle extracted: ${rawOutputPath}`);
    }

    await job.updateProgress(70);

    const rawContent = fs.readFileSync(rawOutputPath, 'utf-8');
    const filtered = ext === '.ass' ? filterAssContent(rawContent, mode) : filterSrtContent(rawContent, mode);
    fs.writeFileSync(finalOutputPath, filtered, 'utf-8');
    fs.rmSync(rawOutputPath, { force: true });
    await job.log(`subtitle filtered and saved: ${finalOutputPath}`);

    let outputVideoPath = null;
    if (outputVideo) {
      outputVideoPath = path.join(env.outputDir, `${job.id}.mkv`);
      await job.log('video composition started');
      await composeVideoWithSubtitle(processingInputPath, finalOutputPath, outputVideoPath);
      await job.log(`video composition completed: ${outputVideoPath}`);
    }

    await job.updateProgress(100);
    await job.log('job completed');
    if (demoClipPath) fs.rmSync(demoClipPath, { force: true });
    return { output: finalOutputPath, outputVideo: outputVideoPath, source, demoMode: Boolean(demoMode), demoDurationSec: env.demoDurationSec };
  } catch (err) {
    await job.log(`job failed: ${err.message}`);
    if (typeof demoClipPath !== 'undefined' && demoClipPath) fs.rmSync(demoClipPath, { force: true });
    throw err;
  }
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
