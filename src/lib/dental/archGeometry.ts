import { Tooth3DPosition } from '@/types/dental';

// Dental arch follows a parabolic/elliptical curve
// Upper arch is slightly wider than lower arch
// Coordinate system: X = left/right, Y = up/down, Z = front/back

interface ArchConfig {
  width: number;      // half-width of the arch
  depth: number;      // front-to-back depth
  yOffset: number;    // vertical position
}

const UPPER_ARCH: ArchConfig = { width: 3.2, depth: 2.8, yOffset: 0.8 };
const LOWER_ARCH: ArchConfig = { width: 2.9, depth: 2.5, yOffset: -0.8 };

// Tooth widths (approximate relative sizes) for spacing
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

function getArchPoint(
  t: number,
  config: ArchConfig
): { x: number; z: number; angle: number } {
  // Parabolic arch: z = depth - (depth/width^2) * x^2
  // Parameterized by t from -1 to 1
  const x = t * config.width;
  const z = config.depth * (1 - t * t);

  // Tangent angle for tooth rotation (face outward)
  const dx = config.width;
  const dz = -2 * config.depth * t;
  const angle = Math.atan2(dx, dz);

  return { x, z, angle };
}

// Distribute teeth along the arch curve
// positions 1-8 from midline outward, for each side
function computeToothPositions(
  config: ArchConfig,
  isUpper: boolean
): Map<number, Tooth3DPosition> {
  const positions = new Map<number, Tooth3DPosition>();

  // Calculate cumulative widths to determine parameter t for each tooth
  // Teeth go from midline (t~0) outward to back (t~±1)
  const totalHalfWidth = Object.values(TOOTH_WIDTHS).reduce((a, b) => a + b, 0);

  // Build parameter positions for teeth 1-8 on right side (negative t)
  // and left side (positive t)
  for (const side of ['right', 'left'] as const) {
    let cumulative = 0;
    for (let pos = 1; pos <= 8; pos++) {
      const w = TOOTH_WIDTHS[pos];
      cumulative += w / 2; // center of tooth
      const tNorm = cumulative / totalHalfWidth; // normalize to 0-1
      const t = tNorm * 0.95; // don't go all the way to the edge

      const signedT = side === 'right' ? -t : t;
      const { x, z, angle } = getArchPoint(signedT, config);

      const quadrant = isUpper
        ? (side === 'right' ? 1 : 2)
        : (side === 'right' ? 4 : 3);
      const fdi = quadrant * 10 + pos;

      const rotY = side === 'right' ? -angle : angle;

      positions.set(fdi, {
        x,
        y: config.yOffset,
        z,
        rotationY: rotY,
      });

      cumulative += w / 2; // move to next tooth start
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

// Generate arch curve points for rendering the gum mesh
export function getArchCurvePoints(
  isUpper: boolean,
  segments: number = 64
): Array<{ x: number; y: number; z: number }> {
  const config = isUpper ? UPPER_ARCH : LOWER_ARCH;
  const points: Array<{ x: number; y: number; z: number }> = [];

  for (let i = 0; i <= segments; i++) {
    const t = (i / segments) * 2 - 1; // -1 to 1
    const { x, z } = getArchPoint(t, config);
    points.push({ x, y: config.yOffset, z });
  }

  return points;
}
