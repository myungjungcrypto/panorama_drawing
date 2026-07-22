# -*- coding: utf-8 -*-
"""
구매한 치아 3D 모델(OBJ/FBX/STL) → 웹용 teeth.glb 자동 변환 스크립트

사용법 (Blender 4.x+ 설치 후, 터미널에서):
  blender --background --python scripts/prepare_teeth_glb.py -- \
      --input /path/to/teeth.fbx --output public/models/teeth.glb

옵션:
  --input PATH     원본 모델 파일 (obj/fbx/stl)
  --output PATH    출력 GLB 경로 (기본: public/models/teeth.glb)
  --ratio 0.2      폴리곤 감소 비율 (3000폴리곤 초과 치아만 적용)
  --flip-lr        좌우 FDI 배정이 거울처럼 뒤집혔을 때 사용
  --no-auto-name   자동 FDI 배정 건너뜀 (이미 이름이 11~48인 경우)

하는 일:
  1. 모델 import (개별 치아 28~32개 오브젝트 필요)
  2. 위치 기반 자동 FDI 배정 — 악궁 각도를 '갭 기준 언랩'으로 정렬해
     ±180° 경계 문제 없이 원심→근심→원심 순서를 보장
  3. 각 치아를 원점 이동 + 정면(-Y)을 향하도록 회전 정규화
  4. 상악 치아는 치관이 위(+Z)로 향하게 반전 (앱이 렌더 시 다시 뒤집음)
  5. Decimate로 웹용 폴리곤 감소 (필요시)
  6. Draco 압축 GLB로 내보내기 (glTF +Y up → 치관 +Y, 순측 +Z)

실행 후 콘솔에 출력되는 FDI 배정 목록을 반드시 확인하세요.
좌우가 뒤집혔으면 --flip-lr 옵션으로 다시 실행.
"""

import bpy
import sys
import math
import argparse
from mathutils import Vector, Matrix


def parse_args():
    argv = sys.argv
    argv = argv[argv.index("--") + 1:] if "--" in argv else []
    p = argparse.ArgumentParser()
    p.add_argument("--input", required=True)
    p.add_argument("--output", default="public/models/teeth.glb")
    p.add_argument("--ratio", type=float, default=0.2)
    p.add_argument("--flip-lr", action="store_true")
    p.add_argument("--no-auto-name", action="store_true")
    return p.parse_args(argv)


def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()


def import_model(path):
    ext = path.lower().rsplit(".", 1)[-1]
    if ext == "obj":
        bpy.ops.wm.obj_import(filepath=path)
    elif ext == "fbx":
        bpy.ops.import_scene.fbx(filepath=path)
    elif ext == "stl":
        bpy.ops.wm.stl_import(filepath=path)
    else:
        raise ValueError(f"지원하지 않는 형식: {ext}")


def mesh_objects():
    return [o for o in bpy.context.scene.objects if o.type == "MESH"]


def world_centroid(obj):
    total = Vector((0, 0, 0))
    verts = obj.data.vertices
    if not verts:
        return obj.matrix_world.translation.copy()
    for v in verts:
        total += obj.matrix_world @ v.co
    return total / len(verts)


def unwrap_arch_order(items):
    """items: [(obj, angle)] — 각도 정렬 후 가장 큰 갭(악궁 뒤쪽 열린 부분)을
    찾아 그 다음부터 시작하도록 재배열. ±180° 경계 문제 해결."""
    s = sorted(items, key=lambda x: x[1])
    n = len(s)
    # 인접 각도 갭 (마지막→처음은 +2π)
    gaps = []
    for i in range(n):
        a1 = s[i][1]
        a2 = s[(i + 1) % n][1] + (2 * math.pi if i == n - 1 else 0)
        gaps.append(a2 - a1)
    start = (gaps.index(max(gaps)) + 1) % n
    return [s[(start + i) % n] for i in range(n)]


