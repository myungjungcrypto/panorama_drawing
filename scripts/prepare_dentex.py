"""
DENTEX 데이터셋 다운로드 + YOLO 형식 변환 + 기존 데이터 합치기
================================================================

DENTEX: MICCAI 2023 학회 공식 데이터셋
- 1,005장 파노라마 X-ray
- 개별 치아 FDI 번호 + 진단 라벨 동시 포함

사용법:
    python3 scripts/prepare_dentex.py --step all
    python3 scripts/prepare_dentex.py --step download
    python3 scripts/prepare_dentex.py --step convert
    python3 scripts/prepare_dentex.py --step merge
"""

import os
import sys
import json
import argparse
import random
import shutil
from pathlib import Path

PROJECT_ROOT = Path(__file__).parent.parent
DENTEX_DIR = PROJECT_ROOT / "dentex_raw"
DENTEX_YOLO_DIR = PROJECT_ROOT / "dentex_yolo"
MERGED_DIR = PROJECT_ROOT / "merged-tooth-numbering-v2"

# FDI class list (sorted) - 32 classes
FDI_CLASSES = [
    '11','12','13','14','15','16','17','18',
    '21','22','23','24','25','26','27','28',
    '31','32','33','34','35','36','37','38',
    '41','42','43','44','45','46','47','48',
]
FDI_TO_IDX = {fdi: i for i, fdi in enumerate(FDI_CLASSES)}


def download_dentex():
    """DENTEX 데이터셋 다운로드 (Hugging Face)"""
    print("=" * 60)
    print("1단계: DENTEX 데이터셋 다운로드")
    print("=" * 60)

    DENTEX_DIR.mkdir(parents=True, exist_ok=True)

    try:
        from huggingface_hub import hf_hub_download, list_repo_files
    except ImportError:
        print("huggingface_hub 설치 중...")
        os.system(f"{sys.executable} -m pip install huggingface_hub")
        from huggingface_hub import hf_hub_download, list_repo_files

    repo_id = "ibrahimhamamci/DENTEX"

    print(f"Hugging Face에서 DENTEX 다운로드 중...")
    print(f"리포: {repo_id}")

    # List files in the repo
    try:
        files = list_repo_files(repo_id, repo_type="dataset")
        print(f"파일 수: {len(files)}")

        # Download all relevant files
        downloaded = 0
        for f in files:
            if any(f.endswith(ext) for ext in ['.json', '.png', '.jpg', '.jpeg', '.txt']):
                try:
                    hf_hub_download(
                        repo_id=repo_id,
                        filename=f,
                        repo_type="dataset",
                        local_dir=str(DENTEX_DIR),
                    )
                    downloaded += 1
                    if downloaded % 100 == 0:
                        print(f"  다운로드: {downloaded}/{len(files)}")
                except Exception as e:
                    print(f"  스킵: {f} ({e})")

        print(f"\n다운로드 완료: {downloaded}개 파일 → {DENTEX_DIR}")

    except Exception as e:
        print(f"ERROR: 다운로드 실패 - {e}")
        print("대안: 직접 다운로드")
        print(f"  https://huggingface.co/datasets/ibrahimhamamci/DENTEX")
        sys.exit(1)


def find_dentex_annotations():
    """DENTEX 어노테이션 파일 찾기"""
    json_files = list(DENTEX_DIR.rglob("*.json"))
    print(f"JSON 파일 {len(json_files)}개 발견")

    # Find the annotation file with tooth enumeration + diagnosis
    best_file = None
    best_count = 0

    for jf in json_files:
        try:
            with open(jf) as f:
                data = json.load(f)
            if isinstance(data, dict) and 'images' in data and 'annotations' in data:
                count = len(data.get('annotations', []))
                print(f"  {jf.name}: {len(data['images'])} images, {count} annotations")
                if count > best_count:
                    best_count = count
                    best_file = jf
        except:
            pass

    return best_file


