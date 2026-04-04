import { Tooth3DPosition } from '@/types/dental';

// Coordinate system: X = left/right, Y = up/down, Z = front/back

interface ArchConfig {
  width: number;
  depth: number;
  yOffset: number;    // gum line vertical position
}

const UPPER_ARCH: ArchConfig = { width: 3.2, depth: 2.8, yOffset: 0.6 };
const LOWER_ARCH: ArchConfig = { width: 2.9, depth: 2.5, yOffset: -0.6 };

// Tooth widths for spacing along the arch
const TOOTH_WIDTHS: Record<number, number> = {
  1: 0.55,  // central incisor
  2: 0.45,  // lateral incisor
  3: 0.50,  // canine
  4: 0.48,  // first premolar
  5: 0.48,  // second premolar
  6: 0.65,  // first molar
  7: 0.62,  // second molar
  8: 0.55,  // third molar
};

// Crown heights - how much the crown extends beyond the gum line
// This creates the visible portion of each tooth
const CROWN_HEIGHTS: Record<number, number> = {
  1: 0.45,  // central incisor - tallest crown
  2: 0.40,  // lateral incisor
  3: 0.42,  // canine
  4: 0.32,  // first premolar
  5: 0.30,  // second premolar
  6: 0.28,  // first molar - shorter crown
  7: 0.25,  // second molar
  8: 0.22,  // third molar - shortest
};

// Curve of Spee: vertical offset for each tooth position
// Creates the characteristic curve where anterior teeth are lowest (upper) / highest (lower)
// and posterior teeth gradually rise (upper) / descend (lower)
// The curve is defined as a Y offset from the gum line
function getCurveOfSpee(position: number, isUpper: boolean): number {
  // Curve of Spee offsets (how far each tooth drops below/above gumline)
  // Position 1 = central incisor (most offset), 8 = wisdom (least offset)
  const speeOffsets: Record<number, number> = {
    1: 0.50,   // central incisor - drops the most
    2: 0.48,   // lateral incisor
    3: 0.52,   // canine - tip of the curve (slight bump)
    4: 0.40,   // first premolar - starts rising
    5: 0.35,   // second premolar
    6: 0.28,   // first molar
    7: 0.22,   // second molar
    8: 0.18,   // third molar - least offset, closest to gum
  };

  const offset = speeOffsets[position];
  // Upper teeth: offset downward (negative Y), Lower teeth: offset upward (positive Y)
  return isUpper ? -offset : offset;
}

function getArchPoint(
  t: number,
  config: ArchConfig
): { x: number; z: number; angle: number } {
  const x = t * config.width;
  const z = config.depth * (1 - t * t);

  // Tangent angle for tooth rotation (face outward)
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

  const totalHalfWidth = Object.values(TOOTH_WIDTHS).reduce((a, b) => a + b, 0);

  for (const side of ['right', 'left'] as const) {
    let cumulative = 0;
    for (let pos = 1; pos <= 8; pos++) {
      const w = TOOTH_WIDTHS[pos];
      cumulative += w / 2;
      const tNorm = cumulative / totalHalfWidth;
      const t = tNorm * 0.95;

      const signedT = side === 'right' ? -t : t;
      const { x, z, angle } = getArchPoint(signedT, config);

      const quadrant = isUpper
        ? (side === 'right' ? 1 : 2)
        : (side === 'right' ? 4 : 3);
      const fdi = quadrant * 10 + pos;

      const rotY = side === 'right' ? -angle : angle;

      // Apply Curve of Spee: shift tooth vertically from gum line
      const speeOffset = getCurveOfSpee(pos, isUpper);
      const y = config.yOffset + speeOffset;

      positions.set(fdi, {
        x,
        y,
        z,
        rotationY: rotY,
      });

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

// Get the gum line Y position for label placement
export function getGumLineY(isUpper: boolean): number {
  return isUpper ? UPPER_ARCH.yOffset : LOWER_ARCH.yOffset;
}

// Generate arch curve points for rendering the gum mesh
export function getArchCurvePoints(
  isUpper: boolean,
  segments: number = 64
): Array<{ x: number; y: number; z: number }> {
  const config = isUpper ? UPPER_ARCH : LOWER_ARCH;
  const points: Array<{ x: number; y: number; z: number }> = [];

  for (let i = 0; i <= segments; i++) {
    const t = (i / segments) * 2 - 1;
    const { x, z } = getArchPoint(t, config);
    points.push({ x, y: config.yOffset, z });
  }

  return points;
}
