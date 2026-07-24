'use client';

import { useState, useEffect, useCallback, use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

interface PanoramaItem {
  id: string;
  phase: string;
  filename: string;
  width: number;
  height: number;
  takenAt: string | null;
  annotStatus: string;
}

interface TreatmentLabelItem {
  id: string;
  fdi: number;
  beforeStatus: string;
  afterStatus: string;
  treatment: string;
  confirmed: boolean;
}

interface CaseDetail {
  id: string;
  title: string;
  status: string;
  isIdeal: boolean | null;
  note: string | null;
  shareToken: string | null;
  user: { name: string };
  panoramas: PanoramaItem[];
  treatmentLabels: TreatmentLabelItem[];
}

function UploadSlot({ caseId, phase, onDone }: { caseId: string; phase: 'before' | 'after'; onDone: () => void }) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [takenAt, setTakenAt] = useState('');
  const [consented, setConsented] = useState(false);

  const handleFile = async (file: File) => {
    setUploading(true);
    setError(null);
    try {
      // 이미지 크기 읽기
      const dims = await new Promise<{ w: number; h: number }>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
        img.onerror = () => reject(new Error('이미지를 읽을 수 없습니다.'));
        img.src = URL.createObjectURL(file);
      });

      const formData = new FormData();
      formData.append('file', file);
      formData.append('phase', phase);
      formData.append('width', String(dims.w));
      formData.append('height', String(dims.h));
      if (takenAt) formData.append('takenAt', takenAt);

      const res = await fetch(`/api/cases/${caseId}/panoramas`, { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '업로드 실패');
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : '업로드 오류');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="border-2 border-dashed border-gray-300 rounded-xl p-6 text-center">
      <p className="text-sm text-gray-500 mb-2">
        {phase === 'before' ? '치료 전' : '치료 후'} 파노라마 업로드
      </p>
      <div className="mb-2">
        <label className="text-xs text-gray-400 mr-2">촬영일 (선택):</label>
        <input
          type="date"
          value={takenAt}
          onChange={(e) => setTakenAt(e.target.value)}
          className="text-xs border border-gray-300 rounded px-2 py-1"
        />
      </div>
      {/* 개인정보 동의 */}
      <label className="flex items-start gap-2 text-left text-[11px] text-gray-500 mb-3 mx-auto max-w-xs cursor-pointer">
        <input
          type="checkbox"
          checked={consented}
          onChange={(e) => setConsented(e.target.checked)}
          className="mt-0.5"
        />
        <span>
          영상에 환자 성명·차트번호 등 <strong>식별정보가 없음</strong>을 확인했으며,
          소속 기관에서 활용에 필요한 절차를 완료했습니다.{' '}
          <a href="/privacy" target="_blank" className="text-blue-500 underline">처리방침</a>
        </span>
      </label>
      <label className={`inline-block px-4 py-2 text-white text-sm rounded-lg ${
        consented ? 'bg-blue-500 hover:bg-blue-600 cursor-pointer' : 'bg-gray-300 cursor-not-allowed'
      }`}>
        {uploading ? '업로드 중...' : '파일 선택'}
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          disabled={uploading || !consented}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
          className="hidden"
        />
      </label>
      {error && <p className="mt-2 text-xs text-red-500">{error}</p>}
    </div>
  );
}

function PanoramaCard({ pano }: { pano: PanoramaItem }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`/api/files/${pano.filename}`}
        alt={pano.phase === 'before' ? '치료 전' : '치료 후'}
        className="w-full object-contain bg-black"
        style={{ maxHeight: 260 }}
      />
      <div className="p-3 flex items-center justify-between">
        <div className="text-xs text-gray-500">
          {pano.takenAt && <span>촬영일: {new Date(pano.takenAt).toLocaleDateString('ko-KR')} · </span>}
          <span className={pano.annotStatus === 'done' ? 'text-green-600 font-semibold' : ''}>
            {pano.annotStatus === 'done' ? '어노테이션 완료' : pano.annotStatus === 'in_progress' ? '작업 중' : '어노테이션 전'}
          </span>
        </div>
        <Link
          href={`/annotate/${pano.id}`}
          className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-semibold hover:bg-emerald-700"
        >
          어노테이션 {pano.annotStatus === 'none' ? '시작' : '열기'}
        </Link>
      </div>
    </div>
  );
}

const STATUS_KO: Record<string, string> = {
  present: '존재', missing: '상실', crown: '크라운', implant: '임플란트', bridge: '브릿지',
};

