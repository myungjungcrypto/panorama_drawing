import 'server-only';
import { getSession, SessionPayload } from './session';

// 역할 체계:
// pending(레거시) < member(일반 회원, 자동가입) < annotator(어노테이션 승인) < admin
const ROLE_LEVEL: Record<string, number> = {
  pending: 0,
  member: 1,
  annotator: 2,
  admin: 3,
};

// 세션 + DB 역할 검증. 권한 부족 시 null 반환 (호출부에서 401/403 처리)
export async function requireRole(minRole: 'member' | 'annotator' | 'admin'): Promise<SessionPayload | null> {
  const session = await getSession();
  if (!session) return null;
  if ((ROLE_LEVEL[session.role] ?? -1) < ROLE_LEVEL[minRole]) return null;
  return session;
}

// 로그인 여부만 확인 (권한 검사 없음, 비로그인 시 null)
export async function getSessionOrNull(): Promise<SessionPayload | null> {
  return getSession();
}

export function unauthorized(message = '권한이 없습니다.') {
  return Response.json({ error: message }, { status: 403 });
}

export function unauthenticated(message = '로그인이 필요합니다.') {
  return Response.json({ error: message }, { status: 401 });
}
