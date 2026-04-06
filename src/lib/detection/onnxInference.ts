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
  'Implant': 'implant',
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
    const toothMap = new Map<number, Detection>(); // FDI -> detection

    for (const det of toothDetections) {
      const fdi = parseInt(det.className);
      if (isNaN(fdi) || fdi < 11 || fdi > 48) continue;

      // Keep highest confidence detection for each FDI
      const existing = toothMap.get(fdi);
      if (!existing || det.confidence > existing.confidence) {
        toothMap.set(fdi, det);
      }
    }

    // All detected teeth are present
    // NOTE: 치아 번호 모델이 감지 못한 것 ≠ 상실
    // 상실은 오직 상태 감지 모델의 "Missing teeth" 클래스로만 판단
    const detectedFdis = new Set(toothMap.keys());
    console.log(`[매핑] 감지된 치아 (${detectedFdis.size}개): ${Array.from(detectedFdis).sort().join(', ')}`);

    // Step 2: Overlay condition detections onto detected teeth
    for (const condDet of conditionDetections) {
      const status = CONDITION_TO_STATUS[condDet.className];
      if (!status || status === 'present') continue;

      // Find which tooth this condition overlaps with
      let bestFdi = 0;
      let bestOverlap = 0.3; // minimum 30% overlap required

      for (const [fdi, toothDet] of toothMap) {
        const overlap = bboxOverlap(condDet.bbox, toothDet.bbox);
        if (overlap > bestOverlap) {
          bestOverlap = overlap;
          bestFdi = fdi;
        }
      }

      if (bestFdi > 0) {
        console.log(`[매핑] ${condDet.className} → #${bestFdi} (겹침: ${(bestOverlap * 100).toFixed(0)}%)`);
        result[bestFdi] = status;
      }
    }

    // Also check for "Missing teeth" detections from condition model
    for (const condDet of conditionDetections) {
      if (condDet.className !== 'Missing teeth') continue;

      // For missing teeth, find the nearest tooth position that isn't already detected
      const centerX = condDet.bbox.x + condDet.bbox.w / 2;
      const centerY = condDet.bbox.y + condDet.bbox.h / 2;
      const isUpper = centerY < 0.48;

      // Find the nearest undetected tooth position
      for (const [fdi, toothDet] of toothMap) {
        const toothCenterX = toothDet.bbox.x + toothDet.bbox.w / 2;
        const dist = Math.abs(centerX - toothCenterX);
        // If there's a missing teeth detection near a detected tooth, check neighbors
        if (dist < 0.05) {
          const quadrant = Math.floor(fdi / 10);
          const position = fdi % 10;
          const isCorrectJaw = isUpper ? (quadrant <= 2) : (quadrant >= 3);
          if (isCorrectJaw) {
            // Check adjacent positions for gaps
            for (const adj of [position - 1, position + 1]) {
              if (adj >= 1 && adj <= 8) {
                const adjFdi = quadrant * 10 + adj;
                if (!detectedFdis.has(adjFdi)) {
                  result[adjFdi] = 'missing';
                }
              }
            }
          }
        }
      }
    }

  } else {
    // === Fallback: condition model only (old behavior) ===
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
