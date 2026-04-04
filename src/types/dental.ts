export type ToothType = 'incisor' | 'canine' | 'premolar' | 'molar';

export type ToothStatus = 'present' | 'missing' | 'implant' | 'crown' | 'bridge';

export type Quadrant = 1 | 2 | 3 | 4;

export interface ToothInfo {
  fdi: number;
  name: string;
  nameKo: string;
  type: ToothType;
  quadrant: Quadrant;
  position: number; // 1-8 within quadrant
}

export interface ToothState {
  fdi: number;
  status: ToothStatus;
}

export interface Tooth3DPosition {
  x: number;
  y: number;
  z: number;
  rotationY: number;
}
