'use client';

import { useRef, useMemo } from 'react';
import * as THREE from 'three';
import { ThreeEvent } from '@react-three/fiber';
import { createToothGeometry } from '@/lib/dental/toothGeometry';
import { TOOTH_MAP } from '@/lib/dental/toothData';
import { TOOTH_3D_POSITIONS } from '@/lib/dental/archGeometry';
import { useTeethState } from '@/hooks/useTeethState';

interface ToothMeshProps {
  fdi: number;
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

  const isMissing = status === 'missing';
  const isSelected = selectedTooth === fdi;
  const isHovered = hoveredTooth === fdi;

  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    setSelectedTooth(fdi);
  };

  const handleDoubleClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    toggleTooth(fdi);
  };

  // Determine material properties based on state
  let color = '#f5f0e8';
  let opacity = 1;
  let wireframe = false;
  let transparent = false;

  if (isMissing) {
    color = '#ff4444';
    opacity = isHovered ? 0.4 : 0.15;
    wireframe = true;
    transparent = true;
  } else if (isSelected) {
    color = '#4dabf7';
  } else if (isHovered) {
    color = '#a5d8ff';
  }

  return (
    <mesh
      ref={meshRef}
      position={[pos.x, pos.y, pos.z]}
      rotation={[0, pos.rotationY, 0]}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      onPointerOver={(e) => { e.stopPropagation(); setHoveredTooth(fdi); }}
      onPointerOut={() => setHoveredTooth(null)}
      geometry={geometry}
    >
      <meshStandardMaterial
        key={`${fdi}-${isMissing ? 'missing' : 'present'}`}
        color={color}
        transparent={transparent}
        opacity={opacity}
        wireframe={wireframe}
        roughness={isMissing ? 1 : 0.3}
        metalness={isMissing ? 0 : 0.05}
        side={isMissing ? THREE.DoubleSide : THREE.FrontSide}
      />
    </mesh>
  );
}
