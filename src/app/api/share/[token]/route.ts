import { prisma } from '@/lib/db';
import { deriveToothStatuses, deriveTreatment, ToothStatusStr } from '@/lib/annotationDiff';

// 환자용 공개 조회 — 토큰만으로 접근, 3D 상태 데이터만 반환 (X-ray/개인정보 없음)
// 토큰 소스 2종: 케이스 공유(shareToken) / 뷰어 스냅샷(Snapshot.token)
export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!token || token.length < 16) {
    return Response.json({ error: '잘못된 링크입니다.' }, { status: 400 });
  }

  // 1) 케이스 공유 링크
  const c = await prisma.case.findUnique({
    where: { shareToken: token },
    include: {
      panoramas: { include: { annotations: true } },
      treatmentLabels: { orderBy: { fdi: 'asc' } },
    },
  });
  if (c) {
    const before = c.panoramas.find((p) => p.phase === 'before');
    const after = c.panoramas.find((p) => p.phase === 'after');
    return Response.json({
      caseView: {
        statuses: before && before.annotations.length > 0 ? deriveToothStatuses(before.annotations) : null,
        afterStatuses: after && after.annotations.length > 0 ? deriveToothStatuses(after.annotations) : null,
        treatments: c.treatmentLabels.map((l) => ({
          fdi: l.fdi,
          beforeStatus: l.beforeStatus,
          afterStatus: l.afterStatus,
          treatment: l.treatment,
        })),
      },
    });
  }

  // 2) 뷰어 스냅샷 링크
  const snap = await prisma.snapshot.findUnique({ where: { token } });
  if (snap) {
    const teeth: Record<string, ToothStatusStr> = JSON.parse(snap.teeth);
    const plan: Record<string, ToothStatusStr> = JSON.parse(snap.plan);
    const treatments = Object.entries(plan).map(([fdi, after]) => {
      const before = teeth[fdi] ?? 'present';
      return {
        fdi: parseInt(fdi),
        beforeStatus: before,
        afterStatus: after,
        treatment: deriveTreatment(before, after) ?? '치료 계획',
      };
    }).sort((a, b) => a.fdi - b.fdi);

    return Response.json({
      caseView: { statuses: teeth, afterStatuses: null, treatments },
    });
  }

  return Response.json({ error: '만료되었거나 존재하지 않는 링크입니다.' }, { status: 404 });
}
