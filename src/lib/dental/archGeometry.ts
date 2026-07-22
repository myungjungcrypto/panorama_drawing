import { Tooth3DPosition } from '@/types/dental';

// Coordinate system: X = left/right, Y = up/down, Z = front/back
// Teeth emerge FROM the gum: upper teeth hang down, lower teeth point up

interface ArchConfig {
  width: number;
  depth: number;
  gumY: number;       // Y position of the gum ridge (top of gum)
}

// Gum base sits at gumY, teeth emerge from this line
const UPPER_ARCH: ArchConfig = { width: 3.0, depth: 2.6, gumY: 0.8 };
const LOWER_ARCH: ArchConfig = { width: 2.7, depth: 2.3, gumY: -0.8 };

// 실제 해부학적 평균 근원심 폭 비율 기반 (Wheeler 치아형태학, 악궁 절반폭 4.0 기준 정규화)
export const UPPER_TOOTH_WIDTHS: Record<number, number> = {
  1: 0.53, // 중절치 8.5mm
  2: 0.41, // 측절치 6.5mm
  3: 0.47, // 견치 7.5mm
  4: 0.44, // 제1소구치 7.0mm
  5: 0.43, // 제2소구치 6.8mm
  6: 0.63, // 제1대구치 10.0mm
  7: 0.56, // 제2대구치 9.0mm
  8: 0.53, // 제3대구치 8.5mm
};

export const LOWER_TOOTH_WIDTHS: Record<number, number> = {
  1: 0.32, // 중절치 5.0mm
  2: 0.35, // 측절치 5.5mm
  3: 0.44, // 견치 7.0mm
  4: 0.44, // 제1소구치 7.0mm
  5: 0.44, // 제2소구치 7.0mm
  6: 0.70, // 제1대구치 11.0mm
  7: 0.67, // 제2대구치 10.5mm
  8: 0.64, // 제3대구치 10.0mm
};

export function getToothWidth(fdi: number): number {
  const quadrant = Math.floor(fdi / 10);
  const pos = fdi % 10;
  return quadrant <= 2 ? UPPER_TOOTH_WIDTHS[pos] : LOWER_TOOTH_WIDTHS[pos];
}

// How far each tooth crown extends beyond the gum ridge
// This defines the Curve of Spee: anterior teeth protrude more, posterior less
const CROWN_PROTRUSION: Record<number, number> = {
  1: 0.42,   // central incisor - most visible
  2: 0.38,   // lateral incisor
  3: 0.44,   // canine - prominent
  4: 0.32,   // first premolar
  5: 0.28,   // second premolar
  6: 0.25,   // first molar
  7: 0.22,   // second molar
  8: 0.18,   // wisdom tooth - barely visible
};

function getArchPoint(
  t: number,
  config: ArchConfig
): { x: number; z: number; angle: number } {
  const x = t * config.width;
  const z = config.depth * (1 - t * t);

  const dx = config.width;
  const dz = -2 * config.depth * t;
  const angle = Math.atan2(dx, dz);

  return { x, z, angle };
}

function computeToothPositions(
  config: ArchConfig,
  isUpper: boolean
): Map<number, Tooth3DPosition> {
  const positions = new Map<number, Tooth3DPosition>();
  const widths = isUpper ? UPPER_TOOTH_WIDTHS : LOWER_TOOTH_WIDTHS;
  const totalHalfWidth = Object.values(widths).reduce((a, b) => a + b, 0);

  for (const side of ['right', 'left'] as const) {
    let cumulative = 0;
    for (let pos = 1; pos <= 8; pos++) {
      const w = widths[pos];
      cumulative += w / 2;
      const tNorm = cumulative / totalHalfWidth;
      const t = tNorm * 0.95;

      const signedT = side === 'right' ? -t : t;
      const { x, z, angle } = getArchPoint(signedT, config);

      const quadrant = isUpper
        ? (side === 'right' ? 1 : 2)
        : (side === 'right' ? 4 : 3);
      const fdi = quadrant * 10 + pos;
      // 순측/협측(+Z)이 악궁 바깥 법선을 향하도록 하는 yaw.
      // angle(접선 방향)은 우측 끝~좌측 끝까지 연속(31°~149°)이므로
      // 법선 = angle - 90° 하나의 식으로 양쪽 모두 커버됨.
      const rotY = angle - Math.PI / 2;

      // Tooth center Y: positioned so crown emerges from gum ridge
      // Upper teeth: crown hangs DOWN from gumY, so tooth center is below gumY
      // Lower teeth: crown points UP from gumY, so tooth center is above gumY
      const protrusion = CROWN_PROTRUSION[pos];
      const y = isUpper
        ? config.gumY - protrusion * 0.5  // center of crown below gum ridge
        : config.gumY + protrusion * 0.5; // center of crown above gum ridge

      positions.set(fdi, { x, y, z, rotationY: rotY });
      cumulative += w / 2;
    }
  }

  return positions;
}

const upperPositions = computeToothPositions(UPPER_ARCH, true);
const lowerPositions = computeToothPositions(LOWER_ARCH, false);

export const TOOTH_3D_POSITIONS: Map<number, Tooth3DPosition> = new Map([
  ...upperPositions,
  ...lowerPositions,
]);

export function getGumLineY(isUpper: boolean): number {
  return isUpper ? UPPER_ARCH.gumY : LOWER_ARCH.gumY;
}

export function getArchCurvePoints(
  isUpper: boolean,
  segments: number = 64
): Array<{ x: number; y: number; z: number }> {
  const config = isUpper ? UPPER_ARCH : LOWER_ARCH;
  const points: Array<{ x: number; y: number; z: number }> = [];

  for (let i = 0; i <= segments; i++) {
    const t = (i / segments) * 2 - 1;
    const { x, z } = getArchPoint(t, config);
    points.push({ x, y: config.gumY, z });
  }

  return points;
}
