import { useEffect, useMemo, useState } from "react";
import {
  createReportDocument,
  getReportDocuments,
  updateReportDocument,
} from "../services/api";

const reportTypeOptions = [
  { value: "climate_risk", label: "Climate Risk Report" },
  { value: "ghg_inventory", label: "GHG Inventory Report" },
  { value: "project_portfolio", label: "Project Portfolio Report" },
  { value: "ndc_progress", label: "NDC Progress Report" },
  { value: "executive_brief", label: "Executive Brief" },
  { value: "data_export", label: "Data Export" },
  { value: "other", label: "Other" },
];

const statusOptions = [
  { value: "draft", label: "Draft" },
  { value: "review", label: "Under Review" },
  { value: "approved", label: "Approved" },
  { value: "published", label: "Published" },
  { value: "archived", label: "Archived" },
];

const sourceModuleOptions = [
  { value: "climate_risk", label: "Climate Risk" },
  { value: "ghg_inventory", label: "GHG Inventory" },
  { value: "project_portfolio", label: "Project Portfolio" },
  { value: "executive_dashboard", label: "Executive Dashboard" },
  { value: "administration", label: "Administration" },
  { value: "other", label: "Other" },
];

const initialForm = {
  title: "",
  report_type: "other",
  status: "draft",
  reporting_year: "",
  description: "",
  source_module: "",
  is_public: false,
  notes: "",
};

function formatNumber(value, maximumFractionDigits = 0) {
  return Number(value || 0).toLocaleString(undefined, {
    maximumFractionDigits,
  });
}

function getOptionLabel(options, value) {
  return options.find((item) => item.value === value)?.label || value || "—";
}

function getStatusClass(status) {
  if (status === "published") return "bg-emerald-50 text-emerald-700";
  if (status === "approved") return "bg-blue-50 text-blue-700";
  if (status === "review") return "bg-amber-50 text-amber-700";
  if (status === "archived") return "bg-slate-100 text-slate-600";
  return "bg-slate-50 text-slate-700";
}

function getTypeClass(type) {
  if (type === "climate_risk") return "bg-green-50 text-green-700";
  if (type === "ghg_inventory") return "bg-purple-50 text-purple-700";
  if (type === "project_portfolio") return "bg-blue-50 text-blue-700";
  if (type === "ndc_progress") return "bg-orange-50 text-orange-700";
  if (type === "executive_brief") return "bg-indigo-50 text-indigo-700";
  if (type === "data_export") return "bg-cyan-50 text-cyan-700";
  return "bg-slate-100 text-slate-700";
}

function buildFormFromReport(report) {
  return {
    title: report.title || "",
    report_type: report.report_type || "other",
    status: report.status || "draft",
    reporting_year: report.reporting_year ? String(report.reporting_year) : "",
    description: report.description || "",
    source_module: report.source_module || "",
    is_public: Boolean(report.is_public),
    notes: report.notes || "",
  };
}

function appendIfPresent(formData, key, value) {
  if (value !== null && value !== undefined && value !== "") {
    formData.append(key, value);
  }
}

