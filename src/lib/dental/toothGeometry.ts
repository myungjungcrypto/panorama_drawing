import * as THREE from 'three';
import { ToothType } from '@/types/dental';

const SEG = 28;

export const TOOTH_DIMENSIONS: Record<ToothType, { w: number; h: number; d: number }> = {
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
  scaleAxis(geo, 'z', dim.d / dim.w * 0.5);

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
  scaleAxis(geo, 'z', dim.d / dim.w * 0.65);

  return geo;
}

// 덴티폼 스타일: 곧은 원통 몸체 + 부드럽게 둥근 교합면 (알약 캡슐형)
function createRoundedProfile(
  dim: { w: number; h: number; d: number },
  maxWidthRatio: number,
  cervicalRatio: number,
  bodyEnd: number,       // 몸체 끝 지점 (0~1, 0.65 = 하단 65%까지 곧은 몸체)
  steps: number
): THREE.Vector2[] {
  const profile: THREE.Vector2[] = [];

  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    let r: number;

    if (t < 0.12) {
      // 경부: 약간 좁은 시작
      const nt = t / 0.12;
      r = cervicalRatio + (maxWidthRatio - cervicalRatio) * Math.sin(nt * Math.PI * 0.5);
    } else if (t < bodyEnd) {
      // 몸체: 거의 곧은 원통 (아주 미세한 볼록)
      const bodyT = (t - 0.12) / (bodyEnd - 0.12);
      r = maxWidthRatio + 0.01 * Math.sin(bodyT * Math.PI);
    } else {
      // 교합면 캡: 사분원(quarter-circle) 커브로 부드럽게 닫힘
      const capT = (t - bodyEnd) / (1 - bodyEnd);
      r = maxWidthRatio * Math.cos(capT * Math.PI * 0.5);
    }

    const y = (t - 0.45) * dim.h;
    profile.push(new THREE.Vector2(Math.max(dim.w * r, 0.001), y));
  }

  return profile;
}

function createPremolarGeometry(dim: { w: number; h: number; d: number }): THREE.BufferGeometry {
  const profile = createRoundedProfile(dim, 0.44, 0.36, 0.62, 22);
  const geo = new THREE.LatheGeometry(profile, SEG);

  scaleAxis(geo, 'z', dim.d / dim.w * 0.95);
  squarifyGeometry(geo, 0.25);

  // 교두 2개 + 열구
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  const maxY = dim.h * 0.55;

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const r = Math.sqrt(x * x + z * z);

    // 상단 40% 영역에서만 교두 적용
    if (y > maxY * 0.2 && r < dim.w * 0.4) {
      const t = Math.min(1, (y - maxY * 0.2) / (maxY * 0.8));

      // 협측/설측 교두
      const buccalDist = Math.sqrt(x * x + (z - dim.d * 0.14) ** 2);
      const lingualDist = Math.sqrt(x * x + (z + dim.d * 0.14) ** 2);
      const cuspR = dim.w * 0.26;

      const buccalInf = Math.max(0, 1 - buccalDist / cuspR);
      const lingualInf = Math.max(0, 1 - lingualDist / cuspR);

      const rise = Math.max(
        buccalInf * buccalInf * 0.10 * t,
        lingualInf * lingualInf * 0.08 * t
      );

      // 열구
      const fissure = Math.exp(-(z * z) / 0.005) * 0.03 * t;

      pos.setY(i, y + rise - fissure);
    }
  }
  pos.needsUpdate = true;

  return geo;
}

function createMolarGeometry(dim: { w: number; h: number; d: number }): THREE.BufferGeometry {
  const profile = createRoundedProfile(dim, 0.47, 0.38, 0.60, 24);
  const geo = new THREE.LatheGeometry(profile, SEG);

  scaleAxis(geo, 'z', dim.d / dim.w);
  squarifyGeometry(geo, 0.35);

  // 교두 4개 + 십자형 열구 + 중심와
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  const maxY = dim.h * 0.55;

  const cusps = [
    { cx:  dim.w * 0.15, cz:  dim.d * 0.16, h: 0.12, r: dim.w * 0.24 },
    { cx: -dim.w * 0.15, cz:  dim.d * 0.16, h: 0.11, r: dim.w * 0.23 },
    { cx:  dim.w * 0.14, cz: -dim.d * 0.16, h: 0.10, r: dim.w * 0.23 },
    { cx: -dim.w * 0.14, cz: -dim.d * 0.16, h: 0.09, r: dim.w * 0.22 },
  ];

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const r = Math.sqrt(x * x + z * z);

    if (y > maxY * 0.1 && r < dim.w * 0.45) {
      const t = Math.min(1, (y - maxY * 0.1) / (maxY * 0.9));

      // 교두 기여
      let totalRise = 0;
      for (const cusp of cusps) {
        const dx = x - cusp.cx;
        const dz = z - cusp.cz;
        const dist = Math.sqrt(dx * dx + dz * dz);
        const influence = Math.max(0, 1 - dist / cusp.r);
        totalRise = Math.max(totalRise, influence * influence * cusp.h * t);
      }

      // 십자형 열구
      const blGroove = Math.exp(-(x * x) / 0.003) * 0.035 * t;
      const mdGroove = Math.exp(-(z * z) / 0.006) * 0.025 * t;
      const grooveDepth = Math.max(blGroove, mdGroove);

      // 중심와
      const fossa = Math.exp(-(x * x + z * z) / 0.006) * 0.02 * t;

      pos.setY(i, y + totalRise - grooveDepth - fossa);
    }
  }
  pos.needsUpdate = true;

  return geo;
}

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
