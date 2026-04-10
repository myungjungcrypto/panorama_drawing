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

  // Flatten along X axis (mesio-distal) so the flat face points outward (Z = labial)
  scaleAxis(geo, 'x', dim.d / dim.w * 0.5);

  // Add slight labial convexity (front bulge)
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const t = (y / dim.h) + 0.5; // normalize 0-1
    if (z > 0) { // labial (front) side - Z positive = outward
      const bulge = Math.sin(t * Math.PI) * 0.03;
      pos.setZ(i, z + bulge);
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
  scaleAxis(geo, 'x', dim.d / dim.w * 0.65);

  return geo;
}

function createPremolarGeometry(dim: { w: number; h: number; d: number }): THREE.BufferGeometry {
  // Rounded rectangular crown with 2 distinct cusps and central fissure
  const profile: THREE.Vector2[] = [];
  const steps = 14;

  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    let r: number;
    if (t < 0.15) {
      // Cervical constriction
      r = dim.w * (0.34 + 0.06 * (t / 0.15));
    } else if (t < 0.6) {
      // Body: slight bulge
      const bodyT = (t - 0.15) / 0.45;
      r = dim.w * (0.40 + 0.04 * Math.sin(bodyT * Math.PI));
    } else {
      // Occlusal taper - less aggressive to leave room for cusps
      const topT = (t - 0.6) / 0.4;
      r = dim.w * (0.40 - 0.08 * topT);
    }
    const y = (t - 0.45) * dim.h;
    profile.push(new THREE.Vector2(Math.max(r, 0.02), y));
  }

  const geo = new THREE.LatheGeometry(profile, SEG);
  // Make it more oval (wider bucco-lingually)
  scaleAxis(geo, 'z', dim.d / dim.w * 0.95);
  // Squarify the cross-section
  squarifyGeometry(geo, 0.3, 'xz');

  // Add two cusps with central fissure
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  const topY = dim.h * 0.55 * 0.5;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);

    if (y > topY * 0.4) {
      const t = Math.min(1, (y - topY * 0.4) / (topY * 0.6));
      // Buccal cusp (z > 0) and lingual cusp (z < 0)
      const buccalDist = Math.sqrt(x * x + (z - dim.d * 0.18) ** 2);
      const lingualDist = Math.sqrt(x * x + (z + dim.d * 0.18) ** 2);
      const cuspRadius = dim.w * 0.22;

      const buccalInfluence = Math.max(0, 1 - buccalDist / cuspRadius);
      const lingualInfluence = Math.max(0, 1 - lingualDist / cuspRadius);

      // Cusp rise
      const buccalRise = buccalInfluence * buccalInfluence * 0.10 * t;
      const lingualRise = lingualInfluence * lingualInfluence * 0.08 * t;

      // Central fissure depression
      const fissureDepth = Math.exp(-(z * z) / (0.006)) * 0.05 * t;

      pos.setY(i, y + Math.max(buccalRise, lingualRise) - fissureDepth);
    }
  }
  pos.needsUpdate = true;

  return geo;
}

function createMolarGeometry(dim: { w: number; h: number; d: number }): THREE.BufferGeometry {
  // Wide blocky crown with 4 distinct cusps and cross-fissure
  const profile: THREE.Vector2[] = [];
  const steps = 14;

  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    let r: number;
    if (t < 0.12) {
      // Cervical constriction
      r = dim.w * (0.36 + 0.08 * (t / 0.12));
    } else if (t < 0.6) {
      // Body: wider, more cylindrical
      const bodyT = (t - 0.12) / 0.48;
      r = dim.w * (0.44 + 0.03 * Math.sin(bodyT * Math.PI));
    } else {
      // Occlusal - flatten top, less taper
      const topT = (t - 0.6) / 0.4;
      r = dim.w * (0.44 - 0.06 * topT);
    }
    const y = (t - 0.45) * dim.h;
    profile.push(new THREE.Vector2(Math.max(r, 0.02), y));
  }

  const geo = new THREE.LatheGeometry(profile, SEG);
  // Make it rectangular (wider mesio-distally)
  scaleAxis(geo, 'z', dim.d / dim.w);
  // Squarify to reduce roundness
  squarifyGeometry(geo, 0.35, 'xz');

  // Add four cusps with cross-shaped fissure
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  const topY = dim.h * 0.55 * 0.5;

  // Cusp positions: MB, DB, ML, DL
  const cusps = [
    { cx:  dim.w * 0.14, cz: -dim.d * 0.16, h: 0.12, r: dim.w * 0.20 }, // mesio-buccal
    { cx: -dim.w * 0.14, cz: -dim.d * 0.16, h: 0.11, r: dim.w * 0.19 }, // disto-buccal
    { cx:  dim.w * 0.14, cz:  dim.d * 0.16, h: 0.10, r: dim.w * 0.19 }, // mesio-lingual
    { cx: -dim.w * 0.14, cz:  dim.d * 0.16, h: 0.09, r: dim.w * 0.18 }, // disto-lingual
  ];

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);

    if (y > topY * 0.3) {
      const t = Math.min(1, (y - topY * 0.3) / (topY * 0.7));

      // Cusp contributions
      let maxCuspRise = 0;
      for (const cusp of cusps) {
        const dx = x - cusp.cx;
        const dz = z - cusp.cz;
        const dist = Math.sqrt(dx * dx + dz * dz);
        const influence = Math.max(0, 1 - dist / cusp.r);
        // Sharper cusp shape with squared influence
        const rise = influence * influence * cusp.h * t;
        maxCuspRise = Math.max(maxCuspRise, rise);
      }

      // Cross-shaped fissure (bucco-lingual groove along x=0, mesio-distal groove along z=0)
      const blGrooveDepth = Math.exp(-(x * x) / 0.004) * 0.06 * t;
      const mdGrooveDepth = Math.exp(-(z * z) / 0.008) * 0.04 * t;
      const fissureDepth = Math.max(blGrooveDepth, mdGrooveDepth);

      // Central fossa (intersection of grooves)
      const centralFossa = Math.exp(-(x * x + z * z) / 0.008) * 0.03 * t;

      pos.setY(i, y + maxCuspRise - fissureDepth - centralFossa);
    }
  }
  pos.needsUpdate = true;

  return geo;
}

// 원형 단면을 직사각형에 가깝게 변형 (amount: 0=원형, 1=완전 사각형)
function squarifyGeometry(geo: THREE.BufferGeometry, amount: number, plane: 'xz') {
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const angle = Math.atan2(z, x);
    const r = Math.sqrt(x * x + z * z);
    if (r < 0.001) continue;

    // Superellipse factor: increases radius at 45-degree angles
    const cos4 = Math.cos(2 * angle);
    const squareFactor = 1 + amount * 0.15 * (1 - cos4 * cos4);
    pos.setX(i, x * squareFactor);
    pos.setZ(i, z * squareFactor);
  }
  pos.needsUpdate = true;
}

function scaleAxis(geo: THREE.BufferGeometry, axis: 'x' | 'y' | 'z', scale: number) {
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  const idx = axis === 'x' ? 0 : axis === 'y' ? 1 : 2;
  for (let i = 0; i < pos.count; i++) {
    pos.setComponent(i, idx, pos.getComponent(i, idx) * scale);
  }
  pos.needsUpdate = true;
}
