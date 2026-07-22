# -*- coding: utf-8 -*-
"""
치아 상태 감지 모델용 데이터셋 병합 스크립트
=============================================

여러 소스(OralXrays-9, DENTEX, Roboflow, 자체 어노테이션 내보내기)를
하나의 YOLO 학습 데이터셋으로 병합합니다. COCO JSON / YOLO 형식 자동 감지.

사용법:
    python3 scripts/prepare_condition_dataset.py \
        --input /path/to/OralXrays-9 /path/to/dentex_raw /path/to/roboflow_dataset \
        --output condition_merged

    # 병합 후 학습 (기존 스크립트 재사용):
    python3 scripts/train_dental_yolo.py --step train --dataset-dir condition_merged
    python3 scripts/train_dental_yolo.py --step export --model-path training/runs/dental_detector/weights/best.pt

클래스 이름이 매핑에 없으면 경고로 출력됩니다.
그 이름을 ALIASES에 추가한 뒤 다시 실행하세요.
"""

import argparse
import json
import random
import shutil
import sys
from pathlib import Path
from collections import Counter

# ===== 통합 클래스 (YOLO 인덱스 순서 — 앱 src/lib/dental/conditionClasses.ts와 일치해야 함) =====
CLASSES = [
    "Crown",
    "Implant",
    "Missing teeth",
    "Filling",
    "Root Canal Treatment",
    "abutment",
    "Caries",
    "Deep Caries",
    "Periapical Lesion",
    "Impacted Tooth",
    "Bridge",
]
CLASS_TO_IDX = {c: i for i, c in enumerate(CLASSES)}

# 소스별 클래스 이름 → 통합 클래스 매핑 (소문자 비교, None = 제외)
ALIASES = {
    # 통합 클래스 자기 자신
    **{c.lower(): c for c in CLASSES},
    # OralXrays-9
    "apical periodontitis": "Periapical Lesion",
    "dental caries": "Caries",
    "wisdom tooth": None,  # 치식 모델이 8번 치아로 커버 — 상태 모델에서는 제외
    "missing tooth": "Missing teeth",
    "dental filling": "Filling",
    "root canal filling": "Root Canal Treatment",
    "dental implant": "Implant",
    "porcelain crown": "Crown",
    "ceramic bridge": "Bridge",
    # DENTEX (진단 라벨)
    "decay": "Caries",
    "caries": "Caries",
    "deep caries": "Deep Caries",
    "periapical lesion": "Periapical Lesion",
    "impacted": "Impacted Tooth",
    "impacted tooth": "Impacted Tooth",
    # Roboflow 계열 흔한 표기
    "crown": "Crown",
    "crowns": "Crown",
    "implant": "Implant",
    "implants": "Implant",
    "missing teeth": "Missing teeth",
    "missing-teeth": "Missing teeth",
    "filling": "Filling",
    "fillings": "Filling",
    "root canal treatment": "Root Canal Treatment",
    "root-canal-treatment": "Root Canal Treatment",
    "rct": "Root Canal Treatment",
    "bridge": "Bridge",
    "abutment": "abutment",
    "post - core": None,
    "post-core": None,
    "retained root": None,
    "root piece": None,
    "bone loss": None,
    "bone defect": None,
    "attrition": None,
    "cyst": None,
    "wire": None,
}

IMG_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}

unmapped = Counter()


def map_class(name: str):
    """소스 클래스명 → 통합 클래스 인덱스 (None = 제외)"""
    key = name.strip().lower()
    if key in ALIASES:
        target = ALIASES[key]
        return CLASS_TO_IDX[target] if target else None
    unmapped[name] += 1
    return None


def find_images_index(root: Path):
    """디렉토리 내 모든 이미지 파일을 파일명 기준으로 인덱싱"""
    index = {}
    for p in root.rglob("*"):
        if p.suffix.lower() in IMG_EXTS:
            index.setdefault(p.name, p)
    return index


# ===== COCO 형식 처리 =====

def find_coco_jsons(root: Path):
    """COCO 구조(images/annotations/categories)를 가진 JSON 탐색.
    'annotations' 키는 파일 뒤쪽에 나올 수 있으므로 실제 로드로 검증."""
    jsons = []
    for p in root.rglob("*.json"):
        if p.stat().st_size > 500 * 1024 * 1024:
            continue
        try:
            with open(p) as f:
                head = f.read(4000)
            # COCO 후보: images 키가 앞부분에 존재
            if '"images"' not in head:
                continue
            with open(p) as f:
                data = json.load(f)
            if (
                isinstance(data, dict)
                and "images" in data
                and "annotations" in data
                and ("categories" in data or "categories_3" in data)
            ):
                # DENTEX: 진단 라벨(categories_3)이 있는 JSON을 우선, 분면/치식 전용 JSON은 뒤로
                jsons.append(p)
        except (OSError, UnicodeDecodeError, json.JSONDecodeError):
            continue
    return jsons


