import express from 'express';
import multer from 'multer';
import path from 'node:path';
import { v4 as uuidv4 } from 'uuid';
import { ApiError } from '../utils/errors.js';

const allowedExtensions = new Set(['.mkv', '.mp4']);

const storage = multer.diskStorage({
  destination: 'storage/uploads',
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${uuidv4()}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!allowedExtensions.has(ext)) {
      cb(new ApiError('Only MKV / MP4 are supported', 400));
      return;
    }
    cb(null, true);
  }
});

const router = express.Router();

router.post('/upload', upload.single('file'), (req, res) => {
  if (!req.file) {
    throw new ApiError('file is required', 400);
  }
  const ext = path.extname(req.file.filename);
  const fileId = path.basename(req.file.filename, ext);
  res.json({ fileId, filename: req.file.originalname });
});

export default router;
