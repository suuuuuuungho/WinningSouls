const SERVICES = [
  { key: "1", label: "주일 1부" },
  { key: "2", label: "주일 2부" },
  { key: "3", label: "주일 3부" },
  { key: "4", label: "주일 4부" },
  { key: "school", label: "교회학교" },
];

export default function ServiceTabs({ value, onChange }) {
  return (
    <div className="flex flex-wrap gap-xs">
      {SERVICES.map((s) => {
        const active = value === s.key;
        return (
          <button
            key={s.key}
            type="button"
            onClick={() => onChange(s.key)}
            className={`px-sm py-xs rounded-full text-label-sm font-label-sm transition-colors ${
              active
                ? "bg-primary-container text-on-primary-container"
                : "bg-surface-container-low text-on-surface-variant hover:bg-surface-container-high"
            }`}
          >
            {s.label}
          </button>
        );
      })}
    </div>
  );
}
