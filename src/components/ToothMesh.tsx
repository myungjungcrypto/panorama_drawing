'use client';

import { useRef, useMemo } from 'react';
import * as THREE from 'three';
import { ThreeEvent, useFrame } from '@react-three/fiber';
import { createToothGeometry } from '@/lib/dental/toothGeometry';
import { TOOTH_MAP } from '@/lib/dental/toothData';
import { TOOTH_3D_POSITIONS } from '@/lib/dental/archGeometry';
import { useTeethState } from '@/hooks/useTeethState';
import { ToothStatus, TreatmentStatus } from '@/types/dental';

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

// 펄싱 오버레이 컴포넌트
function PlannedOverlayMesh({ geometry, targetStatus }: { geometry: THREE.BufferGeometry; targetStatus: TreatmentStatus }) {
  const materialRef = useRef<THREE.MeshPhysicalMaterial>(null);
  const planned = getPlannedAppearance(targetStatus);

  useFrame(({ clock }) => {
    if (materialRef.current) {
      materialRef.current.opacity = 0.45 + 0.15 * Math.sin(clock.elapsedTime * 2);
    }
  });

  return (
    <mesh geometry={geometry} scale={1.05}>
      <meshPhysicalMaterial
        ref={materialRef}
        color={planned.color}
        emissive={planned.emissive}
        metalness={planned.metalness}
        roughness={planned.roughness}
        transparent
        opacity={0.45}
        depthWrite={false}
        side={THREE.FrontSide}
      />
    </mesh>
  );
}

export default function ToothMesh({ fdi }: ToothMeshProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const info = TOOTH_MAP[fdi];
  const pos = TOOTH_3D_POSITIONS.get(fdi);

  const status = useTeethState((s) => s.teeth[fdi]);
  const selectedTooth = useTeethState((s) => s.selectedTooth);
  const hoveredTooth = useTeethState((s) => s.hoveredTooth);
  const setSelectedTooth = useTeethState((s) => s.setSelectedTooth);
  const setHoveredTooth = useTeethState((s) => s.setHoveredTooth);
  const toggleTooth = useTeethState((s) => s.toggleTooth);
  const treatmentStatus = useTeethState((s) => s.treatmentPlan[fdi]);
  const viewMode = useTeethState((s) => s.viewMode);

  const geometry = useMemo(() => {
    if (!info) return new THREE.BoxGeometry(0.3, 0.5, 0.3);
    return createToothGeometry(info.type);
  }, [info]);

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
    toggleTooth(fdi);
  };

  // Upper teeth (quadrants 1,2): flip upside down so roots point up, crowns face down
  const isUpper = info.quadrant <= 2;
  const rotationX = isUpper ? Math.PI : 0;

  return (
    <group
      position={[pos.x, pos.y, pos.z]}
      rotation={[rotationX, pos.rotationY, 0]}
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
        <PlannedOverlayMesh geometry={geometry} targetStatus={treatmentStatus} />
      )}
    </group>
  );
}
