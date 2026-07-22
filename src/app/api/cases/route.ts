import { prisma } from '@/lib/db';
import { requireRole, unauthenticated } from '@/lib/auth';

export async function GET() {
  const session = await requireRole('annotator');
  if (!session) return unauthenticated();

  // 관리자는 전체, 어노테이터는 본인 케이스만
  const where = session.role === 'admin' ? {} : { userId: session.userId };

  const cases = await prisma.case.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: {
      user: { select: { name: true } },
      panoramas: {
        select: { id: true, phase: true, annotStatus: true },
      },
      _count: { select: { treatmentLabels: true } },
    },
  });

  return Response.json({ cases });
}

export async function POST(request: Request) {
  const session = await requireRole('annotator');
  if (!session) return unauthenticated();

  const { title, note } = await request.json();
  if (!title || typeof title !== 'string' || !title.trim()) {
    return Response.json({ error: '케이스 제목(차트번호 등)을 입력해주세요.' }, { status: 400 });
  }

  const created = await prisma.case.create({
    data: { userId: session.userId, title: title.trim(), note: note || null },
  });

  return Response.json({ ok: true, caseId: created.id });
}
