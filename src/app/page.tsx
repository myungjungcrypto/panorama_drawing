import Link from 'next/link';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/session';
import BannerSlot from '@/components/BannerSlot';

export const dynamic = 'force-dynamic';

const CATEGORY_KO: Record<string, string> = {
  case: '케이스', seminar: '세미나', job: '구인구직', free: '자유',
};

export default async function LandingPage() {
  const session = await getSession();

  let recentPosts: { id: string; category: string; title: string; createdAt: Date }[] = [];
  try {
    recentPosts = await prisma.post.findMany({
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: { id: true, category: true, title: true, createdAt: true },
    });
  } catch {
    // DB 미초기화 등 — 랜딩은 항상 떠야 함
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xl">🦷</span>
          <span className="font-bold text-gray-800">난발치</span>
          <span className="text-xs text-gray-400 hidden sm:inline">치과 AI 상담 · 커뮤니티</span>
        </div>
        <nav className="flex gap-3 items-center text-sm">
          <Link href="/community" className="text-gray-600 hover:text-blue-600">커뮤니티</Link>
          <Link href="/viewer" className="text-gray-600 hover:text-blue-600">3D 상담 도구</Link>
          {session ? (
            <Link href={session.role === 'admin' || session.role === 'annotator' ? '/cases' : '/community'}
              className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-semibold hover:bg-blue-700">
              {session.name}님
            </Link>
          ) : (
            <>
              <Link href="/login" className="text-gray-600 hover:text-blue-600">로그인</Link>
              <Link href="/register" className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-semibold hover:bg-blue-700">
                가입하기
              </Link>
            </>
          )}
        </nav>
      </header>

      {/* Hero */}
      <section className="bg-gradient-to-b from-white to-gray-50 px-6 py-16 text-center">
        <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 leading-tight">
          파노라마 한 장으로,<br className="sm:hidden" /> 환자가 이해하는 상담
        </h1>
        <p className="mt-4 text-gray-500 max-w-xl mx-auto text-sm sm:text-base">
          AI가 파노라마 X-ray를 분석해 치아 상태를 3D 모식도로 그려줍니다.
          치료 계획을 시각적으로 설명하고, 환자에게 링크로 공유하세요.
        </p>
        <div className="mt-8 flex gap-3 justify-center">
          <Link href="/viewer"
            className="px-6 py-3 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 shadow-sm">
            3D 상담 도구 사용해보기
          </Link>
          <Link href="/community"
            className="px-6 py-3 bg-white text-gray-700 border border-gray-200 rounded-xl text-sm font-semibold hover:bg-gray-50">
            커뮤니티 둘러보기
          </Link>
        </div>
      </section>

      {/* Features */}
      <section className="max-w-5xl mx-auto px-6 py-12 grid sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
          <div className="text-2xl mb-3">🤖</div>
          <h3 className="font-bold text-gray-800 mb-1.5">AI 파노라마 분석</h3>
          <p className="text-sm text-gray-500 leading-relaxed">
            브라우저에서 바로 실행되는 AI가 치식과 치아 상태(크라운·임플란트·상실 등)를 자동 감지합니다.
            영상은 외부로 전송되지 않습니다.
          </p>
        </div>
        <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
          <div className="text-2xl mb-3">🦷</div>
          <h3 className="font-bold text-gray-800 mb-1.5">3D 치료 계획 시뮬레이션</h3>
          <p className="text-sm text-gray-500 leading-relaxed">
            현재 상태와 치료 후 모습을 3D로 비교하고, 환자에게는 로그인 없는
            공유 링크로 전달할 수 있습니다.
          </p>
        </div>
        <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
          <div className="text-2xl mb-3">💬</div>
          <h3 className="font-bold text-gray-800 mb-1.5">치과인 커뮤니티</h3>
          <p className="text-sm text-gray-500 leading-relaxed">
            인터랙티브 3D 케이스로 토론하고, 세미나 정보와 구인구직 소식을
            나누는 치과 전문가 공간입니다.
          </p>
        </div>
      </section>

      {/* 광고 배너 (홈 위치) */}
      <section className="max-w-3xl mx-auto px-6">
        <BannerSlot position="home" />
      </section>

      {/* Recent posts */}
      {recentPosts.length > 0 && (
        <section className="max-w-3xl mx-auto px-6 pb-12">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-bold text-gray-800">커뮤니티 최신 글</h2>
            <Link href="/community" className="text-xs text-blue-600 hover:underline">전체 보기 →</Link>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm divide-y divide-gray-50">
            {recentPosts.map((p) => (
              <Link key={p.id} href={`/community/${p.id}`} className="flex items-center gap-2 px-4 py-3 hover:bg-gray-50 text-sm">
                <span className="text-[10px] px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded shrink-0">
                  {CATEGORY_KO[p.category] ?? p.category}
                </span>
                <span className="text-gray-700 truncate">{p.title}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Footer */}
      <footer className="border-t border-gray-200 px-6 py-6 text-center text-xs text-gray-400">
        <div className="flex gap-4 justify-center mb-2">
          <Link href="/privacy" className="hover:underline">개인정보처리방침</Link>
          <Link href="/community" className="hover:underline">커뮤니티</Link>
          <Link href="/viewer" className="hover:underline">3D 상담 도구</Link>
        </div>
        <p>난발치 — 치과 AI 상담 · 커뮤니티 플랫폼</p>
      </footer>
    </div>
  );
}
