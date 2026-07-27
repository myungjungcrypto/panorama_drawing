import { prisma } from '@/lib/db';
import { requireRole, unauthenticated, unauthorized } from '@/lib/auth';
import { recomputeTreatmentLabels } from '@/lib/treatmentLabels';

// 치료 내역 수동 재계산 (어노테이션 완료 시 자동 계산되지만 예비용으로 유지)
export async function POST(request: Request, { params }: { params: Promise<{ caseId: string }> }) {
  const session = await requireRole('annotator');
  if (!session) return unauthenticated();

  const { caseId } = await params;
  const c = await prisma.case.findUnique({ where: { id: caseId } });
  if (!c) return Response.json({ error: '케이스를 찾을 수 없습니다.' }, { status: 404 });
  if (session.role !== 'admin' && c.userId !== session.userId) return unauthorized();

  const ok = await recomputeTreatmentLabels(caseId);
  if (!ok) {
    return Response.json(
      { error: '치료 전/후 어노테이션이 모두 완료되어야 계산할 수 있습니다.' },
      { status: 400 }
    );
  }

  return Response.json({ ok: true });
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
