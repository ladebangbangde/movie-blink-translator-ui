import 'dotenv/config';
import path from 'node:path';

function asInt(value, fallback) {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

const rootStorageDir = process.env.STORAGE_DIR || 'storage';

export const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: asInt(process.env.PORT, 3000),
  redisUrl: process.env.REDIS_URL || 'redis://127.0.0.1:6379',
  uploadDir: path.resolve(process.env.UPLOAD_DIR || `${rootStorageDir}/uploads`),
  outputDir: path.resolve(process.env.OUTPUT_DIR || `${rootStorageDir}/outputs`),
  maxUploadSizeBytes: asInt(process.env.MAX_UPLOAD_SIZE_BYTES, 2 * 1024 * 1024 * 1024),
  workerConcurrency: asInt(process.env.WORKER_CONCURRENCY, 3),
  fileTtlHours: asInt(process.env.FILE_TTL_HOURS, 24)
};
