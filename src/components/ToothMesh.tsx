'use client';

import { useRef, useMemo } from 'react';
import * as THREE from 'three';
import { ThreeEvent } from '@react-three/fiber';
import { createToothGeometry } from '@/lib/dental/toothGeometry';
import { TOOTH_MAP } from '@/lib/dental/toothData';
import { TOOTH_3D_POSITIONS } from '@/lib/dental/archGeometry';
import { useTeethState } from '@/hooks/useTeethState';
import { ToothStatus } from '@/types/dental';

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
      return base;
  }
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

  const geometry = useMemo(() => {
    if (!info) return new THREE.BoxGeometry(0.3, 0.5, 0.3);
    return createToothGeometry(info.type);
  }, [info]);

  if (!pos || !info) return null;

  const isSelected = selectedTooth === fdi;
  const isHovered = hoveredTooth === fdi;
  const appearance = getStatusAppearance(status, isSelected, isHovered);

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
    <mesh
      ref={meshRef}
      position={[pos.x, pos.y, pos.z]}
      rotation={[rotationX, pos.rotationY, 0]}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      onPointerOver={(e) => { e.stopPropagation(); setHoveredTooth(fdi); }}
      onPointerOut={() => setHoveredTooth(null)}
      geometry={geometry}
    >
      <meshPhysicalMaterial
        key={`${fdi}-${status}`}
        color={appearance.color}
        emissive={appearance.emissive}
        transparent={appearance.transparent}
        opacity={appearance.opacity}
        wireframe={appearance.wireframe}
        roughness={appearance.roughness}
        metalness={appearance.metalness}
        side={appearance.side}
        clearcoat={status === 'present' || status === 'crown' ? 0.3 : 0}
        clearcoatRoughness={0.2}
        envMapIntensity={appearance.envMapIntensity}
      />
    </mesh>
  );
}
