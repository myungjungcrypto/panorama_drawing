'use client';

import { useState } from 'react';
import { useTeethState } from '@/hooks/useTeethState';

// 뷰어의 현재 상태(치아 상태 + 치료 계획)를 스냅샷으로 저장하고 환자 공유 링크 생성
export default function ShareSnapshotButton() {
  const teeth = useTeethState((s) => s.teeth);
  const treatmentPlan = useTeethState((s) => s.treatmentPlan);
  const [link, setLink] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const share = async () => {
    setBusy(true);
    try {
      const res = await fetch('/api/snapshots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teeth, treatmentPlan }),
      });
      const data = await res.json();
      if (res.status === 401) {
        alert('환자 공유 링크는 로그인 후 사용할 수 있습니다.');
        window.location.href = '/login?from=/viewer';
        return;
      }
      if (!res.ok) throw new Error(data.error || '링크 생성 실패');
      const url = `${window.location.origin}/share/${data.token}`;
      setLink(url);
      await navigator.clipboard.writeText(url).catch(() => {});
    } catch (err) {
      alert(err instanceof Error ? err.message : '오류가 발생했습니다.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      {link && (
        <input
          readOnly
          value={link}
          onFocus={(e) => e.target.select()}
          className="w-56 px-2 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-[11px] text-gray-600"
        />
      )}
      <button
        onClick={share}
        disabled={busy}
        className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-semibold hover:bg-emerald-700 disabled:bg-gray-300 cursor-pointer shrink-0"
        title="현재 3D 상태와 치료 계획을 환자가 볼 수 있는 링크로 공유"
      >
        {busy ? '생성 중...' : link ? '링크 재생성' : '환자에게 공유'}
      </button>
    </div>
  );
}
