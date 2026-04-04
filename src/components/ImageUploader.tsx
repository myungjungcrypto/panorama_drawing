'use client';

import { useState, useCallback, DragEvent, ChangeEvent } from 'react';
import { useTeethState } from '@/hooks/useTeethState';
import { ToothStatus } from '@/types/dental';

export default function ImageUploader() {
  const [preview, setPreview] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [analyzed, setAnalyzed] = useState(false);

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

  const handleAnalyze = useCallback(async () => {
    if (!preview) return;

    setAnalyzing(true);
    setAnalysisError(null);

    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageData: preview }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || '분석 실패');
      }

      // Apply results to teeth state
      resetAll();
      const result = data.result as Record<string, string>;
      for (const [fdiStr, status] of Object.entries(result)) {
        const fdi = parseInt(fdiStr);
        if (fdi >= 11 && fdi <= 48 && isValidStatus(status)) {
          setToothStatus(fdi, status as ToothStatus);
        }
      }

      setAnalyzed(true);
    } catch (err) {
      setAnalysisError(err instanceof Error ? err.message : '분석 중 오류 발생');
    } finally {
      setAnalyzing(false);
    }
  }, [preview, resetAll, setToothStatus]);

  return (
    <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
      <h3 className="text-sm font-semibold text-gray-700 mb-3">파노라마 X-ray</h3>

      {preview ? (
        <div>
          <div className="relative">
            <img
              src={preview}
              alt="파노라마 X-ray"
              className="w-full rounded-lg border border-gray-200"
            />
            <button
              onClick={() => {
                setPreview(null);
                setAnalyzed(false);
                setAnalysisError(null);
              }}
              className="absolute top-2 right-2 bg-red-500 text-white text-xs px-2 py-1 rounded-md hover:bg-red-600 cursor-pointer"
            >
              삭제
            </button>
          </div>

          {/* Analysis button */}
          <button
            onClick={handleAnalyze}
            disabled={analyzing}
            className={`
              mt-3 w-full py-2.5 rounded-lg text-sm font-semibold transition-all cursor-pointer
              ${analyzing
                ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                : analyzed
                  ? 'bg-green-500 text-white hover:bg-green-600'
                  : 'bg-blue-600 text-white hover:bg-blue-700'
              }
            `}
          >
            {analyzing ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                AI 분석 중... (10~20초)
              </span>
            ) : analyzed ? (
              '분석 완료 (다시 분석)'
            ) : (
              'AI 자동 분석'
            )}
          </button>

          {analysisError && (
            <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-600">
              {analysisError}
            </div>
          )}

          {analyzed && !analysisError && (
            <p className="mt-2 text-xs text-green-600 text-center">
              분석 결과가 3D 뷰에 적용되었습니다. 수동으로 보정할 수 있습니다.
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
