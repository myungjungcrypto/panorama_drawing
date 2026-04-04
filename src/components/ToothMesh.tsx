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

  if (isMissing) {
    // Render a translucent outline for missing teeth
    return (
      <mesh
        ref={meshRef}
        position={[pos.x, pos.y, pos.z]}
        rotation={[0, pos.rotationY, 0]}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        onPointerOver={(e) => { e.stopPropagation(); setHoveredTooth(fdi); }}
        onPointerOut={() => setHoveredTooth(null)}
      >
        <primitive object={geometry} attach="geometry" />
        <meshStandardMaterial
          color="#ff4444"
          transparent
          opacity={isHovered ? 0.4 : 0.15}
          wireframe
          side={THREE.DoubleSide}
        />
      </mesh>
    );
  }

  // Present tooth
  let color = '#f5f0e8'; // natural tooth color
  if (isSelected) color = '#4dabf7';
  else if (isHovered) color = '#a5d8ff';

  return (
    <mesh
      ref={meshRef}
      position={[pos.x, pos.y, pos.z]}
      rotation={[0, pos.rotationY, 0]}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      onPointerOver={(e) => { e.stopPropagation(); setHoveredTooth(fdi); }}
      onPointerOut={() => setHoveredTooth(null)}
    >
      <primitive object={geometry} attach="geometry" />
      <meshStandardMaterial
        color={color}
        roughness={0.3}
        metalness={0.05}
      />
    </mesh>
  );
}
