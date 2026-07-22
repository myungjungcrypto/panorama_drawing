import { prisma } from '@/lib/db';
import { requireRole, unauthenticated, unauthorized } from '@/lib/auth';
import { computeCaseDiff } from '@/lib/annotationDiff';

export async function POST(request: Request, { params }: { params: Promise<{ caseId: string }> }) {
  const session = await requireRole('annotator');
  if (!session) return unauthenticated();

  const { caseId } = await params;
  const c = await prisma.case.findUnique({
    where: { id: caseId },
    include: { panoramas: { include: { annotations: true } } },
  });
  if (!c) return Response.json({ error: '케이스를 찾을 수 없습니다.' }, { status: 404 });
  if (session.role !== 'admin' && c.userId !== session.userId) return unauthorized();

  const before = c.panoramas.find((p) => p.phase === 'before');
  const after = c.panoramas.find((p) => p.phase === 'after');
  if (!before || !after) {
    return Response.json({ error: '치료 전/후 파노라마가 모두 필요합니다.' }, { status: 400 });
  }
  if (before.annotStatus !== 'done' || after.annotStatus !== 'done') {
    return Response.json({ error: '전/후 어노테이션이 모두 완료(done) 상태여야 합니다.' }, { status: 400 });
  }

  const labels = computeCaseDiff(before.annotations, after.annotations);

  // 기존 라벨 교체
  await prisma.$transaction([
    prisma.treatmentLabel.deleteMany({ where: { caseId } }),
    prisma.treatmentLabel.createMany({
      data: labels.map((l) => ({ caseId, ...l })),
    }),
  ]);

  return Response.json({ ok: true, count: labels.length });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ caseId: string }> }) {
  const session = await requireRole('annotator');
  if (!session) return unauthenticated();

  const { caseId } = await params;
  const c = await prisma.case.findUnique({ where: { id: caseId } });
  if (!c) return Response.json({ error: '케이스를 찾을 수 없습니다.' }, { status: 404 });
  if (session.role !== 'admin' && c.userId !== session.userId) return unauthorized();

  const { labelId, confirmed } = await request.json();
  if (!labelId || typeof confirmed !== 'boolean') {
    return Response.json({ error: '잘못된 요청입니다.' }, { status: 400 });
  }

  await prisma.treatmentLabel.update({ where: { id: labelId }, data: { confirmed } });

  // 모든 라벨이 확인되면 케이스를 reviewed로
  const remaining = await prisma.treatmentLabel.count({ where: { caseId, confirmed: false } });
  if (remaining === 0) {
    await prisma.case.update({ where: { id: caseId }, data: { status: 'reviewed' } });
  }

  return Response.json({ ok: true });
}
