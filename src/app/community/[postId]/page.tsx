'use client';

import { useState, useEffect, useCallback, use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { useTeethState } from '@/hooks/useTeethState';
import { ToothStatus, TreatmentStatus } from '@/types/dental';

const DentalArch3D = dynamic(() => import('@/components/DentalArch3D'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-[400px] bg-gray-50 rounded-xl">
      <div className="text-gray-400 text-sm">3D 뷰 로딩 중...</div>
    </div>
  ),
});

interface CaseView {
  statuses: Record<number, string> | null;
  afterStatuses: Record<number, string> | null;
  treatments: { fdi: number; beforeStatus: string; afterStatus: string; treatment: string }[];
}

interface PostDetail {
  id: string;
  category: string;
  title: string;
  content: string;
  caseId: string | null;
  jobRole: string | null;
  region: string | null;
  eventDate: string | null;
  link: string | null;
  views: number;
  createdAt: string;
  author: string;
  canDelete: boolean;
}

interface CommentItem {
  id: string;
  content: string;
  author: string;
  createdAt: string;
  canDelete: boolean;
}

const CATEGORY_KO: Record<string, string> = {
  case: '케이스 토론', seminar: '세미나', job: '구인구직', free: '자유',
};

const STATUS_KO: Record<string, string> = {
  present: '존재', missing: '상실', crown: '크라운', implant: '임플란트', bridge: '브릿지',
};

// 공유된 케이스의 3D 모식도 (읽기 전용) — 전역 상태에 케이스 데이터를 주입
function SharedCaseViewer({ caseView }: { caseView: CaseView }) {
  const resetAll = useTeethState((s) => s.resetAll);
  const setToothStatus = useTeethState((s) => s.setToothStatus);
  const setTreatmentPlan = useTeethState((s) => s.setTreatmentPlan);
  const setViewMode = useTeethState((s) => s.setViewMode);

  useEffect(() => {
    resetAll();
    if (caseView.statuses) {
      for (const [fdi, status] of Object.entries(caseView.statuses)) {
        setToothStatus(parseInt(fdi), status as ToothStatus);
      }
    }
    // 치료 내역을 계획 오버레이로 표시 (전→후 비교)
    let hasPlan = false;
    for (const t of caseView.treatments) {
      if (['implant', 'crown', 'bridge'].includes(t.afterStatus)) {
        setTreatmentPlan(t.fdi, t.afterStatus as TreatmentStatus);
        hasPlan = true;
      }
    }
    if (hasPlan) setViewMode('compare');
    return () => { resetAll(); };
  }, [caseView, resetAll, setToothStatus, setTreatmentPlan, setViewMode]);

  return (
    <div className="space-y-3">
      <div className="h-[420px]">
        <DentalArch3D />
      </div>
      {caseView.treatments.length > 0 && (
        <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-3">
          <p className="text-xs font-semibold text-indigo-700 mb-2">치료 내역 (전 → 후)</p>
          <div className="flex flex-wrap gap-2">
            {caseView.treatments.map((t) => (
              <span key={t.fdi} className="px-2 py-1 bg-white rounded border border-indigo-100 text-[11px] text-gray-700">
                #{t.fdi} {STATUS_KO[t.beforeStatus] ?? t.beforeStatus} → {STATUS_KO[t.afterStatus] ?? t.afterStatus}
                <span className="text-indigo-600 font-medium"> ({t.treatment})</span>
              </span>
            ))}
          </div>
        </div>
      )}
      <p className="text-[10px] text-gray-400">
        * 공유된 3D 모식도는 치아 상태 정보만 포함하며 원본 X-ray는 공개되지 않습니다.
      </p>
    </div>
  );
}

