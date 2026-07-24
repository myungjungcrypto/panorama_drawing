import { prisma } from '@/lib/db';
import { deriveToothStatuses } from '@/lib/annotationDiff';

// 환자용 공개 조회 — 토큰만으로 접근, 3D 상태 데이터만 반환 (X-ray/개인정보 없음)
export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!token || token.length < 16) {
    return Response.json({ error: '잘못된 링크입니다.' }, { status: 400 });
  }

  const c = await prisma.case.findUnique({
    where: { shareToken: token },
    include: {
      panoramas: { include: { annotations: true } },
      treatmentLabels: { orderBy: { fdi: 'asc' } },
    },
  });
  if (!c) return Response.json({ error: '만료되었거나 존재하지 않는 링크입니다.' }, { status: 404 });

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
