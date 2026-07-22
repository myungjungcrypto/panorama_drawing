import { readFile } from 'fs/promises';
import { requireRole, unauthenticated } from '@/lib/auth';
import { getUploadPath } from '@/lib/storage';

const CONTENT_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

export async function GET(request: Request, { params }: { params: Promise<{ filename: string }> }) {
  const session = await requireRole('annotator');
  if (!session) return unauthenticated();

  const { filename } = await params;
  const ext = filename.slice(filename.lastIndexOf('.')).toLowerCase();
  const contentType = CONTENT_TYPES[ext];
  if (!contentType) return Response.json({ error: '잘못된 파일 형식' }, { status: 400 });

  try {
    const data = await readFile(getUploadPath(filename));
    return new Response(new Uint8Array(data), {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'private, max-age=3600',
      },
    });
  } catch {
    return Response.json({ error: '파일을 찾을 수 없습니다.' }, { status: 404 });
  }
}
