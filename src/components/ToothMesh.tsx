'use client';

import { useRef, useMemo } from 'react';
import * as THREE from 'three';
import { ThreeEvent, useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { createToothGeometry } from '@/lib/dental/toothGeometry';
import { TOOTH_MAP } from '@/lib/dental/toothData';
import { TOOTH_3D_POSITIONS } from '@/lib/dental/archGeometry';
import { useTeethState } from '@/hooks/useTeethState';
import { useCalibration, getCalib } from '@/hooks/useCalibration';
import { useRealToothModel, useRealToothGeometry } from '@/lib/dental/toothModel';
import { ToothStatus, TreatmentStatus } from '@/types/dental';

const DEG = Math.PI / 180;

interface ToothMeshProps {
  fdi: number;
}

// Status-based color and material config
function getStatusAppearance(status: ToothStatus, isSelected: boolean, isHovered: boolean) {
  const base = {
    color: '#ede8d0',
    emissive: '#000000',
    opacity: 1,
    wireframe: false,
    transparent: false,
    roughness: 0.25,
    metalness: 0.02,
    side: THREE.FrontSide as THREE.Side,
    envMapIntensity: 0.5,
  };

  switch (status) {
    case 'missing':
      return {
        ...base,
        color: '#ff4444',
        emissive: '#330000',
        opacity: isHovered ? 0.4 : 0.15,
        wireframe: true,
        transparent: true,
        roughness: 1,
        metalness: 0,
        side: THREE.DoubleSide as THREE.Side,
      };
    case 'implant':
      return {
        ...base,
        color: isSelected ? '#4dabf7' : isHovered ? '#c0c0c0' : '#a0a8b0',
        emissive: '#111518',
        metalness: 0.7,
        roughness: 0.1,
      };
    case 'crown':
      return {
        ...base,
        color: isSelected ? '#4dabf7' : isHovered ? '#fff0b0' : '#f0d060',
        emissive: isSelected ? '#0a1a3a' : '#1a1500',
        metalness: 0.35,
        roughness: 0.15,
      };
    case 'bridge':
      return {
        ...base,
        color: isSelected ? '#4dabf7' : isHovered ? '#c8e6c9' : '#81c784',
        emissive: '#001a00',
        metalness: 0.15,
        roughness: 0.25,
      };
    default: // present
      if (isSelected) return { ...base, color: '#6db3f2', emissive: '#0a1530' };
      if (isHovered) return { ...base, color: '#c8e0ff', emissive: '#050a15' };
      return base;
  }
}

// 치료 계획 오버레이 색상 (밝은 버전)
function getPlannedAppearance(status: TreatmentStatus) {
  switch (status) {
    case 'implant':
      return { color: '#b8c4d0', emissive: '#1a2030', metalness: 0.6, roughness: 0.15 };
    case 'crown':
      return { color: '#f8e080', emissive: '#2a2500', metalness: 0.3, roughness: 0.2 };
    case 'bridge':
      return { color: '#a5d6a7', emissive: '#002a00', metalness: 0.1, roughness: 0.3 };
  }
}

const TREATMENT_BADGE: Record<TreatmentStatus, { label: string; bg: string }> = {
  implant: { label: '임플란트 예정', bg: '#3b82f6' },
  crown: { label: '크라운 예정', bg: '#d97706' },
  bridge: { label: '브릿지 예정', bg: '#059669' },
};

// 펄싱 오버레이 컴포넌트 (강조 버전: 발광 + 크기 펄스)
function PlannedOverlayMesh({ geometry, targetStatus }: { geometry: THREE.BufferGeometry; targetStatus: TreatmentStatus }) {
  const materialRef = useRef<THREE.MeshPhysicalMaterial>(null);
  const meshRef = useRef<THREE.Mesh>(null);
  const planned = getPlannedAppearance(targetStatus);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime * 2.5;
    if (materialRef.current) {
      materialRef.current.opacity = 0.55 + 0.25 * Math.sin(t);
      materialRef.current.emissiveIntensity = 1.2 + 0.8 * Math.sin(t);
    }
    if (meshRef.current) {
      const s = 1.07 + 0.02 * Math.sin(t);
      meshRef.current.scale.setScalar(s);
    }
  });

  return (
    <mesh ref={meshRef} geometry={geometry} scale={1.07}>
      <meshPhysicalMaterial
        ref={materialRef}
        color={planned.color}
        emissive={planned.color}
        emissiveIntensity={1.2}
        metalness={planned.metalness}
        roughness={planned.roughness}
        transparent
        opacity={0.55}
        depthWrite={false}
        side={THREE.FrontSide}
      />
    </mesh>
  );
}

// GLB 실물 모델이 있으면 사용, 없으면 절차적 지오메트리로 폴백
export default function ToothMesh({ fdi }: ToothMeshProps) {
  const hasRealModel = useRealToothModel();
  return hasRealModel ? <RealToothMesh fdi={fdi} /> : <ProceduralToothMesh fdi={fdi} />;
}

