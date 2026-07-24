import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/db';

export async function POST(request: Request) {
  try {
    const { email, password, name } = await request.json();

    if (!email || !password || !name) {
      return Response.json({ error: '이메일, 비밀번호, 이름을 모두 입력해주세요.' }, { status: 400 });
    }
    if (typeof password !== 'string' || password.length < 8) {
      return Response.json({ error: '비밀번호는 8자 이상이어야 합니다.' }, { status: 400 });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return Response.json({ error: '올바른 이메일 형식이 아닙니다.' }, { status: 400 });
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return Response.json({ error: '이미 가입된 이메일입니다.' }, { status: 409 });
    }

    // 최초 가입자는 자동으로 관리자, 이후 가입자는 일반 회원(자동 승인)
    // 어노테이션 플랫폼 권한(annotator)은 관리자가 별도 승인
    const userCount = await prisma.user.count();
    const role = userCount === 0 ? 'admin' : 'member';

    const passwordHash = await bcrypt.hash(password, 10);
    await prisma.user.create({
      data: { email, passwordHash, name, role },
    });

    return Response.json({
      ok: true,
      message: role === 'admin'
        ? '관리자 계정이 생성되었습니다. 로그인해주세요.'
        : '가입 완료! 바로 이용할 수 있습니다. (어노테이션 참여는 관리자 승인 필요)',
    });
  } catch (err) {
    console.error('register error:', err);
    return Response.json({ error: '가입 처리 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
