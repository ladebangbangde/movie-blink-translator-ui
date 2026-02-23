import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { detectSubtitleStreams } from '../services/ffmpegService.js';
import { ApiError } from '../utils/errors.js';
import { env } from '../config/env.js';

const router = express.Router();

router.post('/detect-subtitles', async (req, res, next) => {
  try {
    const { fileId } = req.body;
    if (!fileId) throw new ApiError('fileId is required', 400);

    const candidates = ['.mkv', '.mp4'].map((ext) => path.join(env.uploadDir, `${fileId}${ext}`));
    const inputPath = candidates.find((candidate) => fs.existsSync(candidate));
    if (!inputPath) throw new ApiError('file not found', 404);

    const streams = await detectSubtitleStreams(inputPath);
    res.json({ streams });
  } catch (err) {
    next(err);
  }
});

export default router;
