const NAV_ITEMS = [
  { key: "chat", icon: "chat", title: "Q&A" },
  { key: "attendance", icon: "calendar_month", title: "출석 현황 표" },
];

export default function IconRail({ activeView = "chat", onNavigate = () => {} }) {
  return (
    <aside className="fixed left-0 top-0 h-full w-[72px] bg-surface-container flex flex-col items-center py-lg gap-lg z-50 shadow-[0_1px_8px_rgba(0,0,0,0.04)]">
      <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center mb-md">
        <span className="material-symbols-outlined text-on-primary">forum</span>
      </div>
      <nav className="flex flex-col gap-sm">
        {NAV_ITEMS.map((item) => {
          const active = activeView === item.key;
          return (
            <button
              key={item.key}
              type="button"
              aria-current={active ? "page" : undefined}
              title={item.title}
              onClick={() => onNavigate(item.key)}
              className={`w-12 h-12 flex items-center justify-center rounded-xl transition-colors ${
                active
                  ? "bg-primary-container text-on-primary-container"
                  : "text-on-surface-variant hover:bg-surface-container-high"
              }`}
            >
              <span className="material-symbols-outlined">{item.icon}</span>
            </button>
          );
        })}
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
