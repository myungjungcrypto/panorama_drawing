import * as ort from 'onnxruntime-web';
import { ToothStatus } from '@/types/dental';

// YOLO detection result
interface Detection {
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
  'Filling': 'present',          // filled tooth = present
  'Root Canal Treatment': 'present', // RCT tooth = present
  'Root Piece': 'missing',       // root piece = effectively missing
  'Retained root': 'missing',
};

let session: ort.InferenceSession | null = null;
let classNames: Record<number, string> = {};

export async function loadModel(
  onProgress?: (msg: string) => void
): Promise<boolean> {
  try {
    onProgress?.('ONNX 모델 로딩 중...');

    // Load class names
    const classRes = await fetch('/onnx/classes.json');
    if (classRes.ok) {
      classNames = await classRes.json();
    }

    // Load ONNX model
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
  confidenceThreshold: number = 0.3
): Promise<Record<number, ToothStatus>> {
  if (!session) {
    throw new Error('모델이 로딩되지 않았습니다.');
  }

  // Preprocess: resize image to inputSize x inputSize, normalize to [0,1]
  const canvas = document.createElement('canvas');
  canvas.width = inputSize;
  canvas.height = inputSize;
  const ctx = canvas.getContext('2d')!;

  // Maintain aspect ratio with letterboxing
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

  // Convert to NCHW Float32 tensor, normalize to [0, 1]
  const float32Data = new Float32Array(3 * inputSize * inputSize);
  for (let i = 0; i < inputSize * inputSize; i++) {
    float32Data[i] = data[i * 4] / 255.0;                          // R
    float32Data[inputSize * inputSize + i] = data[i * 4 + 1] / 255.0;     // G
    float32Data[2 * inputSize * inputSize + i] = data[i * 4 + 2] / 255.0; // B
  }

  const inputTensor = new ort.Tensor('float32', float32Data, [1, 3, inputSize, inputSize]);

  // Run inference
  const inputName = session.inputNames[0];
  const results = await session.run({ [inputName]: inputTensor });

  // Parse YOLO output
  const output = results[session.outputNames[0]];
  const detections = parseYoloOutput(output, inputSize, confidenceThreshold);

  // Map detections to FDI tooth numbers based on position
  return mapDetectionsToTeeth(detections, imageElement.naturalWidth, imageElement.naturalHeight, scale, padX, padY);
}

function parseYoloOutput(
  output: ort.Tensor,
  inputSize: number,
  confidenceThreshold: number
): Detection[] {
  const data = output.data as Float32Array;
  const [, numFeatures, numBoxes] = output.dims;
  // YOLOv8 output: [1, (4 + numClasses), numBoxes]
  // 4 = cx, cy, w, h
  const numClasses = numFeatures - 4;

  const detections: Detection[] = [];

  for (let i = 0; i < numBoxes; i++) {
    // Find best class
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

    detections.push({
      classId: maxClassId,
      className: classNames[maxClassId] || `class_${maxClassId}`,
      confidence: maxConf,
      bbox: {
        x: (cx - w / 2) / inputSize,
        y: (cy - h / 2) / inputSize,
        w: w / inputSize,
        h: h / inputSize,
      },
    });
  }

  // NMS (Non-Maximum Suppression)
  return nms(detections, 0.5);
}

function nms(detections: Detection[], iouThreshold: number): Detection[] {
  // Sort by confidence descending
  const sorted = [...detections].sort((a, b) => b.confidence - a.confidence);
  const kept: Detection[] = [];

  for (const det of sorted) {
    let dominated = false;
    for (const kept_det of kept) {
      if (iou(det.bbox, kept_det.bbox) > iouThreshold) {
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

function mapDetectionsToTeeth(
  detections: Detection[],
  imgW: number,
  imgH: number,
  scale: number,
  padX: number,
  padY: number
): Record<number, ToothStatus> {
  // Initialize all teeth as present
  const result: Record<number, ToothStatus> = {};
  for (let q = 1; q <= 4; q++) {
    for (let p = 1; p <= 8; p++) {
      result[q * 10 + p] = 'present';
    }
  }

  // Panoramic X-ray layout:
  // Image left = patient's right (quadrants 1, 4)
  // Image right = patient's left (quadrants 2, 3)
  // Top half = upper jaw (quadrants 1, 2)
  // Bottom half = lower jaw (quadrants 3, 4)

  // Expected horizontal positions for each tooth (normalized 0-1)
  // From left to right: 18,17,16,15,14,13,12,11 | 21,22,23,24,25,26,27,28
  const upperFdi = [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28];
  const lowerFdi = [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38];

  // Process detections that indicate non-present status
  for (const det of detections) {
    const status = CLASS_TO_STATUS[det.className];
    if (!status || status === 'present') continue;

    // Convert bbox center from normalized input coords to original image coords
    const centerX = (det.bbox.x + det.bbox.w / 2);
    const centerY = (det.bbox.y + det.bbox.h / 2);

    // Determine if upper or lower jaw
    const isUpper = centerY < 0.5;
    const fdiRow = isUpper ? upperFdi : lowerFdi;

    // Map horizontal position to tooth index (0-15)
    const toothIdx = Math.min(15, Math.max(0, Math.floor(centerX * 16)));
    const fdi = fdiRow[toothIdx];

    // Only override if detection confidence is higher than previous
    if (fdi && (result[fdi] === 'present' || det.confidence > 0.5)) {
      result[fdi] = status;
    }
  }

  // Check for "Missing teeth" class detections
  for (const det of detections) {
    if (det.className === 'Missing teeth' && det.confidence > 0.3) {
      const centerX = (det.bbox.x + det.bbox.w / 2);
      const centerY = (det.bbox.y + det.bbox.h / 2);
      const isUpper = centerY < 0.5;
      const fdiRow = isUpper ? upperFdi : lowerFdi;
      const toothIdx = Math.min(15, Math.max(0, Math.floor(centerX * 16)));
      const fdi = fdiRow[toothIdx];
      if (fdi) result[fdi] = 'missing';
    }
  }

  return result;
}
