import "./Footer.css";

export default function Footer() {
  return (
    <footer className="footer">
      <div className="container footer__inner">
        <div className="footer__col">
          <p className="t-caption-strong footer__heading">데이터</p>
          <p className="t-dense-link footer__text">
            디모데(w.yonsei.or.kr) 출석통계·교인목록을 주기적으로 동기화합니다.
          </p>
        </div>
        <div className="footer__col">
          <p className="t-caption-strong footer__heading">개인정보</p>
          <p className="t-dense-link footer__text">
            질문과 조회 결과 일부만 서버로 전달되며, 원본 개인정보는 브라우저에 저장되지 않습니다.
          </p>
        </div>
      </div>
      <div className="container">
        <p className="t-fine-print footer__legal">
          내부 교인 관리용 도구입니다. 무단 배포/공유를 금지합니다.
        </p>
      </div>
    </footer>
  );
}
