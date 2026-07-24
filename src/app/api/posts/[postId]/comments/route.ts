import { prisma } from '@/lib/db';
import { requireRole, unauthenticated } from '@/lib/auth';

export async function POST(request: Request, { params }: { params: Promise<{ postId: string }> }) {
  const session = await requireRole('member');
  if (!session) return unauthenticated();

  const { postId } = await params;
  const { content } = await request.json();
  if (!content?.trim()) {
    return Response.json({ error: '내용을 입력해주세요.' }, { status: 400 });
  }

  const post = await prisma.post.findUnique({ where: { id: postId } });
  if (!post) return Response.json({ error: '게시글을 찾을 수 없습니다.' }, { status: 404 });

  await prisma.comment.create({
    data: { postId, userId: session.userId, content: content.trim() },
  });

  return Response.json({ ok: true });
}
