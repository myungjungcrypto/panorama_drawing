import 'server-only';
import { getSession, SessionPayload } from './session';

const ROLE_LEVEL: Record<string, number> = {
  pending: 0,
  annotator: 1,
  admin: 2,
};

// 세션 + DB 역할 검증. 권한 부족 시 null 반환 (호출부에서 401/403 처리)
export async function requireRole(minRole: 'annotator' | 'admin'): Promise<SessionPayload | null> {
  const session = await getSession();
  if (!session) return null;
  if ((ROLE_LEVEL[session.role] ?? -1) < ROLE_LEVEL[minRole]) return null;
  return session;
}

export function unauthorized(message = '권한이 없습니다.') {
  return Response.json({ error: message }, { status: 403 });
}

export function unauthenticated(message = '로그인이 필요합니다.') {
  return Response.json({ error: message }, { status: 401 });
}
