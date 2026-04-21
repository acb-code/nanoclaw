import fs from 'fs';
import os from 'os';
import path from 'path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import sharp from 'sharp';

import { resolveAttachmentDir, uniqueFilename } from './dir.js';
import { saveImage, saveRawFile } from './image.js';

async function makeJpeg(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 255, g: 0, b: 0 },
    },
  })
    .jpeg()
    .toBuffer();
}

describe('attachments/dir', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nc-attach-'));
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('returns sources/ when sources directory already exists', () => {
    fs.mkdirSync(path.join(tmp, 'sources'));
    const { absolutePath, name } = resolveAttachmentDir(tmp);
    expect(name).toBe('sources');
    expect(absolutePath).toBe(path.join(tmp, 'sources'));
  });

  it('falls back to attachments/ and creates it when sources is absent', () => {
    const { absolutePath, name } = resolveAttachmentDir(tmp);
    expect(name).toBe('attachments');
    expect(fs.existsSync(absolutePath)).toBe(true);
  });

  it('ignores a sources/ file (not directory) and falls back', () => {
    fs.writeFileSync(path.join(tmp, 'sources'), 'not a dir');
    const { name } = resolveAttachmentDir(tmp);
    expect(name).toBe('attachments');
  });

  it('uniqueFilename returns the desired name when nothing collides', () => {
    expect(uniqueFilename(tmp, 'paper.pdf')).toBe('paper.pdf');
  });

  it('uniqueFilename appends a counter on collision', () => {
    fs.writeFileSync(path.join(tmp, 'paper.pdf'), '');
    fs.writeFileSync(path.join(tmp, 'paper-1.pdf'), '');
    expect(uniqueFilename(tmp, 'paper.pdf')).toBe('paper-2.pdf');
  });

  it('uniqueFilename handles extensionless names', () => {
    fs.writeFileSync(path.join(tmp, 'notes'), '');
    expect(uniqueFilename(tmp, 'notes')).toBe('notes-1');
  });
});

describe('attachments/image — saveImage', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nc-img-'));
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('resizes oversized images to fit within 1024x1024', async () => {
    const huge = await makeJpeg(4000, 3000);
    const { absolutePath, relativePath } = await saveImage(huge, tmp, 'photo');

    expect(relativePath).toBe('attachments/photo.jpg');
    expect(fs.existsSync(absolutePath)).toBe(true);

    const meta = await sharp(absolutePath).metadata();
    expect(meta.width).toBeLessThanOrEqual(1024);
    expect(meta.height).toBeLessThanOrEqual(1024);
  });

  it('does not upscale small images', async () => {
    const small = await makeJpeg(200, 150);
    const { absolutePath } = await saveImage(small, tmp, 'small');

    const meta = await sharp(absolutePath).metadata();
    expect(meta.width).toBe(200);
    expect(meta.height).toBe(150);
  });

  it('writes to sources/ when the wiki convention is active', async () => {
    fs.mkdirSync(path.join(tmp, 'sources'));
    const img = await makeJpeg(100, 100);
    const { relativePath } = await saveImage(img, tmp, 'wiki-photo');
    expect(relativePath).toBe('sources/wiki-photo.jpg');
  });

  it('avoids filename collisions by appending a counter', async () => {
    const img = await makeJpeg(100, 100);
    const first = await saveImage(img, tmp, 'dup');
    const second = await saveImage(img, tmp, 'dup');
    expect(first.relativePath).toBe('attachments/dup.jpg');
    expect(second.relativePath).toBe('attachments/dup-1.jpg');
  });
});

describe('attachments/image — saveRawFile', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nc-raw-'));
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('writes bytes verbatim preserving the filename', () => {
    const data = Buffer.from('hello world');
    const { absolutePath, relativePath } = saveRawFile(data, tmp, 'note.txt');

    expect(relativePath).toBe('attachments/note.txt');
    expect(fs.readFileSync(absolutePath)).toEqual(data);
  });

  it('resolves filename collisions', () => {
    saveRawFile(Buffer.from('a'), tmp, 'report.pdf');
    const second = saveRawFile(Buffer.from('b'), tmp, 'report.pdf');
    expect(second.relativePath).toBe('attachments/report-1.pdf');
  });

  it('prefers sources/ when present', () => {
    fs.mkdirSync(path.join(tmp, 'sources'));
    const { relativePath } = saveRawFile(Buffer.from('x'), tmp, 'paper.pdf');
    expect(relativePath).toBe('sources/paper.pdf');
  });
});