export default function PostDetailPage({ params }: { params: Promise<{ postId: string }> }) {
  const { postId } = use(params);
  const router = useRouter();

  const [post, setPost] = useState<PostDetail | null>(null);
  const [comments, setComments] = useState<CommentItem[]>([]);
  const [caseView, setCaseView] = useState<CaseView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [commentText, setCommentText] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/posts/${postId}`);
    const data = await res.json();
    if (!res.ok) { setError(data.error || '로딩 실패'); return; }
    setPost(data.post);
    setComments(data.comments);
    setCaseView(data.caseView);
  }, [postId]);

  useEffect(() => { load(); }, [load]);

  const submitComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentText.trim()) return;
    setSubmitting(true);
    const res = await fetch(`/api/posts/${postId}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: commentText }),
    });
    setSubmitting(false);
    if (res.ok) {
      setCommentText('');
      load();
    } else if (res.status === 401) {
      alert('댓글 작성은 로그인이 필요합니다.');
    }
  };

  const deletePost = async () => {
    if (!confirm('게시글을 삭제할까요?')) return;
    const res = await fetch(`/api/posts/${postId}`, { method: 'DELETE' });
    if (res.ok) router.push('/community');
  };

  const deleteComment = async (id: string) => {
    await fetch(`/api/comments/${id}`, { method: 'DELETE' });
    load();
  };

  if (error) return <div className="p-8 text-sm text-red-500">{error}</div>;
  if (!post) return <div className="p-8 text-sm text-gray-400">로딩 중...</div>;

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
        <div>
          <span className="text-xs text-gray-400">{CATEGORY_KO[post.category] ?? post.category}</span>
          <h1 className="text-lg font-bold text-gray-800">{post.title}</h1>
          <p className="text-xs text-gray-400">
            {post.author} · {new Date(post.createdAt).toLocaleString('ko-KR')} · 조회 {post.views}
            {post.jobRole && ` · ${post.jobRole === 'dentist' ? '치과의사' : post.jobRole === 'hygienist' ? '치과위생사' : '스텝'}${post.region ? ` · ${post.region}` : ''}`}
          </p>
        </div>
        <nav className="flex gap-3 text-sm items-center">
          <Link href="/community" className="text-blue-600 hover:underline">← 목록</Link>
          {post.canDelete && (
            <button onClick={deletePost} className="text-red-400 hover:text-red-600 text-xs cursor-pointer">
              삭제
            </button>
          )}
        </nav>
      </header>

      <main className="max-w-4xl mx-auto p-6 space-y-4">
        {/* 세미나 정보 */}
        {post.category === 'seminar' && (post.eventDate || post.link) && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-sm text-emerald-800 flex gap-4">
            {post.eventDate && <span>📅 {new Date(post.eventDate).toLocaleString('ko-KR')}</span>}
            {post.link && (
              <a href={post.link} target="_blank" rel="noopener noreferrer" className="underline">
                신청 링크
              </a>
            )}
          </div>
        )}

        {/* 본문 */}
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{post.content}</p>
        </div>

        {/* 공유된 3D 케이스 */}
        {caseView && (caseView.statuses || caseView.treatments.length > 0) && (
          <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
            <h2 className="text-sm font-semibold text-gray-700 mb-3">공유된 3D 케이스</h2>
            <SharedCaseViewer caseView={caseView} />
          </div>
        )}

        {/* 댓글 */}
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">댓글 {comments.length}</h2>

          <div className="space-y-3 mb-4">
            {comments.map((c) => (
              <div key={c.id} className="border-b border-gray-50 pb-2">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-semibold text-gray-700">{c.author}</span>
                  <div className="flex gap-2 items-center">
                    <span className="text-[10px] text-gray-400">{new Date(c.createdAt).toLocaleString('ko-KR')}</span>
                    {c.canDelete && (
                      <button onClick={() => deleteComment(c.id)} className="text-[10px] text-red-400 cursor-pointer">
                        삭제
                      </button>
                    )}
                  </div>
                </div>
                <p className="text-sm text-gray-600 mt-1 whitespace-pre-wrap">{c.content}</p>
              </div>
            ))}
            {comments.length === 0 && <p className="text-xs text-gray-400">첫 댓글을 남겨보세요.</p>}
          </div>

          <form onSubmit={submitComment} className="flex gap-2">
            <input
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              placeholder="댓글 입력 (로그인 필요)"
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm"
            />
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:bg-gray-300 cursor-pointer"
            >
              등록
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}
