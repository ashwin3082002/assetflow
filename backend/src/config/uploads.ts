import fs from 'node:fs';
import path from 'node:path';
import { env } from './env';

/** Absolute upload root (served at /uploads) and the asset image subdirectory. */
export const uploadRoot = path.resolve(process.cwd(), env.UPLOAD_DIR);
export const assetImageDir = path.join(uploadRoot, 'assets');

/** Public URL prefix stored in `assets.image_url`. */
export const ASSET_IMAGE_URL_PREFIX = '/uploads/assets/';

export function ensureUploadDirs(): void {
  fs.mkdirSync(assetImageDir, { recursive: true });
}

/** Maps a stored image URL back to its absolute path (only within the asset image dir). */
export function imageUrlToPath(imageUrl: string): string | null {
  if (!imageUrl.startsWith(ASSET_IMAGE_URL_PREFIX)) return null;
  const file = path.basename(imageUrl);
  return path.join(assetImageDir, file);
}

/** Deletes an uploaded image file; missing files are ignored. */
export async function removeImageFile(imageUrl: string | null): Promise<void> {
  if (!imageUrl) return;
  const filePath = imageUrlToPath(imageUrl);
  if (!filePath) return;
  try {
    await fs.promises.unlink(filePath);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
  }
}
