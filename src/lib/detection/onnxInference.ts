import * as ort from 'onnxruntime-web';
import { ToothStatus } from '@/types/dental';

export interface Detection {
  classId: number;
  className: string;
  confidence: number;
  bbox: { x: number; y: number; w: number; h: number };
}

// Map condition class names to ToothStatus
const CONDITION_TO_STATUS: Record<string, ToothStatus> = {
  'Crown': 'crown',
  // 'Implant': 'implant',  // 임플란트는 당분간 무시
  'Missing teeth': 'missing',
  'Filling': 'present',
  'Root Canal Treatment': 'present',
  'Root Piece': 'missing',
  'Retained root': 'missing',
  'post - core': 'crown',
  'abutment': 'bridge',
};

let numberingSession: ort.InferenceSession | null = null;
let conditionSession: ort.InferenceSession | null = null;
let numberingClassNames: Record<number, string> = {};
let conditionClassNames: Record<number, string> = {};

export async function loadModel(
  onProgress?: (msg: string) => void
): Promise<boolean> {
  try {
    // Load tooth numbering model (primary)
    onProgress?.('치아 번호 모델 로딩 중...');
    const numClassRes = await fetch('/onnx/tooth_classes.json');
    if (numClassRes.ok) {
      numberingClassNames = await numClassRes.json();
    }

    try {
      numberingSession = await ort.InferenceSession.create('/onnx/tooth_numbering.onnx', {
        executionProviders: ['wasm'],
        graphOptimizationLevel: 'all',
      });
      onProgress?.('치아 번호 모델 로딩 완료');
    } catch {
      console.warn('치아 번호 모델 없음 - 상태 감지 모델만 사용');
      numberingSession = null;
    }

    // Load condition detection model
    onProgress?.('상태 감지 모델 로딩 중...');
    const condClassRes = await fetch('/onnx/classes.json');
    if (condClassRes.ok) {
      conditionClassNames = await condClassRes.json();
    }

    try {
      conditionSession = await ort.InferenceSession.create('/onnx/dental_detector.onnx', {
        executionProviders: ['wasm'],
        graphOptimizationLevel: 'all',
      });
      onProgress?.('상태 감지 모델 로딩 완료');
    } catch {
      console.warn('상태 감지 모델 없음');
      conditionSession = null;
    }

    if (!numberingSession && !conditionSession) {
      onProgress?.('모델 로딩 실패');
      return false;
    }

    onProgress?.('모델 로딩 완료');
    return true;
  } catch (err) {
    console.error('Model load error:', err);
    onProgress?.('모델 로딩 실패');
    return false;
  }
}

export function isModelLoaded(): boolean {
  return numberingSession !== null || conditionSession !== null;
}

export async function detectTeeth(
  imageElement: HTMLImageElement,
  inputSize: number = 640,
  confidenceThreshold: number = 0.25
): Promise<{ result: Record<number, ToothStatus>; detections: Detection[] }> {
  const allDetections: Detection[] = [];

  // Prepare image tensor
  const { tensor, padX, padY } = prepareImage(imageElement, inputSize);

  // Step 1: Run tooth numbering model (if available)
  let toothDetections: Detection[] = [];
  if (numberingSession) {
    const inputName = numberingSession.inputNames[0];
    const results = await numberingSession.run({ [inputName]: tensor });
    const output = results[numberingSession.outputNames[0]];
    toothDetections = parseYoloOutput(output, inputSize, confidenceThreshold, padX, padY, numberingClassNames);
    console.log(`[치아번호] ${toothDetections.length}개 감지:`,
      toothDetections.map(d => `#${d.className}(${(d.confidence * 100).toFixed(0)}%)`)
    );
    allDetections.push(...toothDetections);
  }

  // Step 2: Run condition detection model (if available)
  let conditionDetections: Detection[] = [];
  if (conditionSession) {
    const inputName = conditionSession.inputNames[0];
    const results = await conditionSession.run({ [inputName]: tensor });
    const output = results[conditionSession.outputNames[0]];
    conditionDetections = parseYoloOutput(output, inputSize, confidenceThreshold, padX, padY, conditionClassNames);
    console.log(`[상태감지] ${conditionDetections.length}개 감지:`,
      conditionDetections.map(d => `${d.className}(${(d.confidence * 100).toFixed(0)}%)`)
    );
    allDetections.push(...conditionDetections);
  }

  // Step 3: Combine results
  const result = combineResults(toothDetections, conditionDetections);

  return { result, detections: allDetections };
}

