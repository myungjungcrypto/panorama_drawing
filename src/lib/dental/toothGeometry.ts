import * as THREE from 'three';
import { ToothType } from '@/types/dental';

const SEG = 28;

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

  geo.computeVertexNormals();
  return geo;
}

function createIncisorGeometry(dim: { w: number; h: number; d: number }): THREE.BufferGeometry {
  const profile: THREE.Vector2[] = [];
  const steps = 12;

  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const widthFactor = 0.35 + 0.15 * Math.sin(t * Math.PI * 0.9);
    const r = dim.w * widthFactor;
    const y = (t - 0.5) * dim.h;
    profile.push(new THREE.Vector2(r, y));
  }

  const geo = new THREE.LatheGeometry(profile, SEG);
  scaleAxis(geo, 'x', dim.d / dim.w * 0.5);

  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const t = (y / dim.h) + 0.5;
    if (z > 0) {
      const bulge = Math.sin(t * Math.PI) * 0.03;
      pos.setZ(i, z + bulge);
    }
  }
  pos.needsUpdate = true;

  return geo;
}

function createCanineGeometry(dim: { w: number; h: number; d: number }): THREE.BufferGeometry {
  const profile: THREE.Vector2[] = [];
  const steps = 14;

  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    let r: number;
    if (t < 0.6) {
      r = dim.w * (0.38 + 0.06 * Math.sin(t / 0.6 * Math.PI));
    } else {
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
  // 닫힌 프로파일: 경부 → 동체 → 돔(교합면) → 중심 수렴
  const profile: THREE.Vector2[] = [];
  const bodySteps = 10;
  const domeSteps = 6;

  // 경부~동체
  for (let i = 0; i <= bodySteps; i++) {
    const t = i / bodySteps;
    let r: number;
    if (t < 0.15) {
      r = dim.w * (0.34 + 0.06 * (t / 0.15));
    } else if (t < 0.65) {
      const bodyT = (t - 0.15) / 0.5;
      r = dim.w * (0.40 + 0.04 * Math.sin(bodyT * Math.PI));
    } else {
      // 교합면으로 향하는 완만한 축소
      const topT = (t - 0.65) / 0.35;
      r = dim.w * (0.42 - 0.06 * topT);
    }
    const y = (t - 0.45) * dim.h;
    profile.push(new THREE.Vector2(Math.max(r, 0.02), y));
  }

  // 돔 (교합면 닫기) — 중심으로 부드럽게 수렴
  const domeStartR = dim.w * 0.36;
  const domeStartY = dim.h * 0.55 * 0.5;
  for (let i = 1; i <= domeSteps; i++) {
    const t = i / domeSteps;
    const r = domeStartR * (1 - t * t); // 부드러운 감소
    const y = domeStartY + t * dim.h * 0.06; // 약간 위로
    profile.push(new THREE.Vector2(Math.max(r, 0.001), y));
  }

  const geo = new THREE.LatheGeometry(profile, SEG);
  scaleAxis(geo, 'z', dim.d / dim.w * 0.95);
  squarifyGeometry(geo, 0.25);

  // 교두 2개 + 열구
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  const cuspBaseY = domeStartY * 0.5;

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);

    if (y > cuspBaseY) {
      const t = Math.min(1, (y - cuspBaseY) / (domeStartY + dim.h * 0.06 - cuspBaseY));

      // 협측 교두 (z < 0)와 설측 교두 (z > 0)
      const buccalCenter = -dim.d * 0.16;
      const lingualCenter = dim.d * 0.16;
      const cuspR = dim.w * 0.24;

      const buccalDist = Math.sqrt(x * x + (z - buccalCenter) ** 2);
      const lingualDist = Math.sqrt(x * x + (z - lingualCenter) ** 2);

      const buccalInf = Math.max(0, 1 - buccalDist / cuspR);
      const lingualInf = Math.max(0, 1 - lingualDist / cuspR);

      const buccalRise = buccalInf * buccalInf * 0.09 * t;
      const lingualRise = lingualInf * lingualInf * 0.07 * t;

      // 중심 열구
      const fissure = Math.exp(-(z * z) / 0.005) * 0.035 * t;

      pos.setY(i, y + Math.max(buccalRise, lingualRise) - fissure);
    }
  }
  pos.needsUpdate = true;

  return geo;
}

