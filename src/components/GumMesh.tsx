'use client';

import { useMemo } from 'react';
import * as THREE from 'three';
import { getArchCurvePoints } from '@/lib/dental/archGeometry';

interface GumMeshProps {
  isUpper: boolean;
}

export default function GumMesh({ isUpper }: GumMeshProps) {
  const geometry = useMemo(() => {
    const points = getArchCurvePoints(isUpper, 80);

    // Gum cross-section: thicker, more anatomical
    const outerWidth = 0.50;
    const innerWidth = 0.40;
    const gumHeight = 0.50;

    const vertices: number[] = [];
    const indices: number[] = [];
    const uvs: number[] = [];

    // 12-point cross-section profile for smoother shape
    const PROFILE_POINTS = 12;

    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      const next = points[Math.min(i + 1, points.length - 1)];
      const prev = points[Math.max(i - 1, 0)];

      const dx = next.x - prev.x;
      const dz = next.z - prev.z;
      const len = Math.sqrt(dx * dx + dz * dz) || 1;

      // Normal perpendicular to curve (outward)
      const nx = -dz / len;
      const nz = dx / len;

      const yBase = p.y;
      const yBottom = isUpper ? yBase : yBase - gumHeight;
      const yTop = isUpper ? yBase + gumHeight : yBase;

      const uAlong = i / (points.length - 1);

      // Generate smooth cross-section using angle sweep
      for (let j = 0; j < PROFILE_POINTS; j++) {
        const angle = (j / (PROFILE_POINTS - 1)) * Math.PI * 2;

        // Asymmetric profile: outer side is thicker than inner
        let radius: number;
        let yOffset: number;

        if (angle <= Math.PI) {
          // Outer half (0 to PI)
          const t = angle / Math.PI;
          radius = outerWidth * (0.8 + 0.25 * Math.sin(angle));
          yOffset = yBottom + (yTop - yBottom) * t;
        } else {
          // Inner half (PI to 2PI)
          const t = (angle - Math.PI) / Math.PI;
          radius = -innerWidth * (0.8 + 0.2 * Math.sin(angle - Math.PI));
          yOffset = yTop - (yTop - yBottom) * t;
        }

        const vx = p.x + nx * radius;
        const vz = p.z + nz * radius;

        vertices.push(vx, yOffset, vz);
        uvs.push(uAlong, j / (PROFILE_POINTS - 1));
      }
    }

    // Create faces
    for (let i = 0; i < points.length - 1; i++) {
      for (let j = 0; j < PROFILE_POINTS - 1; j++) {
        const a = i * PROFILE_POINTS + j;
        const b = a + 1;
        const c = (i + 1) * PROFILE_POINTS + j;
        const d = c + 1;

        indices.push(a, c, b);
        indices.push(b, c, d);
      }
      // Close the loop
      const a = i * PROFILE_POINTS + (PROFILE_POINTS - 1);
      const b = i * PROFILE_POINTS;
      const c = (i + 1) * PROFILE_POINTS + (PROFILE_POINTS - 1);
      const d = (i + 1) * PROFILE_POINTS;
      indices.push(a, c, b);
      indices.push(b, c, d);
    }

    // End caps
    for (const endI of [0, points.length - 1]) {
      const center = endI * PROFILE_POINTS;
      // Calculate center point
      let cx = 0, cy = 0, cz = 0;
      for (let j = 0; j < PROFILE_POINTS; j++) {
        const idx = center + j;
        cx += vertices[idx * 3];
        cy += vertices[idx * 3 + 1];
        cz += vertices[idx * 3 + 2];
      }
      cx /= PROFILE_POINTS;
      cy /= PROFILE_POINTS;
      cz /= PROFILE_POINTS;

      // Add center vertex
      const centerIdx = vertices.length / 3;
      vertices.push(cx, cy, cz);
      uvs.push(endI === 0 ? 0 : 1, 0.5);

      // Fan triangles
      for (let j = 0; j < PROFILE_POINTS; j++) {
        const j2 = (j + 1) % PROFILE_POINTS;
        if (endI === 0) {
          indices.push(centerIdx, center + j2, center + j);
        } else {
          indices.push(centerIdx, center + j, center + j2);
        }
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    return geo;
  }, [isUpper]);

  return (
    <mesh geometry={geometry}>
      <meshPhysicalMaterial
        color="#d46b6b"
        roughness={0.65}
        metalness={0.0}
        clearcoat={0.1}
        clearcoatRoughness={0.8}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}
