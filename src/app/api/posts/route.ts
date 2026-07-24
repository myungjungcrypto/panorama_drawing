import { prisma } from '@/lib/db';
import { requireRole, unauthenticated } from '@/lib/auth';

const CATEGORIES = ['case', 'seminar', 'job', 'free'];

// 목록 조회 (비로그인도 가능 — 커뮤니티 성장을 위해 공개)
export async function GET(request: Request) {
  const url = new URL(request.url);
  const category = url.searchParams.get('category');
  const where = category && CATEGORIES.includes(category) ? { category } : {};

  const posts = await prisma.post.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: {
      id: true, category: true, title: true, caseId: true,
      jobRole: true, region: true, eventDate: true,
      views: true, createdAt: true,
      user: { select: { name: true } },
      _count: { select: { comments: true } },
    },
  });

  return Response.json({ posts });
}

// 글 작성 (회원 이상)
export async function POST(request: Request) {
  const session = await requireRole('member');
  if (!session) return unauthenticated();

  const body = await request.json();
  const { category, title, content, caseId, jobRole, region, eventDate, link, caseConsent } = body;

  if (!CATEGORIES.includes(category)) {
    return Response.json({ error: '잘못된 카테고리입니다.' }, { status: 400 });
  }
  if (!title?.trim() || !content?.trim()) {
    return Response.json({ error: '제목과 내용을 입력해주세요.' }, { status: 400 });
  }

  // 케이스 공유: 본인 소유 케이스만, 명시적 동의 필수
  if (caseId) {
    if (!caseConsent) {
      return Response.json(
        { error: '케이스 공유에는 개인정보 확인 동의가 필요합니다.' },
        { status: 400 }
      );
    }
    const c = await prisma.case.findUnique({
      where: { id: caseId },
      include: { panoramas: { include: { annotations: true } } },
    });
    if (!c) return Response.json({ error: '케이스를 찾을 수 없습니다.' }, { status: 404 });
    if (c.userId !== session.userId && session.role !== 'admin') {
      return Response.json({ error: '본인의 케이스만 공유할 수 있습니다.' }, { status: 403 });
    }
    // 어노테이션이 있어야 3D 모식도 표시 가능
    const hasAnnotations = c.panoramas.some((p) => p.annotations.length > 0);
    if (!hasAnnotations) {
      return Response.json(
        { error: '어노테이션이 완료된 케이스만 공유할 수 있습니다. (3D 모식도 데이터 필요)' },
        { status: 400 }
      );
    }
  }

  const post = await prisma.post.create({
    data: {
      userId: session.userId,
      category,
      title: title.trim(),
      content: content.trim(),
      caseId: caseId || null,
      jobRole: jobRole || null,
      region: region || null,
      eventDate: eventDate ? new Date(eventDate) : null,
      link: link || null,
    },
  });

  return Response.json({ ok: true, postId: post.id });
}
