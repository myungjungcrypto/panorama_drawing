import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';

// 보호 라우트 프리픽스 → 최소 역할
const PROTECTED: { prefix: string; minRole: 'annotator' | 'admin' }[] = [
  { prefix: '/admin', minRole: 'admin' },
  { prefix: '/annotate', minRole: 'annotator' },
  { prefix: '/cases', minRole: 'annotator' },
];

const ROLE_LEVEL: Record<string, number> = { pending: 0, annotator: 1, admin: 2 };

async function readSessionRole(req: NextRequest): Promise<string | null> {
  const token = req.cookies.get('session')?.value;
  if (!token) return null;
  const secret = process.env.SESSION_SECRET;
  if (!secret) return null;
  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret), {
      algorithms: ['HS256'],
    });
    return (payload.role as string) ?? null;
  } catch {
    return null;
  }
}

export default async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const rule = PROTECTED.find((r) => pathname.startsWith(r.prefix));
  if (!rule) return NextResponse.next();

  const role = await readSessionRole(req);

  if (!role) {
    const loginUrl = new URL('/login', req.url);
    loginUrl.searchParams.set('from', pathname);
    return NextResponse.redirect(loginUrl);
  }

  if ((ROLE_LEVEL[role] ?? -1) < ROLE_LEVEL[rule.minRole]) {
    // 로그인은 되어 있으나 권한 부족 (pending 등) → 대기 안내 페이지
    return NextResponse.redirect(new URL('/pending', req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*', '/annotate/:path*', '/cases/:path*'],
};
