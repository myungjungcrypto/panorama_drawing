'use client';

import { create } from 'zustand';

// 치아별 보정값: 회전(도 단위), 크기 배율
export interface ToothCalib {
  rx: number;
  ry: number;
  rz: number;
  s: number;
}

export const DEFAULT_CALIB: ToothCalib = { rx: 0, ry: 0, rz: 0, s: 1 };

interface CalibState {
  calib: Record<number, ToothCalib>;
  loaded: boolean;
  editMode: boolean;
  setEditMode: (on: boolean) => void;
  load: () => Promise<void>;
  setTooth: (fdi: number, patch: Partial<ToothCalib>) => void;
  applyToScope: (fromFdi: number, scope: 'all' | 'upper' | 'lower') => void;
  resetTooth: (fdi: number) => void;
  resetAll: () => void;
  save: () => Promise<string>;
}

const ALL_FDIS: number[] = [];
for (let q = 1; q <= 4; q++) for (let p = 1; p <= 8; p++) ALL_FDIS.push(q * 10 + p);

export const useCalibration = create<CalibState>((set, get) => ({
  calib: {},
  loaded: false,
  editMode: false,

  setEditMode: (on) => set({ editMode: on }),

  load: async () => {
    if (get().loaded) return;
    try {
      const res = await fetch('/api/calibration');
      if (res.ok) {
        const data = await res.json();
        set({ calib: data.calib ?? {}, loaded: true });
      } else {
        set({ loaded: true });
      }
    } catch {
      set({ loaded: true });
    }
  },

  setTooth: (fdi, patch) =>
    set((state) => ({
      calib: {
        ...state.calib,
        [fdi]: { ...DEFAULT_CALIB, ...state.calib[fdi], ...patch },
      },
    })),

  applyToScope: (fromFdi, scope) =>
    set((state) => {
      const src = state.calib[fromFdi] ?? DEFAULT_CALIB;
      const targets = ALL_FDIS.filter((fdi) => {
        if (scope === 'upper') return fdi < 30;
        if (scope === 'lower') return fdi >= 30;
        return true;
      });
      const next = { ...state.calib };
      for (const fdi of targets) next[fdi] = { ...src };
      return { calib: next };
    }),

  resetTooth: (fdi) =>
    set((state) => {
      const next = { ...state.calib };
      delete next[fdi];
      return { calib: next };
    }),

  resetAll: () => set({ calib: {} }),

  save: async () => {
    const res = await fetch('/api/calibration', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ calib: get().calib }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || '저장 실패');
    }
    return '보정값이 서버에 저장되었습니다.';
  },
}));

export function getCalib(calib: Record<number, ToothCalib>, fdi: number): ToothCalib {
  return calib[fdi] ?? DEFAULT_CALIB;
}
