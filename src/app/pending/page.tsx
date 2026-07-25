import Link from 'next/link';
import { getSession } from '@/lib/session';

export default async function PendingPage() {
  const session = await getSession();

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8 w-full max-w-sm text-center">
        <div className="text-4xl mb-4">🔒</div>
        <h1 className="text-lg font-bold text-gray-800 mb-2">어노테이터 권한 필요</h1>
        <p className="text-sm text-gray-500 mb-6">
          {session?.name ? `${session.name}님, ` : ''}이 기능(케이스 업로드·어노테이션)은
          관리자 승인을 받은 어노테이터만 사용할 수 있습니다.
          <br /><br />
          참여를 원하시면 관리자에게 승인을 요청해주세요.
          3D 상담 도구와 커뮤니티는 지금 바로 이용할 수 있습니다.
        </p>
        <div className="flex gap-2 justify-center">
          <Link
            href="/viewer"
            className="inline-block px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
          >
            3D 상담 도구
          </Link>
          <Link
            href="/community"
            className="inline-block px-4 py-2 bg-gray-100 text-gray-600 rounded-lg text-sm hover:bg-gray-200"
          >
            커뮤니티
          </Link>
        </div>
      </div>
    </div>
  );
}
