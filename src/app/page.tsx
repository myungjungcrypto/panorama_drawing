'use client';

import dynamic from 'next/dynamic';
import DentalChart2D from '@/components/DentalChart2D';
import ImageUploader from '@/components/ImageUploader';
import ToothInfoPanel from '@/components/ToothInfoPanel';

const DentalArch3D = dynamic(() => import('@/components/DentalArch3D'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full bg-gray-50 rounded-xl">
      <div className="text-gray-400 text-sm">3D 뷰 로딩 중...</div>
    </div>
  ),
});

export default function Home() {
  return (
    <div className="flex flex-col h-screen bg-gray-100">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-lg font-bold text-gray-800">치과 파노라마 3D 시각화</h1>
          <p className="text-xs text-gray-400">파노라마 X-ray 기반 치아 상태 시각화 상담 도구</p>
        </div>
        <div className="text-xs text-gray-400">
          Dental Panorama 3D Viewer
        </div>
      </header>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden p-4 gap-4">
        {/* Left panel: Upload + Chart */}
        <div className="w-[420px] shrink-0 flex flex-col gap-4 overflow-y-auto">
          <ImageUploader />
          <DentalChart2D />
        </div>

        {/* Center: 3D Viewport */}
        <div className="flex-1 min-w-0">
          <DentalArch3D />
        </div>

        {/* Right panel: Info */}
        <div className="w-[220px] shrink-0 flex flex-col gap-4">
          <ToothInfoPanel />

          {/* Legend */}
          <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">범례</h3>
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs">
                <div className="w-4 h-4 rounded bg-[#f5f0e8] border border-gray-300" />
                <span className="text-gray-600">존재하는 치아</span>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <div className="w-4 h-4 rounded border-2 border-dashed border-red-300 bg-red-50" />
                <span className="text-gray-600">상실된 치아</span>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <div className="w-4 h-4 rounded bg-blue-400" />
                <span className="text-gray-600">선택된 치아</span>
              </div>
            </div>
          </div>

          {/* Instructions */}
          <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
            <h3 className="text-sm font-semibold text-gray-700 mb-2">사용법</h3>
            <ul className="text-xs text-gray-500 space-y-1">
              <li>- 좌측 차트에서 치아 클릭 → 상실 토글</li>
              <li>- 3D 뷰에서 치아 더블클릭 → 상실 토글</li>
              <li>- 마우스 드래그 → 3D 회전</li>
              <li>- 스크롤 → 확대/축소</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