function prepareImage(
  imageElement: HTMLImageElement,
  inputSize: number
): { tensor: ort.Tensor; padX: number; padY: number } {
  const canvas = document.createElement('canvas');
  canvas.width = inputSize;
  canvas.height = inputSize;
  const ctx = canvas.getContext('2d')!;

  const scale = Math.min(inputSize / imageElement.naturalWidth, inputSize / imageElement.naturalHeight);
  const scaledW = imageElement.naturalWidth * scale;
  const scaledH = imageElement.naturalHeight * scale;
  const padX = (inputSize - scaledW) / 2;
  const padY = (inputSize - scaledH) / 2;

  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, inputSize, inputSize);
  ctx.drawImage(imageElement, padX, padY, scaledW, scaledH);

  const imageData = ctx.getImageData(0, 0, inputSize, inputSize);
  const { data } = imageData;

  const float32Data = new Float32Array(3 * inputSize * inputSize);
  for (let i = 0; i < inputSize * inputSize; i++) {
    float32Data[i] = data[i * 4] / 255.0;
    float32Data[inputSize * inputSize + i] = data[i * 4 + 1] / 255.0;
    float32Data[2 * inputSize * inputSize + i] = data[i * 4 + 2] / 255.0;
  }

  const tensor = new ort.Tensor('float32', float32Data, [1, 3, inputSize, inputSize]);
  return { tensor, padX, padY };
}

function parseYoloOutput(
  output: ort.Tensor,
  inputSize: number,
  confidenceThreshold: number,
  padX: number,
  padY: number,
  classNamesMap: Record<number, string>
): Detection[] {
  const data = output.data as Float32Array;
  const [, numFeatures, numBoxes] = output.dims;
  const numClasses = numFeatures - 4;

  const detections: Detection[] = [];

  for (let i = 0; i < numBoxes; i++) {
    let maxConf = 0;
    let maxClassId = 0;
    for (let c = 0; c < numClasses; c++) {
      const conf = data[(4 + c) * numBoxes + i];
      if (conf > maxConf) {
        maxConf = conf;
        maxClassId = c;
      }
    }

    if (maxConf < confidenceThreshold) continue;

    const cx = data[0 * numBoxes + i];
    const cy = data[1 * numBoxes + i];
    const w = data[2 * numBoxes + i];
    const h = data[3 * numBoxes + i];

    const origX = (cx - padX) / (inputSize - 2 * padX);
    const origY = (cy - padY) / (inputSize - 2 * padY);
    const origW = w / (inputSize - 2 * padX);
    const origH = h / (inputSize - 2 * padY);

    detections.push({
      classId: maxClassId,
      className: classNamesMap[maxClassId] || `class_${maxClassId}`,
      confidence: maxConf,
      bbox: {
        x: origX - origW / 2,
        y: origY - origH / 2,
        w: origW,
        h: origH,
      },
    });
  }

  return nms(detections, 0.45);
}

function nms(detections: Detection[], iouThreshold: number): Detection[] {
  const sorted = [...detections].sort((a, b) => b.confidence - a.confidence);
  const kept: Detection[] = [];

  for (const det of sorted) {
    let dominated = false;
    for (const kept_det of kept) {
      if (det.classId === kept_det.classId && iou(det.bbox, kept_det.bbox) > iouThreshold) {
        dominated = true;
        break;
      }
    }
    if (!dominated) kept.push(det);
  }

  return kept;
}

function iou(a: Detection['bbox'], b: Detection['bbox']): number {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.w, b.x + b.w);
  const y2 = Math.min(a.y + a.h, b.y + b.h);

  const intersection = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const areaA = a.w * a.h;
  const areaB = b.w * b.h;
  const union = areaA + areaB - intersection;
  return union > 0 ? intersection / union : 0;
}