function createMolarGeometry(dim: { w: number; h: number; d: number }): THREE.BufferGeometry {
  // 닫힌 프로파일: 경부 → 동체 → 돔(교합면) → 중심 수렴
  const profile: THREE.Vector2[] = [];
  const bodySteps = 10;
  const domeSteps = 8;

  // 경부~동체
  for (let i = 0; i <= bodySteps; i++) {
    const t = i / bodySteps;
    let r: number;
    if (t < 0.12) {
      r = dim.w * (0.36 + 0.08 * (t / 0.12));
    } else if (t < 0.65) {
      const bodyT = (t - 0.12) / 0.53;
      r = dim.w * (0.44 + 0.03 * Math.sin(bodyT * Math.PI));
    } else {
      const topT = (t - 0.65) / 0.35;
      r = dim.w * (0.46 - 0.04 * topT);
    }
    const y = (t - 0.45) * dim.h;
    profile.push(new THREE.Vector2(Math.max(r, 0.02), y));
  }

  // 돔 (교합면 닫기)
  const domeStartR = dim.w * 0.42;
  const domeStartY = dim.h * 0.55 * 0.5;
  for (let i = 1; i <= domeSteps; i++) {
    const t = i / domeSteps;
    const r = domeStartR * (1 - t * t);
    const y = domeStartY + t * dim.h * 0.04;
    profile.push(new THREE.Vector2(Math.max(r, 0.001), y));
  }

  const geo = new THREE.LatheGeometry(profile, SEG);
  scaleAxis(geo, 'z', dim.d / dim.w);
  squarifyGeometry(geo, 0.35);

  // 교두 4개 + 십자형 열구 + 중심와
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  const cuspBaseY = domeStartY * 0.4;

  const cusps = [
    { cx:  dim.w * 0.15, cz: -dim.d * 0.17, h: 0.11, r: dim.w * 0.22 }, // 근심협측
    { cx: -dim.w * 0.15, cz: -dim.d * 0.17, h: 0.10, r: dim.w * 0.21 }, // 원심협측
    { cx:  dim.w * 0.14, cz:  dim.d * 0.17, h: 0.09, r: dim.w * 0.21 }, // 근심설측
    { cx: -dim.w * 0.14, cz:  dim.d * 0.17, h: 0.085, r: dim.w * 0.20 }, // 원심설측
  ];

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);

    if (y > cuspBaseY) {
      const t = Math.min(1, (y - cuspBaseY) / (domeStartY + dim.h * 0.04 - cuspBaseY));

      // 교두 기여
      let totalRise = 0;
      for (const cusp of cusps) {
        const dx = x - cusp.cx;
        const dz = z - cusp.cz;
        const dist = Math.sqrt(dx * dx + dz * dz);
        const influence = Math.max(0, 1 - dist / cusp.r);
        const rise = influence * influence * cusp.h * t;
        totalRise = Math.max(totalRise, rise);
      }

      // 십자형 열구
      const blGroove = Math.exp(-(x * x) / 0.003) * 0.04 * t;
      const mdGroove = Math.exp(-(z * z) / 0.006) * 0.03 * t;
      const grooveDepth = Math.max(blGroove, mdGroove);

      // 중심와
      const fossaDist = x * x + z * z;
      const fossa = Math.exp(-fossaDist / 0.006) * 0.025 * t;

      pos.setY(i, y + totalRise - grooveDepth - fossa);
    }
  }
  pos.needsUpdate = true;

  return geo;
}

// 원형 → 직사각형 변형
function squarifyGeometry(geo: THREE.BufferGeometry, amount: number) {
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const angle = Math.atan2(z, x);
    const r = Math.sqrt(x * x + z * z);
    if (r < 0.001) continue;

    const cos4 = Math.cos(2 * angle);
    const factor = 1 + amount * 0.15 * (1 - cos4 * cos4);
    pos.setX(i, x * factor);
    pos.setZ(i, z * factor);
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
