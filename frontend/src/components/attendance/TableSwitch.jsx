const VIEWS = [
  { key: "agg", label: "주일예배 종합" },
  { key: "service", label: "예배별" },
];

export default function TableSwitch({ value, onChange }) {
  const activeIndex = Math.max(
    0,
    VIEWS.findIndex((v) => v.key === value)
  );
  const step = 100 / VIEWS.length;

  return (
    <div className="relative inline-flex bg-surface-container-low rounded-full self-start">
      <div
        className="absolute top-[3px] bottom-[3px] rounded-full bg-primary transition-all duration-200 ease-out"
        style={{
          width: `calc(${step}% - 6px)`,
          left: `calc(${activeIndex * step}% + 3px)`,
        }}
      />
      {VIEWS.map((v) => (
        <button
          key={v.key}
          type="button"
          onClick={() => onChange(v.key)}
          className={`relative z-10 px-lg py-xs rounded-full text-body-md-bold font-body-md-bold text-center transition-colors ${
            value === v.key ? "text-on-primary" : "text-on-surface-variant"
          }`}
        >
          {v.label}
        </button>
      ))}
    </div>
  );
}
