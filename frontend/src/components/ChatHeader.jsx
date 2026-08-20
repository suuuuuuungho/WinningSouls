export default function ChatHeader({
  title = "교인 출석 Q&A",
  subtitle = "실시간 데이터 연동",
  icon = "smart_toy",
}) {
  return (
    <header className="fixed top-0 left-[72px] right-0 h-20 bg-surface/80 backdrop-blur-xl z-30 flex items-center justify-between px-lg shadow-[0_1px_8px_rgba(0,0,0,0.04)]">
      <div className="flex items-center gap-md">
        <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center">
          <span className="material-symbols-outlined text-on-primary text-[20px]">{icon}</span>
        </div>
        <div>
          <h2 className="font-body-md-bold text-on-surface">{title}</h2>
          <span className="text-label-sm font-label-sm text-green-600">{subtitle}</span>
        </div>
      </div>
    </header>
  );
}
