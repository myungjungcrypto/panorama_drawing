import * as THREE from 'three';
import { ToothType } from '@/types/dental';

const SEG = 24; // higher segment count for smoother shapes

// Anatomically proportioned crown dimensions
const TOOTH_DIMENSIONS: Record<ToothType, { w: number; h: number; d: number }> = {
  incisor:  { w: 0.30, h: 0.42, d: 0.14 },
  canine:   { w: 0.28, h: 0.46, d: 0.18 },
  premolar: { w: 0.32, h: 0.30, d: 0.30 },
  molar:    { w: 0.44, h: 0.28, d: 0.38 },
};

export function createToothGeometry(type: ToothType): THREE.BufferGeometry {
  const dim = TOOTH_DIMENSIONS[type];
  let geo: THREE.BufferGeometry;

  switch (type) {
    case 'incisor':  geo = createIncisorGeometry(dim); break;
    case 'canine':   geo = createCanineGeometry(dim); break;
    case 'premolar': geo = createPremolarGeometry(dim); break;
    case 'molar':    geo = createMolarGeometry(dim); break;
  }

  // Smooth normals for all teeth
  geo.computeVertexNormals();
  return geo;
}

function createIncisorGeometry(dim: { w: number; h: number; d: number }): THREE.BufferGeometry {
  // Lathe-based incisor: shovel/blade shape
  // Profile: narrow at cervical, wider at middle, slightly narrower at incisal edge
  const profile: THREE.Vector2[] = [];
  const steps = 12;

  for (let i = 0; i <= steps; i++) {
    const t = i / steps; // 0 = bottom (cervical), 1 = top (incisal)
    // Width profile: starts narrow, bulges in middle, tapers slightly at top
    const widthFactor = 0.35 + 0.15 * Math.sin(t * Math.PI * 0.9);
    const r = dim.w * widthFactor;
    const y = (t - 0.5) * dim.h;
    profile.push(new THREE.Vector2(r, y));
  }

  const geo = new THREE.LatheGeometry(profile, SEG);

  // Flatten front-to-back for blade shape
  scaleAxis(geo, 'z', dim.d / dim.w * 0.5);

  // Add slight labial convexity (front bulge)
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const t = (y / dim.h) + 0.5; // normalize 0-1
    if (z < 0) { // labial (front) side
      const bulge = Math.sin(t * Math.PI) * 0.03;
      pos.setZ(i, z - bulge);
    }
  }
  pos.needsUpdate = true;

  return geo;
}

function createCanineGeometry(dim: { w: number; h: number; d: number }): THREE.BufferGeometry {
  // Lathe-based canine: pointed tip, robust base
  const profile: THREE.Vector2[] = [];
  const steps = 14;

  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    // Canine profile: wide at base, tapers to a point
    let r: number;
    if (t < 0.6) {
      // Base: slight bulge
      r = dim.w * (0.38 + 0.06 * Math.sin(t / 0.6 * Math.PI));
    } else {
      // Tip: smooth taper to point
      const tipT = (t - 0.6) / 0.4;
      r = dim.w * 0.38 * (1 - tipT * tipT * 0.85);
    }
    const y = (t - 0.45) * dim.h;
    profile.push(new THREE.Vector2(Math.max(r, 0.01), y));
  }

  const geo = new THREE.LatheGeometry(profile, SEG);
  scaleAxis(geo, 'z', dim.d / dim.w * 0.65);

  return geo;
}

function createPremolarGeometry(dim: { w: number; h: number; d: number }): THREE.BufferGeometry {
  // Rounded rectangular crown with 2 cusps
  const profile: THREE.Vector2[] = [];
  const steps = 10;

  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    // Slightly tapered cylinder with rounded top
    let r: number;
    if (t < 0.7) {
      r = dim.w * (0.40 + 0.04 * Math.sin(t / 0.7 * Math.PI));
    } else {
      // Rounded top
      const topT = (t - 0.7) / 0.3;
      r = dim.w * 0.40 * Math.cos(topT * Math.PI * 0.45);
    }
    const y = (t - 0.45) * dim.h;
    profile.push(new THREE.Vector2(Math.max(r, 0.02), y));
  }

  const geo = new THREE.LatheGeometry(profile, SEG);
  // Make it more oval (wider bucco-lingually)
  scaleAxis(geo, 'z', dim.d / dim.w * 0.95);

  // Add two cusps by displacing vertices upward in cusp areas
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const normalizedY = (y / dim.h) + 0.45;

    if (normalizedY > 0.6) {
      // Two cusp peaks along Z axis (buccal and lingual)
      const cuspHeight = 0.06;
      const cuspFactor = Math.abs(z) > dim.d * 0.15 ? cuspHeight : 0;
      pos.setY(i, y + cuspFactor * (normalizedY - 0.6) / 0.4);
    }
  }
  pos.needsUpdate = true;

  return geo;
}

function createMolarGeometry(dim: { w: number; h: number; d: number }): THREE.BufferGeometry {
  // Wider, blockier crown with 4 cusps
  const profile: THREE.Vector2[] = [];
  const steps = 10;

  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    let r: number;
    if (t < 0.65) {
      // Slightly tapered base with subtle cervical constriction
      r = dim.w * (0.42 + 0.05 * Math.sin(t / 0.65 * Math.PI));
    } else {
      // Occlusal surface rounds down
      const topT = (t - 0.65) / 0.35;
      r = dim.w * 0.42 * Math.cos(topT * Math.PI * 0.4);
    }
    const y = (t - 0.45) * dim.h;
    profile.push(new THREE.Vector2(Math.max(r, 0.02), y));
  }

  const geo = new THREE.LatheGeometry(profile, SEG);
  // Make it rectangular-ish (wider mesio-distally)
  scaleAxis(geo, 'z', dim.d / dim.w);

  // Add four cusps
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const normalizedY = (y / dim.h) + 0.45;

    if (normalizedY > 0.55) {
      // Four cusp positions
      const cusps = [
        { cx: -dim.w * 0.13, cz: -dim.d * 0.13, h: 0.07 },
        { cx:  dim.w * 0.13, cz: -dim.d * 0.13, h: 0.065 },
        { cx: -dim.w * 0.13, cz:  dim.d * 0.13, h: 0.06 },
        { cx:  dim.w * 0.13, cz:  dim.d * 0.13, h: 0.055 },
      ];

      let maxCusp = 0;
      for (const cusp of cusps) {
        const dx = x - cusp.cx;
        const dz = z - cusp.cz;
        const dist = Math.sqrt(dx * dx + dz * dz);
        const influence = Math.max(0, 1 - dist / (dim.w * 0.3));
        maxCusp = Math.max(maxCusp, influence * cusp.h);
      }

      pos.setY(i, y + maxCusp * (normalizedY - 0.55) / 0.45);
    }
  }
  pos.needsUpdate = true;

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
