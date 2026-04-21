import type { Api } from 'grammy';

// Telegram's Bot API caps file downloads at 20 MB. Larger files return
// "file is too big" from getFile. Use this to decide whether to attempt
// a download or bail early with a user-facing error.
export const TELEGRAM_MAX_DOWNLOAD_BYTES = 20 * 1024 * 1024;

export class TelegramFileTooLargeError extends Error {
  readonly size: number;
  constructor(size: number) {
    super(
      `Telegram file is ${formatBytes(size)} — exceeds ${formatBytes(TELEGRAM_MAX_DOWNLOAD_BYTES)} Bot API cap`,
    );
    this.name = 'TelegramFileTooLargeError';
    this.size = size;
  }
}

export interface DownloadedTelegramFile {
  buffer: Buffer;
  fileSize: number;
  filePath: string;
}

/**
 * Download a Telegram file by file_id via the Bot API two-step flow:
 * 1. getFile(file_id) → File with file_path and file_size
 * 2. GET https://api.telegram.org/file/bot<token>/<file_path> → bytes
 *
 * Size is checked before the GET; files over the Bot API cap throw
 * TelegramFileTooLargeError so callers can surface a clear error to
 * the user instead of silently failing.
 */
export async function downloadTelegramFile(
  api: Api,
  botToken: string,
  fileId: string,
): Promise<DownloadedTelegramFile> {
  const file = await api.getFile(fileId);
  const size = file.file_size ?? 0;
  if (size > TELEGRAM_MAX_DOWNLOAD_BYTES) {
    throw new TelegramFileTooLargeError(size);
  }
  if (!file.file_path) {
    throw new Error('Telegram getFile() returned no file_path');
  }
  const url = `https://api.telegram.org/file/bot${botToken}/${file.file_path}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(
      `Telegram file download failed: ${res.status} ${res.statusText}`,
    );
  }
  const arrayBuffer = await res.arrayBuffer();
  return {
    buffer: Buffer.from(arrayBuffer),
    fileSize: size,
    filePath: file.file_path,
  };
}

export function formatBytes(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) return `${mb.toFixed(1)} MB`;
  const kb = bytes / 1024;
  return `${kb.toFixed(0)} KB`;
}
