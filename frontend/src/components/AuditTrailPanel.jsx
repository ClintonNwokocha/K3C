import { useEffect, useMemo, useState } from "react";
import { getAuditLogs } from "../services/api";

const inputClass =
  "rounded-md border border-slate-200 bg-white px-4 py-3 text-sm text-[#030454] outline-none transition placeholder:text-slate-400 focus:border-[#009B35] focus:ring-2 focus:ring-[#009B35]/10";

function formatValue(value) {
  if (value === null || value === undefined || value === "") return "—";

  if (typeof value === "object") {
    return JSON.stringify(value);
  }

  return String(value);
}

function pick(record, keys) {
  for (const key of keys) {
    if (record[key] !== null && record[key] !== undefined && record[key] !== "") {
      return record[key];
    }
  }

  return "";
}

function formatDate(value) {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return date.toLocaleString();
}

function getActionBadgeClass(action) {
  const value = String(action || "").toLowerCase();

  if (value.includes("create")) {
    return "bg-[#009B35]/10 text-[#009B35]";
  }

  if (value.includes("update") || value.includes("change")) {
    return "bg-[#030454]/10 text-[#030454]";
  }

  if (value.includes("delete") || value.includes("remove")) {
    return "bg-red-50 text-red-700";
  }

  if (value.includes("import") || value.includes("upload")) {
    return "bg-[#F3F74B]/45 text-[#030454]";
  }

  return "bg-slate-100 text-slate-700";
}

function AuditStatCard({ label, value, helper, tone = "blue" }) {
  const toneClasses = {
    blue: "border-[#030454]/15 bg-[#030454]/5",
    green: "border-[#009B35]/20 bg-[#009B35]/8",
    yellow: "border-[#F3F74B]/70 bg-[#F3F74B]/25",
    white: "border-slate-200 bg-white",
  };

  return (
    <div
      className={`rounded-xl border p-4 shadow-sm ${
        toneClasses[tone] || toneClasses.white
      }`}
    >
      <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">
        {label}
      </p>

      <p className="mt-2 text-2xl font-black text-[#030454]">{value}</p>

      {helper && <p className="mt-1 text-xs text-slate-500">{helper}</p>}
    </div>
  );
}

