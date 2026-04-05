"""
치아 번호 인식 YOLO 모델 학습
==============================

개별 치아를 감지하고 FDI 번호(11~48)를 분류하는 모델.

데이터셋: "Teeth Detection and Numbering" (2,528장, 32 FDI 클래스)
모델: YOLOv8s (small)

사용법:
    # 전체 실행 (다운로드 + 학습 + 변환)
    python3 scripts/train_tooth_numbering.py --roboflow-key YOUR_KEY --epochs 100

    # 단계별 실행
    python3 scripts/train_tooth_numbering.py --step download --roboflow-key YOUR_KEY
    python3 scripts/train_tooth_numbering.py --step train --epochs 100
    python3 scripts/train_tooth_numbering.py --step export
"""

import os
import sys
import argparse
from pathlib import Path

PROJECT_ROOT = Path(__file__).parent.parent
MODELS_DIR = PROJECT_ROOT / "public" / "onnx"
TRAINING_DIR = PROJECT_ROOT / "training"
NUMBERING_DIR = TRAINING_DIR / "numbering"


def download_dataset(api_key: str):
    """FDI 치아 번호 데이터셋 다운로드"""
    from roboflow import Roboflow

    print("=" * 60)
    print("1단계: 치아 번호 데이터셋 다운로드")
    print("=" * 60)

    rf = Roboflow(api_key=api_key)

    # "Teeth Detection and Numbering" - 32 FDI classes, ~2,528 images
    project = rf.workspace("prime-snf1v").project(
        "teeth-detection-and-numbering-agi2i"
    )

    # Find available versions
    available_versions = project.versions()
    version_numbers = [v.version.split("/")[-1] for v in available_versions]
    print(f"사용 가능한 버전: {version_numbers}")

    # Use the latest version
    target_version = int(version_numbers[-1]) if version_numbers else 18
    print(f"버전 {target_version} 다운로드 중...")

    dataset = project.version(target_version).download("yolov8")

    print(f"\n다운로드 완료: {dataset.location}")
    return dataset.location


def train_model(
    dataset_dir: str,
    epochs: int = 100,
    imgsz: int = 640,
    batch: int = 16,
    model_size: str = "s",
):
    """치아 번호 인식 YOLOv8 모델 학습"""
    from ultralytics import YOLO

    print("\n" + "=" * 60)
    print("2단계: 치아 번호 모델 학습")
    print("=" * 60)

    model_name = f"yolov8{model_size}.pt"
    print(f"기본 모델: {model_name}")
    print(f"에포크: {epochs}, 이미지 크기: {imgsz}, 배치: {batch}")

    model = YOLO(model_name)

    # Find data.yaml
    data_yaml = None
    for root, dirs, files in os.walk(dataset_dir):
        if "data.yaml" in files:
            data_yaml = os.path.join(root, "data.yaml")
            break

    if not data_yaml:
        # Try parent directory patterns
        for candidate in [
            Path(dataset_dir) / "data.yaml",
            Path(dataset_dir).parent / "data.yaml",
        ]:
            if candidate.exists():
                data_yaml = str(candidate)
                break

    if not data_yaml:
        print(f"ERROR: data.yaml 파일을 찾을 수 없습니다.")
        print(f"검색 위치: {dataset_dir}")
        print("수동으로 경로를 지정하세요: --dataset-dir <경로>")
        sys.exit(1)

    print(f"데이터 설정: {data_yaml}")

    # Print class info
    import yaml
    with open(data_yaml) as f:
        data_config = yaml.safe_load(f)
    print(f"클래스 수: {data_config.get('nc', 'N/A')}")
    print(f"클래스: {data_config.get('names', [])[:10]}...")

    NUMBERING_DIR.mkdir(parents=True, exist_ok=True)

    results = model.train(
        data=data_yaml,
        epochs=epochs,
        imgsz=imgsz,
        batch=batch,
        project=str(NUMBERING_DIR / "runs"),
        name="tooth_numbering",
        exist_ok=True,
        patience=15,
        save=True,
        plots=True,
    )

    best_path = NUMBERING_DIR / "runs" / "tooth_numbering" / "weights" / "best.pt"
    print(f"\n학습 완료!")
    print(f"최고 모델: {best_path}")
    return str(best_path)


def export_to_onnx(model_path: str, imgsz: int = 640):
    """ONNX 변환"""
    from ultralytics import YOLO

    print("\n" + "=" * 60)
    print("3단계: ONNX 변환")
    print("=" * 60)

    model = YOLO(model_path)
    MODELS_DIR.mkdir(parents=True, exist_ok=True)

    onnx_path = model.export(
        format="onnx",
        imgsz=imgsz,
        simplify=True,
        dynamic=False,
        half=False,
    )

    import shutil
    dest = MODELS_DIR / "tooth_numbering.onnx"
    shutil.copy2(onnx_path, dest)

    file_size = os.path.getsize(dest) / (1024 * 1024)
    print(f"\nONNX 모델 저장: {dest}")
    print(f"파일 크기: {file_size:.1f} MB")

    # Save class names
    import json
    class_names = model.names
    classes_path = MODELS_DIR / "tooth_classes.json"
    with open(classes_path, "w") as f:
        json.dump(class_names, f, ensure_ascii=False, indent=2)
    print(f"클래스 정보 저장: {classes_path}")

    return str(dest)


def main():
    parser = argparse.ArgumentParser(description="치아 번호 인식 YOLO 모델 학습")
    parser.add_argument(
        "--step",
        choices=["all", "download", "train", "export"],
        default="all",
    )
    parser.add_argument("--roboflow-key", type=str, default=None)
    parser.add_argument("--epochs", type=int, default=100)
    parser.add_argument("--imgsz", type=int, default=640)
    parser.add_argument("--batch", type=int, default=16)
    parser.add_argument("--model-size", choices=["n", "s", "m"], default="s")
    parser.add_argument("--model-path", type=str, default=None)
    parser.add_argument("--dataset-dir", type=str, default=None)

    args = parser.parse_args()
    NUMBERING_DIR.mkdir(parents=True, exist_ok=True)

    dataset_dir = args.dataset_dir
    model_path = args.model_path

    if args.step in ("all", "download"):
        api_key = args.roboflow_key or os.environ.get("ROBOFLOW_API_KEY")
        if not api_key:
            print("ERROR: Roboflow API Key 필요")
            sys.exit(1)
        dataset_dir = download_dataset(api_key)

    if args.step in ("all", "train"):
        if not dataset_dir:
            # Try to find downloaded dataset
            for candidate in Path(".").glob("**/teeth-detection*/data.yaml"):
                dataset_dir = str(candidate.parent)
                break
            if not dataset_dir:
                print("ERROR: --dataset-dir를 지정해주세요")
                sys.exit(1)
        model_path = train_model(
            dataset_dir=dataset_dir,
            epochs=args.epochs,
            imgsz=args.imgsz,
            batch=args.batch,
            model_size=args.model_size,
        )

    if args.step in ("all", "export"):
        if not model_path:
            default_path = (
                NUMBERING_DIR / "runs" / "tooth_numbering" / "weights" / "best.pt"
            )
            if default_path.exists():
                model_path = str(default_path)
            else:
                print("ERROR: --model-path 지정 필요")
                sys.exit(1)
        export_to_onnx(model_path, args.imgsz)

    print("\n" + "=" * 60)
    print("완료!")
    print("=" * 60)


if __name__ == "__main__":
    main()
