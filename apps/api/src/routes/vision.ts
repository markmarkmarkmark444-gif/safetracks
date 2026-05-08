import { Router, Request, Response } from 'express';
import multer from 'multer';
import { authenticate } from '../middleware/auth';
import { analyzeMoistureMeter, classifyDamage, extractDocumentCodes } from '../services/vision.service';

export const visionRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max for vision
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only JPEG, PNG, GIF, and WebP images are supported'));
    }
  },
});

visionRouter.use(authenticate);

// POST /api/vision/meter — Moisture meter OCR
visionRouter.post('/meter', upload.single('image'), async (req: Request, res: Response) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No image provided. Send an image as multipart/form-data field "image".' });
  }
  const result = await analyzeMoistureMeter(req.file.buffer, req.file.mimetype);
  res.json(result);
});

// POST /api/vision/damage — IICRC damage classification from photo
visionRouter.post('/damage', upload.single('image'), async (req: Request, res: Response) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No image provided. Send an image as multipart/form-data field "image".' });
  }
  const result = await classifyDamage(req.file.buffer, req.file.mimetype);
  res.json(result);
});

// POST /api/vision/document — Insurance document code extraction
visionRouter.post('/document', upload.single('image'), async (req: Request, res: Response) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No image provided. Send an image as multipart/form-data field "image".' });
  }
  const result = await extractDocumentCodes(req.file.buffer, req.file.mimetype);
  res.json(result);
});