export default function AuditTrailPanel() {
  const [auditData, setAuditData] = useState(null);
  const [filters, setFilters] = useState({
    search: "",
    action: "",
    limit: "10",
  });
  const [isLoadingState, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const [settledLimit, setSettledLimit] = useState(null);
  const isLoading = isLoadingState || settledLimit !== filters.limit;

  async function loadAuditLogs() {
    setIsLoading(true);
    setError("");

    try {
      const params = {};

      if (filters.search.trim()) params.search = filters.search.trim();
      if (filters.action.trim()) params.action = filters.action.trim();
      if (filters.limit) params.limit = filters.limit;

      const data = await getAuditLogs(params);
      setAuditData(data);
    } catch (err) {
      console.error(err);
      setError(
        err?.response?.data?.detail ||
          err?.response?.data?.message ||
          "Could not load audit logs."
      );
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    const limit = filters.limit;

    const params = {};
    if (filters.search.trim()) params.search = filters.search.trim();
    if (filters.action.trim()) params.action = filters.action.trim();
    if (limit) params.limit = limit;

    getAuditLogs(params)
      .then((data) => {
        if (!cancelled) {
          setAuditData(data);
          setError("");
        }
      })
      .catch((err) => {
        if (!cancelled) {
          console.error(err);
          setError(
            err?.response?.data?.detail ||
              err?.response?.data?.message ||
              "Could not load audit logs."
          );
        }
      })
      .finally(() => {
        if (!cancelled) {
          setSettledLimit(limit);
        }
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.limit]);

  const logs = useMemo(() => auditData?.results || [], [auditData]);
  const summary = auditData?.summary || {};

  const actionOptions = useMemo(() => {
    const values = logs.map((log) => log.action).filter(Boolean);
    return Array.from(new Set(values)).sort();
  }, [logs]);

  function updateFilter(field, value) {
    setFilters((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function handleSearch(event) {
    event.preventDefault();
    loadAuditLogs();
  }

  function resetFilters() {
    setFilters({
      search: "",
      action: "",
      limit: "100",
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
        <div>
          <h2 className="text-2xl font-black tracking-tight text-[#030454]">
            System Action Logs
          </h2>

          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            Review recorded create, update, import and system actions across
            Climate Intelligence, project portfolio, reports and other platform modules.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={loadAuditLogs}
            className="rounded-md bg-[#009B35] px-5 py-3 text-xs font-black uppercase tracking-[0.08em] text-white transition hover:bg-[#00842e]"
          >
            Refresh Logs
          </button>

          <button
            type="button"
            onClick={resetFilters}
            className="rounded-md border border-slate-200 bg-white px-5 py-3 text-xs font-black uppercase tracking-[0.08em] text-[#030454] transition hover:border-[#009B35] hover:text-[#009B35]"
          >
            Reset Filters
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border-l-4 border-red-400 bg-red-50 px-5 py-4 text-sm leading-6 text-red-700">
          <p className="font-black">Audit log error</p>
          <p className="mt-1">{error}</p>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <AuditStatCard
          label="Total Logs"
          value={summary.total_logs || 0}
          helper="All matching audit records."
          tone="blue"
        />

        <AuditStatCard
          label="Returned Logs"
          value={summary.returned_logs || 0}
          helper="Records currently loaded."
          tone="green"
        />

        <AuditStatCard
          label="Date Field"
          value={summary.date_field || "Not detected"}
          helper="Timestamp source detected by the backend."
          tone="yellow"
        />
      </div>

      <form
        onSubmit={handleSearch}
        className="flex flex-wrap gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4"
      >
        <input
          value={filters.search}
          onChange={(event) => updateFilter("search", event.target.value)}
          placeholder="Search action, model, object, IP..."
          className={`${inputClass} min-w-[260px] flex-1`}
        />

        <select
          value={filters.action}
          onChange={(event) => updateFilter("action", event.target.value)}
          className={inputClass}
        >
          <option value="">All actions</option>
          {actionOptions.map((action) => (
            <option key={action} value={action}>
              {action}
            </option>
          ))}
        </select>

        <select
          value={filters.limit}
          onChange={(event) => updateFilter("limit", event.target.value)}
          className={inputClass}
        >
          <option value="5">Latest 5</option>
          <option value="10">Latest 10</option>
          <option value="50">Latest 50</option>
          <option value="100">Latest 100</option>
          <option value="250">Latest 250</option>
          <option value="500">Latest 500</option>
        </select>

        <button
          type="submit"
          className="rounded-md bg-[#030454] px-5 py-3 text-xs font-black uppercase tracking-[0.08em] text-white transition hover:bg-[#02033d]"
        >
          Apply
        </button>
      </form>

      {isLoading ? (
        <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500">
          Loading audit logs...
        </div>
      ) : logs.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-500">
          No audit logs found yet. Create or update a project/report, then
          refresh this panel.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <table className="w-full min-w-[1100px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-slate-500">
                <th className="px-3 py-3 font-bold">Time</th>
                <th className="px-3 py-3 font-bold">User</th>
                <th className="px-3 py-3 font-bold">Action</th>
                <th className="px-3 py-3 font-bold">Model</th>
                <th className="px-3 py-3 font-bold">Object</th>
                <th className="px-3 py-3 font-bold">IP</th>
              </tr>
            </thead>

            <tbody>
              {logs.map((log, index) => {
                const time = pick(log, [
                  "created_at",
                  "timestamp",
                  "created_on",
                  "date_created",
                ]);

                const user = pick(log, [
                  "user_display",
                  "actor_display",
                  "created_by_display",
                  "user",
                  "actor",
                  "created_by",
                ]);

                const model = [
                  pick(log, ["app_label"]),
                  pick(log, ["model_name", "model"]),
                ]
                  .filter(Boolean)
                  .join(" / ");

                const objectText = pick(log, [
                  "object_repr",
                  "object_name",
                  "object_id",
                  "target",
                ]);

                return (
                  <tr
                    key={log.id || index}
                    className="border-b border-slate-100 last:border-0 hover:bg-[#009B35]/5"
                  >
                    <td className="px-3 py-4 text-slate-600">
                      {formatDate(time)}
                    </td>

                    <td className="px-3 py-4 font-bold text-[#030454]">
                      {formatValue(user)}
                    </td>

                    <td className="px-3 py-4">
                      <span
                        className={`rounded-md px-3 py-1 text-xs font-bold ${getActionBadgeClass(
                          log.action
                        )}`}
                      >
                        {formatValue(log.action)}
                      </span>
                    </td>

                    <td className="px-3 py-4 text-slate-600">
                      {model || "—"}
                    </td>

                    <td className="px-3 py-4 text-slate-600">
                      {formatValue(objectText)}
                    </td>

                    <td className="px-3 py-4 text-slate-600">
                      {formatValue(pick(log, ["ip_address", "ip"]))}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="rounded-xl border-l-4 border-[#F3F74B] bg-[#F3F74B]/25 px-5 py-4 text-sm leading-6 text-[#030454]">
        <p className="font-black">Audit note</p>

        <p className="mt-1">
          This panel is read-only. Audit logs should not be edited from the
          frontend. Use them to verify accountability for important system
          actions.
        </p>
      </div>
    </div>
  );
}