import { readFile, writeFile } from 'fs/promises';
import path from 'path';
import { requireRole } from '@/lib/auth';

const CALIB_PATH = path.join(process.cwd(), 'calibration.json');

export async function GET() {
  try {
    const data = await readFile(CALIB_PATH, 'utf-8');
    return Response.json({ calib: JSON.parse(data) });
  } catch {
    return Response.json({ calib: {} });
  }
}

export async function POST(request: Request) {
  // 프로덕션에서는 관리자만 저장 가능 (로컬 개발은 자유)
  if (process.env.NODE_ENV === 'production') {
    const session = await requireRole('admin');
    if (!session) {
      return Response.json({ error: '관리자만 저장할 수 있습니다.' }, { status: 403 });
    }
  }

  const { calib } = await request.json();
  if (typeof calib !== 'object' || calib === null) {
    return Response.json({ error: '잘못된 데이터입니다.' }, { status: 400 });
  }

  // 값 검증
  for (const [fdi, v] of Object.entries(calib as Record<string, { rx: number; ry: number; rz: number; s: number }>)) {
    const n = parseInt(fdi);
    if (isNaN(n) || n < 11 || n > 48) {
      return Response.json({ error: `잘못된 FDI: ${fdi}` }, { status: 400 });
    }
    for (const key of ['rx', 'ry', 'rz', 's'] as const) {
      if (typeof v[key] !== 'number' || !isFinite(v[key])) {
        return Response.json({ error: `잘못된 값: ${fdi}.${key}` }, { status: 400 });
      }
    }
  }

  await writeFile(CALIB_PATH, JSON.stringify(calib, null, 2));
  return Response.json({ ok: true });
}
