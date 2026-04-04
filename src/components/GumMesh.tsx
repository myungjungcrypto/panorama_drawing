'use client';

import { useMemo } from 'react';
import * as THREE from 'three';
import { getArchCurvePoints } from '@/lib/dental/archGeometry';

interface GumMeshProps {
  isUpper: boolean;
}

export default function GumMesh({ isUpper }: GumMeshProps) {
  const geometry = useMemo(() => {
    const points = getArchCurvePoints(isUpper, 48);
    const shape = new THREE.Shape();
    const gumWidth = 0.4; // half-width of gum cross-section
    const gumHeight = 0.3;

    // Create a tube-like shape along the arch curve
    const vertices: number[] = [];
    const indices: number[] = [];

    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      const next = points[Math.min(i + 1, points.length - 1)];
      const prev = points[Math.max(i - 1, 0)];

      // Direction along the curve
      const dx = next.x - prev.x;
      const dz = next.z - prev.z;
      const len = Math.sqrt(dx * dx + dz * dz) || 1;

      // Normal perpendicular to the curve (in xz plane)
      const nx = -dz / len;
      const nz = dx / len;

      // Create 4 vertices per cross-section: outer-top, inner-top, inner-bottom, outer-bottom
      const yTop = p.y + gumHeight * 0.3;
      const yBottom = p.y - gumHeight * 0.7;

      vertices.push(
        p.x + nx * gumWidth, yTop, p.z + nz * gumWidth,      // outer top
        p.x - nx * gumWidth, yTop, p.z - nz * gumWidth,      // inner top
        p.x - nx * gumWidth, yBottom, p.z - nz * gumWidth,    // inner bottom
        p.x + nx * gumWidth, yBottom, p.z + nz * gumWidth,    // outer bottom
      );
    }

    // Create faces between consecutive cross-sections
    for (let i = 0; i < points.length - 1; i++) {
      const base = i * 4;
      const next = (i + 1) * 4;

      for (let j = 0; j < 4; j++) {
        const j2 = (j + 1) % 4;
        indices.push(
          base + j, next + j, next + j2,
          base + j, next + j2, base + j2,
        );
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    return geo;
  }, [isUpper]);

  return (
    <mesh geometry={geometry}>
      <meshStandardMaterial
        color="#e8a0a0"
        roughness={0.6}
        metalness={0.0}
        transparent
        opacity={0.7}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}