def convert_to_yolo():
    """DENTEX COCO 형식 → YOLO 형식 변환"""
    print("\n" + "=" * 60)
    print("2단계: YOLO 형식 변환")
    print("=" * 60)

    ann_file = find_dentex_annotations()
    if not ann_file:
        print("ERROR: 어노테이션 파일을 찾을 수 없습니다.")
        print(f"검색 위치: {DENTEX_DIR}")
        # Try alternative: look for enumeration+diagnosis folder
        for candidate in DENTEX_DIR.rglob("*enumeration*"):
            print(f"  발견: {candidate}")
        sys.exit(1)

    with open(ann_file) as f:
        coco_data = json.load(f)

    images = {img['id']: img for img in coco_data['images']}
    categories = {cat['id']: cat['name'] for cat in coco_data.get('categories', [])}

    print(f"이미지: {len(images)}개")
    print(f"어노테이션: {len(coco_data['annotations'])}개")
    print(f"카테고리: {categories}")

    # Map category names to FDI class indices
    cat_to_fdi_idx = {}
    for cat_id, cat_name in categories.items():
        # DENTEX categories might be like "11", "12", etc. or "Tooth 11"
        fdi_str = cat_name.strip().replace("Tooth ", "").replace("tooth ", "")
        if fdi_str in FDI_TO_IDX:
            cat_to_fdi_idx[cat_id] = FDI_TO_IDX[fdi_str]
        else:
            # Try extracting number
            import re
            nums = re.findall(r'\d{2}', fdi_str)
            for num in nums:
                if num in FDI_TO_IDX:
                    cat_to_fdi_idx[cat_id] = FDI_TO_IDX[num]
                    break

    print(f"FDI 매핑 성공: {len(cat_to_fdi_idx)}/{len(categories)} 카테고리")

    if not cat_to_fdi_idx:
        print("WARNING: FDI 매핑 실패. 카테고리를 확인하세요:")
        for cat_id, cat_name in categories.items():
            print(f"  {cat_id}: {cat_name}")
        # If categories are just numbered 0-31, map directly
        if len(categories) == 32:
            print("32개 카테고리 → FDI 순서로 직접 매핑")
            for cat_id in sorted(categories.keys()):
                idx = cat_id if isinstance(cat_id, int) else int(cat_id)
                if idx < 32:
                    cat_to_fdi_idx[cat_id] = idx

    # Create YOLO directory structure
    DENTEX_YOLO_DIR.mkdir(parents=True, exist_ok=True)
    for split in ['train', 'valid']:
        (DENTEX_YOLO_DIR / split / 'images').mkdir(parents=True, exist_ok=True)
        (DENTEX_YOLO_DIR / split / 'labels').mkdir(parents=True, exist_ok=True)

    # Group annotations by image
    img_annotations = {}
    for ann in coco_data['annotations']:
        img_id = ann['image_id']
        if img_id not in img_annotations:
            img_annotations[img_id] = []
        img_annotations[img_id].append(ann)

    # Convert each image
    image_ids = list(img_annotations.keys())
    random.shuffle(image_ids)
    split_idx = int(len(image_ids) * 0.9)  # 90% train, 10% valid

    converted = 0
    for i, img_id in enumerate(image_ids):
        if img_id not in images:
            continue

        img_info = images[img_id]
        img_w = img_info['width']
        img_h = img_info['height']
        img_filename = img_info['file_name']

        split = 'train' if i < split_idx else 'valid'

        # Find the actual image file
        img_path = None
        for candidate in DENTEX_DIR.rglob(os.path.basename(img_filename)):
            img_path = candidate
            break

        if not img_path or not img_path.exists():
            continue

        # Copy image
        dest_img = DENTEX_YOLO_DIR / split / 'images' / img_path.name
        shutil.copy2(img_path, dest_img)

        # Convert annotations to YOLO format
        label_lines = []
        for ann in img_annotations[img_id]:
            cat_id = ann['category_id']
            if cat_id not in cat_to_fdi_idx:
                continue

            class_idx = cat_to_fdi_idx[cat_id]

            # COCO bbox: [x, y, width, height] (top-left corner)
            bbox = ann['bbox']
            x_center = (bbox[0] + bbox[2] / 2) / img_w
            y_center = (bbox[1] + bbox[3] / 2) / img_h
            w = bbox[2] / img_w
            h = bbox[3] / img_h

            # Clamp to [0, 1]
            x_center = max(0, min(1, x_center))
            y_center = max(0, min(1, y_center))
            w = max(0, min(1, w))
            h = max(0, min(1, h))

            label_lines.append(f"{class_idx} {x_center:.6f} {y_center:.6f} {w:.6f} {h:.6f}")

        if label_lines:
            label_path = DENTEX_YOLO_DIR / split / 'labels' / (img_path.stem + '.txt')
            with open(label_path, 'w') as f:
                f.write('\n'.join(label_lines))
            converted += 1

    # Create data.yaml
    data_yaml = DENTEX_YOLO_DIR / 'data.yaml'
    with open(data_yaml, 'w') as f:
        f.write(f"train: {DENTEX_YOLO_DIR}/train/images\n")
        f.write(f"val: {DENTEX_YOLO_DIR}/valid/images\n")
        f.write(f"nc: 32\n")
        f.write(f"names: {FDI_CLASSES}\n")

    print(f"\n변환 완료: {converted}개 이미지")
    print(f"YOLO 데이터셋: {DENTEX_YOLO_DIR}")

    # Count per split
    train_count = len(list((DENTEX_YOLO_DIR / 'train' / 'images').glob('*')))
    valid_count = len(list((DENTEX_YOLO_DIR / 'valid' / 'images').glob('*')))
    print(f"  Train: {train_count}, Valid: {valid_count}")