export default function CaseDetailPage({ params }: { params: Promise<{ caseId: string }> }) {
  const { caseId } = use(params);
  const router = useRouter();
  const [caseData, setCaseData] = useState<CaseDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [computing, setComputing] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/cases/${caseId}`);
    const data = await res.json();
    if (res.ok) setCaseData(data.case);
    else setError(data.error || '로딩 실패');
  }, [caseId]);

  useEffect(() => { load(); }, [load]);

  const computeDiff = async () => {
    setComputing(true);
    const res = await fetch(`/api/cases/${caseId}/diff`, { method: 'POST' });
    const data = await res.json();
    setComputing(false);
    if (res.ok) load();
    else alert(data.error || 'diff 계산 실패');
  };

  const confirmLabel = async (labelId: string, confirmed: boolean) => {
    await fetch(`/api/cases/${caseId}/diff`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ labelId, confirmed }),
    });
    load();
  };

  const setIdeal = async (isIdeal: boolean | null) => {
    await fetch(`/api/cases/${caseId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isIdeal }),
    });
    load();
  };

  const deleteCase = async () => {
    if (!confirm('케이스와 모든 파노라마/어노테이션을 삭제할까요?')) return;
    const res = await fetch(`/api/cases/${caseId}`, { method: 'DELETE' });
    if (res.ok) router.push('/cases');
  };

  if (error) return <div className="p-8 text-sm text-red-500">{error}</div>;
  if (!caseData) return <div className="p-8 text-sm text-gray-400">로딩 중...</div>;

  const before = caseData.panoramas.find((p) => p.phase === 'before');
  const after = caseData.panoramas.find((p) => p.phase === 'after');
  const bothAnnotated = before?.annotStatus === 'done' && after?.annotStatus === 'done';

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-gray-800">{caseData.title}</h1>
          <p className="text-xs text-gray-400">{caseData.user.name}{caseData.note && ` · ${caseData.note}`}</p>
        </div>
        <nav className="flex gap-3 text-sm items-center">
          <Link href="/cases" className="text-blue-600 hover:underline">← 케이스 목록</Link>
          {caseData.panoramas.some((p) => p.annotStatus === 'done') && (
            <Link
              href={`/community/new?caseId=${caseId}`}
              className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-semibold hover:bg-indigo-700"
            >
              커뮤니티에 공유
            </Link>
          )}
          <button onClick={deleteCase} className="text-red-400 hover:text-red-600 text-xs cursor-pointer">
            삭제
          </button>
        </nav>
      </header>

      <main className="max-w-5xl mx-auto p-6 space-y-6">
        {/* 파노라마 전/후 */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <h2 className="text-sm font-semibold text-gray-700 mb-2">치료 전</h2>
            {before ? <PanoramaCard pano={before} /> : (
              <UploadSlot caseId={caseId} phase="before" onDone={load} />
            )}
          </div>
          <div>
            <h2 className="text-sm font-semibold text-gray-700 mb-2">치료 후</h2>
            {after ? <PanoramaCard pano={after} /> : (
              <UploadSlot caseId={caseId} phase="after" onDone={load} />
            )}
          </div>
        </div>

        {/* 치료 라벨 (diff) */}
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-700">치료 내역 (전/후 비교)</h2>
            <button
              onClick={computeDiff}
              disabled={!bothAnnotated || computing}
              className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-semibold hover:bg-indigo-700 disabled:bg-gray-200 disabled:text-gray-400 cursor-pointer"
              title={bothAnnotated ? '' : '전/후 어노테이션이 모두 완료되어야 합니다'}
            >
              {computing ? '계산 중...' : 'diff 계산'}
            </button>
          </div>

          {caseData.treatmentLabels.length === 0 ? (
            <p className="text-xs text-gray-400">
              {bothAnnotated
                ? '"diff 계산"을 누르면 전/후 어노테이션 차이에서 치료 내역을 도출합니다.'
                : '치료 전/후 파노라마의 어노테이션을 모두 완료하면 치료 내역을 계산할 수 있습니다.'}
            </p>
          ) : (
            <table className="w-full text-xs">
              <thead className="text-gray-400">
                <tr>
                  <th className="text-left py-1.5">치아 (FDI)</th>
                  <th className="text-left py-1.5">치료 전</th>
                  <th className="text-left py-1.5">치료 후</th>
                  <th className="text-left py-1.5">치료 내역</th>
                  <th className="text-right py-1.5">확인</th>
                </tr>
              </thead>
              <tbody>
                {caseData.treatmentLabels.map((l) => (
                  <tr key={l.id} className="border-t border-gray-100">
                    <td className="py-2 font-bold text-gray-800">#{l.fdi}</td>
                    <td className="py-2 text-gray-600">{STATUS_KO[l.beforeStatus] ?? l.beforeStatus}</td>
                    <td className="py-2 text-gray-600">{STATUS_KO[l.afterStatus] ?? l.afterStatus}</td>
                    <td className="py-2 font-medium text-indigo-700">{l.treatment}</td>
                    <td className="py-2 text-right">
                      <button
                        onClick={() => confirmLabel(l.id, !l.confirmed)}
                        className={`px-2 py-1 rounded text-[10px] cursor-pointer ${
                          l.confirmed
                            ? 'bg-green-100 text-green-700'
                            : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                        }`}
                      >
                        {l.confirmed ? '확인됨 ✓' : '확인'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* 환자용 공유 링크 */}
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold text-gray-700">환자용 3D 공유 링크</h2>
            {caseData.shareToken ? (
              <button
                onClick={async () => {
                  await fetch(`/api/cases/${caseId}/share`, { method: 'DELETE' });
                  load();
                }}
                className="px-3 py-1.5 bg-red-50 text-red-600 border border-red-200 rounded-lg text-xs cursor-pointer hover:bg-red-100"
              >
                공유 해제
              </button>
            ) : (
              <button
                onClick={async () => {
                  const res = await fetch(`/api/cases/${caseId}/share`, { method: 'POST' });
                  const data = await res.json();
                  if (!res.ok) alert(data.error || '생성 실패');
                  load();
                }}
                disabled={!caseData.panoramas.some((p) => p.annotStatus === 'done')}
                className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-semibold cursor-pointer hover:bg-blue-700 disabled:bg-gray-200 disabled:text-gray-400"
              >
                링크 생성
              </button>
            )}
          </div>
          {caseData.shareToken ? (
            <div className="flex gap-2 items-center">
              <input
                readOnly
                value={`${typeof window !== 'undefined' ? window.location.origin : ''}/share/${caseData.shareToken}`}
                className="flex-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-600"
                onFocus={(e) => e.target.select()}
              />
              <button
                onClick={() => {
                  navigator.clipboard.writeText(`${window.location.origin}/share/${caseData.shareToken}`);
                  alert('링크가 복사되었습니다. 환자에게 문자/카톡으로 전달하세요.');
                }}
                className="px-3 py-2 bg-gray-100 text-gray-600 rounded-lg text-xs cursor-pointer hover:bg-gray-200 shrink-0"
              >
                복사
              </button>
            </div>
          ) : (
            <p className="text-xs text-gray-400">
              링크를 생성하면 환자가 로그인 없이 자신의 3D 치아 상태와 치료 계획을 볼 수 있습니다.
              (X-ray 원본은 포함되지 않으며, 링크는 언제든 해제할 수 있습니다)
            </p>
          )}
        </div>

        {/* 관리자 큐레이션 */}
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
          <h2 className="text-sm font-semibold text-gray-700 mb-2">케이스 분류 (관리자)</h2>
          <div className="flex gap-2">
            <button
              onClick={() => setIdeal(true)}
              className={`px-3 py-1.5 rounded-lg text-xs cursor-pointer border ${
                caseData.isIdeal === true
                  ? 'bg-purple-600 text-white border-purple-600'
                  : 'bg-white text-gray-600 border-gray-200'
              }`}
            >
              이상적 치료
            </button>
            <button
              onClick={() => setIdeal(false)}
              className={`px-3 py-1.5 rounded-lg text-xs cursor-pointer border ${
                caseData.isIdeal === false
                  ? 'bg-orange-500 text-white border-orange-500'
                  : 'bg-white text-gray-600 border-gray-200'
              }`}
            >
              타협된 치료
            </button>
            <button
              onClick={() => setIdeal(null)}
              className={`px-3 py-1.5 rounded-lg text-xs cursor-pointer border ${
                caseData.isIdeal === null
                  ? 'bg-gray-500 text-white border-gray-500'
                  : 'bg-white text-gray-600 border-gray-200'
              }`}
            >
              미분류
            </button>
          </div>
          <p className="text-[10px] text-gray-400 mt-2">
            &quot;이상적 치료&quot;로 분류된 케이스만 치료 계획 AI 학습에 사용됩니다.
          </p>
        </div>
      </main>
    </div>
  );
}
