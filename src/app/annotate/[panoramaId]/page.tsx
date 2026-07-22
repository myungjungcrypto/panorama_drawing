'use client';

import { useState, useEffect, useCallback, useRef, use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

interface Box {
  key: string; // 클라이언트 식별용
  type: 'tooth' | 'condition';
  label: string;
  x: number; y: number; w: number; h: number; // 정규화 0~1
  source: 'manual' | 'ai';
}

interface PanoInfo {
  id: string;
  caseId: string;
  caseTitle: string;
  phase: string;
  filename: string;
  width: number;
  height: number;
  annotStatus: string;
}

const FDI_ROWS = [
  [18, 17, 16, 15, 14, 13, 12, 11],
  [21, 22, 23, 24, 25, 26, 27, 28],
  [48, 47, 46, 45, 44, 43, 42, 41],
  [31, 32, 33, 34, 35, 36, 37, 38],
];

const CONDITION_LABELS = [
  'Crown', 'Implant', 'Missing teeth', 'Filling', 'Root Canal Treatment', 'abutment',
];

const CONDITION_KO: Record<string, string> = {
  'Crown': '크라운',
  'Implant': '임플란트',
  'Missing teeth': '상실',
  'Filling': '충전',
  'Root Canal Treatment': '신경치료',
  'abutment': '지대치',
};

function boxColor(box: Box): string {
  if (box.type === 'tooth') return '#22c55e';
  switch (box.label) {
    case 'Crown': return '#eab308';
    case 'Implant': return '#3b82f6';
    case 'Missing teeth': return '#ef4444';
    case 'Filling': return '#8b5cf6';
    case 'Root Canal Treatment': return '#ec4899';
    default: return '#94a3b8';
  }
}

let keySeq = 0;
const nextKey = () => `box-${++keySeq}-${Math.random().toString(36).slice(2, 7)}`;

export default function AnnotatePage({ params }: { params: Promise<{ panoramaId: string }> }) {
  const { panoramaId } = use(params);
  const router = useRouter();

  const [pano, setPano] = useState<PanoInfo | null>(null);
  const [boxes, setBoxes] = useState<Box[]>([]);
  const [mode, setMode] = useState<'tooth' | 'condition'>('tooth');
  const [currentLabel, setCurrentLabel] = useState<string>('11');
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [drawing, setDrawing] = useState<{ x: number; y: number; cx: number; cy: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const [aiRunning, setAiRunning] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const svgRef = useRef<SVGSVGElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  // 데이터 로드
  useEffect(() => {
    (async () => {
      const res = await fetch(`/api/panoramas/${panoramaId}/annotations`);
      const data = await res.json();
      if (!res.ok) { setError(data.error || '로딩 실패'); return; }
      setPano(data.panorama);
      setBoxes(data.annotations.map((a: Box & { id: string }) => ({
        key: nextKey(),
        type: a.type as 'tooth' | 'condition',
        label: a.label,
        x: a.x, y: a.y, w: a.w, h: a.h,
        source: (a.source === 'ai' ? 'ai' : 'manual') as 'manual' | 'ai',
      })));
    })();
  }, [panoramaId]);

  // 좌표 변환: 마우스 이벤트 → 정규화 좌표
  const toNorm = useCallback((e: React.MouseEvent): { x: number; y: number } | null => {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height)),
    };
  }, []);

  const handleMouseDown = (e: React.MouseEvent) => {
    const p = toNorm(e);
    if (!p) return;
    setDrawing({ x: p.x, y: p.y, cx: p.x, cy: p.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!drawing) return;
    const p = toNorm(e);
    if (!p) return;
    setDrawing({ ...drawing, cx: p.x, cy: p.y });
  };

  const handleMouseUp = () => {
    if (!drawing) return;
    const x = Math.min(drawing.x, drawing.cx);
    const y = Math.min(drawing.y, drawing.cy);
    const w = Math.abs(drawing.cx - drawing.x);
    const h = Math.abs(drawing.cy - drawing.y);
    setDrawing(null);

    // 드래그가 거의 없으면 클릭으로 간주 → 해당 지점의 박스 선택
    // (기존 박스 위에서도 드래그로 새 박스를 그릴 수 있도록, 박스는 이벤트를 가로채지 않음)
    if (w < 0.01 || h < 0.01) {
      const px = drawing.x;
      const py = drawing.y;
      // 클릭 지점을 포함하는 박스 중 가장 작은 것(가장 구체적인 것) 선택
      const hit = boxes
        .filter((b) => px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h)
        .sort((a, b) => a.w * a.h - b.w * b.h)[0];
      if (hit) {
        // 같은 박스를 다시 클릭하면 그 아래(다음으로 작은) 박스로 순환 선택
        if (hit.key === selectedKey) {
          const candidates = boxes
            .filter((b) => px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h)
            .sort((a, b) => a.w * a.h - b.w * b.h);
          const idx = candidates.findIndex((b) => b.key === selectedKey);
          const next = candidates[(idx + 1) % candidates.length];
          applySelection(next);
        } else {
          applySelection(hit);
        }
      } else {
        setSelectedKey(null);
      }
      return;
    }

    const newBox: Box = { key: nextKey(), type: mode, label: currentLabel, x, y, w, h, source: 'manual' };
    setBoxes((prev) => [...prev, newBox]);
    setSelectedKey(newBox.key);
    setDirty(true);
  };

  const applySelection = (box: Box) => {
    setSelectedKey(box.key);
    setMode(box.type);
    setCurrentLabel(box.label);
  };

  const deleteSelected = useCallback(() => {
    if (!selectedKey) return;
    setBoxes((prev) => prev.filter((b) => b.key !== selectedKey));
    setSelectedKey(null);
    setDirty(true);
  }, [selectedKey]);

  // Delete 키
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedKey) {
        const target = e.target as HTMLElement;
        if (target.tagName !== 'INPUT' && target.tagName !== 'TEXTAREA') {
          e.preventDefault();
          deleteSelected();
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selectedKey, deleteSelected]);

  // 라벨 선택: 선택된 박스가 있으면 라벨 변경, 없으면 다음 그리기 라벨로
  const pickLabel = (type: 'tooth' | 'condition', label: string) => {
    setMode(type);
    setCurrentLabel(label);
    if (selectedKey) {
      setBoxes((prev) => prev.map((b) => b.key === selectedKey ? { ...b, type, label } : b));
      setDirty(true);
    }
  };

  // AI 사전 어노테이션
  const runAI = async () => {
    if (!imgRef.current) return;
    if (boxes.length > 0 && !confirm('기존 어노테이션을 모두 지우고 AI 결과로 교체할까요?')) return;
    setAiRunning(true);
    setStatusMsg('AI 모델 로딩 중...');
    try {
      const { loadModel, isModelLoaded, detectTeeth } = await import('@/lib/detection/onnxInference');
      if (!isModelLoaded()) {
        const ok = await loadModel((msg) => setStatusMsg(msg));
        if (!ok) throw new Error('모델 로딩 실패. public/onnx/ 모델 파일을 확인하세요.');
      }
      setStatusMsg('감지 중...');
      const { detections } = await detectTeeth(imgRef.current);
      const aiBoxes: Box[] = detections
        .filter((d) => d.bbox.w > 0.005 && d.bbox.h > 0.005)
        .map((d) => {
          const isTooth = /^\d+$/.test(d.className);
          return {
            key: nextKey(),
            type: (isTooth ? 'tooth' : 'condition') as 'tooth' | 'condition',
            label: d.className,
            x: Math.max(0, d.bbox.x),
            y: Math.max(0, d.bbox.y),
            w: Math.min(1, d.bbox.w),
            h: Math.min(1, d.bbox.h),
            source: 'ai' as const,
          };
        });
      setBoxes(aiBoxes);
      setDirty(true);
      setStatusMsg('');
    } catch (err) {
      alert(err instanceof Error ? err.message : 'AI 감지 오류');
      setStatusMsg('');
    } finally {
      setAiRunning(false);
    }
  };

  const save = async (markDone: boolean) => {
    setSaving(true);
    try {
      const res = await fetch(`/api/panoramas/${panoramaId}/annotations`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          annotations: boxes.map(({ type, label, x, y, w, h, source }) => ({ type, label, x, y, w, h, source })),
          annotStatus: markDone ? 'done' : 'in_progress',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '저장 실패');
      setDirty(false);
      if (markDone && pano) router.push(`/cases/${pano.caseId}`);
    } catch (err) {
      alert(err instanceof Error ? err.message : '저장 오류');
    } finally {
      setSaving(false);
    }
  };

  if (error) return <div className="p-8 text-sm text-red-500">{error}</div>;
  if (!pano) return <div className="p-8 text-sm text-gray-400">로딩 중...</div>;

  const toothCount = boxes.filter((b) => b.type === 'tooth').length;
  const condCount = boxes.filter((b) => b.type === 'condition').length;

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-base font-bold text-gray-800">
            {pano.caseTitle} — {pano.phase === 'before' ? '치료 전' : '치료 후'} 어노테이션
          </h1>
          <p className="text-xs text-gray-400">
            드래그: 박스 그리기 (기존 박스 위에서도 가능) · 클릭: 선택 (겹친 박스는 재클릭으로 순환) · Delete: 삭제 · 치식 {toothCount} / 상태 {condCount}
            {dirty && <span className="text-orange-500 ml-2">● 저장 안 됨</span>}
          </p>
        </div>
        <nav className="flex gap-2 items-center">
          <Link href={`/cases/${pano.caseId}`} className="text-sm text-blue-600 hover:underline mr-2">
            ← 케이스
          </Link>
          <button
            onClick={runAI}
            disabled={aiRunning}
            className="px-3 py-1.5 bg-violet-600 text-white rounded-lg text-xs font-semibold hover:bg-violet-700 disabled:bg-gray-300 cursor-pointer"
          >
            {aiRunning ? statusMsg || 'AI 실행 중...' : 'AI 사전 어노테이션'}
          </button>
          <button
            onClick={() => save(false)}
            disabled={saving}
            className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-semibold hover:bg-blue-700 disabled:bg-gray-300 cursor-pointer"
          >
            저장
          </button>
          <button
            onClick={() => save(true)}
            disabled={saving}
            className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-semibold hover:bg-emerald-700 disabled:bg-gray-300 cursor-pointer"
          >
            완료 처리
          </button>
        </nav>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* 이미지 + 오버레이 */}
        <div className="flex-1 overflow-auto p-4 flex items-start justify-center">
          <div className="relative select-none" style={{ maxWidth: '100%' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              ref={imgRef}
              src={`/api/files/${pano.filename}`}
              alt="파노라마"
              className="max-w-full block"
              draggable={false}
              crossOrigin="anonymous"
            />
            <svg
              ref={svgRef}
              className="absolute inset-0 w-full h-full cursor-crosshair"
              viewBox="0 0 1 1"
              preserveAspectRatio="none"
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={() => setDrawing(null)}
            >
              {boxes.map((b) => {
                const isSel = b.key === selectedKey;
                const color = boxColor(b);
                return (
                  <g key={b.key} style={{ pointerEvents: 'none' }}>
                    <rect
                      x={b.x} y={b.y} width={b.w} height={b.h}
                      fill={isSel ? `${color}33` : 'transparent'}
                      stroke={color}
                      strokeWidth={isSel ? 0.004 : 0.002}
                      strokeDasharray={b.source === 'ai' ? '0.008 0.004' : undefined}
                    />
                    <text
                      x={b.x + 0.003} y={b.y - 0.006}
                      fontSize={0.018}
                      fill={color}
                      fontWeight="bold"
                      style={{ paintOrder: 'stroke', stroke: '#000000aa', strokeWidth: 0.003 }}
                    >
                      {b.type === 'tooth' ? b.label : (CONDITION_KO[b.label] ?? b.label)}
                    </text>
                  </g>
                );
              })}
              {drawing && (
                <rect
                  x={Math.min(drawing.x, drawing.cx)}
                  y={Math.min(drawing.y, drawing.cy)}
                  width={Math.abs(drawing.cx - drawing.x)}
                  height={Math.abs(drawing.cy - drawing.y)}
                  fill="#3b82f622"
                  stroke="#3b82f6"
                  strokeWidth={0.003}
                />
              )}
            </svg>
          </div>
        </div>

        {/* 라벨 팔레트 */}
        <aside className="w-[260px] shrink-0 bg-white border-l border-gray-200 p-4 overflow-y-auto">
          <div className="flex gap-1 mb-3">
            <button
              onClick={() => setMode('tooth')}
              className={`flex-1 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
                mode === 'tooth' ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-500'
              }`}
            >
              치식 (FDI)
            </button>
            <button
              onClick={() => setMode('condition')}
              className={`flex-1 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
                mode === 'condition' ? 'bg-yellow-500 text-white' : 'bg-gray-100 text-gray-500'
              }`}
            >
              상태
            </button>
          </div>

          {mode === 'tooth' ? (
            <div className="space-y-1.5">
              <p className="text-[10px] text-gray-400">치아 번호 선택 후 드래그로 박스를 그리세요.</p>
              {FDI_ROWS.map((row, i) => (
                <div key={i} className="grid grid-cols-8 gap-0.5">
                  {row.map((fdi) => (
                    <button
                      key={fdi}
                      onClick={() => pickLabel('tooth', String(fdi))}
                      className={`py-1 rounded text-[10px] font-bold cursor-pointer ${
                        mode === 'tooth' && currentLabel === String(fdi)
                          ? 'bg-green-600 text-white'
                          : 'bg-gray-50 text-gray-600 hover:bg-green-50 border border-gray-200'
                      }`}
                    >
                      {fdi}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-1">
              <p className="text-[10px] text-gray-400">상태 선택 후 드래그로 박스를 그리세요.</p>
              {CONDITION_LABELS.map((label) => (
                <button
                  key={label}
                  onClick={() => pickLabel('condition', label)}
                  className={`w-full py-1.5 px-2 rounded-lg text-xs text-left cursor-pointer flex justify-between ${
                    mode === 'condition' && currentLabel === label
                      ? 'bg-yellow-500 text-white'
                      : 'bg-gray-50 text-gray-600 hover:bg-yellow-50 border border-gray-200'
                  }`}
                >
                  <span>{CONDITION_KO[label]}</span>
                  <span className="opacity-50 text-[10px]">{label}</span>
                </button>
              ))}
            </div>
          )}

          {selectedKey && (
            <div className="mt-4 pt-3 border-t border-gray-100">
              <p className="text-[10px] text-gray-400 mb-2">선택된 박스</p>
              <button
                onClick={deleteSelected}
                className="w-full py-1.5 bg-red-50 text-red-600 border border-red-200 rounded-lg text-xs hover:bg-red-100 cursor-pointer"
              >
                삭제 (Delete)
              </button>
            </div>
          )}

          <div className="mt-4 pt-3 border-t border-gray-100 text-[10px] text-gray-400 space-y-1">
            <p>• 실선 박스: 수동 / 점선 박스: AI</p>
            <p>• AI 사전 어노테이션 후 잘못된 박스를 수정하면 빠릅니다.</p>
            <p>• &quot;완료 처리&quot; 시 케이스 화면으로 돌아갑니다.</p>
          </div>
        </aside>
      </div>
    </div>
  );
}
