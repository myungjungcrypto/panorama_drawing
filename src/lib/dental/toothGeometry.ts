import * as THREE from 'three';
import { ToothType } from '@/types/dental';

const SEG = 16;

// Crown-only dimensions (no visible roots - they're inside the gum)
const TOOTH_DIMENSIONS: Record<ToothType, { w: number; h: number; d: number }> = {
  incisor:  { w: 0.32, h: 0.48, d: 0.16 },
  canine:   { w: 0.30, h: 0.50, d: 0.20 },
  premolar: { w: 0.34, h: 0.36, d: 0.32 },
  molar:    { w: 0.48, h: 0.32, d: 0.42 },
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
  // Flat blade-like crown, wider at incisal edge, narrower at cervical
  // Use a tapered box shape
  const crown = new THREE.CylinderGeometry(
    dim.w * 0.48,   // top radius (incisal edge - slightly narrower)
    dim.w * 0.44,   // bottom radius (cervical/gum line)
    dim.h,
    SEG, 1
  );
  // Flatten front-to-back to make blade shape
  scaleAxis(crown, 'z', dim.d / dim.w * 0.55);

  // Smooth incisal edge
  const edge = new THREE.SphereGeometry(
    dim.w * 0.48, SEG, 8,
    0, Math.PI * 2, 0, Math.PI * 0.3
  );
  scaleAxis(edge, 'z', dim.d / dim.w * 0.55);
  edge.translate(0, dim.h * 0.5, 0);

  const geo = mergeGeometries(crown, edge);
  return geo;
}

function createCanineGeometry(dim: { w: number; h: number; d: number }): THREE.BufferGeometry {
  // Pointed crown, conical top with cylindrical base
  const base = new THREE.CylinderGeometry(
    dim.w * 0.40,
    dim.w * 0.42,
    dim.h * 0.55,
    SEG, 1
  );
  scaleAxis(base, 'z', dim.d / dim.w * 0.65);
  base.translate(0, -dim.h * 0.05, 0);

  const tip = new THREE.ConeGeometry(
    dim.w * 0.38, dim.h * 0.5, SEG
  );
  scaleAxis(tip, 'z', dim.d / dim.w * 0.65);
  tip.translate(0, dim.h * 0.38, 0);

  return mergeGeometries(base, tip);
}

function createPremolarGeometry(dim: { w: number; h: number; d: number }): THREE.BufferGeometry {
  // Wider crown with 2 cusps on top
  const base = new THREE.CylinderGeometry(
    dim.w * 0.44,
    dim.w * 0.42,
    dim.h * 0.6,
    SEG, 1
  );
  scaleAxis(base, 'z', dim.d / dim.w);
  base.translate(0, -dim.h * 0.05, 0);

  // Two cusps (buccal and lingual)
  const cusp1 = new THREE.SphereGeometry(
    dim.w * 0.25, SEG, 10,
    0, Math.PI * 2, 0, Math.PI * 0.5
  );
  cusp1.translate(0, dim.h * 0.25, -dim.d * 0.12);

  const cusp2 = new THREE.SphereGeometry(
    dim.w * 0.23, SEG, 10,
    0, Math.PI * 2, 0, Math.PI * 0.5
  );
  cusp2.translate(0, dim.h * 0.22, dim.d * 0.12);

  let geo = mergeGeometries(base, cusp1);
  geo = mergeGeometries(geo, cusp2);
  return geo;
}

function createMolarGeometry(dim: { w: number; h: number; d: number }): THREE.BufferGeometry {
  // Wide, blocky crown with 4 cusps
  const base = new THREE.CylinderGeometry(
    dim.w * 0.46,
    dim.w * 0.44,
    dim.h * 0.55,
    SEG, 1
  );
  scaleAxis(base, 'z', dim.d / dim.w);
  base.translate(0, -dim.h * 0.05, 0);

  // Four cusps
  const cuspR = dim.w * 0.20;
  const cusps = [
    { x: -dim.w * 0.14, z: -dim.d * 0.14, r: cuspR, h: dim.h * 0.24 },
    { x:  dim.w * 0.14, z: -dim.d * 0.14, r: cuspR * 0.95, h: dim.h * 0.22 },
    { x: -dim.w * 0.14, z:  dim.d * 0.14, r: cuspR * 0.9, h: dim.h * 0.21 },
    { x:  dim.w * 0.14, z:  dim.d * 0.14, r: cuspR * 0.85, h: dim.h * 0.20 },
  ];

  let geo: THREE.BufferGeometry = base;
  for (const c of cusps) {
    const cusp = new THREE.SphereGeometry(
      c.r, SEG, 10,
      0, Math.PI * 2, 0, Math.PI * 0.5
    );
    cusp.translate(c.x, c.h, c.z);
    geo = mergeGeometries(geo, cusp);
  }

  return geo;
}

function scaleAxis(geo: THREE.BufferGeometry, axis: 'x' | 'y' | 'z', scale: number) {
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  const idx = axis === 'x' ? 0 : axis === 'y' ? 1 : 2;
  for (let i = 0; i < pos.count; i++) {
    pos.setComponent(i, idx, pos.getComponent(i, idx) * scale);
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
