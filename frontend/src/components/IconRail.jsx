export default function IconRail() {
  return (
    <aside className="fixed left-0 top-0 h-full w-[72px] bg-surface-container flex flex-col items-center py-lg gap-lg z-50 shadow-[0_1px_8px_rgba(0,0,0,0.04)]">
      <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center mb-md">
        <span className="material-symbols-outlined text-on-primary">forum</span>
      </div>
      <nav className="flex flex-col gap-sm">
        <div
          aria-current="page"
          className="w-12 h-12 flex items-center justify-center rounded-xl bg-primary-container text-on-primary-container"
        >
          <span className="material-symbols-outlined">chat</span>
        </div>
      </nav>
      <a
        className="mt-auto mb-md w-12 h-12 flex items-center justify-center rounded-xl text-on-surface-variant hover:bg-surface-container-high transition-all"
        href="https://w.yonsei.or.kr/yonsei/member/"
        target="_blank"
        rel="noreferrer"
        title="디모데 바로가기"
      >
        <span className="material-symbols-outlined">open_in_new</span>
      </a>
    </aside>
  );
}
