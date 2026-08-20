const SERVICES = [
  { key: "1", label: "주일 1부" },
  { key: "2", label: "주일 2부" },
  { key: "3", label: "주일 3부" },
  { key: "4", label: "주일 4부" },
  { key: "school", label: "교회학교" },
];

export default function ServiceTabs({ value, onChange }) {
  return (
    <label className="flex items-center gap-xs text-label-sm font-label-sm text-on-surface-variant">
      예배
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-surface rounded-lg px-sm py-[2px] text-body-md font-body-md text-on-surface border border-outline-variant/30"
      >
        {SERVICES.map((s) => (
          <option key={s.key} value={s.key}>
            {s.label}
          </option>
        ))}
      </select>
    </label>
  );
}
