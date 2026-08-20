import { useEffect, useState } from "react";
import SlicerBar from "./SlicerBar.jsx";
import ServiceTabs from "./ServiceTabs.jsx";
import AttendanceTable from "./AttendanceTable.jsx";
import { getAttMeta, getAttRows } from "../../lib/api.js";

function addDays(dateStr, days) {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

const EMPTY_TABLE = { rows: [], loading: true, truncated: false, error: null };

export default function AttendanceView() {
  const [meta, setMeta] = useState({ classes: [], dates: [] });
  const [metaError, setMetaError] = useState(null);
  const [filters, setFilters] = useState({
    div: null,
    grades: [],
    classes: [],
    dateFrom: null,
    dateTo: null,
  });
  const [serviceSource, setServiceSource] = useState("1");

  const [table1, setTable1] = useState(EMPTY_TABLE);
  const [table2, setTable2] = useState(EMPTY_TABLE);

  useEffect(() => {
    let cancelled = false;
    getAttMeta()
      .then((data) => {
        if (cancelled) return;
        setMeta(data);
        const maxDate = data.dates?.[data.dates.length - 1];
        if (maxDate) {
          setFilters((f) => ({ ...f, dateFrom: addDays(maxDate, -13 * 7), dateTo: maxDate }));
        }
      })
      .catch((err) => !cancelled && setMetaError(err.message || String(err)));
    return () => {
      cancelled = true;
    };
  }, []);

  const filterKey = JSON.stringify(filters);

  useEffect(() => {
    if (!filters.dateFrom || !filters.dateTo) return undefined;
    const t = setTimeout(() => {
      setTable1((s) => ({ ...s, loading: true, error: null }));
      getAttRows({ source: "agg", ...filters })
        .then((data) => setTable1({ rows: data.rows, loading: false, truncated: data.truncated, error: null }))
        .catch((err) =>
          setTable1({ rows: [], loading: false, truncated: false, error: err.message || String(err) })
        );
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey]);

  useEffect(() => {
    if (!filters.dateFrom || !filters.dateTo) return undefined;
    const t = setTimeout(() => {
      setTable2((s) => ({ ...s, loading: true, error: null }));
      getAttRows({ source: serviceSource, ...filters })
        .then((data) => setTable2({ rows: data.rows, loading: false, truncated: data.truncated, error: null }))
        .catch((err) =>
          setTable2({ rows: [], loading: false, truncated: false, error: err.message || String(err) })
        );
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey, serviceSource]);

  return (
    <div className="max-w-[1200px] mx-auto px-lg py-lg flex flex-col gap-lg">
      {metaError && <p className="text-body-md font-body-md text-error">{metaError}</p>}

      <SlicerBar meta={meta} filters={filters} onChange={setFilters} />

      <section className="flex flex-col gap-sm">
        <h2 className="text-body-md-bold font-body-md-bold text-on-surface">주일예배 종합 출석 현황</h2>
        <AttendanceTable {...table1} />
      </section>

      <section className="flex flex-col gap-sm">
        <div className="flex items-center justify-between flex-wrap gap-sm">
          <h2 className="text-body-md-bold font-body-md-bold text-on-surface">예배별 출석 현황</h2>
          <ServiceTabs value={serviceSource} onChange={setServiceSource} />
        </div>
        <AttendanceTable {...table2} />
      </section>
    </div>
  );
}
