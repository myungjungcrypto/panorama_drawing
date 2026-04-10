'use client';

import { Suspense, useState, useRef, useCallback, useEffect } from 'react';
import * as THREE from 'three';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, Html } from '@react-three/drei';
import ToothMesh from './ToothMesh';
import GumMesh from './GumMesh';
import { ALL_TEETH, TOOTH_MAP } from '@/lib/dental/toothData';
import { TOOTH_3D_POSITIONS, getGumLineY } from '@/lib/dental/archGeometry';
import { useTeethState } from '@/hooks/useTeethState';

type ViewPreset = 'front' | 'top' | 'right' | 'left';
type ArchFilter = 'all' | 'upper' | 'lower';

const CAMERA_POSITIONS: Record<ViewPreset, [number, number, number]> = {
  front: [0, 1, 8],
  top: [0, 9, 0.5],
  right: [-8, 1, 1],
  left: [8, 1, 1],
};

const CAMERA_TARGET: [number, number, number] = [0, 0, 1.2];

function ToothLabel({ fdi, showLabels }: { fdi: number; showLabels: boolean }) {
  const pos = TOOTH_3D_POSITIONS.get(fdi);
  const info = TOOTH_MAP[fdi];
  const status = useTeethState((s) => s.teeth[fdi]);
  if (!pos || !showLabels || !info) return null;

  const isMissing = status === 'missing';
  const isUpper = info.quadrant <= 2;
  const gumY = getGumLineY(isUpper);
  // Upper: labels above gum (higher Y), Lower: labels below gum (lower Y)
  const labelY = isUpper ? gumY + 0.65 : gumY - 0.85;

  return (
    <Html
      position={[pos.x, labelY, pos.z]}
      center
      distanceFactor={8}
      style={{ pointerEvents: 'none' }}
    >
      <div className={`text-[10px] font-bold px-1 rounded ${
        isMissing ? 'text-red-500 bg-red-50/80' : 'text-gray-700 bg-white/80'
      }`}>
        {fdi}
      </div>
    </Html>
  );
}

function CameraController({ viewPreset }: { viewPreset: ViewPreset }) {
  const { camera } = useThree();
  const controlsRef = useRef<any>(null);

  useEffect(() => {
    const pos = CAMERA_POSITIONS[viewPreset];
    camera.position.set(pos[0], pos[1], pos[2]);
    camera.lookAt(CAMERA_TARGET[0], CAMERA_TARGET[1], CAMERA_TARGET[2]);
    if (controlsRef.current) {
      controlsRef.current.target.set(CAMERA_TARGET[0], CAMERA_TARGET[1], CAMERA_TARGET[2]);
      controlsRef.current.update();
    }
  }, [viewPreset, camera]);

  return (
    <OrbitControls
      ref={controlsRef}
      target={CAMERA_TARGET}
      enablePan={true}
      enableZoom={true}
      minDistance={3}
      maxDistance={18}
      makeDefault
    />
  );
}

function Scene({ archFilter, showLabels }: { archFilter: ArchFilter; showLabels: boolean }) {
  const filteredTeeth = ALL_TEETH.filter((t) => {
    if (archFilter === 'upper') return t.quadrant <= 2;
    if (archFilter === 'lower') return t.quadrant >= 3;
    return true;
  });

  return (
    <>
      {/* Improved lighting for dental visualization */}
      <ambientLight intensity={0.4} />
      <directionalLight position={[3, 8, 6]} intensity={1.0} color="#ffffff" />
      <directionalLight position={[-4, 6, -4]} intensity={0.4} color="#e8e0ff" />
      <directionalLight position={[0, -2, 6]} intensity={0.25} color="#ffe8d0" />
      <directionalLight position={[0, 4, -3]} intensity={0.2} color="#d0e8ff" />
      <hemisphereLight args={['#b0c4de', '#8b7355', 0.3]} />

      {/* Gum base */}
      {(archFilter === 'all' || archFilter === 'upper') && <GumMesh isUpper={true} />}
      {(archFilter === 'all' || archFilter === 'lower') && <GumMesh isUpper={false} />}

      {/* Individual tooth status overlays (crown color, missing wireframe, etc.) */}
      {filteredTeeth.map((t) => (
        <ToothMesh key={t.fdi} fdi={t.fdi} />
      ))}

      {filteredTeeth.map((t) => (
        <ToothLabel key={`label-${t.fdi}`} fdi={t.fdi} showLabels={showLabels} />
      ))}
    </>
  );
}

export default function DentalArch3D() {
  const [viewPreset, setViewPreset] = useState<ViewPreset>('front');
  const [archFilter, setArchFilter] = useState<ArchFilter>('all');
  const [showLabels, setShowLabels] = useState(true);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const teeth = useTeethState((s) => s.teeth);

  const missingCount = Object.values(teeth).filter((s) => s === 'missing').length;
  const presentCount = 32 - missingCount;

  const handleScreenshot = useCallback(() => {
    const canvas = document.querySelector('canvas');
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = `dental-3d-${new Date().toISOString().slice(0, 10)}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  }, []);

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-100 bg-gray-50 flex-wrap gap-y-1">
        <div className="flex items-center gap-1">
          <span className="text-xs text-gray-500 mr-1">시점:</span>
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
          <span className="text-xs text-gray-500 mr-1">표시:</span>
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
        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowLabels(!showLabels)}
            className={`px-2 py-1 text-xs rounded cursor-pointer transition-colors
              ${showLabels
                ? 'bg-blue-500 text-white'
                : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
              }`}
          >
            번호
          </button>
          <button
            onClick={handleScreenshot}
            className="px-2 py-1 text-xs rounded cursor-pointer bg-white text-gray-600 hover:bg-gray-100 border border-gray-200"
          >
            캡처
          </button>
        </div>
      </div>

      {/* 3D Canvas */}
      <div className="flex-1 min-h-[400px]">
        <Canvas
          ref={canvasRef}
          gl={{ preserveDrawingBuffer: true }}
          camera={{
            position: CAMERA_POSITIONS[viewPreset],
            fov: 45,
            near: 0.1,
            far: 100,
          }}
          style={{ background: 'linear-gradient(180deg, #f0f4f8 0%, #e2e8f0 100%)' }}
        >
          <Suspense fallback={null}>
            <Scene archFilter={archFilter} showLabels={showLabels} />
            <CameraController viewPreset={viewPreset} />
          </Suspense>
        </Canvas>
      </div>

      {/* Status bar */}
      <div className="px-4 py-2 border-t border-gray-100 bg-gray-50 flex items-center justify-between text-xs text-gray-500">
        <span>드래그: 회전 | 스크롤: 줌 | 더블클릭: 상실 토글</span>
        <span>
          존재: <strong className="text-green-600">{presentCount}</strong> |
          상실: <strong className="text-red-500">{missingCount}</strong> / 32
        </span>
      </div>
    </div>
  );
}
