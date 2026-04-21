import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  downloadTelegramFile,
  formatBytes,
  TELEGRAM_MAX_DOWNLOAD_BYTES,
  TelegramFileTooLargeError,
} from './telegram-download.js';

function mockApi(file: { file_path?: string; file_size?: number }) {
  return { getFile: vi.fn().mockResolvedValue(file) } as any;
}

describe('telegram-download', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('downloads a small file and returns its buffer', async () => {
    const api = mockApi({ file_path: 'documents/file.pdf', file_size: 1024 });
    (globalThis.fetch as any).mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      arrayBuffer: async () => new Uint8Array([1, 2, 3, 4]).buffer,
    });

    const result = await downloadTelegramFile(api, 'TOKEN', 'FILE-ID');

    expect(api.getFile).toHaveBeenCalledWith('FILE-ID');
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://api.telegram.org/file/botTOKEN/documents/file.pdf',
    );
    expect(result.buffer).toEqual(Buffer.from([1, 2, 3, 4]));
    expect(result.fileSize).toBe(1024);
    expect(result.filePath).toBe('documents/file.pdf');
  });

  it('throws TelegramFileTooLargeError before attempting fetch when file exceeds the cap', async () => {
    const oversize = TELEGRAM_MAX_DOWNLOAD_BYTES + 1;
    const api = mockApi({ file_path: 'x', file_size: oversize });

    await expect(
      downloadTelegramFile(api, 'TOKEN', 'FILE-ID'),
    ).rejects.toBeInstanceOf(TelegramFileTooLargeError);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('throws when getFile returns no file_path', async () => {
    const api = mockApi({ file_size: 100 });

    await expect(
      downloadTelegramFile(api, 'TOKEN', 'FILE-ID'),
    ).rejects.toThrow(/no file_path/);
  });

  it('throws when fetch returns a non-ok response', async () => {
    const api = mockApi({ file_path: 'x', file_size: 100 });
    (globalThis.fetch as any).mockResolvedValue({
      ok: false,
      status: 404,
      statusText: 'Not Found',
    });

    await expect(
      downloadTelegramFile(api, 'TOKEN', 'FILE-ID'),
    ).rejects.toThrow(/404 Not Found/);
  });

  it('treats missing file_size as zero (under cap)', async () => {
    const api = mockApi({ file_path: 'x' });
    (globalThis.fetch as any).mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      arrayBuffer: async () => new ArrayBuffer(0),
    });

    const result = await downloadTelegramFile(api, 'TOKEN', 'FILE-ID');
    expect(result.fileSize).toBe(0);
  });
});

describe('formatBytes', () => {
  it('formats bytes as MB for sizes >= 1 MB', () => {
    expect(formatBytes(2 * 1024 * 1024)).toBe('2.0 MB');
    expect(formatBytes(20 * 1024 * 1024)).toBe('20.0 MB');
  });

  it('formats bytes as KB for sizes < 1 MB', () => {
    expect(formatBytes(512 * 1024)).toBe('512 KB');
  });
});
