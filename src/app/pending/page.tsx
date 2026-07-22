import Link from 'next/link';
import { getSession } from '@/lib/session';

export default async function PendingPage() {
  const session = await getSession();

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8 w-full max-w-sm text-center">
        <div className="text-4xl mb-4">⏳</div>
        <h1 className="text-lg font-bold text-gray-800 mb-2">승인 대기 중</h1>
        <p className="text-sm text-gray-500 mb-6">
          {session?.name ? `${session.name}님, ` : ''}가입이 완료되었습니다.
          <br />
          관리자 승인 후 어노테이션 작업에 참여할 수 있습니다.
        </p>
        <Link
          href="/"
          className="inline-block px-4 py-2 bg-gray-100 text-gray-600 rounded-lg text-sm hover:bg-gray-200"
        >
          홈으로 돌아가기
        </Link>
      </div>
    </div>
  );
}