export default function ReportsCentrePage({ currentUser }) {
  const [reportsData, setReportsData] = useState(null);
  const [form, setForm] = useState(initialForm);
  const [selectedFile, setSelectedFile] = useState(null);
  const [editingReport, setEditingReport] = useState(null);
  const [selectedReport, setSelectedReport] = useState(null);

  const [filters, setFilters] = useState({
    report_type: "all",
    status: "all",
    reporting_year: "",
    source_module: "all",
    is_public: "all",
    search: "",
  });

  const [showForm, setShowForm] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const canManage =
    currentUser?.is_superuser ||
    ["admin", "analyst"].includes(currentUser?.profile?.role);

  async function loadReports() {
    setIsLoading(true);
    setError("");

    try {
      const params = {};

      Object.entries(filters).forEach(([key, value]) => {
        if (value && value !== "all") {
          params[key] = value;
        }
      });

      const data = await getReportDocuments(params);
      setReportsData(data);

      if (selectedReport) {
        const refreshedReport = (data.results || []).find(
          (report) => report.id === selectedReport.id
        );

        setSelectedReport(refreshedReport || null);
      }
    } catch (err) {
      console.error(err);
      setError("Could not load reports.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadReports();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    filters.report_type,
    filters.status,
    filters.reporting_year,
    filters.source_module,
    filters.is_public,
  ]);

  const reports = reportsData?.results || [];
  const summary = reportsData?.summary || {};

  const filteredReports = useMemo(() => {
    const search = filters.search.trim().toLowerCase();

    if (!search) return reports;

    return reports.filter((report) => {
      return (
        String(report.title || "").toLowerCase().includes(search) ||
        String(report.description || "").toLowerCase().includes(search) ||
        String(report.source_module || "").toLowerCase().includes(search) ||
        String(report.notes || "").toLowerCase().includes(search)
      );
    });
  }, [reports, filters.search]);

  function updateFilter(field, value) {
    setFilters((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function updateForm(field, value) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function resetForm() {
    setForm(initialForm);
    setSelectedFile(null);
    setEditingReport(null);
    setShowForm(false);

    const input = document.getElementById("report-file-input");
    if (input) {
      input.value = "";
    }
  }

  function handleEditReport(report) {
    setEditingReport(report);
    setSelectedReport(report);
    setForm(buildFormFromReport(report));
    setSelectedFile(null);
    setShowForm(true);
    setMessage("");
    setError("");

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }

  function handleViewReport(report) {
    setSelectedReport(report);
  }

  function buildPayload() {
    const formData = new FormData();

    formData.append("title", form.title);
    formData.append("report_type", form.report_type);
    formData.append("status", form.status);
    formData.append("description", form.description || "");
    formData.append("source_module", form.source_module || "");
    formData.append("is_public", form.is_public ? "true" : "false");
    formData.append("is_active", "true");
    formData.append("notes", form.notes || "");

    appendIfPresent(formData, "reporting_year", form.reporting_year);

    if (selectedFile) {
      formData.append("file", selectedFile);
    }

    return formData;
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (!canManage) return;

    setIsSaving(true);
    setMessage("");
    setError("");

    try {
      const payload = buildPayload();

      if (editingReport) {
        const result = await updateReportDocument(editingReport.id, payload);
        setMessage("Report updated successfully.");
        setSelectedReport(result.report);
      } else {
        const result = await createReportDocument(payload);
        setMessage("Report created successfully.");
        setSelectedReport(result.report);
      }

      resetForm();
      await loadReports();
    } catch (err) {
      console.error(err);
      setError(
        err?.response?.data
          ? JSON.stringify(err.response.data)
          : editingReport
            ? "Could not update report."
            : "Could not create report."
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
        <div>
          <p className="text-sm font-medium text-emerald-700">
            Reports Centre
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight">
            Reports Centre
          </h1>
          <p className="mt-2 max-w-3xl text-slate-600">
            Store, manage, review and publish climate risk reports, GHG
            inventory outputs, project portfolio reports, NDC progress reports,
            executive briefs and exported datasets.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={loadReports}
            className="rounded-full border border-slate-200 bg-white px-5 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
          >
            Refresh reports
          </button>

          {canManage && (
            <button
              type="button"
              onClick={() => {
                if (showForm && !editingReport) {
                  setShowForm(false);
                  return;
                }

                setEditingReport(null);
                setForm(initialForm);
                setSelectedFile(null);
                setShowForm(true);
              }}
              className="rounded-full bg-emerald-600 px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700"
            >
              {showForm && !editingReport ? "Hide Form" : "Add Report"}
            </button>
          )}
        </div>
      </section>

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {message && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
          {message}
        </div>
      )}

      <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-sm text-slate-500">Total Reports</p>
          <h2 className="mt-3 text-3xl font-bold">
            {summary.total_reports || 0}
          </h2>
          <p className="mt-2 text-sm text-slate-500">
            Active report records.
          </p>
        </div>

        <div className="rounded-2xl border border-blue-200 bg-blue-50 p-6 shadow-sm">
          <p className="text-sm text-blue-700">Approved Reports</p>
          <h2 className="mt-3 text-3xl font-bold text-blue-700">
            {summary.approved_reports || 0}
          </h2>
          <p className="mt-2 text-sm text-blue-700">
            Reports approved for use.
          </p>
        </div>

        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 shadow-sm">
          <p className="text-sm text-emerald-700">Published Reports</p>
          <h2 className="mt-3 text-3xl font-bold text-emerald-700">
            {summary.published_reports || 0}
          </h2>
          <p className="mt-2 text-sm text-emerald-700">
            Reports marked as published.
          </p>
        </div>

        <div className="rounded-2xl border border-orange-200 bg-orange-50 p-6 shadow-sm">
          <p className="text-sm text-orange-700">Public Reports</p>
          <h2 className="mt-3 text-3xl font-bold text-orange-700">
            {summary.public_reports || 0}
          </h2>
          <p className="mt-2 text-sm text-orange-700">
            Visible for public-facing use.
          </p>
        </div>
      </section>

      {canManage && showForm && (
        <form
          onSubmit={handleSubmit}
          className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
        >
          <div className="mb-5 flex flex-col justify-between gap-3 md:flex-row md:items-start">
            <div>
              <h2 className="text-lg font-bold">
                {editingReport ? "Edit Report" : "Create Report"}
              </h2>
              <p className="text-sm text-slate-500">
                {editingReport
                  ? "Update report metadata, status, visibility or uploaded file."
                  : "Create a report record and optionally attach a file."}
              </p>
            </div>

            {editingReport && (
              <button
                type="button"
                onClick={resetForm}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel Editing
              </button>
            )}
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div className="md:col-span-2">
              <label className="mb-2 block text-sm font-medium text-slate-700">
                Report Title
              </label>
              <input
                value={form.title}
                onChange={(event) => updateForm("title", event.target.value)}
                className="w-full rounded-xl border border-slate-300 px-4 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                placeholder="Example: Kaduna Climate Risk Brief 2026"
                required
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                Reporting Year
              </label>
              <input
                type="number"
                value={form.reporting_year}
                onChange={(event) =>
                  updateForm("reporting_year", event.target.value)
                }
                className="w-full rounded-xl border border-slate-300 px-4 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                placeholder="2026"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                Report Type
              </label>
              <select
                value={form.report_type}
                onChange={(event) =>
                  updateForm("report_type", event.target.value)
                }
                className="w-full rounded-xl border border-slate-300 px-4 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
              >
                {reportTypeOptions.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                Status
              </label>
              <select
                value={form.status}
                onChange={(event) => updateForm("status", event.target.value)}
                className="w-full rounded-xl border border-slate-300 px-4 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
              >
                {statusOptions.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                Source Module
              </label>
              <select
                value={form.source_module}
                onChange={(event) =>
                  updateForm("source_module", event.target.value)
                }
                className="w-full rounded-xl border border-slate-300 px-4 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
              >
                <option value="">Not specified</option>
                {sourceModuleOptions.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="md:col-span-3">
              <label className="mb-2 block text-sm font-medium text-slate-700">
                Upload File
              </label>
              <input
                id="report-file-input"
                type="file"
                onChange={(event) =>
                  setSelectedFile(event.target.files?.[0] || null)
                }
                className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
              />

              {editingReport?.file_url && !selectedFile && (
                <p className="mt-2 text-xs text-slate-500">
                  Current file:{" "}
                  <a
                    href={editingReport.file_url}
                    target="_blank"
                    rel="noreferrer"
                    className="font-semibold text-blue-700 hover:underline"
                  >
                    Open existing file
                  </a>
                </p>
              )}
            </div>

            <div className="md:col-span-3">
              <label className="mb-2 block text-sm font-medium text-slate-700">
                Description
              </label>
              <textarea
                rows="3"
                value={form.description}
                onChange={(event) =>
                  updateForm("description", event.target.value)
                }
                className="w-full rounded-xl border border-slate-300 px-4 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                placeholder="Describe what this report contains..."
              />
            </div>

            <div className="md:col-span-3">
              <label className="mb-2 block text-sm font-medium text-slate-700">
                Notes
              </label>
              <textarea
                rows="2"
                value={form.notes}
                onChange={(event) => updateForm("notes", event.target.value)}
                className="w-full rounded-xl border border-slate-300 px-4 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                placeholder="Internal notes, assumptions, approval comments..."
              />
            </div>

            <div className="md:col-span-3">
              <label className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={form.is_public}
                  onChange={(event) =>
                    updateForm("is_public", event.target.checked)
                  }
                  className="h-4 w-4"
                />
                Mark as public-facing report
              </label>
            </div>
          </div>

          <button
            type="submit"
            disabled={isSaving}
            className="mt-5 rounded-xl bg-emerald-600 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-400"
          >
            {isSaving
              ? "Saving..."
              : editingReport
                ? "Update Report"
                : "Save Report"}
          </button>
        </form>
      )}

      {selectedReport && (
        <section className="rounded-2xl border border-blue-200 bg-blue-50 p-6 text-blue-900 shadow-sm">
          <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
            <div>
              <p className="text-sm font-medium">Selected Report</p>
              <h2 className="mt-1 text-2xl font-bold">
                {selectedReport.title}
              </h2>
              <p className="mt-2 text-sm">
                {selectedReport.description || "No description provided."}
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              {selectedReport.file_url && (
                <a
                  href={selectedReport.file_url}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
                >
                  Open File
                </a>
              )}

              {canManage && (
                <button
                  type="button"
                  onClick={() => handleEditReport(selectedReport)}
                  className="rounded-xl border border-blue-200 bg-white px-4 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50"
                >
                  Edit Report
                </button>
              )}
            </div>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-4">
            <div className="rounded-xl bg-white p-4">
              <p className="text-xs text-blue-700">Type</p>
              <p className="mt-1 font-bold">
                {selectedReport.report_type_display ||
                  getOptionLabel(reportTypeOptions, selectedReport.report_type)}
              </p>
            </div>

            <div className="rounded-xl bg-white p-4">
              <p className="text-xs text-blue-700">Status</p>
              <p className="mt-1 font-bold">
                {selectedReport.status_display ||
                  getOptionLabel(statusOptions, selectedReport.status)}
              </p>
            </div>

            <div className="rounded-xl bg-white p-4">
              <p className="text-xs text-blue-700">Year</p>
              <p className="mt-1 font-bold">
                {selectedReport.reporting_year || "—"}
              </p>
            </div>

            <div className="rounded-xl bg-white p-4">
              <p className="text-xs text-blue-700">Visibility</p>
              <p className="mt-1 font-bold">
                {selectedReport.is_public ? "Public" : "Internal"}
              </p>
            </div>
          </div>

          {selectedReport.notes && (
            <div className="mt-4 rounded-xl bg-white p-4 text-sm">
              <p className="font-semibold">Notes</p>
              <p className="mt-1">{selectedReport.notes}</p>
            </div>
          )}
        </section>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-5 flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
          <div>
            <h2 className="text-lg font-bold">Report Register</h2>
            <p className="text-sm text-slate-500">
              Filter, view, edit and open uploaded report documents.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <select
              value={filters.report_type}
              onChange={(event) =>
                updateFilter("report_type", event.target.value)
              }
              className="rounded-xl border border-slate-300 px-4 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
            >
              <option value="all">All report types</option>
              {reportTypeOptions.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>

            <select
              value={filters.status}
              onChange={(event) => updateFilter("status", event.target.value)}
              className="rounded-xl border border-slate-300 px-4 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
            >
              <option value="all">All statuses</option>
              {statusOptions.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>

            <input
              type="number"
              value={filters.reporting_year}
              onChange={(event) =>
                updateFilter("reporting_year", event.target.value)
              }
              placeholder="Year"
              className="w-28 rounded-xl border border-slate-300 px-4 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
            />

            <select
              value={filters.source_module}
              onChange={(event) =>
                updateFilter("source_module", event.target.value)
              }
              className="rounded-xl border border-slate-300 px-4 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
            >
              <option value="all">All modules</option>
              {sourceModuleOptions.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>

            <select
              value={filters.is_public}
              onChange={(event) => updateFilter("is_public", event.target.value)}
              className="rounded-xl border border-slate-300 px-4 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
            >
              <option value="all">All visibility</option>
              <option value="true">Public</option>
              <option value="false">Internal</option>
            </select>

            <input
              value={filters.search}
              onChange={(event) => updateFilter("search", event.target.value)}
              placeholder="Search reports..."
              className="rounded-xl border border-slate-300 px-4 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
            />
          </div>
        </div>

        {isLoading ? (
          <p className="text-sm text-slate-500">Loading reports...</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1150px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="px-3 py-3 font-medium">Report</th>
                  <th className="px-3 py-3 font-medium">Type</th>
                  <th className="px-3 py-3 font-medium">Status</th>
                  <th className="px-3 py-3 font-medium">Year</th>
                  <th className="px-3 py-3 font-medium">Module</th>
                  <th className="px-3 py-3 font-medium">Visibility</th>
                  <th className="px-3 py-3 font-medium">Generated By</th>
                  <th className="px-3 py-3 font-medium">File</th>
                  <th className="px-3 py-3 font-medium">Actions</th>
                </tr>
              </thead>

              <tbody>
                {filteredReports.map((report) => (
                  <tr
                    key={report.id}
                    className={`border-b border-slate-100 last:border-0 ${
                      selectedReport?.id === report.id ? "bg-blue-50" : ""
                    }`}
                  >
                    <td className="px-3 py-4">
                      <p className="font-semibold">{report.title}</p>
                      <p className="text-xs text-slate-400">
                        {report.description || "No description"}
                      </p>
                    </td>

                    <td className="px-3 py-4">
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-semibold ${getTypeClass(
                          report.report_type
                        )}`}
                      >
                        {report.report_type_display ||
                          getOptionLabel(reportTypeOptions, report.report_type)}
                      </span>
                    </td>

                    <td className="px-3 py-4">
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-semibold ${getStatusClass(
                          report.status
                        )}`}
                      >
                        {report.status_display ||
                          getOptionLabel(statusOptions, report.status)}
                      </span>
                    </td>

                    <td className="px-3 py-4">
                      {report.reporting_year || "—"}
                    </td>

                    <td className="px-3 py-4">
                      {report.source_module || "—"}
                    </td>

                    <td className="px-3 py-4">
                      {report.is_public ? (
                        <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                          Public
                        </span>
                      ) : (
                        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                          Internal
                        </span>
                      )}
                    </td>

                    <td className="px-3 py-4">
                      {report.generated_by_name || "—"}
                    </td>

                    <td className="px-3 py-4">
                      {report.file_url ? (
                        <a
                          href={report.file_url}
                          target="_blank"
                          rel="noreferrer"
                          className="font-semibold text-blue-700 hover:underline"
                        >
                          Open file
                        </a>
                      ) : (
                        <span className="text-slate-400">No file</span>
                      )}
                    </td>

                    <td className="px-3 py-4">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => handleViewReport(report)}
                          className="rounded-lg border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                        >
                          View
                        </button>

                        {canManage && (
                          <button
                            type="button"
                            onClick={() => handleEditReport(report)}
                            className="rounded-lg bg-emerald-600 px-3 py-1 text-xs font-semibold text-white hover:bg-emerald-700"
                          >
                            Edit
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}

                {filteredReports.length === 0 && (
                  <tr>
                    <td
                      colSpan="9"
                      className="px-3 py-8 text-center text-slate-500"
                    >
                      No reports found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-800">
        <p className="font-bold">Reports Centre Note</p>
        <p className="mt-2">
          This page stores report files and metadata. Automated PDF generation
          will come later. For now, upload already prepared PDFs, Word files,
          Excel outputs, CSV exports, or briefing documents.
        </p>
      </section>
    </div>
  );
}