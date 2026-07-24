'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import BannerSlot from '@/components/BannerSlot';

interface PostItem {
  id: string;
  category: string;
  title: string;
  caseId: string | null;
  jobRole: string | null;
  region: string | null;
  eventDate: string | null;
  views: number;
  createdAt: string;
  user: { name: string };
  _count: { comments: number };
}

const CATEGORIES: { key: string; label: string; color: string }[] = [
  { key: 'all', label: '전체', color: 'bg-gray-700' },
  { key: 'case', label: '케이스 토론', color: 'bg-indigo-600' },
  { key: 'seminar', label: '세미나', color: 'bg-emerald-600' },
  { key: 'job', label: '구인구직', color: 'bg-amber-600' },
  { key: 'free', label: '자유', color: 'bg-gray-600' },
];

const CATEGORY_BADGE: Record<string, { label: string; cls: string }> = {
  case: { label: '케이스', cls: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  seminar: { label: '세미나', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  job: { label: '구인구직', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  free: { label: '자유', cls: 'bg-gray-50 text-gray-600 border-gray-200' },
};

const JOB_ROLE_KO: Record<string, string> = {
  dentist: '치과의사', hygienist: '치과위생사', staff: '스텝',
};

export default function CommunityPage() {
  const [posts, setPosts] = useState<PostItem[]>([]);
  const [category, setCategory] = useState('all');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (cat: string) => {
    setLoading(true);
    const qs = cat === 'all' ? '' : `?category=${cat}`;
    const res = await fetch(`/api/posts${qs}`);
    if (res.ok) {
      const data = await res.json();
      setPosts(data.posts);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(category); }, [category, load]);

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-gray-800">커뮤니티</h1>
          <p className="text-xs text-gray-400">케이스 토론 · 세미나 · 구인구직</p>
        </div>
        <nav className="flex gap-3 text-sm items-center">
          <Link href="/" className="text-gray-500 hover:underline">3D 뷰어</Link>
          <Link href="/cases" className="text-gray-500 hover:underline">어노테이션</Link>
          <Link
            href="/community/new"
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700"
          >
            글쓰기
          </Link>
        </nav>
      </header>

      <main className="max-w-4xl mx-auto p-6">
        <BannerSlot position="community" />

        {/* 카테고리 탭 */}
        <div className="flex gap-1 mb-4">
          {CATEGORIES.map((c) => (
            <button
              key={c.key}
              onClick={() => setCategory(c.key)}
              className={`px-3 py-1.5 text-xs rounded-lg cursor-pointer ${
                category === c.key ? `${c.color} text-white` : 'bg-white text-gray-600 border border-gray-200'
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>

        {loading ? (
          <p className="text-sm text-gray-400">로딩 중...</p>
        ) : posts.length === 0 ? (
          <div className="bg-white rounded-xl p-12 text-center text-sm text-gray-400 border border-gray-100">
            아직 게시글이 없습니다. 첫 글을 작성해보세요!
          </div>
        ) : (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 divide-y divide-gray-100">
            {posts.map((p) => {
              const badge = CATEGORY_BADGE[p.category] ?? CATEGORY_BADGE.free;
              return (
                <Link
                  key={p.id}
                  href={`/community/${p.id}`}
                  className="block px-4 py-3 hover:bg-gray-50"
                >
                  <div className="flex items-center gap-2">
                    <span className={`px-1.5 py-0.5 rounded border text-[10px] shrink-0 ${badge.cls}`}>
                      {badge.label}
                    </span>
                    {p.caseId && (
                      <span className="px-1.5 py-0.5 rounded border text-[10px] shrink-0 bg-blue-50 text-blue-700 border-blue-200">
                        3D
                      </span>
                    )}
                    <span className="font-medium text-sm text-gray-800 truncate">{p.title}</span>
                    {p._count.comments > 0 && (
                      <span className="text-xs text-blue-500 shrink-0">[{p._count.comments}]</span>
                    )}
                  </div>
                  <div className="mt-1 text-[11px] text-gray-400 flex gap-2">
                    <span>{p.user.name}</span>
                    <span>{new Date(p.createdAt).toLocaleDateString('ko-KR')}</span>
                    <span>조회 {p.views}</span>
                    {p.jobRole && <span className="text-amber-600">{JOB_ROLE_KO[p.jobRole] ?? p.jobRole}{p.region && ` · ${p.region}`}</span>}
                    {p.eventDate && <span className="text-emerald-600">{new Date(p.eventDate).toLocaleDateString('ko-KR')}</span>}
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
