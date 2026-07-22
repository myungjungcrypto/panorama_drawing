# -*- coding: utf-8 -*-
"""
구매한 치아 3D 모델(OBJ/FBX/STL) → 웹용 teeth.glb 자동 변환 스크립트

사용법 (Blender 4.x 설치 후, 터미널에서):
  blender --background --python scripts/prepare_teeth_glb.py -- \
      --input /path/to/teeth.fbx --output public/models/teeth.glb

옵션:
  --input PATH     원본 모델 파일 (obj/fbx/stl)
  --output PATH    출력 GLB 경로 (기본: public/models/teeth.glb)
  --ratio 0.2      폴리곤 감소 비율 (기본 0.2 = 80% 감소)
  --flip-lr        좌우 FDI 배정이 거울처럼 뒤집혔을 때 사용
  --no-auto-name   자동 FDI 배정 건너뜀 (이미 이름이 11~48인 경우)

하는 일:
  1. 모델 import (개별 치아 28~32개 오브젝트 필요)
  2. 위치 기반 자동 FDI 이름 배정 (상/하악 분리 → 악궁 각도 순서로 번호 매김)
  3. 상악 치아를 치관이 위로 향하게 반전 (앱 규칙: 모든 치아 치관 +Y)
  4. 각 치아를 정면(-Y)을 향하도록 회전 정규화
  5. Decimate로 웹용 폴리곤 감소
  6. Draco 압축 GLB로 내보내기

실행 후 콘솔에 출력되는 FDI 배정 목록을 반드시 확인하세요.
좌우가 뒤집혔으면 --flip-lr 옵션으로 다시 실행.
"""

import bpy
import sys
import math
import argparse
from mathutils import Vector


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


def auto_assign_fdi(objs, flip_lr=False):
    """위치 기반 FDI 자동 배정.
    상/하악: 중심 Z(높이) 기준 분리. 악궁 순서: 중심에서 본 각도로 정렬.
    상악 14개: 17..11, 21..27 / 하악 14개: 47..41, 31..37 (사랑니 없는 경우)
    16개면 8번(사랑니)까지 배정.
    """
    cents = {o.name: world_centroid(o) for o in objs}
    z_values = sorted(c.z for c in cents.values())
    z_mid = z_values[len(z_values) // 2 - 1] / 2 + z_values[len(z_values) // 2] / 2

    upper = [o for o in objs if cents[o.name].z >= z_mid]
    lower = [o for o in objs if cents[o.name].z < z_mid]
    print(f"상악 추정: {len(upper)}개 / 하악 추정: {len(lower)}개")

    result = {}
    for arch_objs, quadrants in ((upper, (1, 2)), (lower, (4, 3))):
        n = len(arch_objs)
        per_side = n // 2
        center = sum((cents[o.name] for o in arch_objs), Vector((0, 0, 0))) / max(n, 1)
        # 악궁 각도로 정렬 (XY 평면, 환자 우측 → 좌측)
        def angle(o):
            d = cents[o.name] - center
            return math.atan2(d.y, d.x)
        arch_sorted = sorted(arch_objs, key=angle)
        if flip_lr:
            arch_sorted = list(reversed(arch_sorted))

        # 우측 분면 (뒤→앞) + 좌측 분면 (앞→뒤)
        q_right, q_left = quadrants
        fdis = [q_right * 10 + p for p in range(per_side, 0, -1)] + \
               [q_left * 10 + p for p in range(1, n - per_side + 1)]
        for o, fdi in zip(arch_sorted, fdis):
            result[o.name] = fdi

    return result, cents


def main():
    args = parse_args()
    clear_scene()
    import_model(args.input)

    objs = mesh_objects()
    print(f"\n메시 오브젝트 {len(objs)}개 발견")
    if len(objs) < 20:
        print("경고: 오브젝트 수가 적습니다. 통짜 모델이면 Blender에서 P → By Loose Parts로 분리 후 재시도.")

    # FDI 이름 배정
    if args.no_auto_name:
        assignment = {}
        for o in objs:
            name = o.name.strip()
            digits = "".join(ch for ch in name if ch.isdigit())
            if digits and 11 <= int(digits[:2]) <= 48:
                assignment[o.name] = int(digits[:2])
    else:
        assignment, _ = auto_assign_fdi(objs, flip_lr=args.flip_lr)

    print("\n=== FDI 배정 결과 (반드시 확인!) ===")
    for orig, fdi in sorted(assignment.items(), key=lambda x: x[1]):
        print(f"  {orig}  →  #{fdi}")
    print("좌우가 뒤집혀 보이면 --flip-lr 로 재실행하세요.\n")

    for o in objs:
        fdi = assignment.get(o.name)
        if fdi is None:
            print(f"제외 (배정 실패): {o.name}")
            bpy.data.objects.remove(o)
            continue
        o.name = str(fdi)

    objs = mesh_objects()

    # 개별 치아 정규화
    for o in objs:
        fdi = int(o.name)
        is_upper = fdi < 30

        bpy.context.view_layer.objects.active = o
        bpy.ops.object.select_all(action="DESELECT")
        o.select_set(True)

        # 원점을 지오메트리 중심으로, 위치는 원점으로
        bpy.ops.object.origin_set(type="ORIGIN_GEOMETRY", center="BOUNDS")
        o.location = (0, 0, 0)

        # 상악: 치관이 아래를 향하므로 X축 기준 180도 회전 (치관 +Z 위로)
        if is_upper:
            o.rotation_euler[0] += math.pi

        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

        # 폴리곤 감소
        if args.ratio < 1.0 and len(o.data.polygons) > 3000:
            mod = o.modifiers.new("decimate", "DECIMATE")
            mod.ratio = args.ratio
            bpy.ops.object.modifier_apply(modifier="decimate")
        print(f"#{o.name}: {len(o.data.polygons)} polys")

    # GLB 내보내기 (Draco 압축)
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
