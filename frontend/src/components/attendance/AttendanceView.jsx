import { useEffect, useState } from "react";
import TableSwitch from "./TableSwitch.jsx";
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
const DEFAULT_FILTERS = { div: null, grades: [], classes: [], dateFrom: null, dateTo: null };

function useAttendanceFetch(source, filters) {
  const [table, setTable] = useState(EMPTY_TABLE);
  const filterKey = JSON.stringify(filters);

  useEffect(() => {
    if (!filters.dateFrom || !filters.dateTo) return undefined;
    const t = setTimeout(() => {
      setTable((s) => ({ ...s, loading: true, error: null }));
      getAttRows({ source, ...filters })
        .then((data) => setTable({ rows: data.rows, loading: false, truncated: data.truncated, error: null }))
        .catch((err) =>
          setTable({ rows: [], loading: false, truncated: false, error: err.message || String(err) })
        );
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, filterKey]);

  return table;
}

export default function AttendanceView() {
  const [meta, setMeta] = useState({ classes: [], dates: [] });
  const [metaError, setMetaError] = useState(null);
  const [view, setView] = useState("agg");

  const [aggFilters, setAggFilters] = useState(DEFAULT_FILTERS);
  const [serviceFilters, setServiceFilters] = useState(DEFAULT_FILTERS);
  const [serviceSource, setServiceSource] = useState("1");

  useEffect(() => {
    let cancelled = false;
    getAttMeta()
      .then((data) => {
        if (cancelled) return;
        setMeta(data);
        const maxDate = data.dates?.[data.dates.length - 1];
        if (maxDate) {
          const defaults = { dateFrom: addDays(maxDate, -13 * 7), dateTo: maxDate };
          setAggFilters((f) => ({ ...f, ...defaults }));
          setServiceFilters((f) => ({ ...f, ...defaults }));
        }
      })
      .catch((err) => !cancelled && setMetaError(err.message || String(err)));
    return () => {
      cancelled = true;
    };
  }, []);

  const aggTable = useAttendanceFetch("agg", aggFilters);
  const serviceTable = useAttendanceFetch(serviceSource, serviceFilters);

  return (
    <div className="max-w-[1200px] mx-auto px-lg py-lg flex flex-col gap-lg">
      {metaError && <p className="text-body-md font-body-md text-error">{metaError}</p>}

      <TableSwitch value={view} onChange={setView} />

      {view === "agg" ? (
        <section className="flex flex-col gap-sm">
          <h2 className="text-body-md-bold font-body-md-bold text-on-surface">주일예배 종합 출석 현황</h2>
          <SlicerBar meta={meta} filters={aggFilters} onChange={setAggFilters} />
          <AttendanceTable {...aggTable} />
        </section>
      ) : (
        <section className="flex flex-col gap-sm">
          <div className="flex items-center justify-between flex-wrap gap-sm">
            <h2 className="text-body-md-bold font-body-md-bold text-on-surface">예배별 출석 현황</h2>
            <ServiceTabs value={serviceSource} onChange={setServiceSource} />
          </div>
          <SlicerBar meta={meta} filters={serviceFilters} onChange={setServiceFilters} />
          <AttendanceTable {...serviceTable} />
        </section>
      )}
    </div>
  );
}
