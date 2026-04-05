import * as ort from 'onnxruntime-web';
import { ToothStatus } from '@/types/dental';

export interface Detection {
  classId: number;
  className: string;
  confidence: number;
  bbox: { x: number; y: number; w: number; h: number };
}

// Map YOLO class names to our ToothStatus
const CLASS_TO_STATUS: Record<string, ToothStatus> = {
  'Permanent Teeth': 'present',
  'Primary teeth': 'present',
  'Crown': 'crown',
  'Implant': 'implant',
  'Missing teeth': 'missing',
  'Filling': 'present',
  'Root Canal Treatment': 'present',
  'Root Piece': 'missing',
  'Retained root': 'missing',
};

// Classes that represent a "tooth exists at this position"
const TOOTH_PRESENT_CLASSES = new Set([
  'Permanent Teeth', 'Primary teeth', 'Crown', 'Implant',
  'Filling', 'Root Canal Treatment', 'post - core', 'abutment',
]);

// Classes that override the status
const STATUS_OVERRIDE_CLASSES = new Set([
  'Crown', 'Implant', 'Missing teeth',
]);

let session: ort.InferenceSession | null = null;
let classNames: Record<number, string> = {};

export async function loadModel(
  onProgress?: (msg: string) => void
): Promise<boolean> {
  try {
    onProgress?.('ONNX 모델 로딩 중...');

    const classRes = await fetch('/onnx/classes.json');
    if (classRes.ok) {
      classNames = await classRes.json();
    }

    session = await ort.InferenceSession.create('/onnx/dental_detector.onnx', {
      executionProviders: ['wasm'],
      graphOptimizationLevel: 'all',
    });

    onProgress?.('모델 로딩 완료');
    return true;
  } catch (err) {
    console.error('Model load error:', err);
    onProgress?.('모델 로딩 실패');
    return false;
  }
}

export function isModelLoaded(): boolean {
  return session !== null;
}

export async function detectTeeth(
  imageElement: HTMLImageElement,
  inputSize: number = 640,
  confidenceThreshold: number = 0.25
): Promise<{ result: Record<number, ToothStatus>; detections: Detection[] }> {
  if (!session) {
    throw new Error('모델이 로딩되지 않았습니다.');
  }

  const canvas = document.createElement('canvas');
  canvas.width = inputSize;
  canvas.height = inputSize;
  const ctx = canvas.getContext('2d')!;

  // Letterbox resize
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

  const inputTensor = new ort.Tensor('float32', float32Data, [1, 3, inputSize, inputSize]);
  const inputName = session.inputNames[0];
  const results = await session.run({ [inputName]: inputTensor });

  const output = results[session.outputNames[0]];
  const detections = parseYoloOutput(output, inputSize, confidenceThreshold, padX, padY, scale);

  // Log detections for debugging
  console.log(`[YOLO] ${detections.length}개 감지:`,
    detections.map(d => `${d.className}(${(d.confidence * 100).toFixed(0)}%) [x:${d.bbox.x.toFixed(2)}, y:${d.bbox.y.toFixed(2)}]`)
  );

  const result = mapDetectionsToTeeth(detections);
  return { result, detections };
}

function parseYoloOutput(
  output: ort.Tensor,
  inputSize: number,
  confidenceThreshold: number,
  padX: number,
  padY: number,
  scale: number
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

    // Convert from input coords to original image coords (0-1 normalized)
    const cx = data[0 * numBoxes + i];
    const cy = data[1 * numBoxes + i];
    const w = data[2 * numBoxes + i];
    const h = data[3 * numBoxes + i];

    // Remove padding and scaling to get normalized coords in original image
    const origX = (cx - padX) / (inputSize - 2 * padX);
    const origY = (cy - padY) / (inputSize - 2 * padY);
    const origW = w / (inputSize - 2 * padX);
    const origH = h / (inputSize - 2 * padY);

    detections.push({
      classId: maxClassId,
      className: classNames[maxClassId] || `class_${maxClassId}`,
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

// Panoramic X-ray: expected normalized X positions for each FDI tooth
// Image left = patient right (Q1 upper, Q4 lower)
// Image right = patient left (Q2 upper, Q3 lower)
// Panoramic images are typically wider than tall, teeth occupy ~80% of width
// Positions adjusted based on real panoramic anatomy
const TOOTH_X_POSITIONS: Record<number, number> = {
  // Upper right (Q1): left side of image, 18→11
  18: 0.06, 17: 0.11, 16: 0.17, 15: 0.22, 14: 0.27, 13: 0.32, 12: 0.39, 11: 0.45,
  // Upper left (Q2): right side of image, 21→28
  21: 0.55, 22: 0.61, 23: 0.68, 24: 0.73, 25: 0.78, 26: 0.83, 27: 0.89, 28: 0.94,
  // Lower left (Q3): right side of image, 31→38
  // Note: lower teeth positions mirror upper but the arch is narrower
  31: 0.54, 32: 0.59, 33: 0.64, 34: 0.69, 35: 0.74, 36: 0.79, 37: 0.85, 38: 0.91,
  // Lower right (Q4): left side of image, 41→48
  41: 0.46, 42: 0.41, 43: 0.36, 44: 0.31, 45: 0.26, 46: 0.21, 47: 0.15, 48: 0.09,
};

function mapDetectionsToTeeth(detections: Detection[]): Record<number, ToothStatus> {
  // Start with all present
  const result: Record<number, ToothStatus> = {};
  const allFdi = Object.keys(TOOTH_X_POSITIONS).map(Number);
  for (const fdi of allFdi) {
    result[fdi] = 'present';
  }

  // Separate detections by jaw (upper vs lower)
  const upperDets: Detection[] = [];
  const lowerDets: Detection[] = [];

  for (const det of detections) {
    const centerY = det.bbox.y + det.bbox.h / 2;
    // Upper/lower jaw boundary: typically around 47-50% of image height
    if (centerY < 0.48) {
      upperDets.push(det);
    } else {
      lowerDets.push(det);
    }
  }

  // Process each jaw
  processJawDetections(upperDets, [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28], result);
  processJawDetections(lowerDets, [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38], result);

  return result;
}

function processJawDetections(
  detections: Detection[],
  fdiOrder: number[],
  result: Record<number, ToothStatus>
) {
  // For each detection, find the nearest FDI tooth position
  for (const det of detections) {
    const status = CLASS_TO_STATUS[det.className];
    if (!status) continue;

    const centerX = det.bbox.x + det.bbox.w / 2;

    // Find closest FDI tooth to this detection's X position
    let closestFdi = fdiOrder[0];
    let closestDist = Infinity;

    for (const fdi of fdiOrder) {
      const expectedX = TOOTH_X_POSITIONS[fdi];
      const dist = Math.abs(centerX - expectedX);
      if (dist < closestDist) {
        closestDist = dist;
        closestFdi = fdi;
      }
    }

    // Only assign if reasonably close (within ~4% of image width)
    if (closestDist > 0.06) continue;

    // Status priority: missing > implant > crown > present
    const currentStatus = result[closestFdi];
    if (shouldOverride(currentStatus, status)) {
      result[closestFdi] = status;
    }
  }
}

function shouldOverride(current: ToothStatus, incoming: ToothStatus): boolean {
  const priority: Record<ToothStatus, number> = {
    present: 0,
    crown: 1,
    bridge: 2,
    implant: 3,
    missing: 4,
  };
  return priority[incoming] > priority[current];
}
