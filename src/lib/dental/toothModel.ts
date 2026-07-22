'use client';

// 실제 3D 치아 모델(GLB) 로딩 유틸
//
// public/models/teeth.glb 파일이 존재하면 실제 모델을 사용하고,
// 없으면 절차적(수식) 지오메트리로 폴백합니다.
//
// GLB 준비 규칙 (public/models/README.md 참고):
// - 파일 경로: public/models/teeth.glb
// - 치아 32개가 개별 메시로 분리되어 있어야 함
// - 메시 이름: FDI 번호 ("11" ~ "48", 또는 "T11" / "tooth_11" 형식도 인식)
// - 방향: 치관(+Y 위), 순측/협측(+Z 앞) — 하악 기준 (상악은 코드에서 자동 반전)

import { useState, useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { useGLTF } from '@react-three/drei';
import { TOOTH_MAP } from './toothData';
import { TOOTH_DIMENSIONS } from './toothGeometry';

export const TEETH_MODEL_URL = '/models/teeth.glb';

// 모듈 레벨 캐시 (앱 세션당 1회만 확인)
let modelAvailable: boolean | null = null;
let checking: Promise<boolean> | null = null;

async function checkModelAvailable(): Promise<boolean> {
  if (modelAvailable !== null) return modelAvailable;
  if (!checking) {
    checking = fetch(TEETH_MODEL_URL, { method: 'HEAD' })
      .then((r) => {
        // Next.js는 없는 정적 파일에 HTML 404를 반환하므로 content-type도 확인
        const ct = r.headers.get('content-type') || '';
        modelAvailable = r.ok && !ct.includes('text/html');
        return modelAvailable;
      })
      .catch(() => {
        modelAvailable = false;
        return false;
      });
  }
  return checking;
}

// GLB 모델 존재 여부 훅
export function useRealToothModel(): boolean {
  const [available, setAvailable] = useState(modelAvailable === true);
  useEffect(() => {
    checkModelAvailable().then(setAvailable);
  }, []);
  return available;
}

const NAME_PATTERNS = (fdi: number) => [String(fdi), `T${fdi}`, `tooth_${fdi}`, `Tooth_${fdi}`, `FDI_${fdi}`];

// 지오메트리 캐시 (fdi → 정규화된 지오메트리)
const geoCache = new Map<number, THREE.BufferGeometry | null>();

/**
 * GLB에서 해당 FDI 치아 지오메트리를 추출해 크기/중심 정규화.
 * 메시를 못 찾으면 null 반환 (호출부에서 절차적 지오메트리로 폴백).
 * 반드시 모델 파일이 존재할 때만 호출할 것 (useGLTF는 404 시 throw).
 */
export function useRealToothGeometry(fdi: number): THREE.BufferGeometry | null {
  const { scene } = useGLTF(TEETH_MODEL_URL);

  return useMemo(() => {
    if (geoCache.has(fdi)) return geoCache.get(fdi)!;

    let mesh: THREE.Mesh | null = null;
    for (const name of NAME_PATTERNS(fdi)) {
      const obj = scene.getObjectByName(name);
      if (obj) {
        obj.traverse((child) => {
          if (!mesh && (child as THREE.Mesh).isMesh) mesh = child as THREE.Mesh;
        });
        if (mesh) break;
      }
    }

    if (!mesh) {
      console.warn(`[3D모델] GLB에서 치아 #${fdi} 메시를 찾지 못함 — 절차적 지오메트리 사용`);
      geoCache.set(fdi, null);
      return null;
    }

    // 지오메트리 복제 후 정규화: 중심을 원점으로, 높이를 목표 치수에 맞춤
    const geo = (mesh as THREE.Mesh).geometry.clone();
    geo.computeBoundingBox();
    const bb = geo.boundingBox!;
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    bb.getSize(size);
    bb.getCenter(center);
    geo.translate(-center.x, -center.y, -center.z);

    const info = TOOTH_MAP[fdi];
    // 치관 전용 모델 기준 배율 (치근 포함 모델이면 1.5~1.8로 조정)
    const targetH = info ? TOOTH_DIMENSIONS[info.type].h * 1.0 : 0.4;
    const scale = size.y > 0 ? targetH / size.y : 1;
    geo.scale(scale, scale, scale);
    geo.computeVertexNormals();

    geoCache.set(fdi, geo);
    return geo;
  }, [scene, fdi]);
}
