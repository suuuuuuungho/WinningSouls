import "./GlobalNav.css";

export default function GlobalNav() {
  return (
    <header className="global-nav">
      <div className="global-nav__inner">
        <span className="global-nav__brand t-nav-link">교인 출석 Q&A</span>
        <nav className="global-nav__links">
          <a
            className="t-nav-link global-nav__link"
            href="https://w.yonsei.or.kr/yonsei/member/"
            target="_blank"
            rel="noreferrer"
          >
            디모데 바로가기
          </a>
        </nav>
      </div>
    </header>
  );
}
