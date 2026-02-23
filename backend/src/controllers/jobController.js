import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import mime from 'mime-types';
import { subtitleQueue } from '../queue/subtitleQueue.js';
import { ApiError } from '../utils/errors.js';
import { env } from '../config/env.js';

const router = express.Router();

router.post('/jobs', async (req, res, next) => {
  try {
    const { fileId, subtitleIndex, mode = 'both' } = req.body;
    if (!fileId && fileId !== 0) throw new ApiError('fileId is required', 400);
    if (typeof subtitleIndex !== 'number') throw new ApiError('subtitleIndex must be a number', 400);
    if (!['zh', 'en', 'both'].includes(mode)) throw new ApiError('invalid mode', 400);

    const job = await subtitleQueue.add('subtitle-process', {
      fileId,
      subtitleIndex,
      mode
    }, {
      removeOnComplete: 50,
      removeOnFail: 50
    });

    res.json({ jobId: job.id, status: 'pending' });
  } catch (err) {
    next(err);
  }
});

router.get('/jobs/:jobId', async (req, res, next) => {
  try {
    const job = await subtitleQueue.getJob(req.params.jobId);
    if (!job) throw new ApiError('job not found', 404);

    const state = await job.getState();
    const progress = typeof job.progress === 'number' ? job.progress : 0;
    res.json({ status: state, progress });
  } catch (err) {
    next(err);
  }
});

router.get('/download/:jobId', async (req, res, next) => {
  try {
    const jobId = req.params.jobId;
    const candidates = ['.srt', '.ass'].map((ext) => path.join(env.outputDir, `${jobId}${ext}`));
    const outputPath = candidates.find((candidate) => fs.existsSync(candidate));
    if (!outputPath) throw new ApiError('file not found', 404);

    const type = mime.lookup(outputPath) || 'application/octet-stream';
    res.setHeader('Content-Type', type);
    res.download(outputPath);
  } catch (err) {
    next(err);
  }
});

export default router;
