'use client';

import { useTeethState } from '@/hooks/useTeethState';
import { TOOTH_MAP } from '@/lib/dental/toothData';

export default function ToothInfoPanel() {
  const selectedTooth = useTeethState((s) => s.selectedTooth);
  const hoveredTooth = useTeethState((s) => s.hoveredTooth);
  const teeth = useTeethState((s) => s.teeth);
  const toggleTooth = useTeethState((s) => s.toggleTooth);

  const activeFdi = hoveredTooth ?? selectedTooth;
  const info = activeFdi ? TOOTH_MAP[activeFdi] : null;
  const status = activeFdi ? teeth[activeFdi] : null;

  if (!activeFdi || !info) {
    return (
      <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
        <h3 className="text-sm font-semibold text-gray-700 mb-2">치아 정보</h3>
        <p className="text-xs text-gray-400">
          3D 뷰에서 치아를 클릭하거나 호버하면 정보가 표시됩니다.
        </p>
      </div>
    );
  }

  const typeNames: Record<string, string> = {
    incisor: '절치',
    canine: '견치',
    premolar: '소구치',
    molar: '대구치',
  };

  return (
    <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
      <h3 className="text-sm font-semibold text-gray-700 mb-3">치아 정보</h3>

      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-gray-500">FDI 번호</span>
          <span className="font-bold text-gray-800">#{activeFdi}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-500">이름</span>
          <span className="text-gray-800">{info.nameKo}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-500">유형</span>
          <span className="text-gray-800">{typeNames[info.type]}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-500">상태</span>
          <span className={status === 'missing' ? 'text-red-500 font-semibold' : 'text-green-600 font-semibold'}>
            {status === 'missing' ? '상실' : '존재'}
          </span>
        </div>
      </div>

      <button
        onClick={() => toggleTooth(activeFdi)}
        className={`
          mt-3 w-full py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer
          ${status === 'missing'
            ? 'bg-green-50 text-green-600 hover:bg-green-100 border border-green-200'
            : 'bg-red-50 text-red-500 hover:bg-red-100 border border-red-200'
          }
        `}
      >
        {status === 'missing' ? '존재로 변경' : '상실로 변경'}
      </button>
    </div>
  );
}
