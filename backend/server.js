import express from 'express';
import cors from 'cors';
import fs from 'node:fs';
import path from 'node:path';

import uploadRouter from './src/controllers/uploadController.js';
import subtitleRouter from './src/controllers/subtitleController.js';
import jobRouter from './src/controllers/jobController.js';

const app = express();
const port = process.env.PORT || 3000;

const uploadDir = path.resolve('storage/uploads');
const outputDir = path.resolve('storage/outputs');
fs.mkdirSync(uploadDir, { recursive: true });
fs.mkdirSync(outputDir, { recursive: true });

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

app.listen(port, () => {
  console.log(`movie-blink-translator backend listening on :${port}`);
});