function bboxOverlap(a: Detection['bbox'], b: Detection['bbox']): number {
  const ix1 = Math.max(a.x, b.x);
  const iy1 = Math.max(a.y, b.y);
  const ix2 = Math.min(a.x + a.w, b.x + b.w);
  const iy2 = Math.min(a.y + a.h, b.y + b.h);
  const intersection = Math.max(0, ix2 - ix1) * Math.max(0, iy2 - iy1);
  const smallerArea = Math.min(a.w * a.h, b.w * b.h);
  return smallerArea > 0 ? intersection / smallerArea : 0;
}

function combineResults(
  toothDetections: Detection[],
  conditionDetections: Detection[]
): Record<number, ToothStatus> {
  // Initialize all as present
  const result: Record<number, ToothStatus> = {};
  for (let q = 1; q <= 4; q++) {
    for (let p = 1; p <= 8; p++) {
      result[q * 10 + p] = 'present';
    }
  }

  if (toothDetections.length > 0) {
    // === Two-model pipeline ===

    // Step 1: Map tooth detections to FDI numbers
    const toothMap = new Map<number, Detection>();
    for (const det of toothDetections) {
      const fdi = parseInt(det.className);
      if (isNaN(fdi) || fdi < 11 || fdi > 48) continue;

      const existing = toothMap.get(fdi);
      if (!existing || det.confidence > existing.confidence) {
        toothMap.set(fdi, det);
      }
    }

    const detectedFdis = new Set(toothMap.keys());
    const undetectedFdis = new Set<number>();
    for (let q = 1; q <= 4; q++) {
      for (let p = 1; p <= 8; p++) {
        const fdi = q * 10 + p;
        if (!detectedFdis.has(fdi)) undetectedFdis.add(fdi);
      }
    }

    console.log(`[매핑] 감지된 치아 (${detectedFdis.size}개): ${Array.from(detectedFdis).sort().join(', ')}`);
    console.log(`[매핑] 미감지 치아 (${undetectedFdis.size}개): ${Array.from(undetectedFdis).sort().join(', ')}`);

    // Step 2: Process condition detections
    // KEY PRINCIPLES:
    //   - Crown/Implant → 감지된 치아 중 겹치는 것에 1:1 매핑
    //   - Missing teeth → 미감지 치아 중 가장 가까운 것에 매핑
    //   - 같은 치아에 Crown + Implant → Implant 우선
    //   - 각 Crown/Implant은 반드시 서로 다른 치아에 매핑 (1:1)

    // Step 2a: Collect all Crown/Implant detections with their best matching teeth
    interface CondMatch {
      det: Detection;
      status: ToothStatus;
      fdi: number;
      overlap: number;
    }

    const condMatches: CondMatch[] = [];

    for (const condDet of conditionDetections) {
      const status = CONDITION_TO_STATUS[condDet.className];
      if (!status || status === 'present') continue;

      if (condDet.className === 'Missing teeth') {
        // Missing은 별도 처리
        const condCenterX = condDet.bbox.x + condDet.bbox.w / 2;
        const condCenterY = condDet.bbox.y + condDet.bbox.h / 2;
        const isUpper = condCenterY < 0.48;

        let bestFdi = 0;
        let bestDist = Infinity;

        for (const fdi of undetectedFdis) {
          const quadrant = Math.floor(fdi / 10);
          const fdiIsUpper = quadrant <= 2;
          if (fdiIsUpper !== isUpper) continue;

          const estimatedX = estimateToothX(fdi, toothMap);
          if (estimatedX === null) continue;

          const dist = Math.abs(condCenterX - estimatedX);
          if (dist < bestDist) {
            bestDist = dist;
            bestFdi = fdi;
          }
        }

        if (bestFdi > 0 && bestDist < 0.08) {
          console.log(`[매핑] Missing teeth → #${bestFdi} (거리: ${(bestDist * 100).toFixed(1)}%, 미감지 치아)`);
          result[bestFdi] = 'missing';
        }
      } else {
        // Crown/Implant: 모든 감지된 치아와의 겹침 계산
        const matches: { fdi: number; overlap: number }[] = [];

        for (const [fdi, toothDet] of toothMap) {
          const overlap = bboxOverlap(condDet.bbox, toothDet.bbox);
          if (overlap > 0.15) {
            matches.push({ fdi, overlap });
          }
        }

        // 겹침 높은 순 정렬
        matches.sort((a, b) => b.overlap - a.overlap);

        if (matches.length > 0) {
          condMatches.push({
            det: condDet,
            status,
            fdi: matches[0].fdi,
            overlap: matches[0].overlap,
          });
        }
      }
    }

    // Step 2b: 매핑 규칙
    // - Implant 먼저 배정 (우선순위 높음)
    // - Crown은 Implant과 같은 치아에 배정 가능 (임플란트 위에 크라운은 정상)
    // - 같은 종류끼리는 1:1 (Crown-Crown, Implant-Implant 중복 불가)
    condMatches.sort((a, b) => b.overlap - a.overlap);

    const crownAssigned = new Set<number>();   // Crown이 배정된 치아
    const implantAssigned = new Set<number>(); // Implant이 배정된 치아

    // Implant 먼저 배정
    const implantMatches = condMatches.filter(m => m.det.className === 'Implant');
    const crownMatches = condMatches.filter(m => m.det.className !== 'Implant');

    for (const match of implantMatches) {
      if (!implantAssigned.has(match.fdi)) {
        implantAssigned.add(match.fdi);
        result[match.fdi] = 'implant';
        console.log(`[매핑] Implant → #${match.fdi} (겹침: ${(match.overlap * 100).toFixed(0)}%)`);
      } else {
        // 같은 치아에 이미 Implant → 다른 치아 찾기
        const altFdi = findAlternativeTooth(match, toothMap, implantAssigned);
        if (altFdi) {
          implantAssigned.add(altFdi);
          result[altFdi] = 'implant';
          console.log(`[매핑] Implant → #${altFdi} (재배정, 원래 #${match.fdi} 중복)`);
        }
      }
    }

    // Crown 배정 (Implant 치아와 겹쳐도 OK, Crown끼리만 1:1)
    for (const match of crownMatches) {
      if (match.status !== 'crown') {
        // bridge 등 다른 상태는 그냥 배정
        result[match.fdi] = match.status;
        console.log(`[매핑] ${match.det.className} → #${match.fdi} (겹침: ${(match.overlap * 100).toFixed(0)}%)`);
        continue;
      }

      if (!crownAssigned.has(match.fdi)) {
        crownAssigned.add(match.fdi);
        // Implant 치아에 Crown이 겹치면 → Implant 유지 (Crown은 무시, 이미 포함된 개념)
        if (!implantAssigned.has(match.fdi)) {
          result[match.fdi] = 'crown';
        }
        console.log(`[매핑] Crown → #${match.fdi} (겹침: ${(match.overlap * 100).toFixed(0)}%)${implantAssigned.has(match.fdi) ? ' [Implant 치아]' : ''}`);
      } else {
        // 같은 치아에 이미 Crown → 다른 치아 찾기
        const altFdi = findAlternativeTooth(match, toothMap, crownAssigned);
        if (altFdi) {
          crownAssigned.add(altFdi);
          if (!implantAssigned.has(altFdi)) {
            result[altFdi] = 'crown';
          }
          console.log(`[매핑] Crown → #${altFdi} (재배정, 원래 #${match.fdi} 중복)${implantAssigned.has(altFdi) ? ' [Implant 치아]' : ''}`);
        }
      }
    }

  } else {
    // === Fallback: condition model only ===
    console.log('[매핑] 치아 번호 모델 없음 - 위치 기반 추정 사용');
    const upperFdi = [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28];
    const lowerFdi = [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38];

    const TOOTH_X: Record<number, number> = {
      18: 0.06, 17: 0.11, 16: 0.17, 15: 0.22, 14: 0.27, 13: 0.32, 12: 0.39, 11: 0.45,
      21: 0.55, 22: 0.61, 23: 0.68, 24: 0.73, 25: 0.78, 26: 0.83, 27: 0.89, 28: 0.94,
      31: 0.54, 32: 0.59, 33: 0.64, 34: 0.69, 35: 0.74, 36: 0.79, 37: 0.85, 38: 0.91,
      41: 0.46, 42: 0.41, 43: 0.36, 44: 0.31, 45: 0.26, 46: 0.21, 47: 0.15, 48: 0.09,
    };

    for (const det of conditionDetections) {
      const status = CONDITION_TO_STATUS[det.className];
      if (!status) continue;

      const cx = det.bbox.x + det.bbox.w / 2;
      const cy = det.bbox.y + det.bbox.h / 2;
      const isUpper = cy < 0.48;
      const fdiRow = isUpper ? upperFdi : lowerFdi;

      let closestFdi = fdiRow[0];
      let closestDist = Infinity;
      for (const fdi of fdiRow) {
        const dist = Math.abs(cx - TOOTH_X[fdi]);
        if (dist < closestDist) {
          closestDist = dist;
          closestFdi = fdi;
        }
      }

      if (closestDist < 0.06 && status !== 'present') {
        result[closestFdi] = status;
      }
    }
  }

  return result;
}

