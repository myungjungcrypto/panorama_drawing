'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';

interface MyCase {
  id: string;
  title: string;
  status: string;
  panoramas: { id: string; phase: string; annotStatus: string }[];
}

function NewPostForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [category, setCategory] = useState(searchParams.get('caseId') ? 'case' : 'free');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [caseId, setCaseId] = useState(searchParams.get('caseId') || '');
  const [caseConsent, setCaseConsent] = useState(false);
  const [myCases, setMyCases] = useState<MyCase[]>([]);
  const [jobRole, setJobRole] = useState('dentist');
  const [region, setRegion] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [link, setLink] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // 케이스 토론 카테고리일 때 내 케이스 목록 로드 (어노테이터가 아니면 빈 목록)
  useEffect(() => {
    if (category !== 'case') return;
    fetch('/api/cases')
      .then((r) => (r.ok ? r.json() : { cases: [] }))
      .then((d) => setMyCases(
        (d.cases ?? []).filter((c: MyCase) =>
          c.panoramas.some((p) => p.annotStatus === 'done')
        )
      ))
      .catch(() => {});
  }, [category]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category, title, content,
          caseId: category === 'case' && caseId ? caseId : null,
          caseConsent,
          jobRole: category === 'job' ? jobRole : null,
          region: category === 'job' ? region : null,
          eventDate: category === 'seminar' && eventDate ? eventDate : null,
          link: category === 'seminar' ? link : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '작성 실패');
      router.push(`/community/${data.postId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : '작성 중 오류');
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      {/* 카테고리 */}
      <div className="flex gap-1">
        {[
          { key: 'case', label: '케이스 토론' },
          { key: 'seminar', label: '세미나' },
          { key: 'job', label: '구인구직' },
          { key: 'free', label: '자유' },
        ].map((c) => (
          <button
            key={c.key}
            type="button"
            onClick={() => setCategory(c.key)}
            className={`px-3 py-1.5 text-xs rounded-lg cursor-pointer ${
              category === c.key ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 border border-gray-200'
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        required
        placeholder="제목"
        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
      />

      {/* 카테고리별 부가 필드 */}
      {category === 'case' && (
        <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3 space-y-2">
          <label className="block text-xs text-indigo-700 font-semibold">3D 케이스 첨부 (선택)</label>
          <select
            value={caseId}
            onChange={(e) => setCaseId(e.target.value)}
            className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm bg-white"
          >
            <option value="">첨부 안 함</option>
            {myCases.map((c) => (
              <option key={c.id} value={c.id}>{c.title}</option>
            ))}
          </select>
          {caseId && (
            <label className="flex items-start gap-2 text-[11px] text-gray-600 cursor-pointer">
              <input
                type="checkbox"
                checked={caseConsent}
                onChange={(e) => setCaseConsent(e.target.checked)}
                className="mt-0.5"
              />
              <span>
                공유되는 것은 <strong>3D 모식도(치아 상태 정보)뿐</strong>이며 원본 X-ray는 공개되지 않음을 이해했고,
                케이스 제목·내용에 환자 식별정보가 없음을 확인했습니다.
              </span>
            </label>
          )}
          <p className="text-[10px] text-indigo-400">
            어노테이션이 완료된 본인 케이스만 첨부할 수 있습니다.
          </p>
        </div>
      )}

      {category === 'job' && (
        <div className="flex gap-2">
          <select
            value={jobRole}
            onChange={(e) => setJobRole(e.target.value)}
            className="px-2 py-1.5 border border-gray-300 rounded text-sm bg-white"
          >
            <option value="dentist">치과의사</option>
            <option value="hygienist">치과위생사</option>
            <option value="staff">스텝</option>
          </select>
          <input
            value={region}
            onChange={(e) => setRegion(e.target.value)}
            placeholder="지역 (예: 서울 강남)"
            className="flex-1 px-3 py-1.5 border border-gray-300 rounded text-sm"
          />
        </div>
      )}

      {category === 'seminar' && (
        <div className="flex gap-2">
          <input
            type="datetime-local"
            value={eventDate}
            onChange={(e) => setEventDate(e.target.value)}
            className="px-2 py-1.5 border border-gray-300 rounded text-sm"
          />
          <input
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder="신청 링크 (선택)"
            className="flex-1 px-3 py-1.5 border border-gray-300 rounded text-sm"
          />
        </div>
      )}

      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        required
        rows={10}
        placeholder="내용 (환자 식별정보 입력 금지)"
        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
      />

      {error && (
        <div className="p-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-600">{error}</div>
      )}

      <div className="flex gap-2 justify-end">
        <Link href="/community" className="px-4 py-2 bg-gray-100 text-gray-600 rounded-lg text-sm hover:bg-gray-200">
          취소
        </Link>
        <button
          type="submit"
          disabled={saving}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:bg-gray-300 cursor-pointer"
        >
          {saving ? '등록 중...' : '등록'}
        </button>
      </div>
    </form>
  );
}

export default function NewPostPage() {
  return (
    <div className="min-h-screen bg-gray-100">
      <header className="bg-white border-b border-gray-200 px-6 py-3">
        <h1 className="text-lg font-bold text-gray-800">글쓰기</h1>
        <Link href="/community" className="text-xs text-blue-600 hover:underline">← 커뮤니티</Link>
      </header>
      <main className="max-w-3xl mx-auto p-6">
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <Suspense>
            <NewPostForm />
          </Suspense>
        </div>
      </main>
    </div>
  );
}
