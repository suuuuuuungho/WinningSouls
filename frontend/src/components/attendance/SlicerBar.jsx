import { useMemo } from "react";

const PRESETS = [
  { label: "최근 8주", weeks: 8 },
  { label: "최근 13주", weeks: 13 },
  { label: "최근 26주", weeks: 26 },
  { label: "전체", weeks: null },
];

function addDays(dateStr, days) {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function FilterSelect({ label, value, onChange, options, allLabel = "전체" }) {
  return (
    <label className="flex items-center gap-xs text-label-sm font-label-sm text-on-surface-variant">
      {label}
      <select
        value={value || ""}
        onChange={(e) => onChange(e.target.value || null)}
        className="bg-surface rounded-lg px-sm py-[2px] text-body-md font-body-md text-on-surface border border-outline-variant/30"
      >
        <option value="">{allLabel}</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}

export default function SlicerBar({ meta, filters, onChange }) {
  const divisions = useMemo(
    () => [...new Set((meta.classes || []).map((c) => c.div))],
    [meta.classes]
  );

  const grades = useMemo(() => {
    const filtered = (meta.classes || []).filter((c) => !filters.div || c.div === filters.div);
    return [...new Set(filtered.map((c) => c.grade))];
  }, [meta.classes, filters.div]);

  const classes = useMemo(() => {
    const filtered = (meta.classes || []).filter(
      (c) =>
        (!filters.div || c.div === filters.div) &&
        (filters.grades.length === 0 || filters.grades.includes(c.grade))
    );
    return [...new Set(filtered.map((c) => c.class))];
  }, [meta.classes, filters.div, filters.grades]);

  const dates = meta.dates || [];
  const maxDate = dates.length ? dates[dates.length - 1] : null;

  function applyPreset(weeks) {
    if (!maxDate) return;
    if (weeks === null) {
      onChange({ ...filters, dateFrom: dates[0], dateTo: maxDate });
    } else {
      onChange({ ...filters, dateFrom: addDays(maxDate, -weeks * 7), dateTo: maxDate });
    }
  }

  return (
    <div className="flex flex-col gap-sm bg-surface-container-low rounded-2xl p-md">
      <div className="flex flex-wrap items-center gap-md">
        <FilterSelect
          label="부서"
          value={filters.div}
          options={divisions}
          onChange={(v) => onChange({ ...filters, div: v, grades: [], classes: [] })}
        />

        <FilterSelect
          label="학년"
          value={filters.grades[0]}
          options={grades}
          onChange={(v) => onChange({ ...filters, grades: v ? [v] : [], classes: [] })}
        />

        <FilterSelect
          label="반"
          value={filters.classes[0]}
          options={classes}
          onChange={(v) => onChange({ ...filters, classes: v ? [v] : [] })}
        />
      </div>

      <div className="flex flex-wrap items-center gap-xs">
        <label className="flex items-center gap-xs text-label-sm font-label-sm text-on-surface-variant">
          기간
          <select
            value=""
            onChange={(e) => {
              const weeks = e.target.value === "" ? undefined : e.target.value === "all" ? null : Number(e.target.value);
              if (weeks !== undefined) applyPreset(weeks);
            }}
            className="bg-surface rounded-lg px-sm py-[2px] text-body-md font-body-md text-on-surface border border-outline-variant/30"
          >
            <option value="" disabled>
              빠른 선택
            </option>
            {PRESETS.map((p) => (
              <option key={p.label} value={p.weeks === null ? "all" : p.weeks}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        <input
          type="date"
          value={filters.dateFrom || ""}
          onChange={(e) => onChange({ ...filters, dateFrom: e.target.value })}
          className="bg-surface rounded-lg px-sm py-[2px] text-body-md font-body-md text-on-surface border border-outline-variant/30"
        />
        <span className="text-on-surface-variant">~</span>
        <input
          type="date"
          value={filters.dateTo || ""}
          onChange={(e) => onChange({ ...filters, dateTo: e.target.value })}
          className="bg-surface rounded-lg px-sm py-[2px] text-body-md font-body-md text-on-surface border border-outline-variant/30"
        />
      </div>
    </div>
  );
}
