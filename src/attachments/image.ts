import fs from 'fs';
import path from 'path';

import sharp from 'sharp';

import { resolveAttachmentDir, uniqueFilename } from './dir.js';

const MAX_DIMENSION = 1024;

export interface SavedAttachment {
  relativePath: string;
  absolutePath: string;
}

/**
 * Resize a photo to MAX_DIMENSION on its longest side, re-encode as JPEG,
 * and save it under the group's attachment directory. Resizing keeps
 * Claude's image-token cost bounded (full-res phone photos cost thousands
 * of tokens per call; a 1024px JPEG is ~600–800).
 */
export async function saveImage(
  buffer: Buffer,
  groupDir: string,
  baseName: string,
): Promise<SavedAttachment> {
  const resized = await sharp(buffer)
    .resize(MAX_DIMENSION, MAX_DIMENSION, {
      fit: 'inside',
      withoutEnlargement: true,
    })
    .jpeg({ quality: 85 })
    .toBuffer();

  const { absolutePath: dir, name } = resolveAttachmentDir(groupDir);
  const filename = uniqueFilename(dir, `${baseName}.jpg`);
  const absolutePath = path.join(dir, filename);
  fs.writeFileSync(absolutePath, resized);

  return {
    relativePath: `${name}/${filename}`,
    absolutePath,
  };
}

/**
 * Save a raw file to the group's attachment directory without processing.
 * Preserves the original filename; appends a counter on collision.
 */
export function saveRawFile(
  buffer: Buffer,
  groupDir: string,
  desiredName: string,
): SavedAttachment {
  const { absolutePath: dir, name } = resolveAttachmentDir(groupDir);
  const filename = uniqueFilename(dir, desiredName);
  const absolutePath = path.join(dir, filename);
  fs.writeFileSync(absolutePath, buffer);

  return {
    relativePath: `${name}/${filename}`,
    absolutePath,
  };
}
