// 어노테이션 → 치아별 상태 도출 및 전/후 diff 계산

export interface AnnBox {
  type: string; // tooth | condition
  label: string;
  x: number; y: number; w: number; h: number;
}

export type ToothStatusStr = 'present' | 'missing' | 'crown' | 'implant' | 'bridge';

const ALL_FDIS: number[] = [];
for (let q = 1; q <= 4; q++) for (let p = 1; p <= 8; p++) ALL_FDIS.push(q * 10 + p);

// 겹침 비율: 교집합 / 작은 박스 면적
function overlapRatio(a: AnnBox, b: AnnBox): number {
  const ix = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const iy = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  const inter = ix * iy;
  const smaller = Math.min(a.w * a.h, b.w * b.h);
  return smaller > 0 ? inter / smaller : 0;
}

// 어노테이션 목록에서 치아별(FDI) 상태 도출
// - 치식 박스가 있는 FDI: 겹치는 상태 박스에 따라 crown/implant/bridge, 없으면 present
// - 치식 박스가 없는 FDI: missing (어노테이터는 보이는 치아를 모두 표기한다는 전제)
export function deriveToothStatuses(annotations: AnnBox[]): Record<number, ToothStatusStr> {
  const toothBoxes = annotations.filter((a) => a.type === 'tooth' && /^\d+$/.test(a.label));
  const condBoxes = annotations.filter((a) => a.type === 'condition');

  const result: Record<number, ToothStatusStr> = {};
  for (const fdi of ALL_FDIS) result[fdi] = 'missing';

  for (const tb of toothBoxes) {
    const fdi = parseInt(tb.label);
    if (fdi < 11 || fdi > 48) continue;

    let status: ToothStatusStr = 'present';
    let bestPriority = 0;
    // 우선순위: Implant > Crown > abutment(bridge)
    for (const cb of condBoxes) {
      if (overlapRatio(tb, cb) < 0.25) continue;
      if (cb.label === 'Implant' && bestPriority < 3) { status = 'implant'; bestPriority = 3; }
      else if (cb.label === 'Crown' && bestPriority < 2) { status = 'crown'; bestPriority = 2; }
      else if (cb.label === 'abutment' && bestPriority < 1) { status = 'bridge'; bestPriority = 1; }
    }
    result[fdi] = status;
  }

  return result;
}

// 전/후 상태에서 치료 내역 도출 (변화 없으면 null)
export function deriveTreatment(before: ToothStatusStr, after: ToothStatusStr): string | null {
  if (before === after) return null;
  const key = `${before}>${after}`;
  const MAP: Record<string, string> = {
    'missing>implant': '임플란트 식립',
    'missing>crown': '보철 수복',
    'missing>bridge': '브릿지 (가공치)',
    'missing>present': '보철/수복',
    'present>crown': '크라운 수복',
    'present>bridge': '브릿지 지대치',
    'present>implant': '발치 후 임플란트',
    'present>missing': '발치',
    'crown>missing': '발치',
    'crown>implant': '발치 후 임플란트',
    'crown>present': '크라운 제거',
    'bridge>implant': '브릿지 제거 후 임플란트',
    'bridge>missing': '발치',
    'implant>crown': '임플란트 보철 완료',
    'implant>missing': '임플란트 제거',
  };
  return MAP[key] ?? `${before} → ${after}`;
}

export function computeCaseDiff(
  beforeAnns: AnnBox[],
  afterAnns: AnnBox[]
): { fdi: number; beforeStatus: ToothStatusStr; afterStatus: ToothStatusStr; treatment: string }[] {
  const beforeStatuses = deriveToothStatuses(beforeAnns);
  const afterStatuses = deriveToothStatuses(afterAnns);

  const labels: { fdi: number; beforeStatus: ToothStatusStr; afterStatus: ToothStatusStr; treatment: string }[] = [];
  for (const fdi of ALL_FDIS) {
    const treatment = deriveTreatment(beforeStatuses[fdi], afterStatuses[fdi]);
    if (treatment) {
      labels.push({ fdi, beforeStatus: beforeStatuses[fdi], afterStatus: afterStatuses[fdi], treatment });
    }
  }
  return labels;
}
