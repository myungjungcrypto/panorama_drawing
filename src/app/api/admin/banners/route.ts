import { prisma } from '@/lib/db';
import { requireRole, unauthorized } from '@/lib/auth';

export async function GET() {
  const session = await requireRole('admin');
  if (!session) return unauthorized();

  const banners = await prisma.banner.findMany({ orderBy: [{ position: 'asc' }, { order: 'asc' }] });
  return Response.json({ banners });
}

export async function POST(request: Request) {
  const session = await requireRole('admin');
  if (!session) return unauthorized();

  const { title, subtitle, linkUrl, imageUrl, position, order } = await request.json();
  if (!title?.trim() || !linkUrl?.trim()) {
    return Response.json({ error: '제목과 링크는 필수입니다.' }, { status: 400 });
  }
  if (!['community', 'home'].includes(position)) {
    return Response.json({ error: '잘못된 위치입니다.' }, { status: 400 });
  }

  const banner = await prisma.banner.create({
    data: {
      title: title.trim(),
      subtitle: subtitle?.trim() || null,
      linkUrl: linkUrl.trim(),
      imageUrl: imageUrl?.trim() || null,
      position,
      order: Number.isFinite(order) ? order : 0,
    },
  });
  return Response.json({ ok: true, bannerId: banner.id });
}

export async function PATCH(request: Request) {
  const session = await requireRole('admin');
  if (!session) return unauthorized();

  const { bannerId, active } = await request.json();
  if (!bannerId || typeof active !== 'boolean') {
    return Response.json({ error: '잘못된 요청입니다.' }, { status: 400 });
  }
  await prisma.banner.update({ where: { id: bannerId }, data: { active } });
  return Response.json({ ok: true });
}

export async function DELETE(request: Request) {
  const session = await requireRole('admin');
  if (!session) return unauthorized();

  const { bannerId } = await request.json();
  if (!bannerId) return Response.json({ error: '잘못된 요청입니다.' }, { status: 400 });
  await prisma.banner.delete({ where: { id: bannerId } });
  return Response.json({ ok: true });
}