/**
 * 미감지 치아의 예상 X 위치를 인접 감지 치아로부터 보간 추정
 */
function findAlternativeTooth(
  match: { det: Detection; fdi: number },
  toothMap: Map<number, Detection>,
  assigned: Set<number>
): number {
  const condCenterX = match.det.bbox.x + match.det.bbox.w / 2;

  // 겹침으로 대안 찾기
  let bestAltFdi = 0;
  let bestAltOverlap = 0.1;

  for (const [fdi, toothDet] of toothMap) {
    if (assigned.has(fdi)) continue;
    const overlap = bboxOverlap(match.det.bbox, toothDet.bbox);
    if (overlap > bestAltOverlap) {
      bestAltOverlap = overlap;
      bestAltFdi = fdi;
    }
  }

  // 겹침으로 못 찾으면 거리로
  if (!bestAltFdi) {
    let bestDist = Infinity;
    for (const [fdi, toothDet] of toothMap) {
      if (assigned.has(fdi)) continue;
      const toothCenterX = toothDet.bbox.x + toothDet.bbox.w / 2;
      const dist = Math.abs(condCenterX - toothCenterX);
      if (dist < bestDist) {
        bestDist = dist;
        bestAltFdi = fdi;
      }
    }
  }

  return bestAltFdi;
}

