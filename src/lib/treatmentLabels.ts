import 'server-only';
import { prisma } from './db';
import { computeCaseDiff } from './annotationDiff';

/**
 * 케이스의 치료 내역(전/후 비교)을 재계산.
 * - 전/후 어노테이션이 모두 완료된 경우에만 계산
 * - 기존에 "확인"된 항목은 내용(전/후 상태·치료)이 동일하면 확인 상태 유지
 * - 케이스 상태 자동 갱신: 라벨 전부 확인됨 → reviewed, 아니면 completed
 * 반환: 계산 여부
 */
export async function recomputeTreatmentLabels(caseId: string): Promise<boolean> {
  const c = await prisma.case.findUnique({
    where: { id: caseId },
    include: {
      panoramas: { include: { annotations: true } },
      treatmentLabels: true,
    },
  });
  if (!c) return false;

  const before = c.panoramas.find((p) => p.phase === 'before');
  const after = c.panoramas.find((p) => p.phase === 'after');
  if (!before || !after || before.annotStatus !== 'done' || after.annotStatus !== 'done') {
    return false;
  }

  const labels = computeCaseDiff(before.annotations, after.annotations);

  // 기존 확인 상태 보존: 동일 내용이면 confirmed 유지
  const prevByFdi = new Map(c.treatmentLabels.map((l) => [l.fdi, l]));
  const withConfirm = labels.map((l) => {
    const prev = prevByFdi.get(l.fdi);
    const unchanged =
      prev &&
      prev.beforeStatus === l.beforeStatus &&
      prev.afterStatus === l.afterStatus &&
      prev.treatment === l.treatment;
    return { ...l, confirmed: unchanged ? prev.confirmed : false };
  });

  const allConfirmed = withConfirm.length > 0 && withConfirm.every((l) => l.confirmed);

  await prisma.$transaction([
    prisma.treatmentLabel.deleteMany({ where: { caseId } }),
    prisma.treatmentLabel.createMany({
      data: withConfirm.map((l) => ({ caseId, ...l })),
    }),
    prisma.case.update({
      where: { id: caseId },
      data: { status: allConfirmed ? 'reviewed' : 'completed' },
    }),
  ]);

  return true;
}