def convert_coco(json_path: Path, img_index, out_images: Path, out_labels: Path, tag: str):
    """COCO JSON → YOLO 변환. 변환된 이미지 수 반환.
    DENTEX 계층 형식(categories_3 = 진단 라벨)도 지원."""
    with open(json_path) as f:
        coco = json.load(f)

    # DENTEX: 진단 라벨은 categories_3 / category_id_3에 있음
    cats_key, ann_cat_field = "categories", "category_id"
    if "categories_3" in coco:
        cats_key, ann_cat_field = "categories_3", "category_id_3"
        print(f"  (DENTEX 계층 형식 감지 — 진단 라벨 사용)")

    cat_map = {}
    for cat in coco.get(cats_key, []):
        cat_map[cat["id"]] = map_class(str(cat.get("name", "")))

    images = {img["id"]: img for img in coco.get("images", [])}
    labels_per_image = {}

    for ann in coco.get("annotations", []):
        cls_idx = cat_map.get(ann.get(ann_cat_field))
        if cls_idx is None:
            continue
        img = images.get(ann.get("image_id"))
        if not img:
            continue
        w, h = img.get("width"), img.get("height")
        if not w or not h:
            continue
        bbox = ann.get("bbox")
        if not bbox or len(bbox) != 4:
            continue
        x, y, bw, bh = bbox
        # 좌표 클램핑 (일부 데이터셋에 범위 초과 좌표 존재)
        x1 = max(0.0, min(1.0, x / w))
        y1 = max(0.0, min(1.0, y / h))
        x2 = max(0.0, min(1.0, (x + bw) / w))
        y2 = max(0.0, min(1.0, (y + bh) / h))
        nw, nh = x2 - x1, y2 - y1
        if nw <= 0.001 or nh <= 0.001:
            continue
        cx, cy = x1 + nw / 2, y1 + nh / 2
        line = f"{cls_idx} {cx:.6f} {cy:.6f} {nw:.6f} {nh:.6f}"
        labels_per_image.setdefault(img["id"], []).append(line)

    count = 0
    for img_id, lines in labels_per_image.items():
        img = images[img_id]
        fname = Path(img["file_name"]).name
        src = img_index.get(fname)
        if not src:
            continue
        new_name = f"{tag}_{fname}"
        shutil.copy2(src, out_images / new_name)
        (out_labels / f"{Path(new_name).stem}.txt").write_text("\n".join(lines))
        count += 1
    return count


# ===== YOLO 형식 처리 =====

def load_yolo_names(root: Path):
    """data.yaml 또는 classes.txt에서 클래스 이름 로드"""
    for yaml_path in list(root.rglob("data.yaml")) + list(root.rglob("data.yml")):
        try:
            import yaml
            with open(yaml_path) as f:
                data = yaml.safe_load(f)
            names = data.get("names")
            if isinstance(names, dict):
                return {int(k): str(v) for k, v in names.items()}, yaml_path.parent
            if isinstance(names, list):
                return {i: str(n) for i, n in enumerate(names)}, yaml_path.parent
        except Exception:
            continue
    for cls_path in root.rglob("classes.txt"):
        lines = cls_path.read_text().strip().split("\n")
        return {i: n.strip() for i, n in enumerate(lines)}, cls_path.parent
    return None, None


def convert_yolo(root: Path, img_index, out_images: Path, out_labels: Path, tag: str):
    """YOLO 데이터셋 → 통합 클래스로 리매핑하여 복사"""
    names, base = load_yolo_names(root)
    if names is None:
        return 0

    idx_map = {i: map_class(n) for i, n in names.items()}

    count = 0
    for label_file in root.rglob("*.txt"):
        if label_file.name in ("classes.txt", "README.txt", "requirements.txt"):
            continue
        if "labels" not in str(label_file.parent).lower():
            continue

        new_lines = []
        for line in label_file.read_text().strip().split("\n"):
            parts = line.split()
            if len(parts) < 5:
                continue
            try:
                old_idx = int(parts[0])
            except ValueError:
                continue
            new_idx = idx_map.get(old_idx)
            if new_idx is None:
                continue
            new_lines.append(" ".join([str(new_idx)] + parts[1:5]))

        if not new_lines:
            continue

        # 같은 이름의 이미지 찾기
        img_src = None
        for ext in IMG_EXTS:
            cand = img_index.get(label_file.stem + ext)
            if cand:
                img_src = cand
                break
        if not img_src:
            continue

        new_name = f"{tag}_{img_src.name}"
        shutil.copy2(img_src, out_images / new_name)
        (out_labels / f"{Path(new_name).stem}.txt").write_text("\n".join(new_lines))
        count += 1
    return count


