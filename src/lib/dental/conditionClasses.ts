// 치아 상태 클래스 단일 소스
// 순서는 YOLO 클래스 인덱스와 일치 — scripts/prepare_condition_dataset.py의 CLASSES와 동일해야 함

export const CONDITION_CLASSES: readonly string[] = [
  'Crown',
  'Implant',
  'Missing teeth',
  'Filling',
  'Root Canal Treatment',
  'abutment',
  'Caries',
  'Deep Caries',
  'Periapical Lesion',
  'Impacted Tooth',
  'Bridge',
];

export const CONDITION_KO: Record<string, string> = {
  'Crown': '크라운',
  'Implant': '임플란트',
  'Missing teeth': '상실',
  'Filling': '충전',
  'Root Canal Treatment': '신경치료',
  'abutment': '지대치',
  'Caries': '우식',
  'Deep Caries': '심부우식',
  'Periapical Lesion': '치근단병소',
  'Impacted Tooth': '매복치',
  'Bridge': '브릿지',
};

// 어노테이션 도구 박스 색상
export const CONDITION_COLORS: Record<string, string> = {
  'Crown': '#eab308',
  'Implant': '#3b82f6',
  'Missing teeth': '#ef4444',
  'Filling': '#8b5cf6',
  'Root Canal Treatment': '#ec4899',
  'abutment': '#94a3b8',
  'Caries': '#fb923c',
  'Deep Caries': '#b91c1c',
  'Periapical Lesion': '#d946ef',
  'Impacted Tooth': '#64748b',
  'Bridge': '#10b981',
};
