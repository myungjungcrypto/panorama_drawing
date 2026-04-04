'use client';

import { Suspense, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import ToothMesh from './ToothMesh';
import GumMesh from './GumMesh';
import { ALL_TEETH } from '@/lib/dental/toothData';
import { useTeethState } from '@/hooks/useTeethState';

type ViewPreset = 'front' | 'top' | 'right' | 'left';
type ArchFilter = 'all' | 'upper' | 'lower';

function Scene({ archFilter }: { archFilter: ArchFilter }) {
  const filteredTeeth = ALL_TEETH.filter((t) => {
    if (archFilter === 'upper') return t.quadrant <= 2;
    if (archFilter === 'lower') return t.quadrant >= 3;
    return true;
  });

  return (
    <>
      {/* Lighting */}
      <ambientLight intensity={0.6} />
      <directionalLight position={[5, 8, 5]} intensity={0.8} castShadow />
      <directionalLight position={[-5, 5, -5]} intensity={0.3} />

      {/* Gum base */}
      {(archFilter === 'all' || archFilter === 'upper') && <GumMesh isUpper={true} />}
      {(archFilter === 'all' || archFilter === 'lower') && <GumMesh isUpper={false} />}

      {/* Teeth */}
      {filteredTeeth.map((t) => (
        <ToothMesh key={t.fdi} fdi={t.fdi} />
      ))}
    </>
  );
}

interface CameraControlsProps {
  viewPreset: ViewPreset;
}

function CameraSetup({ viewPreset }: CameraControlsProps) {
  const positions: Record<ViewPreset, [number, number, number]> = {
    front: [0, 0, 7],
    top: [0, 8, 0.1],
    right: [-7, 1, 0],
    left: [7, 1, 0],
  };

  return (
    <OrbitControls
      target={[0, 0, 1]}
      enablePan={true}
      enableZoom={true}
      minDistance={3}
      maxDistance={15}
      makeDefault
    />
  );
}

export default function DentalArch3D() {
  const [viewPreset, setViewPreset] = useState<ViewPreset>('front');
  const [archFilter, setArchFilter] = useState<ArchFilter>('all');
  const teeth = useTeethState((s) => s.teeth);

  const missingCount = Object.values(teeth).filter((s) => s === 'missing').length;

  const cameraPositions: Record<ViewPreset, [number, number, number]> = {
    front: [0, 0, 7],
    top: [0, 8, 0.1],
    right: [-7, 1, 0],
    left: [7, 1, 0],
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-100 bg-gray-50">
        <div className="flex items-center gap-1">
          <span className="text-xs text-gray-500 mr-2">시점:</span>
          {(['front', 'top', 'right', 'left'] as ViewPreset[]).map((preset) => (
            <button
              key={preset}
              onClick={() => setViewPreset(preset)}
              className={`px-2 py-1 text-xs rounded cursor-pointer transition-colors
                ${viewPreset === preset
                  ? 'bg-blue-500 text-white'
                  : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
                }`}
            >
              {{ front: '정면', top: '위', right: '우측', left: '좌측' }[preset]}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          <span className="text-xs text-gray-500 mr-2">표시:</span>
          {(['all', 'upper', 'lower'] as ArchFilter[]).map((filter) => (
            <button
              key={filter}
              onClick={() => setArchFilter(filter)}
              className={`px-2 py-1 text-xs rounded cursor-pointer transition-colors
                ${archFilter === filter
                  ? 'bg-blue-500 text-white'
                  : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
                }`}
            >
              {{ all: '전체', upper: '상악', lower: '하악' }[filter]}
            </button>
          ))}
        </div>
      </div>

      {/* 3D Canvas */}
      <div className="flex-1 min-h-[400px]">
        <Canvas
          camera={{
            position: cameraPositions[viewPreset],
            fov: 45,
            near: 0.1,
            far: 100,
          }}
          style={{ background: 'linear-gradient(180deg, #f0f4f8 0%, #e2e8f0 100%)' }}
        >
          <Suspense fallback={null}>
            <Scene archFilter={archFilter} />
            <CameraSetup viewPreset={viewPreset} />
          </Suspense>
        </Canvas>
      </div>

      {/* Status bar */}
      <div className="px-4 py-2 border-t border-gray-100 bg-gray-50 flex items-center justify-between text-xs text-gray-500">
        <span>마우스 드래그: 회전 | 스크롤: 줌 | 더블클릭: 상실 토글</span>
        <span>
          상실: <strong className="text-red-500">{missingCount}</strong> / 32
        </span>
      </div>
    </div>
  );
}
