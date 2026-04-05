'use client';

import { useState, useCallback, useRef, DragEvent, ChangeEvent } from 'react';
import { useTeethState } from '@/hooks/useTeethState';
import { ToothStatus } from '@/types/dental';
import type { Detection } from '@/lib/detection/onnxInference';

export default function ImageUploader() {
  const [preview, setPreview] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [analyzed, setAnalyzed] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string>('');
  const [localModelReady, setLocalModelReady] = useState(false);
  const [detections, setDetections] = useState<Detection[]>([]);
  const [showOverlay, setShowOverlay] = useState(true);
  const imgRef = useRef<HTMLImageElement>(null);

  const setToothStatus = useTeethState((s) => s.setToothStatus);
  const resetAll = useTeethState((s) => s.resetAll);

  const handleFile = useCallback((file: File) => {
    if (!file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      setPreview(dataUrl);
      setAnalyzed(false);
      setAnalysisError(null);
      setDetections([]);
    };
    reader.readAsDataURL(file);
  }, []);

  const handleDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const handleChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  // Cloud analysis (Claude API)
  const analyzeCloud = useCallback(async () => {
    if (!preview) return;
    setAnalyzing(true);
    setAnalysisError(null);
    setStatusMsg('Claude API로 분석 중... (10~20초)');

    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageData: preview }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '분석 실패');
      applyResults(data.result);
      setAnalyzed(true);
      setStatusMsg('');
      setDetections([]);
    } catch (err) {
      setAnalysisError(err instanceof Error ? err.message : '분석 중 오류 발생');
    } finally {
      setAnalyzing(false);
    }
  }, [preview]);

  // Local analysis (ONNX model in browser)
  const analyzeLocal = useCallback(async () => {
    if (!preview || !imgRef.current) return;
    setAnalyzing(true);
    setAnalysisError(null);

    try {
      const { loadModel, isModelLoaded, detectTeeth } = await import('@/lib/detection/onnxInference');

      if (!isModelLoaded()) {
        setStatusMsg('ONNX 모델 로딩 중...');
        const loaded = await loadModel((msg) => setStatusMsg(msg));
        if (!loaded) throw new Error('모델 로딩 실패. public/onnx/ 폴더에 모델 파일이 있는지 확인하세요.');
        setLocalModelReady(true);
      }

      setStatusMsg('치아 감지 중...');
      const { result, detections: dets } = await detectTeeth(imgRef.current);

      applyResults(result);
      setDetections(dets);
      setAnalyzed(true);
      setStatusMsg('');
    } catch (err) {
      setAnalysisError(err instanceof Error ? err.message : '로컬 분석 중 오류');
    } finally {
      setAnalyzing(false);
    }
  }, [preview]);

  const applyResults = useCallback((result: Record<string | number, string>) => {
    resetAll();
    for (const [fdiStr, status] of Object.entries(result)) {
      const fdi = parseInt(String(fdiStr));
      if (fdi >= 11 && fdi <= 48 && isValidStatus(status)) {
        setToothStatus(fdi, status as ToothStatus);
      }
    }
  }, [resetAll, setToothStatus]);

  // Color for detection overlay boxes
  const getDetectionColor = (className: string): string => {
    if (className === 'Missing teeth') return 'rgba(255, 60, 60, 0.7)';
    if (className === 'Crown') return 'rgba(255, 200, 0, 0.7)';
    if (className === 'Implant') return 'rgba(100, 150, 255, 0.7)';
    if (className === 'Permanent Teeth') return 'rgba(100, 255, 100, 0.4)';
    return 'rgba(200, 200, 200, 0.4)';
  };

  return (
    <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
      <h3 className="text-sm font-semibold text-gray-700 mb-3">파노라마 X-ray</h3>

      {preview ? (
        <div>
          {/* Image with detection overlay */}
          <div className="relative">
            <img
              ref={imgRef}
              src={preview}
              alt="파노라마 X-ray"
              className="w-full rounded-lg border border-gray-200"
              crossOrigin="anonymous"
            />

            {/* Detection overlay boxes */}
            {showOverlay && detections.length > 0 && (
              <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 1 1" preserveAspectRatio="none">
                {detections.map((det, i) => (
                  <g key={i}>
                    <rect
                      x={det.bbox.x}
                      y={det.bbox.y}
                      width={det.bbox.w}
                      height={det.bbox.h}
                      fill="none"
                      stroke={getDetectionColor(det.className)}
                      strokeWidth="0.003"
                    />
                  </g>
                ))}
              </svg>
            )}

            {/* Control buttons */}
            <div className="absolute top-2 right-2 flex gap-1">
              {detections.length > 0 && (
                <button
                  onClick={() => setShowOverlay(!showOverlay)}
                  className={`text-xs px-2 py-1 rounded-md cursor-pointer ${
                    showOverlay ? 'bg-blue-500 text-white' : 'bg-white text-gray-600 border border-gray-300'
                  }`}
                >
                  감지 {showOverlay ? 'ON' : 'OFF'}
                </button>
              )}
              <button
                onClick={() => {
                  setPreview(null);
                  setAnalyzed(false);
                  setAnalysisError(null);
                  setDetections([]);
                }}
                className="bg-red-500 text-white text-xs px-2 py-1 rounded-md hover:bg-red-600 cursor-pointer"
              >
                삭제
              </button>
            </div>
          </div>

          {/* Detection summary */}
          {detections.length > 0 && (
            <div className="mt-2 text-[10px] text-gray-500">
              감지: {detections.length}개 |
              치아: {detections.filter(d => d.className === 'Permanent Teeth').length} |
              크라운: {detections.filter(d => d.className === 'Crown').length} |
              임플란트: {detections.filter(d => d.className === 'Implant').length} |
              상실: {detections.filter(d => d.className === 'Missing teeth').length}
            </div>
          )}

          {/* Analysis buttons */}
          <div className="mt-3 flex gap-2">
            <button
              onClick={analyzeLocal}
              disabled={analyzing}
              className={`
                flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all cursor-pointer
                ${analyzing
                  ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                  : 'bg-emerald-600 text-white hover:bg-emerald-700'
                }
              `}
            >
              {analyzing ? '분석 중...' : '로컬 AI 분석'}
            </button>
            <button
              onClick={analyzeCloud}
              disabled={analyzing}
              className={`
                flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all cursor-pointer
                ${analyzing
                  ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                  : 'bg-blue-600 text-white hover:bg-blue-700'
                }
              `}
            >
              {analyzing ? '분석 중...' : '클라우드 분석'}
            </button>
          </div>

          <div className="mt-1 flex justify-between text-[10px] text-gray-400">
            <span>ONNX 모델 (개인정보 보호)</span>
            <span>Claude API (정확도 높음)</span>
          </div>

          {analyzing && statusMsg && (
            <div className="mt-2 flex items-center justify-center gap-2 text-sm text-blue-600">
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              {statusMsg}
            </div>
          )}

          {analysisError && (
            <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-600">
              {analysisError}
            </div>
          )}

          {analyzed && !analysisError && (
            <p className="mt-2 text-xs text-green-600 text-center">
              분석 완료! 결과를 확인하고 수동으로 보정하세요.
            </p>
          )}
        </div>
      ) : (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          className={`
            border-2 border-dashed rounded-lg p-8 text-center transition-colors
            ${isDragging ? 'border-blue-400 bg-blue-50' : 'border-gray-300 hover:border-gray-400'}
          `}
        >
          <div className="text-gray-400 mb-2">
            <svg className="mx-auto w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          <p className="text-sm text-gray-500 mb-2">
            파노라마 사진을 드래그하거나 클릭하여 업로드
          </p>
          <label className="inline-block px-4 py-2 bg-blue-500 text-white text-sm rounded-lg hover:bg-blue-600 cursor-pointer">
            파일 선택
            <input
              type="file"
              accept="image/*"
              onChange={handleChange}
              className="hidden"
            />
          </label>
        </div>
      )}
    </div>
  );
}

function isValidStatus(s: string): s is ToothStatus {
  return ['present', 'missing', 'implant', 'crown', 'bridge'].includes(s);
}
