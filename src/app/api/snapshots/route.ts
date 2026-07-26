import crypto from 'crypto';
import { prisma } from '@/lib/db';
import { requireRole, unauthenticated } from '@/lib/auth';

const VALID_STATUS = ['present', 'missing', 'crown', 'implant', 'bridge'];
const VALID_TREATMENT = ['implant', 'crown', 'bridge'];

// 뷰어 현재 상태를 스냅샷으로 저장하고 환자 공유 링크 발급
export async function POST(request: Request) {
  const session = await requireRole('member');
  if (!session) return unauthenticated();

  const { teeth, treatmentPlan } = await request.json();

  // 검증: fdi(11~48) → 상태
  const cleanTeeth: Record<number, string> = {};
  if (teeth && typeof teeth === 'object') {
    for (const [k, v] of Object.entries(teeth)) {
      const fdi = parseInt(k);
      if (fdi >= 11 && fdi <= 48 && VALID_STATUS.includes(v as string)) {
        cleanTeeth[fdi] = v as string;
      }
    }
  }
  const cleanPlan: Record<number, string> = {};
  if (treatmentPlan && typeof treatmentPlan === 'object') {
    for (const [k, v] of Object.entries(treatmentPlan)) {
      const fdi = parseInt(k);
      if (fdi >= 11 && fdi <= 48 && VALID_TREATMENT.includes(v as string)) {
        cleanPlan[fdi] = v as string;
      }
    }
  }
  if (Object.keys(cleanTeeth).length === 0) {
    return Response.json({ error: '공유할 치아 상태가 없습니다.' }, { status: 400 });
  }

  const token = crypto.randomBytes(16).toString('hex');
  await prisma.snapshot.create({
    data: {
      token,
      userId: session.userId,
      teeth: JSON.stringify(cleanTeeth),
      plan: JSON.stringify(cleanPlan),
    },
  });

  return Response.json({ ok: true, token });
}
