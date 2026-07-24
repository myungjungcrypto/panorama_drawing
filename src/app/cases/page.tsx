'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

interface CaseItem {
  id: string;
  title: string;
  status: string;
  isIdeal: boolean | null;
  note: string | null;
  createdAt: string;
  user: { name: string };
  panoramas: { id: string; phase: string; annotStatus: string }[];
  _count: { treatmentLabels: number };
}

const STATUS_INFO: Record<string, { label: string; color: string }> = {
  in_progress: { label: '치료 전만', color: 'bg-yellow-50 text-yellow-700 border-yellow-200' },
  completed: { label: '전+후 완비', color: 'bg-blue-50 text-blue-700 border-blue-200' },
  reviewed: { label: '검수 완료', color: 'bg-green-50 text-green-700 border-green-200' },
};

export default function CasesPage() {
  const router = useRouter();
  const [cases, setCases] = useState<CaseItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'waiting_after'>('all');
  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newNote, setNewNote] = useState('');
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch('/api/cases');
    if (res.ok) {
      const data = await res.json();
      setCases(data.cases);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const createCase = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    const res = await fetch('/api/cases', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: newTitle, note: newNote }),
    });
    const data = await res.json();
    setCreating(false);
    if (res.ok) {
      router.push(`/cases/${data.caseId}`);
    } else {
      alert(data.error || '생성 실패');
    }
  };

  const filtered = filter === 'waiting_after'
    ? cases.filter((c) => c.status === 'in_progress')
    : cases;

  const logout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  };

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-gray-800">케이스 목록</h1>
          <p className="text-xs text-gray-400">파노라마 업로드 및 어노테이션</p>
        </div>
        <nav className="flex gap-3 text-sm items-center">
          <Link href="/" className="text-gray-500 hover:underline">3D 뷰어</Link>
          <Link href="/community" className="text-gray-500 hover:underline">커뮤니티</Link>
          <Link href="/admin" className="text-gray-500 hover:underline">관리자</Link>
          <button onClick={logout} className="text-gray-400 hover:text-gray-600 cursor-pointer text-xs">
            로그아웃
          </button>
        </nav>
      </header>

      <main className="max-w-4xl mx-auto p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex gap-1">
            <button
              onClick={() => setFilter('all')}
              className={`px-3 py-1.5 text-xs rounded-lg cursor-pointer ${
                filter === 'all' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 border border-gray-200'
              }`}
            >
              전체 ({cases.length})
            </button>
            <button
              onClick={() => setFilter('waiting_after')}
              className={`px-3 py-1.5 text-xs rounded-lg cursor-pointer ${
                filter === 'waiting_after' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 border border-gray-200'
              }`}
            >
              치료 후 대기 ({cases.filter((c) => c.status === 'in_progress').length})
            </button>
          </div>
          <button
            onClick={() => setShowCreate(!showCreate)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 cursor-pointer"
          >
            + 새 케이스
          </button>
        </div>

        {showCreate && (
          <form onSubmit={createCase} className="mb-4 bg-white rounded-xl p-4 shadow-sm border border-gray-100 flex gap-2 items-end">
            <div className="flex-1">
              <label className="block text-xs text-gray-500 mb-1">케이스 제목 (차트번호 등, 환자 이름 금지)</label>
              <input
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                required
                placeholder="예: CH-2026-001"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
            </div>
            <div className="flex-1">
              <label className="block text-xs text-gray-500 mb-1">메모 (선택)</label>
              <input
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
            </div>
            <button
              type="submit"
              disabled={creating}
              className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm hover:bg-emerald-700 disabled:bg-gray-300 cursor-pointer"
            >
              생성
            </button>
          </form>
        )}

        {loading ? (
          <p className="text-sm text-gray-400">로딩 중...</p>
        ) : filtered.length === 0 ? (
          <div className="bg-white rounded-xl p-12 text-center text-sm text-gray-400 border border-gray-100">
            케이스가 없습니다. 새 케이스를 만들어 파노라마를 업로드하세요.
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((c) => {
              const statusInfo = STATUS_INFO[c.status] ?? STATUS_INFO.in_progress;
              const before = c.panoramas.find((p) => p.phase === 'before');
              const after = c.panoramas.find((p) => p.phase === 'after');
              return (
                <Link
                  key={c.id}
                  href={`/cases/${c.id}`}
                  className="block bg-white rounded-xl p-4 shadow-sm border border-gray-100 hover:border-blue-300 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-gray-800 text-sm">{c.title}</span>
                        <span className={`px-2 py-0.5 rounded border text-[10px] ${statusInfo.color}`}>
                          {statusInfo.label}
                        </span>
                        {c.isIdeal === true && (
                          <span className="px-2 py-0.5 rounded border text-[10px] bg-purple-50 text-purple-700 border-purple-200">
                            이상적 치료
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-gray-400 mt-1">
                        {c.user.name} · {new Date(c.createdAt).toLocaleDateString('ko-KR')}
                        {c.note && ` · ${c.note}`}
                      </div>
                    </div>
                    <div className="flex gap-2 text-[10px]">
                      <span className={`px-2 py-1 rounded ${before ? (before.annotStatus === 'done' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700') : 'bg-gray-100 text-gray-400'}`}>
                        치료 전 {before ? (before.annotStatus === 'done' ? '✓' : '(작업중)') : '없음'}
                      </span>
                      <span className={`px-2 py-1 rounded ${after ? (after.annotStatus === 'done' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700') : 'bg-gray-100 text-gray-400'}`}>
                        치료 후 {after ? (after.annotStatus === 'done' ? '✓' : '(작업중)') : '없음'}
                      </span>
                    </div>
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
