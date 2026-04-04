"""
치과 파노라마 YOLO 모델 학습 파이프라인
=======================================

1단계: 데이터셋 다운로드
2단계: 모델 학습 (YOLOv8)
3단계: ONNX 변환

실행 전 필수 설치:
    pip install ultralytics roboflow onnx onnxruntime

Roboflow API Key 필요:
    https://app.roboflow.com/settings/api 에서 발급
"""

import os
import sys
import argparse
from pathlib import Path

# 프로젝트 루트
PROJECT_ROOT = Path(__file__).parent.parent
MODELS_DIR = PROJECT_ROOT / "public" / "onnx"
TRAINING_DIR = PROJECT_ROOT / "training"


def download_dataset(api_key: str, version: int = 1):
    """Roboflow에서 치과 파노라마 데이터셋 다운로드"""
    from roboflow import Roboflow

    print("=" * 60)
    print("1단계: 데이터셋 다운로드")
    print("=" * 60)

    rf = Roboflow(api_key=api_key)

    # 데이터셋: Dental X-Ray Panoramic Dataset (13,800+ images)
    # 클래스: Crown, Implant, Missing teeth, Filling, Root Canal Treatment 등
    project = rf.workspace("celldetection-ok5sm").project(
        "dental-x-ray-panoramic-dataset"
    )

    # 사용 가능한 버전 찾기
    available_versions = project.versions()
    if not available_versions:
        print("ERROR: 사용 가능한 데이터셋 버전이 없습니다.")
        sys.exit(1)

    # 지정된 버전이 없으면 최신 버전 사용
    target_version = version
    version_numbers = [v.version.split("/")[-1] for v in available_versions]
    print(f"사용 가능한 버전: {version_numbers}")

    if str(target_version) not in version_numbers:
        target_version = int(version_numbers[-1])
        print(f"버전 {version}이 없어 최신 버전 {target_version} 사용")

    dataset_dir = TRAINING_DIR / "dataset"
    dataset_dir.mkdir(parents=True, exist_ok=True)

    dataset = project.version(target_version).download("yolov8", location=str(dataset_dir))

    print(f"\n다운로드 완료: {dataset_dir}")
    return dataset_dir


def train_model(
    dataset_dir: str,
    epochs: int = 50,
    imgsz: int = 640,
    batch: int = 16,
    model_size: str = "n",
):
    """YOLOv8 모델 학습"""
    from ultralytics import YOLO

    print("\n" + "=" * 60)
    print("2단계: 모델 학습")
    print("=" * 60)

    # YOLOv8 nano (브라우저 추론에 적합한 경량 모델)
    model_name = f"yolov8{model_size}.pt"
    print(f"기본 모델: {model_name}")
    print(f"에포크: {epochs}, 이미지 크기: {imgsz}, 배치: {batch}")

    model = YOLO(model_name)

    # data.yaml 파일 찾기
    data_yaml = None
    for candidate in [
        Path(dataset_dir) / "data.yaml",
        Path(dataset_dir) / "dataset" / "data.yaml",
    ]:
        if candidate.exists():
            data_yaml = str(candidate)
            break

    if not data_yaml:
        print("ERROR: data.yaml 파일을 찾을 수 없습니다.")
        print(f"검색 위치: {dataset_dir}")
        sys.exit(1)

    print(f"데이터 설정: {data_yaml}")

    # 학습 실행
    results = model.train(
        data=data_yaml,
        epochs=epochs,
        imgsz=imgsz,
        batch=batch,
        project=str(TRAINING_DIR / "runs"),
        name="dental_detector",
        exist_ok=True,
        # 성능 최적화
        patience=10,  # Early stopping
        save=True,
        plots=True,
    )

    best_model_path = TRAINING_DIR / "runs" / "dental_detector" / "weights" / "best.pt"
    print(f"\n학습 완료!")
    print(f"최고 모델: {best_model_path}")
    return str(best_model_path)


