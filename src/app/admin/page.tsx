'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';

interface AdminUser {
  id: string;
  email: string;
  name: string;
  role: string;
  createdAt: string;
  _count: { cases: number; annotations: number };
}

const ROLE_LABELS: Record<string, { label: string; color: string }> = {
  pending: { label: '승인 대기(레거시)', color: 'bg-yellow-50 text-yellow-700 border-yellow-200' },
  member: { label: '일반 회원', color: 'bg-gray-50 text-gray-600 border-gray-200' },
  annotator: { label: '어노테이터', color: 'bg-green-50 text-green-700 border-green-200' },
  admin: { label: '관리자', color: 'bg-blue-50 text-blue-700 border-blue-200' },
};

interface AdminBanner {
  id: string;
  title: string;
  subtitle: string | null;
  linkUrl: string;
  imageUrl: string | null;
  position: string;
  active: boolean;
  order: number;
}

// 광고 배너 관리 섹션
function BannerManager() {
  const [banners, setBanners] = useState<AdminBanner[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: '', subtitle: '', linkUrl: '', imageUrl: '', position: 'community' });

  const load = useCallback(async () => {
    const res = await fetch('/api/admin/banners');
    if (res.ok) {
      const data = await res.json();
      setBanners(data.banners);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch('/api/admin/banners', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    if (res.ok) {
      setForm({ title: '', subtitle: '', linkUrl: '', imageUrl: '', position: 'community' });
      setShowForm(false);
      load();
    } else {
      const data = await res.json();
      alert(data.error || '등록 실패');
    }
  };

  const toggle = async (bannerId: string, active: boolean) => {
    await fetch('/api/admin/banners', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bannerId, active }),
    });
    load();
  };

  const remove = async (bannerId: string) => {
    if (!confirm('배너를 삭제할까요?')) return;
    await fetch('/api/admin/banners', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bannerId }),
    });
    load();
  };

  return (
    <div className="mt-6 bg-white rounded-xl shadow-sm border border-gray-100 p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-gray-700">광고 배너 관리</h2>
        <button
          onClick={() => setShowForm(!showForm)}
          className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-semibold hover:bg-blue-700 cursor-pointer"
        >
          + 배너 추가
        </button>
      </div>

      {showForm && (
        <form onSubmit={create} className="mb-4 p-3 bg-gray-50 rounded-lg grid grid-cols-2 gap-2">
          <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
            required placeholder="제목 (예: 보험청구 개선 플랫폼 OO)" className="px-2 py-1.5 border border-gray-300 rounded text-sm col-span-2" />
          <input value={form.subtitle} onChange={(e) => setForm({ ...form, subtitle: e.target.value })}
            placeholder="부제 (선택)" className="px-2 py-1.5 border border-gray-300 rounded text-sm col-span-2" />
          <input value={form.linkUrl} onChange={(e) => setForm({ ...form, linkUrl: e.target.value })}
            required placeholder="링크 URL (https://...)" className="px-2 py-1.5 border border-gray-300 rounded text-sm" />
          <input value={form.imageUrl} onChange={(e) => setForm({ ...form, imageUrl: e.target.value })}
            placeholder="이미지 URL (선택)" className="px-2 py-1.5 border border-gray-300 rounded text-sm" />
          <select value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })}
            className="px-2 py-1.5 border border-gray-300 rounded text-sm bg-white">
            <option value="community">커뮤니티</option>
            <option value="home">홈</option>
          </select>
          <button type="submit" className="px-3 py-1.5 bg-emerald-600 text-white rounded text-sm cursor-pointer hover:bg-emerald-700">
            등록
          </button>
        </form>
      )}

      {banners.length === 0 ? (
        <p className="text-xs text-gray-400">등록된 배너가 없습니다.</p>
      ) : (
        <div className="space-y-2">
          {banners.map((b) => (
            <div key={b.id} className="flex items-center justify-between border border-gray-100 rounded-lg px-3 py-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-sm">
                  <span className={`px-1.5 py-0.5 rounded text-[10px] ${b.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'}`}>
                    {b.active ? '노출 중' : '중지'}
                  </span>
                  <span className="text-[10px] text-gray-400">{b.position === 'community' ? '커뮤니티' : '홈'}</span>
                  <span className="font-medium text-gray-800 truncate">{b.title}</span>
                </div>
                <p className="text-[11px] text-gray-400 truncate">{b.linkUrl}</p>
              </div>
              <div className="flex gap-1 shrink-0">
                <button onClick={() => toggle(b.id, !b.active)}
                  className="px-2 py-1 bg-gray-100 text-gray-600 rounded text-xs cursor-pointer hover:bg-gray-200">
                  {b.active ? '중지' : '노출'}
                </button>
                <button onClick={() => remove(b.id)}
                  className="px-2 py-1 bg-red-50 text-red-600 border border-red-200 rounded text-xs cursor-pointer hover:bg-red-100">
                  삭제
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function AdminPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/users');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '로딩 실패');
      setUsers(data.users);
    } catch (err) {
      setError(err instanceof Error ? err.message : '오류');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const changeRole = async (userId: string, role: string) => {
    const res = await fetch('/api/admin/users', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, role }),
    });
    if (res.ok) load();
    else {
      const data = await res.json();
      alert(data.error || '변경 실패');
    }
  };

  const removeUser = async (userId: string, email: string) => {
    if (!confirm(`${email} 회원을 삭제할까요?`)) return;
    const res = await fetch('/api/admin/users', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    });
    if (res.ok) load();
    else {
      const data = await res.json();
      alert(data.error || '삭제 실패');
    }
  };

  const pendingCount = users.filter((u) => u.role === 'pending').length;

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-gray-800">관리자</h1>
          <p className="text-xs text-gray-400">회원 관리</p>
        </div>
        <nav className="flex gap-3 text-sm items-center">
          <Link href="/cases" className="text-blue-600 hover:underline">케이스 목록</Link>
          <Link href="/viewer" className="text-gray-500 hover:underline">3D 뷰어</Link>
          <a
            href="/api/admin/export"
            className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-semibold hover:bg-indigo-700"
          >
            YOLO 데이터셋 내보내기
          </a>
        </nav>
      </header>

      <main className="max-w-4xl mx-auto p-6">
        {loading ? (
          <p className="text-sm text-gray-400">로딩 중...</p>
        ) : error ? (
          <p className="text-sm text-red-500">{error}</p>
        ) : (
          <>
            {pendingCount > 0 && (
              <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-700">
                승인 대기 중인 회원이 {pendingCount}명 있습니다.
              </div>
            )}

            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-500 text-xs">
                  <tr>
                    <th className="text-left px-4 py-2.5">이름</th>
                    <th className="text-left px-4 py-2.5">이메일</th>
                    <th className="text-left px-4 py-2.5">역할</th>
                    <th className="text-right px-4 py-2.5">케이스</th>
                    <th className="text-right px-4 py-2.5">어노테이션</th>
                    <th className="text-right px-4 py-2.5">작업</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => {
                    const roleInfo = ROLE_LABELS[u.role] ?? ROLE_LABELS.pending;
                    return (
                      <tr key={u.id} className="border-t border-gray-100">
                        <td className="px-4 py-3 font-medium text-gray-800">{u.name}</td>
                        <td className="px-4 py-3 text-gray-500">{u.email}</td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 rounded border text-xs ${roleInfo.color}`}>
                            {roleInfo.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right text-gray-600">{u._count.cases}</td>
                        <td className="px-4 py-3 text-right text-gray-600">{u._count.annotations}</td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex gap-1 justify-end">
                            {(u.role === 'pending' || u.role === 'member') && (
                              <button
                                onClick={() => changeRole(u.id, 'annotator')}
                                className="px-2 py-1 bg-green-600 text-white rounded text-xs hover:bg-green-700 cursor-pointer"
                              >
                                어노테이터 승인
                              </button>
                            )}
                            {u.role === 'annotator' && (
                              <button
                                onClick={() => changeRole(u.id, 'member')}
                                className="px-2 py-1 bg-gray-200 text-gray-600 rounded text-xs hover:bg-gray-300 cursor-pointer"
                              >
                                권한 해제
                              </button>
                            )}
                            {(u.role === 'pending' || u.role === 'member') && (
                              <button
                                onClick={() => removeUser(u.id, u.email)}
                                className="px-2 py-1 bg-red-50 text-red-600 border border-red-200 rounded text-xs hover:bg-red-100 cursor-pointer"
                              >
                                삭제
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <BannerManager />
          </>
        )}
      </main>
    </div>
  );
}
