import { prisma } from '@/lib/db';
import { requireRole, getSessionOrNull, unauthenticated, unauthorized } from '@/lib/auth';
import { deriveToothStatuses } from '@/lib/annotationDiff';

export async function GET(request: Request, { params }: { params: Promise<{ postId: string }> }) {
  const { postId } = await params;

  const post = await prisma.post.findUnique({
    where: { id: postId },
    include: {
      user: { select: { name: true } },
      comments: {
        orderBy: { createdAt: 'asc' },
        include: { user: { select: { name: true } } },
      },
    },
  });
  if (!post) return Response.json({ error: '게시글을 찾을 수 없습니다.' }, { status: 404 });

  // 조회수 증가 (비동기, 실패 무시)
  prisma.post.update({ where: { id: postId }, data: { views: { increment: 1 } } }).catch(() => {});

  // 케이스 공유 글: 3D 모식도 데이터 도출 (원본 X-ray는 절대 포함하지 않음)
  let caseView = null;
  if (post.caseId) {
    const c = await prisma.case.findUnique({
      where: { id: post.caseId },
      include: {
        panoramas: { include: { annotations: true } },
        treatmentLabels: { orderBy: { fdi: 'asc' } },
      },
    });
    if (c) {
      const before = c.panoramas.find((p) => p.phase === 'before');
      const after = c.panoramas.find((p) => p.phase === 'after');
      caseView = {
        statuses: before && before.annotations.length > 0
          ? deriveToothStatuses(before.annotations)
          : null,
        afterStatuses: after && after.annotations.length > 0
          ? deriveToothStatuses(after.annotations)
          : null,
        treatments: c.treatmentLabels.map((l) => ({
          fdi: l.fdi,
          beforeStatus: l.beforeStatus,
          afterStatus: l.afterStatus,
          treatment: l.treatment,
        })),
      };
    }
  }

  const session = await getSessionOrNull();

  return Response.json({
    post: {
      id: post.id,
      category: post.category,
      title: post.title,
      content: post.content,
      caseId: post.caseId,
      jobRole: post.jobRole,
      region: post.region,
      eventDate: post.eventDate,
      link: post.link,
      views: post.views,
      createdAt: post.createdAt,
      author: post.user.name,
      isMine: session?.userId === post.userId,
      canDelete: session ? session.userId === post.userId || session.role === 'admin' : false,
    },
    comments: post.comments.map((cm) => ({
      id: cm.id,
      content: cm.content,
      author: cm.user.name,
      createdAt: cm.createdAt,
      canDelete: session ? session.userId === cm.userId || session.role === 'admin' : false,
    })),
    caseView,
  });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ postId: string }> }) {
  const session = await requireRole('member');
  if (!session) return unauthenticated();

  const { postId } = await params;
  const post = await prisma.post.findUnique({ where: { id: postId } });
  if (!post) return Response.json({ error: '게시글을 찾을 수 없습니다.' }, { status: 404 });
  if (post.userId !== session.userId && session.role !== 'admin') return unauthorized();

  await prisma.post.delete({ where: { id: postId } });
  return Response.json({ ok: true });
}
