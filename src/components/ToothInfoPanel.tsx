'use client';

import { useTeethState, getValidTreatments } from '@/hooks/useTeethState';
import { TOOTH_MAP } from '@/lib/dental/toothData';
import { ToothStatus, TreatmentStatus } from '@/types/dental';

const STATUS_CONFIG: Record<ToothStatus, { label: string; color: string; bg: string; border: string }> = {
  present:  { label: '존재',      color: 'text-green-600', bg: 'bg-green-50',  border: 'border-green-200' },
  missing:  { label: '상실',      color: 'text-red-500',   bg: 'bg-red-50',    border: 'border-red-200' },
  implant:  { label: '임플란트',  color: 'text-blue-600',  bg: 'bg-blue-50',   border: 'border-blue-200' },
  crown:    { label: '크라운',    color: 'text-yellow-600', bg: 'bg-yellow-50', border: 'border-yellow-200' },
  bridge:   { label: '브릿지',    color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-200' },
};

const TREATMENT_LABELS: Record<TreatmentStatus, string> = {
  implant: '임플란트',
  crown: '크라운',
  bridge: '브릿지',
};

const ALL_STATUSES: ToothStatus[] = ['present', 'missing', 'implant', 'crown', 'bridge'];

const TYPE_NAMES: Record<string, string> = {
  incisor: '절치',
  canine: '견치',
  premolar: '소구치',
  molar: '대구치',
};

export default function ToothInfoPanel() {
  const selectedTooth = useTeethState((s) => s.selectedTooth);
  const hoveredTooth = useTeethState((s) => s.hoveredTooth);
  const teeth = useTeethState((s) => s.teeth);
  const setToothStatus = useTeethState((s) => s.setToothStatus);
  const treatmentPlan = useTeethState((s) => s.treatmentPlan);
  const setTreatmentPlan = useTeethState((s) => s.setTreatmentPlan);
  const removeTreatmentPlan = useTeethState((s) => s.removeTreatmentPlan);

  const activeFdi = hoveredTooth ?? selectedTooth;
  const info = activeFdi ? TOOTH_MAP[activeFdi] : null;
  const status = activeFdi ? teeth[activeFdi] : null;
  const planned = activeFdi ? treatmentPlan[activeFdi] : undefined;

  if (!activeFdi || !info || !status) {
    return (
      <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
        <h3 className="text-sm font-semibold text-gray-700 mb-2">치아 정보</h3>
        <p className="text-xs text-gray-400">
          치아를 클릭하거나 호버하면 정보가 표시됩니다.
        </p>
      </div>
    );
  }

  const currentConfig = STATUS_CONFIG[status];
  const validTreatments = getValidTreatments(status);

  return (
    <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
      <h3 className="text-sm font-semibold text-gray-700 mb-3">치아 정보</h3>

      <div className="space-y-1.5">
        <div className="flex justify-between text-sm">
          <span className="text-gray-500">FDI 번호</span>
          <span className="font-bold text-gray-800">#{activeFdi}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-500">이름</span>
          <span className="text-gray-800 text-right text-xs leading-5">{info.nameKo}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-500">유형</span>
          <span className="text-gray-800">{TYPE_NAMES[info.type]}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-500">상태</span>
          <span className={`font-semibold ${currentConfig.color}`}>
            {currentConfig.label}
          </span>
        </div>
      </div>

      {/* Status buttons */}
      <div className="mt-3 pt-3 border-t border-gray-100">
        <p className="text-[10px] text-gray-400 mb-2">상태 변경:</p>
        <div className="grid grid-cols-2 gap-1">
          {ALL_STATUSES.map((s) => {
            const config = STATUS_CONFIG[s];
            const isActive = status === s;
            return (
              <button
                key={s}
                onClick={() => setToothStatus(activeFdi, s)}
                className={`
                  py-1.5 rounded text-[11px] font-medium transition-colors cursor-pointer border
                  ${isActive
                    ? `${config.bg} ${config.color} ${config.border} ring-1 ring-offset-1 ring-current`
                    : `bg-white text-gray-500 border-gray-200 hover:${config.bg}`
                  }
                `}
              >
                {config.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Treatment plan section */}
      {validTreatments.length > 0 && (
        <div className="mt-3 pt-3 border-t border-dashed border-gray-200">
          <p className="text-[10px] text-gray-400 mb-2">치료 계획:</p>

          {planned && (
            <div className="mb-2 flex items-center justify-between bg-indigo-50 border border-indigo-200 rounded px-2 py-1.5">
              <span className="text-[11px] font-semibold text-indigo-700">
                {currentConfig.label} → {TREATMENT_LABELS[planned]}
              </span>
              <button
                onClick={() => removeTreatmentPlan(activeFdi)}
                className="text-[10px] text-indigo-400 hover:text-indigo-600 cursor-pointer ml-2"
              >
                취소
              </button>
            </div>
          )}

          <div className="grid grid-cols-2 gap-1">
            {validTreatments.map((t) => {
              const isPlanned = planned === t;
              const config = STATUS_CONFIG[t];
              return (
                <button
                  key={t}
                  onClick={() => isPlanned ? removeTreatmentPlan(activeFdi) : setTreatmentPlan(activeFdi, t)}
                  className={`
                    py-1.5 rounded text-[11px] font-medium transition-colors cursor-pointer border border-dashed
                    ${isPlanned
                      ? `${config.bg} ${config.color} ${config.border} ring-1 ring-offset-1 ring-current`
                      : `bg-white text-gray-500 border-gray-300 hover:${config.bg}`
                    }
                  `}
                >
                  {TREATMENT_LABELS[t]}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
