import fs from 'node:fs';
import path from 'node:path';
import { env } from '../config/env.js';

const uploadDir = env.uploadDir;
const outputDir = env.outputDir;

export function getUploadPath(fileId, ext = '') {
  return path.join(uploadDir, `${fileId}${ext}`);
}

export function getOutputPath(jobId, ext = '.srt') {
  return path.join(outputDir, `${jobId}${ext}`);
}

export function ensureWithinStorage(targetPath) {
  const resolved = path.resolve(targetPath);
  const allowedRoots = [path.resolve(uploadDir), path.resolve(outputDir)];
  if (!allowedRoots.some((root) => resolved.startsWith(root))) {
    throw new Error('Invalid storage path');
  }
  return resolved;
}

export function cleanupOlderThanHours(hours = env.fileTtlHours) {
  const ttl = hours * 60 * 60 * 1000;
  for (const dir of [uploadDir, outputDir]) {
    const files = fs.existsSync(dir) ? fs.readdirSync(dir) : [];
    for (const file of files) {
      const fullPath = path.join(dir, file);
      const stat = fs.statSync(fullPath);
      if (Date.now() - stat.mtimeMs > ttl) {
        fs.rmSync(fullPath, { force: true });
      }
    }
  }
}
