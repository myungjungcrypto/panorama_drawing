import 'server-only';
import { mkdir, writeFile } from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads');

const ALLOWED_TYPES: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

const MAX_SIZE = 15 * 1024 * 1024; // 15MB

export async function savePanoramaFile(file: File): Promise<string> {
  const ext = ALLOWED_TYPES[file.type];
  if (!ext) throw new Error('JPEG, PNG, WebP 이미지만 업로드할 수 있습니다.');
  if (file.size > MAX_SIZE) throw new Error('파일 크기는 15MB 이하여야 합니다.');

  await mkdir(UPLOAD_DIR, { recursive: true });

  const filename = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(path.join(UPLOAD_DIR, filename), buffer);

  return filename;
}

export function getUploadPath(filename: string): string {
  // 경로 조작 방지
  const safe = path.basename(filename);
  return path.join(UPLOAD_DIR, safe);
}
