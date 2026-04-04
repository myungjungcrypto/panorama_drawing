import * as THREE from 'three';
import { ToothType } from '@/types/dental';

// Tooth dimensions per type (width, height, depth)
const TOOTH_DIMENSIONS: Record<ToothType, { w: number; h: number; d: number }> = {
  incisor:  { w: 0.35, h: 0.65, d: 0.20 },
  canine:   { w: 0.32, h: 0.70, d: 0.25 },
  premolar: { w: 0.38, h: 0.55, d: 0.35 },
  molar:    { w: 0.55, h: 0.50, d: 0.45 },
};

export function createToothGeometry(type: ToothType): THREE.BufferGeometry {
  const dim = TOOTH_DIMENSIONS[type];

  switch (type) {
    case 'incisor':
      return createIncisorGeometry(dim);
    case 'canine':
      return createCanineGeometry(dim);
    case 'premolar':
      return createPremolarGeometry(dim);
    case 'molar':
      return createMolarGeometry(dim);
  }
}

function createIncisorGeometry(dim: { w: number; h: number; d: number }): THREE.BufferGeometry {
  // Flat chisel-shaped tooth: wider box for crown, narrower for root
  const crown = new THREE.BoxGeometry(dim.w, dim.h * 0.5, dim.d);
  crown.translate(0, dim.h * 0.25, 0);

  const root = new THREE.CylinderGeometry(dim.w * 0.2, dim.w * 0.15, dim.h * 0.5, 8);
  root.translate(0, -dim.h * 0.25, 0);

  return mergeGeometries(crown, root);
}

function createCanineGeometry(dim: { w: number; h: number; d: number }): THREE.BufferGeometry {
  // Pointed tooth: cone-like crown on a cylinder root
  const crown = new THREE.ConeGeometry(dim.w * 0.4, dim.h * 0.5, 8);
  crown.translate(0, dim.h * 0.35, 0);

  const base = new THREE.CylinderGeometry(dim.w * 0.35, dim.w * 0.3, dim.h * 0.2, 8);
  base.translate(0, dim.h * 0.05, 0);

  const root = new THREE.CylinderGeometry(dim.w * 0.2, dim.w * 0.12, dim.h * 0.45, 8);
  root.translate(0, -dim.h * 0.27, 0);

  return mergeGeometries(mergeGeometries(crown, base), root);
}

function createPremolarGeometry(dim: { w: number; h: number; d: number }): THREE.BufferGeometry {
  // Two-cusped: two small bumps on a wider base
  const base = new THREE.BoxGeometry(dim.w, dim.h * 0.35, dim.d);
  base.translate(0, dim.h * 0.05, 0);

  const cusp1 = new THREE.SphereGeometry(dim.w * 0.22, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.5);
  cusp1.translate(-dim.w * 0.12, dim.h * 0.22, 0);

  const cusp2 = new THREE.SphereGeometry(dim.w * 0.22, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.5);
  cusp2.translate(dim.w * 0.12, dim.h * 0.22, 0);

  const root = new THREE.CylinderGeometry(dim.w * 0.2, dim.w * 0.12, dim.h * 0.4, 8);
  root.translate(0, -dim.h * 0.32, 0);

  let geo = mergeGeometries(base, cusp1);
  geo = mergeGeometries(geo, cusp2);
  geo = mergeGeometries(geo, root);
  return geo;
}

function createMolarGeometry(dim: { w: number; h: number; d: number }): THREE.BufferGeometry {
  // Four-cusped: four bumps on a wide rectangular base
  const base = new THREE.BoxGeometry(dim.w, dim.h * 0.3, dim.d);
  base.translate(0, dim.h * 0.05, 0);

  const cuspPositions = [
    [-dim.w * 0.15, dim.h * 0.2, -dim.d * 0.15],
    [dim.w * 0.15, dim.h * 0.2, -dim.d * 0.15],
    [-dim.w * 0.15, dim.h * 0.2, dim.d * 0.15],
    [dim.w * 0.15, dim.h * 0.2, dim.d * 0.15],
  ];

  let geo: THREE.BufferGeometry = base;
  for (const [cx, cy, cz] of cuspPositions) {
    const cusp = new THREE.SphereGeometry(dim.w * 0.18, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.5);
    cusp.translate(cx, cy, cz);
    geo = mergeGeometries(geo, cusp);
  }

  // Two roots for molars
  const root1 = new THREE.CylinderGeometry(dim.w * 0.15, dim.w * 0.1, dim.h * 0.4, 8);
  root1.translate(-dim.w * 0.15, -dim.h * 0.3, 0);

  const root2 = new THREE.CylinderGeometry(dim.w * 0.15, dim.w * 0.1, dim.h * 0.4, 8);
  root2.translate(dim.w * 0.15, -dim.h * 0.3, 0);

  geo = mergeGeometries(geo, root1);
  geo = mergeGeometries(geo, root2);
  return geo;
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

  // Merge indices
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
