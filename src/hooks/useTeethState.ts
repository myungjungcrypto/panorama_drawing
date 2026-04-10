import { create } from 'zustand';
import { ToothStatus, TreatmentStatus, ViewMode } from '@/types/dental';
import { ALL_TEETH } from '@/lib/dental/toothData';

interface TeethState {
  teeth: Record<number, ToothStatus>;
  selectedTooth: number | null;
  hoveredTooth: number | null;
  treatmentPlan: Record<number, TreatmentStatus>;
  viewMode: ViewMode;
  toggleTooth: (fdi: number) => void;
  setToothStatus: (fdi: number, status: ToothStatus) => void;
  setSelectedTooth: (fdi: number | null) => void;
  setHoveredTooth: (fdi: number | null) => void;
  setTreatmentPlan: (fdi: number, status: TreatmentStatus) => void;
  removeTreatmentPlan: (fdi: number) => void;
  clearAllTreatmentPlans: () => void;
  setViewMode: (mode: ViewMode) => void;
  resetAll: () => void;
}

function createInitialTeeth(): Record<number, ToothStatus> {
  const teeth: Record<number, ToothStatus> = {};
  for (const t of ALL_TEETH) {
    teeth[t.fdi] = 'present';
  }
  return teeth;
}

export const useTeethState = create<TeethState>((set) => ({
  teeth: createInitialTeeth(),
  selectedTooth: null,
  hoveredTooth: null,
  treatmentPlan: {},
  viewMode: 'current',

  toggleTooth: (fdi) =>
    set((state) => {
      const current = state.teeth[fdi];
      const next: ToothStatus = current === 'present' ? 'missing' : 'present';
      return { teeth: { ...state.teeth, [fdi]: next } };
    }),

  setToothStatus: (fdi, status) =>
    set((state) => {
      const newPlan = { ...state.treatmentPlan };
      // 현재 상태가 계획 상태와 같아지면 계획 제거
      if (newPlan[fdi] === status) {
        delete newPlan[fdi];
      }
      return { teeth: { ...state.teeth, [fdi]: status }, treatmentPlan: newPlan };
    }),

  setSelectedTooth: (fdi) => set({ selectedTooth: fdi }),
  setHoveredTooth: (fdi) => set({ hoveredTooth: fdi }),

  setTreatmentPlan: (fdi, status) =>
    set((state) => {
      // 현재 상태와 같으면 계획 제거
      if (state.teeth[fdi] === status) {
        const newPlan = { ...state.treatmentPlan };
        delete newPlan[fdi];
        return { treatmentPlan: newPlan };
      }
      return { treatmentPlan: { ...state.treatmentPlan, [fdi]: status } };
    }),

  removeTreatmentPlan: (fdi) =>
    set((state) => {
      const newPlan = { ...state.treatmentPlan };
      delete newPlan[fdi];
      return { treatmentPlan: newPlan };
    }),

  clearAllTreatmentPlans: () =>
    set({ treatmentPlan: {}, viewMode: 'current' }),

  setViewMode: (mode) => set({ viewMode: mode }),

  resetAll: () =>
    set({
      teeth: createInitialTeeth(),
      selectedTooth: null,
      hoveredTooth: null,
      treatmentPlan: {},
      viewMode: 'current',
    }),
}));

// 유효한 치료 옵션 반환
export function getValidTreatments(currentStatus: ToothStatus): TreatmentStatus[] {
  switch (currentStatus) {
    case 'missing': return ['implant', 'bridge'];
    case 'present': return ['crown', 'bridge', 'implant'];
    case 'implant': return ['crown'];
    default: return [];
  }
}
