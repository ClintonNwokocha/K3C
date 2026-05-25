import { useEffect, useMemo, useState } from "react";
import { getAuditLogs } from "../services/api";

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

export default function AuditTrailPanel() {
  const [auditData, setAuditData] = useState(null);
  const [filters, setFilters] = useState({
    search: "",
    action: "",
    limit: "100",
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

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
    loadAuditLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.limit]);

  const logs = auditData?.results || [];
  const summary = auditData?.summary || {};

  const actionOptions = useMemo(() => {
    const values = logs
      .map((log) => log.action)
      .filter(Boolean);

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

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-5 flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
        <div>
          <p className="text-sm font-medium text-emerald-700">Audit Trail</p>
          <h2 className="mt-1 text-2xl font-bold">System Action Logs</h2>
          <p className="mt-2 max-w-3xl text-sm text-slate-500">
            Review recorded create/update/import actions across climate risk,
            project portfolio, reports and other system modules.
          </p>
        </div>

        <button
          type="button"
          onClick={loadAuditLogs}
          className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          Refresh Logs
        </button>
      </div>

      {error && (
        <div className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="mb-5 grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl bg-slate-50 p-4">
          <p className="text-sm text-slate-500">Total Logs</p>
          <p className="mt-2 text-2xl font-bold">{summary.total_logs || 0}</p>
        </div>

        <div className="rounded-2xl bg-blue-50 p-4">
          <p className="text-sm text-blue-700">Returned Logs</p>
          <p className="mt-2 text-2xl font-bold text-blue-700">
            {summary.returned_logs || 0}
          </p>
        </div>

        <div className="rounded-2xl bg-emerald-50 p-4">
          <p className="text-sm text-emerald-700">Date Field</p>
          <p className="mt-2 text-lg font-bold text-emerald-700">
            {summary.date_field || "Not detected"}
          </p>
        </div>
      </div>

      <form
        onSubmit={handleSearch}
        className="mb-5 flex flex-wrap gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4"
      >
        <input
          value={filters.search}
          onChange={(event) => updateFilter("search", event.target.value)}
          placeholder="Search action, model, object, IP..."
          className="min-w-[260px] rounded-xl border border-slate-300 px-4 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
        />

        <select
          value={filters.action}
          onChange={(event) => updateFilter("action", event.target.value)}
          className="rounded-xl border border-slate-300 px-4 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
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
          className="rounded-xl border border-slate-300 px-4 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
        >
          <option value="50">Latest 50</option>
          <option value="100">Latest 100</option>
          <option value="250">Latest 250</option>
          <option value="500">Latest 500</option>
        </select>

        <button
          type="submit"
          className="rounded-xl bg-emerald-600 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
        >
          Apply
        </button>
      </form>

      {isLoading ? (
        <p className="text-sm text-slate-500">Loading audit logs...</p>
      ) : logs.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6 text-sm text-slate-500">
          No audit logs found yet. Create or update a project/report, then
          refresh this panel.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="px-3 py-3 font-medium">Time</th>
                <th className="px-3 py-3 font-medium">User</th>
                <th className="px-3 py-3 font-medium">Action</th>
                <th className="px-3 py-3 font-medium">Model</th>
                <th className="px-3 py-3 font-medium">Object</th>
                <th className="px-3 py-3 font-medium">IP</th>
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
                    className="border-b border-slate-100 last:border-0"
                  >
                    <td className="px-3 py-4">{formatDate(time)}</td>
                    <td className="px-3 py-4">{formatValue(user)}</td>
                    <td className="px-3 py-4">
                      <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                        {formatValue(log.action)}
                      </span>
                    </td>
                    <td className="px-3 py-4">{model || "—"}</td>
                    <td className="px-3 py-4">{formatValue(objectText)}</td>
                    <td className="px-3 py-4">
                      {formatValue(pick(log, ["ip_address", "ip"]))}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
        <p className="font-bold">Audit note</p>
        <p className="mt-1">
          This panel is read-only. Audit logs should not be edited from the
          frontend. Use them to verify accountability for important system
          actions.
        </p>
      </div>
    </section>
  );
}