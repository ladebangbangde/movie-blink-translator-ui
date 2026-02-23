import express from 'express';
import cors from 'cors';
import fs from 'node:fs';

import uploadRouter from './src/controllers/uploadController.js';
import subtitleRouter from './src/controllers/subtitleController.js';
import jobRouter from './src/controllers/jobController.js';
import { env } from './src/config/env.js';

const app = express();

fs.mkdirSync(env.uploadDir, { recursive: true });
fs.mkdirSync(env.outputDir, { recursive: true });

app.use(cors());
app.use(express.json({ limit: '2mb' }));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api', uploadRouter);
app.use('/api', subtitleRouter);
app.use('/api', jobRouter);

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(err.status || 500).json({
    message: err.message || 'Internal server error'
  });
});

app.listen(env.port, () => {
  console.log(`movie-blink-translator backend listening on :${env.port}`);
});
