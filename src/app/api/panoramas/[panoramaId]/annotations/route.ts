import { prisma } from '@/lib/db';
import { requireRole, unauthenticated, unauthorized } from '@/lib/auth';
import { recomputeTreatmentLabels } from '@/lib/treatmentLabels';

async function getAccessiblePanorama(panoramaId: string, session: { userId: string; role: string }) {
  const pano = await prisma.panorama.findUnique({
    where: { id: panoramaId },
    include: { case: { select: { id: true, userId: true, title: true } } },
  });
  if (!pano) return null;
  if (session.role !== 'admin' && pano.case.userId !== session.userId) return 'forbidden';
  return pano;
}

export async function GET(request: Request, { params }: { params: Promise<{ panoramaId: string }> }) {
  const session = await requireRole('annotator');
  if (!session) return unauthenticated();

  const { panoramaId } = await params;
  const pano = await getAccessiblePanorama(panoramaId, session);
  if (!pano) return Response.json({ error: '파노라마를 찾을 수 없습니다.' }, { status: 404 });
  if (pano === 'forbidden') return unauthorized();

  const annotations = await prisma.annotation.findMany({
    where: { panoramaId },
    orderBy: { createdAt: 'asc' },
  });

  return Response.json({
    panorama: {
      id: pano.id,
      caseId: pano.case.id,
      caseTitle: pano.case.title,
      phase: pano.phase,
      filename: pano.filename,
      width: pano.width,
      height: pano.height,
      annotStatus: pano.annotStatus,
    },
    annotations,
  });
}

interface IncomingAnnotation {
  type: string;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
  source?: string;
}

export async function PUT(request: Request, { params }: { params: Promise<{ panoramaId: string }> }) {
  const session = await requireRole('annotator');
  if (!session) return unauthenticated();

  const { panoramaId } = await params;
  const pano = await getAccessiblePanorama(panoramaId, session);
  if (!pano) return Response.json({ error: '파노라마를 찾을 수 없습니다.' }, { status: 404 });
  if (pano === 'forbidden') return unauthorized();

  const body = await request.json();
  const annotations: IncomingAnnotation[] = body.annotations;
  const annotStatus: string = body.annotStatus;

  if (!Array.isArray(annotations)) {
    return Response.json({ error: 'annotations 배열이 필요합니다.' }, { status: 400 });
  }
  if (!['in_progress', 'done'].includes(annotStatus)) {
    return Response.json({ error: '잘못된 상태값입니다.' }, { status: 400 });
  }

  // 검증
  for (const a of annotations) {
    if (!['tooth', 'condition'].includes(a.type)) {
      return Response.json({ error: `잘못된 type: ${a.type}` }, { status: 400 });
    }
    if (typeof a.label !== 'string' || !a.label) {
      return Response.json({ error: '라벨이 없는 어노테이션이 있습니다.' }, { status: 400 });
    }
    for (const v of [a.x, a.y, a.w, a.h]) {
      if (typeof v !== 'number' || v < -0.1 || v > 1.1) {
        return Response.json({ error: '좌표값이 올바르지 않습니다.' }, { status: 400 });
      }
    }
  }

  // 전체 교체 (단순하고 안전)
  await prisma.$transaction([
    prisma.annotation.deleteMany({ where: { panoramaId } }),
    prisma.annotation.createMany({
      data: annotations.map((a) => ({
        panoramaId,
        userId: session.userId,
        type: a.type,
        label: a.label,
        x: a.x, y: a.y, w: a.w, h: a.h,
        source: a.source === 'ai' ? 'ai' : 'manual',
      })),
    }),
    prisma.panorama.update({ where: { id: panoramaId }, data: { annotStatus } }),
  ]);

  // 전/후 모두 완료 상태면 치료 내역 자동 재계산 (확인된 항목은 내용 동일 시 유지)
  const recomputed = await recomputeTreatmentLabels(pano.case.id);

  return Response.json({ ok: true, count: annotations.length, treatmentsRecomputed: recomputed });
}
