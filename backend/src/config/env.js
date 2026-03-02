import 'dotenv/config';
import path from 'node:path';

function asInt(value, fallback) {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function asFloat(value, fallback) {
  const parsed = Number.parseFloat(value ?? '');
  return Number.isNaN(parsed) ? fallback : parsed;
}

const rootStorageDir = process.env.STORAGE_DIR || 'storage';

export const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: asInt(process.env.PORT, 3000),
  // Default to localhost for direct backend runs; docker-compose overrides via REDIS_URL=redis://redis:6379
  redisUrl: process.env.REDIS_URL || 'redis://127.0.0.1:6379',
  uploadDir: path.resolve(process.env.UPLOAD_DIR || `${rootStorageDir}/uploads`),
  outputDir: path.resolve(process.env.OUTPUT_DIR || `${rootStorageDir}/outputs`),
  maxUploadSizeBytes: asInt(process.env.MAX_UPLOAD_SIZE_BYTES, 2 * 1024 * 1024 * 1024),
  workerConcurrency: asInt(process.env.WORKER_CONCURRENCY, 3),
  fileTtlHours: asInt(process.env.FILE_TTL_HOURS, 24),
  ocrLang: process.env.OCR_LANG || 'chi_sim',
  ocrIntervalSec: asFloat(process.env.OCR_INTERVAL_SEC, 0.5),
  ocrMinConfidence: asInt(process.env.OCR_MIN_CONFIDENCE, 60),
  ocrPsm: asInt(process.env.OCR_PSM, 6),
  ocrCropBottomRatio: asFloat(process.env.OCR_CROP_BOTTOM_RATIO, 0.22),
  ocrMinStableFrames: asInt(process.env.OCR_MIN_STABLE_FRAMES, 2),
  ocrMaxGapFrames: asInt(process.env.OCR_MAX_GAP_FRAMES, 1),
  ocrEngine: process.env.OCR_ENGINE || 'tesseract',
  ocrHttpUrl: process.env.OCR_HTTP_URL || '',
  ocrHttpTimeoutMs: asInt(process.env.OCR_HTTP_TIMEOUT_MS, 15000),
  ocrHttpBatchSize: asInt(process.env.OCR_HTTP_BATCH_SIZE, 8),
  demoDurationSec: asInt(process.env.DEMO_DURATION_SEC, 120)
};
