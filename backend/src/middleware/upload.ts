import { randomUUID } from 'node:crypto';
import path from 'node:path';
import multer from 'multer';
import { BadRequestError } from '../common/errors';
import { assetImageDir } from '../config/uploads';

export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

const ALLOWED: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, assetImageDir),
  // Never trust the client filename: regenerate it from a UUID and the whitelisted extension.
  filename: (_req, file, cb) => cb(null, `${randomUUID()}${ALLOWED[file.mimetype] ?? path.extname(file.originalname)}`),
});

/** Single `image` field; jpeg/png/webp; ≤ 2 MB. Violations surface as 400 INVALID_FILE. */
export const uploadAssetImage = multer({
  storage,
  limits: { fileSize: MAX_IMAGE_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED[file.mimetype]) {
      cb(new BadRequestError('Only JPEG, PNG or WebP images are allowed', 'INVALID_FILE'));
      return;
    }
    cb(null, true);
  },
}).single('image');
