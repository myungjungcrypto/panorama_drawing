import { create } from 'zustand';
import { ToothStatus } from '@/types/dental';
import { ALL_TEETH } from '@/lib/dental/toothData';

interface TeethState {
  teeth: Record<number, ToothStatus>;
  selectedTooth: number | null;
  hoveredTooth: number | null;
  toggleTooth: (fdi: number) => void;
  setToothStatus: (fdi: number, status: ToothStatus) => void;
  setSelectedTooth: (fdi: number | null) => void;
  setHoveredTooth: (fdi: number | null) => void;
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

  toggleTooth: (fdi) =>
    set((state) => {
      const current = state.teeth[fdi];
      // Cycle: present → missing → present
      const next: ToothStatus = current === 'present' ? 'missing' : 'present';
      return { teeth: { ...state.teeth, [fdi]: next } };
    }),

  setToothStatus: (fdi, status) =>
    set((state) => ({
      teeth: { ...state.teeth, [fdi]: status },
    })),

  setSelectedTooth: (fdi) => set({ selectedTooth: fdi }),
  setHoveredTooth: (fdi) => set({ hoveredTooth: fdi }),

  resetAll: () =>
    set({
      teeth: createInitialTeeth(),
      selectedTooth: null,
      hoveredTooth: null,
    }),
}));
