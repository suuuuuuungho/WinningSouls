import { useMemo } from "react";

const VALUE_CHIP = {
  참석: "bg-green-100 text-green-700",
  타예배: "bg-blue-100 text-blue-700",
  가정: "bg-amber-100 text-amber-700",
  불참: "bg-error/10 text-error",
};

function ValueChip({ value }) {
  if (!value) return <span className="text-on-surface-variant/40">-</span>;
  const cls = VALUE_CHIP[value] || "bg-surface-container-high text-on-surface-variant";
  return (
    <span className={`inline-block px-xs py-[2px] rounded-full text-label-sm font-label-sm whitespace-nowrap ${cls}`}>
      {value}
    </span>
  );
}

export default function AttendanceTable({ rows, loading, truncated, error }) {
  const { dates, members } = useMemo(() => {
    const dateSet = new Set();
    const memberMap = new Map();
    for (const r of rows || []) {
      dateSet.add(r.Att_Date);
      if (!memberMap.has(r.ID)) {
        memberMap.set(r.ID, { Name: r.Name, Div_Class: r.Div_Class, values: new Map() });
      }
      memberMap.get(r.ID).values.set(r.Att_Date, r.Value);
    }
    return { dates: [...dateSet].sort(), members: [...memberMap.entries()] };
  }, [rows]);

  if (error) {
    return <p className="text-body-md font-body-md text-error py-md">{error}</p>;
  }

  if (loading) {
    return <p className="text-body-md font-body-md text-on-surface-variant py-md">불러오는 중...</p>;
  }

  if (members.length === 0) {
    return <p className="text-body-md font-body-md text-on-surface-variant py-md">조건에 맞는 데이터가 없습니다.</p>;
  }

  return (
    <div>
      {truncated && (
        <p className="text-label-sm font-label-sm text-error mb-xs">
          결과가 많아 일부만 표시됩니다. 필터를 좁혀주세요.
        </p>
      )}
      <div className="overflow-auto custom-scrollbar max-h-[60vh] rounded-xl border border-outline-variant/30">
        <table className="text-label-sm border-collapse">
          <thead>
            <tr>
              <th className="sticky top-0 left-0 z-30 bg-surface-container-low px-sm py-xs text-left font-body-md-bold text-on-surface whitespace-nowrap">
                이름 / 반
              </th>
              {dates.map((d) => (
                <th
                  key={d}
                  className="sticky top-0 z-20 bg-surface-container-low px-sm py-xs text-center font-body-md-bold text-on-surface whitespace-nowrap"
                >
                  {d.slice(5)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {members.map(([id, m]) => (
              <tr key={id} className="border-t border-outline-variant/20">
                <td className="sticky left-0 z-10 bg-surface px-sm py-xs whitespace-nowrap">
                  <span className="text-on-surface font-body-md-bold">{m.Name}</span>{" "}
                  <span className="text-on-surface-variant">{m.Div_Class}</span>
                </td>
                {dates.map((d) => (
                  <td key={d} className="px-sm py-xs text-center">
                    <ValueChip value={m.values.get(d)} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
