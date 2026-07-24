import { prisma } from '@/lib/db';
import { requireRole, unauthorized } from '@/lib/auth';

export async function GET() {
  const session = await requireRole('admin');
  if (!session) return unauthorized();

  const users = await prisma.user.findMany({
    orderBy: { createdAt: 'desc' },
    select: {
      id: true, email: true, name: true, role: true, createdAt: true,
      _count: { select: { cases: true, annotations: true } },
    },
  });

  return Response.json({ users });
}

export async function PATCH(request: Request) {
  const session = await requireRole('admin');
  if (!session) return unauthorized();

  const { userId, role } = await request.json();
  if (!userId || !['pending', 'member', 'annotator', 'admin'].includes(role)) {
    return Response.json({ error: '잘못된 요청입니다.' }, { status: 400 });
  }
  if (userId === session.userId && role !== 'admin') {
    return Response.json({ error: '본인의 관리자 권한은 해제할 수 없습니다.' }, { status: 400 });
  }

  await prisma.user.update({ where: { id: userId }, data: { role } });
  return Response.json({ ok: true });
}

export async function DELETE(request: Request) {
  const session = await requireRole('admin');
  if (!session) return unauthorized();

  const { userId } = await request.json();
  if (!userId || userId === session.userId) {
    return Response.json({ error: '잘못된 요청입니다.' }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { _count: { select: { cases: true, annotations: true } } },
  });
  if (!user) return Response.json({ error: '사용자를 찾을 수 없습니다.' }, { status: 404 });
  if (user._count.cases > 0 || user._count.annotations > 0) {
    return Response.json(
      { error: '작업 데이터가 있는 회원은 삭제할 수 없습니다. 권한을 pending으로 변경하세요.' },
      { status: 400 }
    );
  }

  await prisma.user.delete({ where: { id: userId } });
  return Response.json({ ok: true });
}
