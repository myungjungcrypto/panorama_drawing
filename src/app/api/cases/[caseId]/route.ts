import { prisma } from '@/lib/db';
import { requireRole, unauthenticated, unauthorized } from '@/lib/auth';

async function findAccessibleCase(caseId: string, session: { userId: string; role: string }) {
  const c = await prisma.case.findUnique({
    where: { id: caseId },
    include: {
      user: { select: { name: true } },
      panoramas: { orderBy: { createdAt: 'asc' } },
      treatmentLabels: { orderBy: { fdi: 'asc' } },
    },
  });
  if (!c) return null;
  if (session.role !== 'admin' && c.userId !== session.userId) return 'forbidden';
  return c;
}

export async function GET(request: Request, { params }: { params: Promise<{ caseId: string }> }) {
  const session = await requireRole('annotator');
  if (!session) return unauthenticated();

  const { caseId } = await params;
  const result = await findAccessibleCase(caseId, session);
  if (!result) return Response.json({ error: '케이스를 찾을 수 없습니다.' }, { status: 404 });
  if (result === 'forbidden') return unauthorized();

  return Response.json({ case: result });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ caseId: string }> }) {
  const session = await requireRole('annotator');
  if (!session) return unauthenticated();

  const { caseId } = await params;
  const existing = await prisma.case.findUnique({ where: { id: caseId } });
  if (!existing) return Response.json({ error: '케이스를 찾을 수 없습니다.' }, { status: 404 });
  if (session.role !== 'admin' && existing.userId !== session.userId) return unauthorized();

  const body = await request.json();
  const data: Record<string, unknown> = {};

  if (typeof body.title === 'string' && body.title.trim()) data.title = body.title.trim();
  if (typeof body.note === 'string' || body.note === null) data.note = body.note;
  if (['in_progress', 'completed', 'reviewed'].includes(body.status)) data.status = body.status;
  // isIdeal 큐레이션은 관리자만
  if (session.role === 'admin' && (typeof body.isIdeal === 'boolean' || body.isIdeal === null)) {
    data.isIdeal = body.isIdeal;
  }

  await prisma.case.update({ where: { id: caseId }, data });
  return Response.json({ ok: true });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ caseId: string }> }) {
  const session = await requireRole('annotator');
  if (!session) return unauthenticated();

  const { caseId } = await params;
  const existing = await prisma.case.findUnique({
    where: { id: caseId },
    include: { panoramas: { select: { id: true } } },
  });
  if (!existing) return Response.json({ error: '케이스를 찾을 수 없습니다.' }, { status: 404 });
  if (session.role !== 'admin' && existing.userId !== session.userId) return unauthorized();

  // 파노라마/어노테이션 함께 삭제
  await prisma.$transaction([
    prisma.annotation.deleteMany({ where: { panoramaId: { in: existing.panoramas.map((p) => p.id) } } }),
    prisma.treatmentLabel.deleteMany({ where: { caseId } }),
    prisma.panorama.deleteMany({ where: { caseId } }),
    prisma.case.delete({ where: { id: caseId } }),
  ]);

  return Response.json({ ok: true });
}
