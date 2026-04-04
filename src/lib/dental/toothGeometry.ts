import * as THREE from 'three';
import { ToothType } from '@/types/dental';

const SEG = 16; // segment count for smoother shapes

const TOOTH_DIMENSIONS: Record<ToothType, { w: number; h: number; d: number }> = {
  incisor:  { w: 0.35, h: 0.65, d: 0.20 },
  canine:   { w: 0.32, h: 0.70, d: 0.25 },
  premolar: { w: 0.38, h: 0.55, d: 0.35 },
  molar:    { w: 0.55, h: 0.50, d: 0.45 },
};

export function createToothGeometry(type: ToothType): THREE.BufferGeometry {
  const dim = TOOTH_DIMENSIONS[type];
  switch (type) {
    case 'incisor':  return createIncisorGeometry(dim);
    case 'canine':   return createCanineGeometry(dim);
    case 'premolar': return createPremolarGeometry(dim);
    case 'molar':    return createMolarGeometry(dim);
  }
}

function createIncisorGeometry(dim: { w: number; h: number; d: number }): THREE.BufferGeometry {
  // Chisel-shaped crown using a rounded box-like cylinder
  const crown = new THREE.CylinderGeometry(
    dim.w * 0.45, dim.w * 0.5, dim.h * 0.45, SEG, 1
  );
  // Flatten to make it more blade-like
  scaleGeometryAxis(crown, 'z', dim.d / dim.w * 0.7);
  crown.translate(0, dim.h * 0.22, 0);

  // Rounded top edge
  const top = new THREE.SphereGeometry(dim.w * 0.45, SEG, 8, 0, Math.PI * 2, 0, Math.PI * 0.35);
  scaleGeometryAxis(top, 'z', dim.d / dim.w * 0.7);
  top.translate(0, dim.h * 0.44, 0);

  const root = new THREE.CylinderGeometry(dim.w * 0.18, dim.w * 0.08, dim.h * 0.5, SEG);
  root.translate(0, -dim.h * 0.25, 0);

  let geo = mergeGeometries(crown, top);
  geo = mergeGeometries(geo, root);
  return geo;
}

function createCanineGeometry(dim: { w: number; h: number; d: number }): THREE.BufferGeometry {
  // Pointed crown
  const crown = new THREE.ConeGeometry(dim.w * 0.38, dim.h * 0.45, SEG);
  crown.translate(0, dim.h * 0.32, 0);

  const base = new THREE.CylinderGeometry(dim.w * 0.38, dim.w * 0.32, dim.h * 0.2, SEG);
  base.translate(0, dim.h * 0.05, 0);

  const root = new THREE.CylinderGeometry(dim.w * 0.2, dim.w * 0.08, dim.h * 0.5, SEG);
  root.translate(0, -dim.h * 0.28, 0);

  let geo = mergeGeometries(crown, base);
  geo = mergeGeometries(geo, root);
  return geo;
}

function createPremolarGeometry(dim: { w: number; h: number; d: number }): THREE.BufferGeometry {
  // Rounded base
  const base = new THREE.CylinderGeometry(dim.w * 0.42, dim.w * 0.4, dim.h * 0.3, SEG);
  scaleGeometryAxis(base, 'z', dim.d / dim.w * 0.9);
  base.translate(0, dim.h * 0.05, 0);

  // Two cusps
  const cusp1 = new THREE.SphereGeometry(dim.w * 0.24, SEG, 10, 0, Math.PI * 2, 0, Math.PI * 0.5);
  cusp1.translate(-dim.w * 0.1, dim.h * 0.2, 0);

  const cusp2 = new THREE.SphereGeometry(dim.w * 0.22, SEG, 10, 0, Math.PI * 2, 0, Math.PI * 0.5);
  cusp2.translate(dim.w * 0.1, dim.h * 0.18, 0);

  const root = new THREE.CylinderGeometry(dim.w * 0.18, dim.w * 0.08, dim.h * 0.42, SEG);
  root.translate(0, -dim.h * 0.3, 0);

  let geo = mergeGeometries(base, cusp1);
  geo = mergeGeometries(geo, cusp2);
  geo = mergeGeometries(geo, root);
  return geo;
}

function createMolarGeometry(dim: { w: number; h: number; d: number }): THREE.BufferGeometry {
  // Wide rounded base
  const base = new THREE.CylinderGeometry(dim.w * 0.45, dim.w * 0.42, dim.h * 0.28, SEG);
  scaleGeometryAxis(base, 'z', dim.d / dim.w);
  base.translate(0, dim.h * 0.04, 0);

  // Four cusps
  const cuspPositions = [
    [-dim.w * 0.14, dim.h * 0.18, -dim.d * 0.14],
    [dim.w * 0.14, dim.h * 0.18, -dim.d * 0.14],
    [-dim.w * 0.14, dim.h * 0.17, dim.d * 0.14],
    [dim.w * 0.14, dim.h * 0.17, dim.d * 0.14],
  ];

  let geo: THREE.BufferGeometry = base;
  for (const [cx, cy, cz] of cuspPositions) {
    const cusp = new THREE.SphereGeometry(dim.w * 0.2, SEG, 10, 0, Math.PI * 2, 0, Math.PI * 0.5);
    cusp.translate(cx, cy, cz);
    geo = mergeGeometries(geo, cusp);
  }

  // Two roots (wider apart)
  const root1 = new THREE.CylinderGeometry(dim.w * 0.14, dim.w * 0.07, dim.h * 0.38, SEG);
  root1.translate(-dim.w * 0.16, -dim.h * 0.28, 0);

  const root2 = new THREE.CylinderGeometry(dim.w * 0.14, dim.w * 0.07, dim.h * 0.38, SEG);
  root2.translate(dim.w * 0.16, -dim.h * 0.28, 0);

  geo = mergeGeometries(geo, root1);
  geo = mergeGeometries(geo, root2);
  return geo;
}

function scaleGeometryAxis(geo: THREE.BufferGeometry, axis: 'x' | 'y' | 'z', scale: number) {
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  const idx = axis === 'x' ? 0 : axis === 'y' ? 1 : 2;
  for (let i = 0; i < pos.count; i++) {
    const val = pos.getComponent(i, idx);
    pos.setComponent(i, idx, val * scale);
  }
  pos.needsUpdate = true;
}

function mergeGeometries(
  a: THREE.BufferGeometry,
  b: THREE.BufferGeometry
): THREE.BufferGeometry {
  const merged = new THREE.BufferGeometry();

  const posA = a.getAttribute('position') as THREE.BufferAttribute;
  const posB = b.getAttribute('position') as THREE.BufferAttribute;

  const positions = new Float32Array(posA.count * 3 + posB.count * 3);
  positions.set(posA.array as Float32Array, 0);
  positions.set(posB.array as Float32Array, posA.count * 3);

  merged.setAttribute('position', new THREE.BufferAttribute(positions, 3));

  const idxA = a.index;
  const idxB = b.index;

  if (idxA && idxB) {
    const indices = new Uint32Array(idxA.count + idxB.count);
    indices.set(idxA.array as Uint32Array, 0);
    for (let i = 0; i < idxB.count; i++) {
      indices[idxA.count + i] = (idxB.array as Uint32Array)[i] + posA.count;
    }
    merged.setIndex(new THREE.BufferAttribute(indices, 1));
  }

  merged.computeVertexNormals();
  return merged;
}
