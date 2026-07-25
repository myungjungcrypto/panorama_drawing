import type { Metadata } from 'next';
import { prisma } from '@/lib/db';
import PostDetailClient from './PostDetailClient';

// 카카오톡/메신저 공유 미리보기용 OG 메타태그
export async function generateMetadata(
  { params }: { params: Promise<{ postId: string }> }
): Promise<Metadata> {
  const { postId } = await params;
  try {
    const post = await prisma.post.findUnique({
      where: { id: postId },
      select: { title: true, content: true, category: true, caseId: true },
    });
    if (!post) return { title: '게시글을 찾을 수 없습니다 — 난발치' };

    const categoryKo: Record<string, string> = {
      case: '케이스 토론', seminar: '세미나', job: '구인구직', free: '자유',
    };
    const description = post.content.slice(0, 100).replace(/\n/g, ' ')
      + (post.caseId ? ' · 인터랙티브 3D 케이스 포함' : '');

    return {
      title: `${post.title} — 난발치 커뮤니티`,
      description,
      openGraph: {
        title: post.title,
        description,
        siteName: '난발치 — 치과 AI 커뮤니티',
        type: 'article',
        locale: 'ko_KR',
      },
    };
  } catch {
    return { title: '난발치 커뮤니티' };
  }
}

export default async function PostDetailPage(
  { params }: { params: Promise<{ postId: string }> }
) {
  const { postId } = await params;
  return <PostDetailClient postId={postId} />;
}