# ===== 메인 =====

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", nargs="+", required=True, help="소스 데이터셋 디렉토리들")
    parser.add_argument("--output", default="condition_merged", help="출력 디렉토리")
    parser.add_argument("--val-ratio", type=float, default=0.1)
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()

    out_root = Path(args.output)
    if out_root.exists():
        print(f"기존 {out_root} 삭제 후 재생성")
        shutil.rmtree(out_root)

    staging_images = out_root / "_staging" / "images"
    staging_labels = out_root / "_staging" / "labels"
    staging_images.mkdir(parents=True)
    staging_labels.mkdir(parents=True)

    total = 0
    for input_dir in args.input:
        root = Path(input_dir)
        if not root.exists():
            print(f"경고: {root} 없음 — 건너뜀")
            continue
        tag = root.name.replace(" ", "_")[:24]
        print(f"\n=== 소스 처리: {root} (태그: {tag}) ===")
        img_index = find_images_index(root)
        print(f"이미지 파일 {len(img_index)}개 인덱싱")

        # COCO 우선, 없으면 YOLO
        coco_jsons = find_coco_jsons(root)
        converted = 0
        if coco_jsons:
            print(f"COCO JSON {len(coco_jsons)}개 발견")
            for jp in coco_jsons:
                n = convert_coco(jp, img_index, staging_images, staging_labels, tag)
                print(f"  {jp.name}: {n}장 변환")
                converted += n
        if converted == 0:
            converted = convert_yolo(root, img_index, staging_images, staging_labels, tag)
            print(f"YOLO 형식으로 {converted}장 변환")

        total += converted

    if total == 0:
        print("\nERROR: 변환된 이미지가 없습니다.")
        sys.exit(1)

    # train/val 분할
    all_labels = sorted(staging_labels.glob("*.txt"))
    random.Random(args.seed).shuffle(all_labels)
    val_count = max(1, int(len(all_labels) * args.val_ratio))

    stats = Counter()
    for split, labels in (("valid", all_labels[:val_count]), ("train", all_labels[val_count:])):
        img_dir = out_root / split / "images"
        lbl_dir = out_root / split / "labels"
        img_dir.mkdir(parents=True)
        lbl_dir.mkdir(parents=True)
        for lbl in labels:
            # 이미지 먼저 확인 — 없으면 라벨도 버림 (고아 라벨 방지)
            img_src = None
            for ext in IMG_EXTS:
                cand = staging_images / (lbl.stem + ext)
                if cand.exists():
                    img_src = cand
                    break
            if not img_src:
                print(f"경고: 이미지 없는 라벨 제외 — {lbl.name}")
                continue
            # 라벨 통계
            for line in lbl.read_text().strip().split("\n"):
                idx = int(line.split()[0])
                stats[CLASSES[idx]] += 1
            shutil.move(str(lbl), lbl_dir / lbl.name)
            shutil.move(str(img_src), img_dir / img_src.name)

    shutil.rmtree(out_root / "_staging")

    # data.yaml
    (out_root / "data.yaml").write_text(
        f"path: {out_root.resolve()}\n"
        "train: train/images\n"
        "val: valid/images\n"
        f"nc: {len(CLASSES)}\n"
        f"names: {json.dumps(CLASSES)}\n"
    )

    print("\n" + "=" * 60)
    print(f"병합 완료: 총 {total}장 (train {len(all_labels) - val_count} / val {val_count})")
    print("=" * 60)
    print("\n클래스별 어노테이션 수:")
    for cls in CLASSES:
        print(f"  {cls}: {stats.get(cls, 0)}")

    if unmapped:
        print("\n⚠ 매핑되지 않은 클래스 (필요하면 ALIASES에 추가 후 재실행):")
        for name, cnt in unmapped.most_common():
            print(f"  '{name}': {cnt}개 어노테이션 제외됨")

    print(f"\n다음 단계 (학습):")
    print(f"  python3 scripts/train_dental_yolo.py --step train --dataset-dir {out_root}")
    print(f"  python3 scripts/train_dental_yolo.py --step export --model-path training/runs/dental_detector/weights/best.pt")


if __name__ == "__main__":
    main()
