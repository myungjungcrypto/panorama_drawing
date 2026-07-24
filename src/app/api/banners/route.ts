import { prisma } from '@/lib/db';

// 활성 배너 조회 (공개)
export async function GET(request: Request) {
  const url = new URL(request.url);
  const position = url.searchParams.get('position') || 'community';

  const banners = await prisma.banner.findMany({
    where: { active: true, position },
    orderBy: { order: 'asc' },
    select: { id: true, title: true, subtitle: true, linkUrl: true, imageUrl: true },
  });

  return Response.json({ banners });
}
