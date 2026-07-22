# 실제 3D 치아 모델 (GLB) 준비 가이드

이 디렉토리에 `teeth.glb` 파일을 넣으면 3D 뷰어가 절차적 지오메트리 대신
실제 치아 모델을 사용합니다. 파일이 없으면 자동으로 기존 방식으로 동작합니다.

## 파일 요구사항

- **경로**: `public/models/teeth.glb` (정확히 이 이름)
- **개별 분리**: 치아 32개가 각각 별도의 메시(오브젝트)여야 함 — 통짜 모델 불가
- **메시 이름**: FDI 번호로 명명
  - 인식되는 형식: `11`, `T11`, `tooth_11`, `Tooth_11`, `FDI_11`
  - 예: 상악 우측 중절치 = `11`, 하악 좌측 제2대구치 = `37`
- **방향 (하악 기준)**: 치관이 +Y(위), 순측/협측이 +Z(앞)
  - 상악 치아도 같은 방향으로 두면 됨 — 코드가 상악을 자동으로 뒤집음
- **크기/위치**: 자동 정규화되므로 정확할 필요 없음 (각 치아의 중심과 높이를 코드가 맞춤)
- **용량**: Draco 압축 권장, 전체 5MB 이하 목표

## Blender 준비 절차 (구매 모델 → teeth.glb)

1. 구매한 모델(OBJ/FBX/STL) Import
2. 각 치아가 분리되어 있는지 확인 (Outliner에서 오브젝트 32개)
   - 분리 안 된 경우: Edit Mode → P(Separate) → By Loose Parts
3. 각 오브젝트 이름을 FDI 번호로 변경 (`11` ~ `48`)
   - 방향 주의: 화면을 환자 정면이라고 볼 때, 환자의 우측(화면 왼쪽)이 1/4분면
4. 방향 정렬: 모든 치아의 치관이 +Y, 앞면(순측)이 +Z를 향하게 회전 → Apply Rotation (Ctrl+A)
5. 폴리곤 감소 (선택): Decimate Modifier ~0.3-0.5 (치아당 5천~1만 폴리곤이면 충분)
6. Export → glTF 2.0 (.glb)
   - Include: Selected Objects 또는 전체
   - Compression: Draco 체크
   - 파일명: `teeth.glb`

## 서버 반영

git에는 올라가지 않으므로 (라이선스 보호) ONNX 모델처럼 직접 전송:

```bash
scp -i ~/downloads/jung_test.pem teeth.glb ec2-user@43.201.222.151:~/panorama_drawing/public/models/
# 이후 EC2에서 재빌드
cd ~/panorama_drawing && npm run build && pm2 restart panorama-drawing
```
