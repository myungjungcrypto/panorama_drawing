# -*- coding: utf-8 -*-
"""
치아 상태 모델 평가 스크립트 — 정답 라벨이 있는 평가셋으로 성적표 산출
==================================================================

사용법:
    python3 scripts/evaluate_condition.py \
        --model training/runs/dental_detector/weights/best.pt \
        --dataset /path/to/export/condition

  --dataset: 플랫폼 "YOLO 데이터셋 내보내기"의 condition/ 폴더
             (classes.txt + images/ + labels/ 구조)
  --model:   .pt 또는 .onnx 모두 가능, 여러 개 지정하면 나란히 비교

클래스 이름은 소문자 정규화로 매칭하므로 모델과 평가셋의
클래스 체계(11종/31종)가 달라도 공통 클래스끼리 비교됩니다.
"""

import argparse
import sys
from pathlib import Path
from collections import defaultdict

# 이름 정규화: 체계가 달라도 같은 개념끼리 묶기
CANON = {
    "crown": "crown",
    "implant": "implant",
    "missing teeth": "missing teeth",
    "missing tooth": "missing teeth",
    "filling": "filling",
    "root canal treatment": "root canal treatment",
    "abutment": "abutment",
    "caries": "caries",
    "deep caries": "caries",
    "periapical lesion": "periapical lesion",
    "impacted tooth": "impacted tooth",
    "impacted": "impacted tooth",
    "bridge": "bridge",
}


def canon(name: str):
    return CANON.get(name.strip().lower())


def load_gt(dataset: Path):
    """평가셋 로드: {이미지경로: [(클래스, cx, cy, w, h)]}"""
    classes = [l.strip() for l in (dataset / "classes.txt").read_text().split("\n") if l.strip()]
    gt = {}
    for lbl in (dataset / "labels").glob("*.txt"):
        boxes = []
        for line in lbl.read_text().strip().split("\n"):
            parts = line.split()
            if len(parts) < 5:
                continue
            cls = canon(classes[int(parts[0])])
            if cls is None:
                continue
            boxes.append((cls, *map(float, parts[1:5])))
        # 이미지 찾기
        for ext in (".jpg", ".jpeg", ".png", ".webp"):
            img = dataset / "images" / (lbl.stem + ext)
            if img.exists():
                gt[img] = boxes
                break
    return gt


def iou(a, b):
    """(cx,cy,w,h) 정규화 박스 IoU"""
    ax1, ay1, ax2, ay2 = a[0]-a[2]/2, a[1]-a[3]/2, a[0]+a[2]/2, a[1]+a[3]/2
    bx1, by1, bx2, by2 = b[0]-b[2]/2, b[1]-b[3]/2, b[0]+b[2]/2, b[1]+b[3]/2
    ix = max(0, min(ax2, bx2) - max(ax1, bx1))
    iy = max(0, min(ay2, by2) - max(ay1, by1))
    inter = ix * iy
    union = a[2]*a[3] + b[2]*b[3] - inter
    return inter / union if union > 0 else 0


def evaluate(model_path: str, gt: dict, conf: float, iou_thr: float):
    from ultralytics import YOLO
    from PIL import Image

    model = YOLO(model_path, task="detect")
    tp = defaultdict(int)
    fp = defaultdict(int)
    fn = defaultdict(int)

    for img_path, gt_boxes in gt.items():
        r = model.predict(str(img_path), conf=conf, verbose=False)[0]
        with Image.open(img_path) as im:
            W, H = im.size

        preds = []
        for box, cls_id in zip(r.boxes.xywh.tolist(), r.boxes.cls.tolist()):
            name = canon(model.names[int(cls_id)])
            if name is None:
                continue
            preds.append((name, box[0]/W, box[1]/H, box[2]/W, box[3]/H))

        matched_gt = set()
        for p in sorted(preds, key=lambda x: -x[3]*x[4]):
            best, best_iou = None, iou_thr
            for gi, g in enumerate(gt_boxes):
                if gi in matched_gt or g[0] != p[0]:
                    continue
                v = iou(p[1:], g[1:])
                if v >= best_iou:
                    best, best_iou = gi, v
            if best is not None:
                matched_gt.add(best)
                tp[p[0]] += 1
            else:
                fp[p[0]] += 1
        for gi, g in enumerate(gt_boxes):
            if gi not in matched_gt:
                fn[g[0]] += 1

    return tp, fp, fn


def report(name: str, tp, fp, fn):
    print(f"\n{'='*64}\n모델: {name}\n{'='*64}")
    print(f"{'클래스':<24}{'정답수':>6}{'맞춤':>6}{'오탐':>6}{'놓침':>6}{'정밀도':>8}{'재현율':>8}")
    classes = sorted(set(list(tp) + list(fp) + list(fn)))
    T = P = F = 0
    for c in classes:
        t, p_, f_ = tp[c], fp[c], fn[c]
        gt_n = t + f_
        prec = t / (t + p_) if t + p_ else 0
        rec = t / gt_n if gt_n else 0
        print(f"{c:<24}{gt_n:>6}{t:>6}{p_:>6}{f_:>6}{prec:>8.2f}{rec:>8.2f}")
        T += t; P += p_; F += f_
    prec = T / (T + P) if T + P else 0
    rec = T / (T + F) if T + F else 0
    f1 = 2 * prec * rec / (prec + rec) if prec + rec else 0
    print(f"{'-'*64}\n{'전체':<24}{T+F:>6}{T:>6}{P:>6}{F:>6}{prec:>8.2f}{rec:>8.2f}   F1={f1:.2f}")
    return f1


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", nargs="+", required=True, help="평가할 모델 (.pt/.onnx, 복수 가능)")
    parser.add_argument("--dataset", required=True, help="condition/ 폴더 (classes.txt+images+labels)")
    parser.add_argument("--conf", type=float, default=0.25)
    parser.add_argument("--iou", type=float, default=0.5)
    args = parser.parse_args()

    dataset = Path(args.dataset)
    if not (dataset / "classes.txt").exists():
        print(f"ERROR: {dataset}/classes.txt 없음 — 내보내기 zip의 condition/ 폴더를 지정하세요.")
        sys.exit(1)

    gt = load_gt(dataset)
    total_boxes = sum(len(v) for v in gt.values())
    print(f"평가셋: 이미지 {len(gt)}장, 정답 박스 {total_boxes}개")
    if not gt:
        sys.exit(1)

    scores = {}
    for m in args.model:
        tp, fp, fn = evaluate(m, gt, args.conf, args.iou)
        scores[m] = report(m, tp, fp, fn)

    if len(scores) > 1:
        print(f"\n{'='*64}\n종합 (F1 기준)\n{'='*64}")
        for m, f1 in sorted(scores.items(), key=lambda x: -x[1]):
            print(f"  {f1:.3f}  {m}")


main()
