'use client';

import { useMemo } from 'react';
import * as THREE from 'three';
import { getArchCurvePoints } from '@/lib/dental/archGeometry';

interface GumMeshProps {
  isUpper: boolean;
}

export default function GumMesh({ isUpper }: GumMeshProps) {
  const geometry = useMemo(() => {
    const points = getArchCurvePoints(isUpper, 64);

    // Gum cross-section dimensions
    const outerWidth = 0.55;  // how far outward
    const innerWidth = 0.45;  // how far inward
    const gumHeight = 0.55;   // total height of gum base
    const topRound = 0.08;    // slight rounding on top edge

    const vertices: number[] = [];
    const indices: number[] = [];

    // For each point along the arch, create a cross-section profile
    // Cross-section (7 points):
    //   0: outer-bottom, 1: outer-mid, 2: outer-top
    //   3: top-center (ridge)
    //   4: inner-top, 5: inner-mid, 6: inner-bottom
    //   7: bottom-center
    const PROFILE_POINTS = 8;

    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      const next = points[Math.min(i + 1, points.length - 1)];
      const prev = points[Math.max(i - 1, 0)];

      // Direction along the curve
      const dx = next.x - prev.x;
      const dz = next.z - prev.z;
      const len = Math.sqrt(dx * dx + dz * dz) || 1;

      // Normal perpendicular to curve (outward direction in xz plane)
      const nx = -dz / len;
      const nz = dx / len;

      // Y positions
      const yBase = p.y;
      const yBottom = isUpper ? yBase : yBase - gumHeight;
      const yTop = isUpper ? yBase + gumHeight : yBase;
      const yMid = (yBottom + yTop) / 2;

      // Profile vertices (going around the cross-section)
      // Outer side
      vertices.push(
        p.x + nx * outerWidth, yBottom, p.z + nz * outerWidth,  // 0: outer-bottom
        p.x + nx * (outerWidth + 0.05), yMid, p.z + nz * (outerWidth + 0.05),    // 1: outer-mid (slight bulge)
        p.x + nx * outerWidth, yTop - topRound, p.z + nz * outerWidth,   // 2: outer-top
      );
      // Top ridge
      vertices.push(
        p.x + nx * (outerWidth * 0.3), yTop, p.z + nz * (outerWidth * 0.3),  // 3: top-center ridge
      );
      // Inner side
      vertices.push(
        p.x - nx * innerWidth, yTop - topRound, p.z - nz * innerWidth,   // 4: inner-top
        p.x - nx * (innerWidth + 0.05), yMid, p.z - nz * (innerWidth + 0.05),    // 5: inner-mid (slight bulge)
        p.x - nx * innerWidth, yBottom, p.z - nz * innerWidth,  // 6: inner-bottom
      );
      // Bottom
      vertices.push(
        p.x, yBottom - 0.02, p.z,  // 7: bottom-center (slightly below for flat bottom)
      );
    }

    // Create faces between consecutive cross-sections
    for (let i = 0; i < points.length - 1; i++) {
      const base = i * PROFILE_POINTS;
      const nextBase = (i + 1) * PROFILE_POINTS;

      for (let j = 0; j < PROFILE_POINTS; j++) {
        const j2 = (j + 1) % PROFILE_POINTS;
        indices.push(
          base + j, nextBase + j, nextBase + j2,
          base + j, nextBase + j2, base + j2,
        );
      }
    }

    // Cap the two ends
    for (const endIdx of [0, points.length - 1]) {
      const base = endIdx * PROFILE_POINTS;
      // Simple fan from center to perimeter
      for (let j = 0; j < PROFILE_POINTS; j++) {
        const j2 = (j + 1) % PROFILE_POINTS;
        if (endIdx === 0) {
          indices.push(base + 7, base + j, base + j2);
        } else {
          indices.push(base + 7, base + j2, base + j);
        }
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
        color="#e07070"
        roughness={0.55}
        metalness={0.0}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}
