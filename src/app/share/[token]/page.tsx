'use client';

import { useState, useEffect, use } from 'react';
import dynamic from 'next/dynamic';
import { useTeethState } from '@/hooks/useTeethState';
import { ToothStatus, TreatmentStatus } from '@/types/dental';

const DentalArch3D = dynamic(() => import('@/components/DentalArch3D'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-[420px] bg-gray-50 rounded-xl">
      <div className="text-gray-400 text-sm">3D 뷰 로딩 중...</div>
    </div>
  ),
});

interface CaseView {
  statuses: Record<number, string> | null;
  treatments: { fdi: number; beforeStatus: string; afterStatus: string; treatment: string }[];
}

const STATUS_KO: Record<string, string> = {
  present: '존재', missing: '상실', crown: '크라운', implant: '임플란트', bridge: '브릿지',
};

export default function SharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [caseView, setCaseView] = useState<CaseView | null>(null);
  const [error, setError] = useState<string | null>(null);

  const resetAll = useTeethState((s) => s.resetAll);
  const setToothStatus = useTeethState((s) => s.setToothStatus);
  const setTreatmentPlan = useTeethState((s) => s.setTreatmentPlan);
  const setViewMode = useTeethState((s) => s.setViewMode);

  useEffect(() => {
    (async () => {
      const res = await fetch(`/api/share/${token}`);
      const data = await res.json();
      if (!res.ok) { setError(data.error || '링크를 열 수 없습니다.'); return; }
      setCaseView(data.caseView);
    })();
  }, [token]);

  useEffect(() => {
    if (!caseView) return;
    resetAll();
    if (caseView.statuses) {
      for (const [fdi, status] of Object.entries(caseView.statuses)) {
        setToothStatus(parseInt(fdi), status as ToothStatus);
      }
    }
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

  if (error) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl p-8 text-center shadow-sm border border-gray-100">
          <p className="text-sm text-gray-500">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      <header className="bg-white border-b border-gray-200 px-6 py-3">
        <h1 className="text-lg font-bold text-gray-800">내 치아 상태 3D 보기</h1>
        <p className="text-xs text-gray-400">
          치과에서 공유한 치아 상태 모식도입니다. 드래그하면 회전하고, 스크롤로 확대할 수 있습니다.
        </p>
      </header>

      <main className="flex-1 max-w-4xl w-full mx-auto p-4 space-y-4">
        {!caseView ? (
          <p className="text-sm text-gray-400 p-4">로딩 중...</p>
        ) : (
          <>
            <div className="h-[480px]">
              <DentalArch3D />
            </div>

            {caseView.treatments.length > 0 && (
              <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                <h2 className="text-sm font-semibold text-gray-700 mb-2">치료 계획 / 내역</h2>
                <div className="space-y-1.5">
                  {caseView.treatments.map((t) => (
                    <div key={t.fdi} className="flex items-center gap-2 text-sm">
                      <span className="font-bold text-gray-800 w-10">#{t.fdi}</span>
                      <span className="text-gray-500">{STATUS_KO[t.beforeStatus] ?? t.beforeStatus}</span>
                      <span className="text-gray-300">→</span>
                      <span className="text-gray-700">{STATUS_KO[t.afterStatus] ?? t.afterStatus}</span>
                      <span className="text-indigo-600 font-medium ml-2">{t.treatment}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <p className="text-[11px] text-gray-400 text-center pb-4">
              본 모식도는 상담 보조용 시각 자료이며 진단서가 아닙니다. 자세한 내용은 담당 치과에 문의하세요.
            </p>
          </>
        )}
      </main>
    </div>
  );
}