function estimateToothX(
  fdi: number,
  toothMap: Map<number, Detection>
): number | null {
  const quadrant = Math.floor(fdi / 10);
  const position = fdi % 10;

  // 같은 사분면에서 인접한 감지된 치아 찾기
  let leftFdi = 0, rightFdi = 0;
  let leftDet: Detection | null = null, rightDet: Detection | null = null;

  // 왼쪽(더 작은 position) 방향으로 가장 가까운 감지 치아
  for (let p = position - 1; p >= 1; p--) {
    const adjFdi = quadrant * 10 + p;
    if (toothMap.has(adjFdi)) {
      leftFdi = adjFdi;
      leftDet = toothMap.get(adjFdi)!;
      break;
    }
  }

  // 오른쪽(더 큰 position) 방향으로 가장 가까운 감지 치아
  for (let p = position + 1; p <= 8; p++) {
    const adjFdi = quadrant * 10 + p;
    if (toothMap.has(adjFdi)) {
      rightFdi = adjFdi;
      rightDet = toothMap.get(adjFdi)!;
      break;
    }
  }

  if (leftDet && rightDet) {
    // 양쪽 다 있으면 선형 보간
    const leftX = leftDet.bbox.x + leftDet.bbox.w / 2;
    const rightX = rightDet.bbox.x + rightDet.bbox.w / 2;
    const leftPos = leftFdi % 10;
    const rightPos = rightFdi % 10;
    const ratio = (position - leftPos) / (rightPos - leftPos);
    return leftX + (rightX - leftX) * ratio;
  } else if (leftDet) {
    // 왼쪽만 있으면 치아 간격 추정
    const leftX = leftDet.bbox.x + leftDet.bbox.w / 2;
    const gap = leftDet.bbox.w * 1.1; // 치아 너비만큼 간격
    const leftPos = leftFdi % 10;
    const diff = position - leftPos;
    // 사분면에 따라 방향 결정
    const direction = (quadrant === 1 || quadrant === 4) ? -1 : 1;
    return leftX + direction * gap * diff;
  } else if (rightDet) {
    const rightX = rightDet.bbox.x + rightDet.bbox.w / 2;
    const gap = rightDet.bbox.w * 1.1;
    const rightPos = rightFdi % 10;
    const diff = rightPos - position;
    const direction = (quadrant === 1 || quadrant === 4) ? -1 : 1;
    return rightX - direction * gap * diff;
  }

  return null;
}
