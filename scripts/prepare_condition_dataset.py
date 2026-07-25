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

# ===== 클래스 체계 =====
# condition11: 앱 중심의 11개 축소 체계 (src/lib/dental/conditionClasses.ts와 일치)
# roboflow31: 기존 배포 모델과 동일한 celldetection 31클래스 체계
#             (라벨 폐기 없이 공개 데이터를 흡수 — 성능 재현/향상 실험용)
CONDITION11 = [
    "Crown", "Implant", "Missing teeth", "Filling", "Root Canal Treatment",
    "abutment", "Caries", "Deep Caries", "Periapical Lesion", "Impacted Tooth", "Bridge",
]

ROBOFLOW31 = [
    "Bone Loss", "Caries", "Crown", "Cyst", "Filling", "Fracture teeth",
    "Implant", "Malaligned", "Mandibular Canal", "Missing teeth",
    "Periapical lesion", "Permanent Teeth", "Primary teeth", "Retained root",
    "Root Canal Treatment", "Root Piece", "Root resorption", "Supra Eruption",
    "TAD", "abutment", "attrition", "bone defect", "gingival former",
    "impacted tooth", "maxillary sinus", "metal band", "orthodontic brackets",
    "permanent retainer", "plating", "post - core", "wire",
]

# 기본값 (main에서 --scheme에 따라 재설정)
CLASSES = CONDITION11
CLASS_TO_IDX = {c: i for i, c in enumerate(CLASSES)}

# roboflow31 체계용 매핑: 31클래스는 그대로 유지 + 공개 데이터 라벨을 31개 안으로 흡수
ALIASES_ROBOFLOW31 = {
    **{c.lower(): c for c in ROBOFLOW31},
    # OralXrays-9 → 31클래스 체계
    "apical periodontitis": "Periapical lesion",
    "dental caries": "Caries",
    "decay": "Caries",
    "wisdom tooth": None,      # 사랑니 자체는 병소가 아님
    "missing tooth": "Missing teeth",
    "dental filling": "Filling",
    "root canal filling": "Root Canal Treatment",
    "dental implant": "Implant",
    "porcelain crown": "Crown",
    "ceramic bridge": None,    # 31클래스에 브릿지 없음
    # DENTEX → 31클래스 체계
    "deep caries": "Caries",
    "periapical lesion": "Periapical lesion",
    "impacted": "impacted tooth",
    "impacted tooth": "impacted tooth",
}

# condition11 체계용: 소스별 클래스 이름 → 통합 클래스 매핑 (소문자 비교, None = 제외)
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
    "permanent teeth": None,  # 정상 치아 — 치식 모델 담당이므로 상태 모델에서 제외
    "primary teeth": None,
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
    parser.add_argument(
        "--scheme",
        choices=["condition11", "roboflow31"],
        default="condition11",
        help="클래스 체계: condition11(앱 축소형) | roboflow31(기존 모델과 동일, 라벨 폐기 없음)",
    )
    parser.add_argument(
        "--augment-compress",
        action="store_true",
        help="학습 이미지마다 저화질 사본 추가 (메신저 압축 이미지 대응 — JPEG 품질 저하 + 축소)",
    )
    args = parser.parse_args()

    # 클래스 체계 선택
    global CLASSES, CLASS_TO_IDX, ALIASES
    if args.scheme == "roboflow31":
        CLASSES = ROBOFLOW31
        CLASS_TO_IDX = {c: i for i, c in enumerate(CLASSES)}
        ALIASES = ALIASES_ROBOFLOW31
    print(f"클래스 체계: {args.scheme} ({len(CLASSES)}개 클래스)")

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

    # 메신저 압축 스타일 증강: train 이미지마다 저화질 사본 생성 (라벨은 동일 — 정규화 좌표라 그대로 유효)
    if args.augment_compress:
        try:
            from PIL import Image
        except ImportError:
            print("PIL 필요: pip install pillow")
            sys.exit(1)
        rng = random.Random(args.seed + 1)
        img_dir = out_root / "train" / "images"
        lbl_dir = out_root / "train" / "labels"
        originals = [p for p in img_dir.iterdir() if p.suffix.lower() in IMG_EXTS]
        added = 0
        for src in originals:
            lbl = lbl_dir / (src.stem + ".txt")
            if not lbl.exists():
                continue
            try:
                img = Image.open(src).convert("RGB")
                # 카톡 전송 수준: 긴 변 1000~1600px 축소 + JPEG 품질 55~75
                target_w = rng.randint(1000, 1600)
                if img.width > target_w:
                    ratio = target_w / img.width
                    img = img.resize((target_w, max(1, int(img.height * ratio))), Image.BILINEAR)
                quality = rng.randint(55, 75)
                new_name = f"compressed_{src.stem}.jpg"
                img.save(img_dir / new_name, "JPEG", quality=quality)
                shutil.copy2(lbl, lbl_dir / f"compressed_{src.stem}.txt")
                added += 1
            except OSError:
                continue
        print(f"\n압축 증강: 저화질 사본 {added}장 추가 (train 전용)")

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
