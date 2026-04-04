'use client';

import { useTeethState } from '@/hooks/useTeethState';
import { TOOTH_MAP } from '@/lib/dental/toothData';

const UPPER_RIGHT = [18, 17, 16, 15, 14, 13, 12, 11]; // patient's right
const UPPER_LEFT = [21, 22, 23, 24, 25, 26, 27, 28];
const LOWER_RIGHT = [48, 47, 46, 45, 44, 43, 42, 41];
const LOWER_LEFT = [31, 32, 33, 34, 35, 36, 37, 38];

function ToothCell({ fdi }: { fdi: number }) {
  const status = useTeethState((s) => s.teeth[fdi]);
  const selectedTooth = useTeethState((s) => s.selectedTooth);
  const hoveredTooth = useTeethState((s) => s.hoveredTooth);
  const toggleTooth = useTeethState((s) => s.toggleTooth);
  const setSelectedTooth = useTeethState((s) => s.setSelectedTooth);
  const setHoveredTooth = useTeethState((s) => s.setHoveredTooth);

  const info = TOOTH_MAP[fdi];
  const isMissing = status === 'missing';
  const isSelected = selectedTooth === fdi;
  const isHovered = hoveredTooth === fdi;

  return (
    <button
      onClick={() => {
        toggleTooth(fdi);
        setSelectedTooth(fdi);
      }}
      onMouseEnter={() => setHoveredTooth(fdi)}
      onMouseLeave={() => setHoveredTooth(null)}
      className={`
        w-10 h-14 rounded-md border-2 flex flex-col items-center justify-center
        text-xs font-medium transition-all duration-150 cursor-pointer
        ${isMissing
          ? 'bg-gray-200 border-gray-400 text-gray-500 border-dashed'
          : 'bg-white border-gray-300 text-gray-800 hover:border-blue-400'
        }
        ${isSelected ? 'ring-2 ring-blue-500 border-blue-500' : ''}
        ${isHovered && !isSelected ? 'border-blue-300 shadow-md' : ''}
      `}
      title={info?.nameKo || ''}
    >
      <span className="text-[10px] leading-tight font-bold">{fdi}</span>
      <span className="text-[8px] leading-tight text-gray-400 mt-0.5">
        {isMissing ? '상실' : '존재'}
      </span>
    </button>
  );
}

function ToothRow({ teeth, label }: { teeth: number[]; label: string }) {
  return (
    <div className="flex items-center gap-1">
      <span className="text-[10px] text-gray-400 w-6 text-right mr-1">{label}</span>
      {teeth.map((fdi) => (
        <ToothCell key={fdi} fdi={fdi} />
      ))}
    </div>
  );
}

export default function DentalChart2D() {
  const resetAll = useTeethState((s) => s.resetAll);
  const teeth = useTeethState((s) => s.teeth);

  const missingCount = Object.values(teeth).filter((s) => s === 'missing').length;

  return (
    <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-700">치아 차트 (클릭하여 상실 표시)</h3>
        <button
          onClick={resetAll}
          className="text-xs text-blue-500 hover:text-blue-700 cursor-pointer"
        >
          초기화
        </button>
      </div>

      {/* Dental chart label */}
      <div className="text-center text-xs text-gray-400 mb-2">상악 (Upper)</div>

      {/* Upper jaw */}
      <div className="flex flex-col items-center gap-1 mb-3">
        <div className="flex gap-1">
          <ToothRow teeth={UPPER_RIGHT} label="R" />
          <div className="w-px bg-gray-300 mx-1" />
          <ToothRow teeth={UPPER_LEFT} label="" />
          <span className="text-[10px] text-gray-400 w-6 ml-1">L</span>
        </div>
      </div>

      {/* Midline separator */}
      <div className="border-t border-dashed border-gray-300 my-2" />

      {/* Lower jaw */}
      <div className="flex flex-col items-center gap-1 mt-3">
        <div className="flex gap-1">
          <ToothRow teeth={LOWER_RIGHT} label="R" />
          <div className="w-px bg-gray-300 mx-1" />
          <ToothRow teeth={LOWER_LEFT} label="" />
          <span className="text-[10px] text-gray-400 w-6 ml-1">L</span>
        </div>
      </div>

      <div className="text-center text-xs text-gray-400 mt-2">하악 (Lower)</div>

      {/* Status summary */}
      <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500">
        <span>상실 치아: <strong className="text-red-500">{missingCount}</strong>개</span>
        <span>존재 치아: <strong className="text-green-600">{32 - missingCount}</strong>개</span>
      </div>
    </div>
  );
}
