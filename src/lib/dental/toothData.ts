import { ToothInfo, ToothType, Quadrant } from '@/types/dental';

function getToothType(position: number): ToothType {
  if (position <= 2) return 'incisor';
  if (position === 3) return 'canine';
  if (position <= 5) return 'premolar';
  return 'molar';
}

const toothNamesKo: Record<string, string> = {
  'incisor_1': '중절치',
  'incisor_2': '측절치',
  'canine_3': '견치',
  'premolar_4': '제1소구치',
  'premolar_5': '제2소구치',
  'molar_6': '제1대구치',
  'molar_7': '제2대구치',
  'molar_8': '제3대구치(사랑니)',
};

const toothNamesEn: Record<string, string> = {
  'incisor_1': 'Central Incisor',
  'incisor_2': 'Lateral Incisor',
  'canine_3': 'Canine',
  'premolar_4': 'First Premolar',
  'premolar_5': 'Second Premolar',
  'molar_6': 'First Molar',
  'molar_7': 'Second Molar',
  'molar_8': 'Third Molar (Wisdom)',
};

const quadrantNamesKo: Record<Quadrant, string> = {
  1: '우측 상악',
  2: '좌측 상악',
  3: '좌측 하악',
  4: '우측 하악',
};

function buildToothInfo(quadrant: Quadrant, position: number): ToothInfo {
  const fdi = quadrant * 10 + position;
  const type = getToothType(position);
  const key = `${type}_${position}`;

  return {
    fdi,
    name: `${quadrantNamesKo[quadrant]} ${toothNamesEn[key]}`,
    nameKo: `${quadrantNamesKo[quadrant]} ${toothNamesKo[key]}`,
    type,
    quadrant,
    position,
  };
}

export const ALL_TEETH: ToothInfo[] = [];

for (const q of [1, 2, 3, 4] as Quadrant[]) {
  for (let p = 1; p <= 8; p++) {
    ALL_TEETH.push(buildToothInfo(q, p));
  }
}

export const TOOTH_MAP: Record<number, ToothInfo> = {};
for (const tooth of ALL_TEETH) {
  TOOTH_MAP[tooth.fdi] = tooth;
}

// Upper teeth: quadrants 1 (right) and 2 (left)
export const UPPER_RIGHT = ALL_TEETH.filter(t => t.quadrant === 1); // 18-11
export const UPPER_LEFT = ALL_TEETH.filter(t => t.quadrant === 2);  // 21-28
export const LOWER_LEFT = ALL_TEETH.filter(t => t.quadrant === 3);  // 38-31
export const LOWER_RIGHT = ALL_TEETH.filter(t => t.quadrant === 4); // 41-48
