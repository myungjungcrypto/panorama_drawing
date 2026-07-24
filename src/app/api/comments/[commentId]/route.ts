import { prisma } from '@/lib/db';
import { requireRole, unauthenticated, unauthorized } from '@/lib/auth';

export async function DELETE(request: Request, { params }: { params: Promise<{ commentId: string }> }) {
  const session = await requireRole('member');
  if (!session) return unauthenticated();

  const { commentId } = await params;
  const comment = await prisma.comment.findUnique({ where: { id: commentId } });
  if (!comment) return Response.json({ error: '댓글을 찾을 수 없습니다.' }, { status: 404 });
  if (comment.userId !== session.userId && session.role !== 'admin') return unauthorized();

  await prisma.comment.delete({ where: { id: commentId } });
  return Response.json({ ok: true });
}
