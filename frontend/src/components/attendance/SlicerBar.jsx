import { useMemo } from "react";

const PRESETS = [
  { label: "최근 8주", weeks: 8 },
  { label: "최근 13주", weeks: 13 },
  { label: "최근 26주", weeks: 26 },
  { label: "전체", weeks: null },
];

function toggleInArray(arr, value) {
  return arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value];
}

function addDays(dateStr, days) {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
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
        <label className="flex items-center gap-xs text-label-sm font-label-sm text-on-surface-variant">
          부서
          <select
            value={filters.div || ""}
            onChange={(e) =>
              onChange({ ...filters, div: e.target.value || null, grades: [], classes: [] })
            }
            className="bg-surface rounded-lg px-sm py-[2px] text-body-md font-body-md text-on-surface border border-outline-variant/30"
          >
            <option value="">전체</option>
            {divisions.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </label>

        <div className="flex flex-wrap items-center gap-xs">
          <span className="text-label-sm font-label-sm text-on-surface-variant">학년</span>
          {grades.map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => onChange({ ...filters, grades: toggleInArray(filters.grades, g), classes: [] })}
              className={`px-sm py-[2px] rounded-full text-label-sm ${
                filters.grades.includes(g)
                  ? "bg-primary-container text-on-primary-container"
                  : "bg-surface text-on-surface-variant border border-outline-variant/30"
              }`}
            >
              {g}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-xs">
          <span className="text-label-sm font-label-sm text-on-surface-variant">반</span>
          {classes.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => onChange({ ...filters, classes: toggleInArray(filters.classes, c) })}
              className={`px-sm py-[2px] rounded-full text-label-sm ${
                filters.classes.includes(c)
                  ? "bg-primary-container text-on-primary-container"
                  : "bg-surface text-on-surface-variant border border-outline-variant/30"
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-xs">
        <span className="text-label-sm font-label-sm text-on-surface-variant">기간</span>
        {PRESETS.map((p) => (
          <button
            key={p.label}
            type="button"
            onClick={() => applyPreset(p.weeks)}
            className="px-sm py-[2px] rounded-full text-label-sm bg-surface text-on-surface-variant border border-outline-variant/30 hover:bg-surface-container-high"
          >
            {p.label}
          </button>
        ))}
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
