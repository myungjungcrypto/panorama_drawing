import crypto from 'crypto';
import { prisma } from '@/lib/db';
import { requireRole, unauthenticated, unauthorized } from '@/lib/auth';

// 환자용 공유 링크 생성/갱신
export async function POST(request: Request, { params }: { params: Promise<{ caseId: string }> }) {
  const session = await requireRole('annotator');
  if (!session) return unauthenticated();

  const { caseId } = await params;
  const c = await prisma.case.findUnique({
    where: { id: caseId },
    include: { panoramas: { select: { annotStatus: true } } },
  });
  if (!c) return Response.json({ error: '케이스를 찾을 수 없습니다.' }, { status: 404 });
  if (c.userId !== session.userId && session.role !== 'admin') return unauthorized();
  if (!c.panoramas.some((p) => p.annotStatus === 'done')) {
    return Response.json({ error: '어노테이션 완료 후 공유할 수 있습니다.' }, { status: 400 });
  }

  const token = crypto.randomBytes(16).toString('hex');
  await prisma.case.update({ where: { id: caseId }, data: { shareToken: token } });

  return Response.json({ ok: true, shareToken: token });
}

// 공유 해제
export async function DELETE(request: Request, { params }: { params: Promise<{ caseId: string }> }) {
  const session = await requireRole('annotator');
  if (!session) return unauthenticated();

  const { caseId } = await params;
  const c = await prisma.case.findUnique({ where: { id: caseId } });
  if (!c) return Response.json({ error: '케이스를 찾을 수 없습니다.' }, { status: 404 });
  if (c.userId !== session.userId && session.role !== 'admin') return unauthorized();

  await prisma.case.update({ where: { id: caseId }, data: { shareToken: null } });
  return Response.json({ ok: true });
}
