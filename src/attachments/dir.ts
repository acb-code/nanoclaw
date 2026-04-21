import fs from 'fs';
import path from 'path';

export type AttachmentDirName = 'sources' | 'attachments';

export interface ResolvedAttachmentDir {
  absolutePath: string;
  name: AttachmentDirName;
}

/**
 * Pick where downloaded attachments should land inside a group folder.
 *
 * Wiki groups (per the Karpathy LLM-Wiki pattern) keep curated source
 * material in `sources/` — durable, not ephemeral. Regular groups use
 * `attachments/` as a general drop zone. This picks `sources/` when the
 * wiki convention is in effect (the directory already exists) so photos
 * and documents become wiki sources automatically, and falls back to
 * `attachments/` otherwise (creating it on demand).
 */
export function resolveAttachmentDir(groupDir: string): ResolvedAttachmentDir {
  const sources = path.join(groupDir, 'sources');
  if (fs.existsSync(sources) && fs.statSync(sources).isDirectory()) {
    return { absolutePath: sources, name: 'sources' };
  }
  const attachments = path.join(groupDir, 'attachments');
  fs.mkdirSync(attachments, { recursive: true });
  return { absolutePath: attachments, name: 'attachments' };
}

/**
 * Resolve a collision-free path inside `dir` for `desiredName` by
 * appending `-1`, `-2`, … to the stem until no file exists.
 */
export function uniqueFilename(dir: string, desiredName: string): string {
  const ext = path.extname(desiredName);
  const stem = path.basename(desiredName, ext);
  let filename = desiredName;
  let counter = 1;
  while (fs.existsSync(path.join(dir, filename))) {
    filename = `${stem}-${counter}${ext}`;
    counter++;
  }
  return filename;
}
