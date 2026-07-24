import Link from 'next/link';

export const metadata = { title: '개인정보처리방침 — 난발치' };

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-gray-100">
      <header className="bg-white border-b border-gray-200 px-6 py-3">
        <h1 className="text-lg font-bold text-gray-800">개인정보처리방침</h1>
        <Link href="/" className="text-xs text-blue-600 hover:underline">← 홈으로</Link>
      </header>

      <main className="max-w-3xl mx-auto p-6">
        <div className="bg-white rounded-xl p-8 shadow-sm border border-gray-100 space-y-6 text-sm text-gray-700 leading-relaxed">
          <section>
            <h2 className="font-bold text-gray-900 mb-2">1. 수집하는 개인정보</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong>회원 정보</strong>: 이메일, 이름, 비밀번호(암호화 저장)</li>
              <li><strong>의료영상 데이터</strong>: 회원이 업로드하는 파노라마 X-ray 영상 및 어노테이션 정보</li>
            </ul>
          </section>

          <section>
            <h2 className="font-bold text-gray-900 mb-2">2. 수집 및 이용 목적</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>회원 관리 및 서비스 제공 (AI 분석, 3D 시각화, 어노테이션 플랫폼)</li>
              <li>치아 감지 AI 모델의 성능 개선을 위한 학습 데이터 구축</li>
              <li>커뮤니티 서비스 운영</li>
            </ul>
          </section>

          <section>
            <h2 className="font-bold text-gray-900 mb-2">3. 의료영상 업로드 원칙</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>업로드하는 영상에는 <strong>환자 성명, 생년월일, 차트번호 등 식별정보가 포함되어서는 안 됩니다</strong>. 영상 내에 식별정보가 표기된 경우 업로드 전 반드시 제거(크롭/마스킹)해야 합니다.</li>
              <li>업로드하는 회원은 소속 의료기관에서 해당 영상의 활용에 필요한 절차(환자 동의 등)를 완료했음을 확인해야 합니다.</li>
              <li>케이스 제목·메모에 환자 성명 등 식별정보 입력을 금지합니다.</li>
            </ul>
          </section>

          <section>
            <h2 className="font-bold text-gray-900 mb-2">4. 보관 및 파기</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>회원 탈퇴 또는 삭제 요청 시 해당 데이터는 지체 없이 파기합니다.</li>
              <li>업로드된 영상은 서비스 제공 및 AI 학습 목적 범위에서만 보관하며, 접근 권한이 있는 승인된 회원 외에는 접근할 수 없습니다.</li>
            </ul>
          </section>

          <section>
            <h2 className="font-bold text-gray-900 mb-2">5. 제3자 제공</h2>
            <p>
              업로드된 의료영상은 원칙적으로 제3자에게 제공되지 않습니다.
              커뮤니티 케이스 공유 시에는 <strong>원본 X-ray 영상이 아닌 3D 모식도(치아 상태 정보)만</strong> 공유되며,
              공유 전 업로더의 명시적 확인 절차를 거칩니다.
            </p>
          </section>

          <section>
            <h2 className="font-bold text-gray-900 mb-2">6. 삭제 요청 및 문의</h2>
            <p>
              데이터 삭제 요청 및 개인정보 관련 문의는 관리자에게 연락해 주시기 바랍니다.
              요청 접수 후 지체 없이 처리합니다.
            </p>
          </section>

          <p className="text-xs text-gray-400 pt-4 border-t border-gray-100">
            본 방침은 서비스 발전에 따라 개정될 수 있으며, 개정 시 본 페이지를 통해 공지합니다.
          </p>
        </div>
      </main>
    </div>
  );
}
