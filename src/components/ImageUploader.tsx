'use client';

import { useState, useCallback, DragEvent, ChangeEvent } from 'react';

interface ImageUploaderProps {
  onImageLoad?: (dataUrl: string) => void;
}

export default function ImageUploader({ onImageLoad }: ImageUploaderProps) {
  const [preview, setPreview] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleFile = useCallback(
    (file: File) => {
      if (!file.type.startsWith('image/')) return;
      const reader = new FileReader();
      reader.onload = (e) => {
        const dataUrl = e.target?.result as string;
        setPreview(dataUrl);
        onImageLoad?.(dataUrl);
      };
      reader.readAsDataURL(file);
    },
    [onImageLoad]
  );

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

  return (
    <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
      <h3 className="text-sm font-semibold text-gray-700 mb-3">파노라마 X-ray 업로드</h3>

      {preview ? (
        <div className="relative">
          <img
            src={preview}
            alt="파노라마 X-ray"
            className="w-full rounded-lg border border-gray-200"
          />
          <button
            onClick={() => {
              setPreview(null);
              onImageLoad?.('');
            }}
            className="absolute top-2 right-2 bg-red-500 text-white text-xs px-2 py-1 rounded-md hover:bg-red-600 cursor-pointer"
          >
            삭제
          </button>
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
