'use client';

import { useTeethState } from '@/hooks/useTeethState';
import { TOOTH_MAP } from '@/lib/dental/toothData';
import { ToothStatus, TreatmentStatus } from '@/types/dental';

const TREATMENT_ABBR: Record<TreatmentStatus, string> = {
  implant: 'I',
  crown: 'C',
  bridge: 'B',
};

const TREATMENT_COLOR: Record<TreatmentStatus, string> = {
  implant: 'text-blue-500',
  crown: 'text-yellow-500',
  bridge: 'text-emerald-500',
};

const UPPER_RIGHT = [18, 17, 16, 15, 14, 13, 12, 11];
const UPPER_LEFT = [21, 22, 23, 24, 25, 26, 27, 28];
const LOWER_RIGHT = [48, 47, 46, 45, 44, 43, 42, 41];
const LOWER_LEFT = [31, 32, 33, 34, 35, 36, 37, 38];

const STATUS_STYLES: Record<ToothStatus, string> = {
  present:  'bg-white border-gray-300 text-gray-800',
  missing:  'bg-gray-100 border-gray-400 text-gray-400 border-dashed',
  implant:  'bg-blue-50 border-blue-400 text-blue-700',
  crown:    'bg-yellow-50 border-yellow-400 text-yellow-700',
  bridge:   'bg-emerald-50 border-emerald-400 text-emerald-700',
};

const STATUS_LABELS: Record<ToothStatus, string> = {
  present: '',
  missing: '결',
  implant: 'I',
  crown: 'C',
  bridge: 'B',
};

function ToothCell({ fdi }: { fdi: number }) {
  const status = useTeethState((s) => s.teeth[fdi]);
  const selectedTooth = useTeethState((s) => s.selectedTooth);
  const hoveredTooth = useTeethState((s) => s.hoveredTooth);
  const setSelectedTooth = useTeethState((s) => s.setSelectedTooth);
  const setHoveredTooth = useTeethState((s) => s.setHoveredTooth);
  const planned = useTeethState((s) => s.treatmentPlan[fdi]);

  const info = TOOTH_MAP[fdi];
  const isSelected = selectedTooth === fdi;
  const isHovered = hoveredTooth === fdi;

  return (
    <button
      onClick={() => {
        setSelectedTooth(fdi);
      }}
      onMouseEnter={() => setHoveredTooth(fdi)}
      onMouseLeave={() => setHoveredTooth(null)}
      className={`
        w-[30px] h-[38px] rounded border-[1.5px] flex flex-col items-center justify-center
        font-medium transition-all duration-150 cursor-pointer shrink-0 relative
        ${STATUS_STYLES[status]}
        ${isSelected ? 'ring-2 ring-blue-500 border-blue-500' : ''}
        ${isHovered && !isSelected ? 'border-blue-300 shadow-md' : ''}
      `}
      title={info?.nameKo || ''}
    >
      <span className="text-[9px] leading-tight font-bold">{fdi}</span>
      <span className="text-[7px] leading-tight">
        {planned
          ? <span className={TREATMENT_COLOR[planned]}>→{TREATMENT_ABBR[planned]}</span>
          : STATUS_LABELS[status]
        }
      </span>
      {planned && (
        <span className="absolute top-0 right-0 w-1.5 h-1.5 rounded-full bg-indigo-500" />
      )}
    </button>
  );
}

function ToothRow({ teeth, label }: { teeth: number[]; label: string }) {
  return (
    <div className="flex items-center gap-[3px]">
      <span className="text-[9px] text-gray-400 w-4 text-right shrink-0">{label}</span>
      {teeth.map((fdi) => (
        <ToothCell key={fdi} fdi={fdi} />
      ))}
    </div>
  );
}

export default function DentalChart2D() {
  const resetAll = useTeethState((s) => s.resetAll);
  const teeth = useTeethState((s) => s.teeth);
  const treatmentPlan = useTeethState((s) => s.treatmentPlan);

  const counts = Object.values(teeth).reduce((acc, s) => {
    acc[s] = (acc[s] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const planCount = Object.keys(treatmentPlan).length;

  return (
    <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-700">치아 차트 (클릭: 치아 선택)</h3>
        <button
          onClick={resetAll}
          className="text-xs text-blue-500 hover:text-blue-700 cursor-pointer"
        >
          초기화
        </button>
      </div>

      <div className="text-center text-xs text-gray-400 mb-2">상악 (Upper)</div>

      <div className="flex flex-col items-center gap-1 mb-2">
        <div className="flex items-center gap-[3px]">
          <ToothRow teeth={UPPER_RIGHT} label="R" />
          <div className="w-px h-8 bg-gray-300 mx-[2px]" />
          <ToothRow teeth={UPPER_LEFT} label="" />
          <span className="text-[9px] text-gray-400 w-4 shrink-0">L</span>
        </div>
      </div>

      <div className="border-t border-dashed border-gray-300 my-1" />

      <div className="flex flex-col items-center gap-1 mt-2">
        <div className="flex items-center gap-[3px]">
          <ToothRow teeth={LOWER_RIGHT} label="R" />
          <div className="w-px h-8 bg-gray-300 mx-[2px]" />
          <ToothRow teeth={LOWER_LEFT} label="" />
          <span className="text-[9px] text-gray-400 w-4 shrink-0">L</span>
        </div>
      </div>

      <div className="text-center text-xs text-gray-400 mt-2">하악 (Lower)</div>

      {/* Status summary */}
      <div className="mt-3 pt-3 border-t border-gray-100 flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-500">
        <span>존재: <strong className="text-green-600">{counts.present || 0}</strong></span>
        <span>상실: <strong className="text-red-500">{counts.missing || 0}</strong></span>
        {(counts.implant || 0) > 0 && <span>임플란트: <strong className="text-blue-600">{counts.implant}</strong></span>}
        {(counts.crown || 0) > 0 && <span>크라운: <strong className="text-yellow-600">{counts.crown}</strong></span>}
        {(counts.bridge || 0) > 0 && <span>브릿지: <strong className="text-emerald-600">{counts.bridge}</strong></span>}
        {planCount > 0 && <span>치료계획: <strong className="text-indigo-600">{planCount}</strong></span>}
      </div>
    </div>
  );
}