function ProceduralToothMesh({ fdi }: ToothMeshProps) {
  const info = TOOTH_MAP[fdi];
  const geometry = useMemo(() => {
    if (!info) return new THREE.BoxGeometry(0.3, 0.5, 0.3);
    return createToothGeometry(info.type);
  }, [info]);
  return <ToothMeshInner fdi={fdi} geometry={geometry} />;
}

function RealToothMesh({ fdi }: ToothMeshProps) {
  const info = TOOTH_MAP[fdi];
  const realGeo = useRealToothGeometry(fdi);
  const geometry = useMemo(() => {
    if (realGeo) return realGeo;
    if (!info) return new THREE.BoxGeometry(0.3, 0.5, 0.3);
    return createToothGeometry(info.type);
  }, [realGeo, info]);
  return <ToothMeshInner fdi={fdi} geometry={geometry} />;
}

function ToothMeshInner({ fdi, geometry }: { fdi: number; geometry: THREE.BufferGeometry }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const info = TOOTH_MAP[fdi];
  const pos = TOOTH_3D_POSITIONS.get(fdi);

  const status = useTeethState((s) => s.teeth[fdi]);
  const selectedTooth = useTeethState((s) => s.selectedTooth);
  const hoveredTooth = useTeethState((s) => s.hoveredTooth);
  const setSelectedTooth = useTeethState((s) => s.setSelectedTooth);
  const setHoveredTooth = useTeethState((s) => s.setHoveredTooth);
  const treatmentStatus = useTeethState((s) => s.treatmentPlan[fdi]);
  const viewMode = useTeethState((s) => s.viewMode);
  const calibMap = useCalibration((s) => s.calib);
  const calib = getCalib(calibMap, fdi);

  if (!pos || !info) return null;

  const isSelected = selectedTooth === fdi;
  const isHovered = hoveredTooth === fdi;

  // viewMode에 따라 표시할 상태 결정
  const displayStatus = viewMode === 'planned' && treatmentStatus
    ? treatmentStatus
    : status;
  const appearance = getStatusAppearance(displayStatus, isSelected, isHovered);

  const showPlannedOverlay = viewMode === 'compare' && !!treatmentStatus;

  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    setSelectedTooth(fdi);
  };

  const handleDoubleClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
  };

  // 상악(1,2분면): 순측(+Z) 방향을 유지한 채 치관이 아래를 향하도록
  // 순측 축 기준 롤(Z축 π) 회전. Euler XYZ 순서상 [0, rotY, π] = Ry(rotY)·Rz(π)
  // → 롤 먼저 적용 후 악궁 yaw 적용이라 순측 방향이 뒤틀리지 않음.
  const isUpper = info.quadrant <= 2;
  const rotationZ = isUpper ? Math.PI : 0;

  return (
    <group
      position={[pos.x, pos.y, pos.z]}
      rotation={[0, pos.rotationY, rotationZ]}
    >
      {/* 보정(캘리브레이션) 적용 그룹 */}
      <group
        rotation={[calib.rx * DEG, calib.ry * DEG, calib.rz * DEG]}
        scale={calib.s}
      >
        {/* 현재 상태 메시 */}
        <mesh
          ref={meshRef}
          onClick={handleClick}
          onDoubleClick={handleDoubleClick}
          onPointerOver={(e) => { e.stopPropagation(); setHoveredTooth(fdi); }}
          onPointerOut={() => setHoveredTooth(null)}
          geometry={geometry}
        >
          <meshPhysicalMaterial
            key={`${fdi}-${displayStatus}`}
            color={appearance.color}
            emissive={appearance.emissive}
            transparent={appearance.transparent}
            opacity={appearance.opacity}
            wireframe={appearance.wireframe}
            roughness={appearance.roughness}
            metalness={appearance.metalness}
            side={appearance.side}
            clearcoat={displayStatus === 'present' || displayStatus === 'crown' ? 0.3 : 0}
            clearcoatRoughness={0.2}
            envMapIntensity={appearance.envMapIntensity}
          />
        </mesh>

        {/* 치료 계획 오버레이 (비교 모드) */}
        {showPlannedOverlay && (
          <>
            <PlannedOverlayMesh geometry={geometry} targetStatus={treatmentStatus} />
            {/* 계획 배지: 치관 방향 위에 표시 (그룹 회전으로 상악은 자동으로 아래쪽) */}
            <Html
              position={[0, 0.55, 0]}
              center
              distanceFactor={7}
              style={{ pointerEvents: 'none' }}
            >
              <div
                className="px-1.5 py-0.5 rounded text-[9px] font-bold text-white whitespace-nowrap shadow"
                style={{ background: TREATMENT_BADGE[treatmentStatus].bg }}
              >
                {TREATMENT_BADGE[treatmentStatus].label}
              </div>
            </Html>
          </>
        )}
      </group>
    </group>
  );
}
