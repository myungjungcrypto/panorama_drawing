import { readFile } from 'fs/promises';
import JSZip from 'jszip';
import { prisma } from '@/lib/db';
import { requireRole, unauthorized } from '@/lib/auth';
import { getUploadPath } from '@/lib/storage';

// 치식 클래스: FDI 11~48 (32개, 고정 순서)
const TOOTH_CLASSES: string[] = [];
for (let q = 1; q <= 4; q++) for (let p = 1; p <= 8; p++) TOOTH_CLASSES.push(String(q * 10 + p));

// 상태 클래스 (어노테이션 도구와 동일한 순서)
const CONDITION_CLASSES = [
  'Crown', 'Implant', 'Missing teeth', 'Filling', 'Root Canal Treatment', 'abutment',
];

function toYoloLine(classIdx: number, x: number, y: number, w: number, h: number): string {
  const cx = Math.min(1, Math.max(0, x + w / 2));
  const cy = Math.min(1, Math.max(0, y + h / 2));
  return `${classIdx} ${cx.toFixed(6)} ${cy.toFixed(6)} ${Math.min(1, w).toFixed(6)} ${Math.min(1, h).toFixed(6)}`;
}

export async function GET() {
  const session = await requireRole('admin');
  if (!session) return unauthorized();

  // 어노테이션 완료된 파노라마 전체
  const panoramas = await prisma.panorama.findMany({
    where: { annotStatus: 'done' },
    include: {
      annotations: true,
      case: { select: { title: true, isIdeal: true, status: true } },
    },
  });

  const zip = new JSZip();
  const tooth = zip.folder('tooth')!;
  const condition = zip.folder('condition')!;
  tooth.file('classes.txt', TOOTH_CLASSES.join('\n'));
  condition.file('classes.txt', CONDITION_CLASSES.join('\n'));

  let imageCount = 0;
  for (const pano of panoramas) {
    let imageData: Buffer;
    try {
      imageData = await readFile(getUploadPath(pano.filename));
    } catch {
      continue; // 파일 유실 시 건너뜀
    }

    const ext = pano.filename.slice(pano.filename.lastIndexOf('.'));
    const base = pano.id;

    // 치식 라벨
    const toothLines = pano.annotations
      .filter((a) => a.type === 'tooth')
      .map((a) => {
        const idx = TOOTH_CLASSES.indexOf(a.label);
        return idx >= 0 ? toYoloLine(idx, a.x, a.y, a.w, a.h) : null;
      })
      .filter(Boolean);

    // 상태 라벨
    const condLines = pano.annotations
      .filter((a) => a.type === 'condition')
      .map((a) => {
        const idx = CONDITION_CLASSES.indexOf(a.label);
        return idx >= 0 ? toYoloLine(idx, a.x, a.y, a.w, a.h) : null;
      })
      .filter(Boolean);

    if (toothLines.length > 0) {
      tooth.file(`images/${base}${ext}`, imageData);
      tooth.file(`labels/${base}.txt`, toothLines.join('\n'));
    }
    if (condLines.length > 0) {
      condition.file(`images/${base}${ext}`, imageData);
      condition.file(`labels/${base}.txt`, condLines.join('\n'));
    }
    imageCount++;
  }

  // 치료 계획 라벨 CSV (검수된 케이스)
  const treatmentLabels = await prisma.treatmentLabel.findMany({
    include: { case: { select: { title: true, isIdeal: true, status: true } } },
    orderBy: [{ caseId: 'asc' }, { fdi: 'asc' }],
  });

  const csvLines = ['case_id,case_title,is_ideal,case_status,fdi,before_status,after_status,treatment,confirmed'];
  for (const l of treatmentLabels) {
    const title = l.case.title.replace(/"/g, '""');
    csvLines.push(
      `${l.caseId},"${title}",${l.case.isIdeal === null ? '' : l.case.isIdeal},${l.case.status},${l.fdi},${l.beforeStatus},${l.afterStatus},"${l.treatment}",${l.confirmed}`
    );
  }
  zip.file('treatment_labels.csv', csvLines.join('\n'));

  zip.file(
    'README.txt',
    [
      '치과 파노라마 어노테이션 데이터셋 (YOLO 형식)',
      '',
      `내보낸 날짜: ${new Date().toISOString()}`,
      `파노라마 수: ${imageCount}`,
      `치료 라벨 수: ${treatmentLabels.length}`,
      '',
      'tooth/       치식(FDI) 감지 데이터셋 — classes.txt, images/, labels/',
      'condition/   상태 감지 데이터셋 — classes.txt, images/, labels/',
      'treatment_labels.csv  치료 전/후 diff 라벨 (치료 계획 학습용)',
      '',
      '라벨 형식: class_index center_x center_y width height (모두 0~1 정규화)',
      '재학습: scripts/train_dental_yolo.py, scripts/train_tooth_numbering.py 참고',
    ].join('\n')
  );

  const buffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });

  return new Response(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="dental-dataset-${new Date().toISOString().slice(0, 10)}.zip"`,
    },
  });
}