def export_to_onnx(model_path: str, imgsz: int = 640):
    """학습된 모델을 ONNX 형식으로 변환 (브라우저 실행용)"""
    from ultralytics import YOLO

    print("\n" + "=" * 60)
    print("3단계: ONNX 변환")
    print("=" * 60)

    model = YOLO(model_path)

    MODELS_DIR.mkdir(parents=True, exist_ok=True)

    # ONNX 변환
    onnx_path = model.export(
        format="onnx",
        imgsz=imgsz,
        simplify=True,  # 모델 최적화
        dynamic=False,  # 고정 입력 크기 (브라우저 호환성)
        half=False,  # FP32 (브라우저 WASM 호환)
    )

    # public/onnx/ 디렉토리로 복사
    import shutil

    dest = MODELS_DIR / "dental_detector.onnx"
    shutil.copy2(onnx_path, dest)

    file_size = os.path.getsize(dest) / (1024 * 1024)
    print(f"\nONNX 모델 저장: {dest}")
    print(f"파일 크기: {file_size:.1f} MB")

    # 클래스 이름 저장 (브라우저에서 사용)
    import json

    class_names = model.names
    classes_path = MODELS_DIR / "classes.json"
    with open(classes_path, "w") as f:
        json.dump(class_names, f, ensure_ascii=False, indent=2)
    print(f"클래스 정보 저장: {classes_path}")

    return str(dest)


def main():
    parser = argparse.ArgumentParser(description="치과 파노라마 YOLO 모델 학습")
    parser.add_argument(
        "--step",
        choices=["all", "download", "train", "export"],
        default="all",
        help="실행할 단계",
    )
    parser.add_argument(
        "--roboflow-key", type=str, help="Roboflow API Key", default=None
    )
    parser.add_argument("--epochs", type=int, default=50, help="학습 에포크 수")
    parser.add_argument("--imgsz", type=int, default=640, help="이미지 크기")
    parser.add_argument("--batch", type=int, default=16, help="배치 크기")
    parser.add_argument(
        "--model-size",
        choices=["n", "s", "m"],
        default="n",
        help="모델 크기 (n=nano, s=small, m=medium)",
    )
    parser.add_argument(
        "--model-path",
        type=str,
        default=None,
        help="export 단계에서 사용할 .pt 파일 경로",
    )
    parser.add_argument(
        "--dataset-dir",
        type=str,
        default=None,
        help="이미 다운로드된 데이터셋 경로",
    )

    args = parser.parse_args()

    TRAINING_DIR.mkdir(parents=True, exist_ok=True)

    dataset_dir = args.dataset_dir or str(TRAINING_DIR / "dataset")
    model_path = args.model_path

    if args.step in ("all", "download"):
        api_key = args.roboflow_key or os.environ.get("ROBOFLOW_API_KEY")
        if not api_key:
            print("ERROR: Roboflow API Key가 필요합니다.")
            print("  --roboflow-key YOUR_KEY 또는")
            print("  export ROBOFLOW_API_KEY=YOUR_KEY")
            sys.exit(1)
        dataset_dir = str(download_dataset(api_key))

    if args.step in ("all", "train"):
        model_path = train_model(
            dataset_dir=dataset_dir,
            epochs=args.epochs,
            imgsz=args.imgsz,
            batch=args.batch,
            model_size=args.model_size,
        )

    if args.step in ("all", "export"):
        if not model_path:
            # 기본 경로에서 찾기
            default_path = (
                TRAINING_DIR
                / "runs"
                / "dental_detector"
                / "weights"
                / "best.pt"
            )
            if default_path.exists():
                model_path = str(default_path)
            else:
                print("ERROR: 모델 파일 경로를 지정해주세요 (--model-path)")
                sys.exit(1)
        export_to_onnx(model_path, args.imgsz)

    print("\n" + "=" * 60)
    print("완료!")
    print("=" * 60)


if __name__ == "__main__":
    main()
