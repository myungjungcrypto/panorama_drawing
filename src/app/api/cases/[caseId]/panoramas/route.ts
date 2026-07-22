import { prisma } from '@/lib/db';
import { requireRole, unauthenticated, unauthorized } from '@/lib/auth';
import { savePanoramaFile } from '@/lib/storage';

export async function POST(request: Request, { params }: { params: Promise<{ caseId: string }> }) {
  const session = await requireRole('annotator');
  if (!session) return unauthenticated();

  const { caseId } = await params;
  const existing = await prisma.case.findUnique({
    where: { id: caseId },
    include: { panoramas: { select: { phase: true } } },
  });
  if (!existing) return Response.json({ error: '케이스를 찾을 수 없습니다.' }, { status: 404 });
  if (session.role !== 'admin' && existing.userId !== session.userId) return unauthorized();

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const phase = formData.get('phase') as string;
    const width = parseInt(String(formData.get('width') || '0'));
    const height = parseInt(String(formData.get('height') || '0'));
    const takenAtRaw = formData.get('takenAt') as string | null;

    if (!file) return Response.json({ error: '파일이 없습니다.' }, { status: 400 });
    if (!['before', 'after'].includes(phase)) {
      return Response.json({ error: 'phase는 before 또는 after여야 합니다.' }, { status: 400 });
    }
    if (!width || !height) {
      return Response.json({ error: '이미지 크기 정보가 없습니다.' }, { status: 400 });
    }
    if (existing.panoramas.some((p) => p.phase === phase)) {
      return Response.json(
        { error: phase === 'before' ? '치료 전 파노라마가 이미 있습니다.' : '치료 후 파노라마가 이미 있습니다.' },
        { status: 409 }
      );
    }

    const filename = await savePanoramaFile(file);

    const panorama = await prisma.panorama.create({
      data: {
        caseId,
        userId: session.userId,
        phase,
        filename,
        width,
        height,
        takenAt: takenAtRaw ? new Date(takenAtRaw) : null,
      },
    });

    // 치료 후 업로드 시 케이스 상태 자동 갱신
    if (phase === 'after' && existing.status === 'in_progress') {
      await prisma.case.update({ where: { id: caseId }, data: { status: 'completed' } });
    }

    return Response.json({ ok: true, panoramaId: panorama.id });
  } catch (err) {
    const message = err instanceof Error ? err.message : '업로드 실패';
    return Response.json({ error: message }, { status: 400 });
  }
}