def main():
    args = parse_args()
    clear_scene()
    import_model(args.input)

    objs = mesh_objects()
    print(f"\n메시 오브젝트 {len(objs)}개 발견")
    if len(objs) < 20:
        print("경고: 오브젝트 수가 적습니다. 통짜 모델이면 Blender에서 P → By Loose Parts로 분리 후 재시도.")

    cents = {o.name: world_centroid(o) for o in objs}

    # ===== FDI 배정 + 치아별 악궁 각도 계산 =====
    assignment = {}   # obj.name → fdi
    tooth_angle = {}  # obj.name → 악궁 중심 기준 바깥 방향 각도 (XY 평면)

    if args.no_auto_name:
        for o in objs:
            digits = "".join(ch for ch in o.name if ch.isdigit())
            if digits and 11 <= int(digits[:2]) <= 48:
                assignment[o.name] = int(digits[:2])
                tooth_angle[o.name] = None  # 방향 보정 생략
    else:
        z_values = sorted(c.z for c in cents.values())
        z_mid = (z_values[len(z_values) // 2 - 1] + z_values[len(z_values) // 2]) / 2
        upper = [o for o in objs if cents[o.name].z >= z_mid]
        lower = [o for o in objs if cents[o.name].z < z_mid]
        print(f"상악 추정: {len(upper)}개 / 하악 추정: {len(lower)}개")

        for arch_objs, quadrants in ((upper, (1, 2)), (lower, (4, 3))):
            n = len(arch_objs)
            if n == 0:
                continue
            per_side = n // 2
            center = sum((cents[o.name] for o in arch_objs), Vector((0, 0, 0))) / n

            items = []
            for o in arch_objs:
                d = cents[o.name] - center
                items.append((o, math.atan2(d.y, d.x)))

            ordered = unwrap_arch_order(items)
            if args.flip_lr:
                ordered = list(reversed(ordered))

            # 순서: 우측 원심→근심 [q_right*10+7..1], 좌측 근심→원심 [q_left*10+1..7]
            q_right, q_left = quadrants
            fdis = [q_right * 10 + p for p in range(per_side, 0, -1)] + \
                   [q_left * 10 + p for p in range(1, n - per_side + 1)]
            for (o, ang), fdi in zip(ordered, fdis):
                assignment[o.name] = fdi
                tooth_angle[o.name] = ang

    print("\n=== FDI 배정 결과 (반드시 확인!) ===")
    for orig, fdi in sorted(assignment.items(), key=lambda x: x[1]):
        print(f"  {orig}  →  #{fdi}")
    print("좌우가 뒤집혀 보이면 --flip-lr 로 재실행하세요.\n")

    # 배정 실패 오브젝트 제거 + 이름 변경
    for o in list(objs):
        fdi = assignment.get(o.name)
        if fdi is None:
            print(f"제외 (배정 실패): {o.name}")
            bpy.data.objects.remove(o)
            continue
    # 이름 변경은 별도 루프 (이름 충돌 방지 위해 임시 이름 거침)
    for o in mesh_objects():
        o.name = f"tmp_{assignment[o.name]}"
    for o in mesh_objects():
        o.name = o.name.replace("tmp_", "")

    # ===== 치아별 정규화 =====
    for o in mesh_objects():
        fdi = int(o.name)
        is_upper = fdi < 30
        # tooth_angle 키는 원본 이름 기준이므로 fdi로 역참조
        ang = None
        for orig, f in assignment.items():
            if f == fdi:
                ang = tooth_angle.get(orig)
                break

        bpy.context.view_layer.objects.active = o
        bpy.ops.object.select_all(action="DESELECT")
        o.select_set(True)

        # 1) 원점을 지오메트리 중심으로, 위치를 원점으로
        bpy.ops.object.origin_set(type="ORIGIN_GEOMETRY", center="BOUNDS")
        o.location = (0, 0, 0)
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

        # 2) 상악: X축 180도 반전 (치관 +Z 위로) — 바깥 방향 각도는 -ang이 됨
        # 3) 바깥(순측/협측) 방향이 -Y(정면)를 향하도록 Z축 회전
        rot = Matrix.Identity(4)
        if is_upper:
            rot = Matrix.Rotation(math.pi, 4, "X") @ rot
        if ang is not None:
            eff_ang = -ang if is_upper else ang
            phi = (-math.pi / 2) - eff_ang
            rot = Matrix.Rotation(phi, 4, "Z") @ rot
        o.matrix_world = rot @ o.matrix_world
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

        # 4) 폴리곤 감소 (필요시)
        if args.ratio < 1.0 and len(o.data.polygons) > 3000:
            mod = o.modifiers.new("decimate", "DECIMATE")
            mod.ratio = args.ratio
            bpy.ops.object.modifier_apply(modifier="decimate")
        print(f"#{o.name}: {len(o.data.polygons)} polys")

    # ===== GLB 내보내기 (Draco 압축, +Y up) =====
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.export_scene.gltf(
        filepath=args.output,
        export_format="GLB",
        use_selection=True,
        export_draco_mesh_compression_enable=True,
        export_yup=True,
    )
    print(f"\n완료: {args.output}")
    print("브라우저에서 확인 후 상악/하악 방향이나 좌우가 이상하면 옵션 조정 후 재실행하세요.")


main()