def merge_datasets():
    """기존 데이터셋 + DENTEX 합치기"""
    print("\n" + "=" * 60)
    print("3단계: 데이터셋 합치기")
    print("=" * 60)

    MERGED_DIR.mkdir(parents=True, exist_ok=True)
    for split in ['train', 'valid']:
        (MERGED_DIR / split / 'images').mkdir(parents=True, exist_ok=True)
        (MERGED_DIR / split / 'labels').mkdir(parents=True, exist_ok=True)

    sources = [
        PROJECT_ROOT / "teeth-detection-and-numbering-1",
        PROJECT_ROOT / "Tooth-Numbering-1",
        DENTEX_YOLO_DIR,
    ]

    total = 0
    for src in sources:
        if not src.exists():
            print(f"  스킵 (없음): {src}")
            continue

        count = 0
        for split in ['train', 'valid']:
            img_dir = src / split / 'images'
            lbl_dir = src / split / 'labels'

            if not img_dir.exists():
                continue

            for img_file in img_dir.iterdir():
                if img_file.suffix.lower() in ['.jpg', '.jpeg', '.png']:
                    # Copy image
                    dest = MERGED_DIR / split / 'images' / img_file.name
                    if not dest.exists():
                        shutil.copy2(img_file, dest)

                        # Copy label if exists
                        lbl_file = lbl_dir / (img_file.stem + '.txt')
                        if lbl_file.exists():
                            shutil.copy2(lbl_file, MERGED_DIR / split / 'labels' / lbl_file.name)

                        count += 1

        print(f"  {src.name}: {count}개 추가")
        total += count

    # Create data.yaml
    data_yaml = MERGED_DIR / 'data.yaml'
    with open(data_yaml, 'w') as f:
        f.write(f"train: {MERGED_DIR}/train/images\n")
        f.write(f"val: {MERGED_DIR}/valid/images\n")
        f.write(f"nc: 32\n")
        f.write(f"names: {FDI_CLASSES}\n")

    train_count = len(list((MERGED_DIR / 'train' / 'images').glob('*')))
    valid_count = len(list((MERGED_DIR / 'valid' / 'images').glob('*')))

    print(f"\n합친 데이터셋: {MERGED_DIR}")
    print(f"  Train: {train_count}, Valid: {valid_count}")
    print(f"  총: {train_count + valid_count}개")


def main():
    parser = argparse.ArgumentParser(description="DENTEX 데이터셋 준비")
    parser.add_argument("--step", choices=["all", "download", "convert", "merge"], default="all")
    args = parser.parse_args()

    if args.step in ("all", "download"):
        download_dentex()

    if args.step in ("all", "convert"):
        convert_to_yolo()

    if args.step in ("all", "merge"):
        merge_datasets()

    print("\n" + "=" * 60)
    print("완료!")
    print("=" * 60)

    if args.step in ("all", "merge"):
        print(f"\n학습 명령어:")
        print(f'python3 scripts/train_tooth_numbering.py --step train --dataset-dir "{MERGED_DIR}" --epochs 300 --batch 32 --model-size m')


if __name__ == "__main__":
    main()
