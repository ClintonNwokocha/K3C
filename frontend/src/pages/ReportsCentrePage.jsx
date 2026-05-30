import ReportsCentreExportPanel from "../components/ReportsCentreExportPanel";
import {
  CommandButton,
  CommandNotice,
  CommandPageHeader,
  CommandSection,
  CommandStatCard,
  CommandTabs,
} from "../components/CommandUI";
import { canManageReports } from "../utils/permissions";
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

const baseTabs = [
  { key: "overview", label: "Overview" },
  { key: "register", label: "Report Register" },
  { key: "export", label: "Export" },
];

const formTab = { key: "form", label: "Add / Edit Report" };

const inputClass =
  "w-full rounded-md border border-[#CAD2D7] bg-white px-4 py-3 text-sm outline-none focus:border-[#2292A4] focus:ring-2 focus:ring-[#2292A4]/10";

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
  if (type === "climate_risk") return "bg-[#2292A4]/10 text-[#214560]";
  if (type === "ghg_inventory") return "bg-[#4E7492]/10 text-[#214560]";
  if (type === "project_portfolio") return "bg-[#C8A84A]/15 text-[#0B1726]";
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

function ReportSummaryCards({ summary }) {
  return (
    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <CommandStatCard
        label="Total Reports"
        value={summary.total_reports || 0}
        helper="Active report records."
        tone="blue"
      />

      <CommandStatCard
        label="Approved Reports"
        value={summary.approved_reports || 0}
        helper="Reports approved for official use."
        tone="navy"
      />

      <CommandStatCard
        label="Published Reports"
        value={summary.published_reports || 0}
        helper="Reports marked as published."
        tone="teal"
      />

      <CommandStatCard
        label="Public Reports"
        value={summary.public_reports || 0}
        helper="Visible for public-facing use."
        tone="gold"
      />
    </section>
  );
}

function StatusBreakdown({ reports, setActiveTab, updateFilter }) {
  const statusCounts = useMemo(() => {
    return statusOptions.reduce((counts, item) => {
      counts[item.value] = reports.filter(
        (report) => report.status === item.value
      ).length;
      return counts;
    }, {});
  }, [reports]);

  function openStatus(status) {
    updateFilter("status", status);
    setActiveTab("register");
  }

  return (
    <CommandSection
      eyebrow="Report workflow"
      title="Publication status overview"
      description="Track report records from draft through review, approval, publication and archiving."
    >
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {statusOptions.map((item) => (
          <button
            key={item.value}
            type="button"
            onClick={() => openStatus(item.value)}
            className="rounded-xl border border-[#CAD2D7] bg-white p-4 text-left transition hover:border-[#4E7492]/60 hover:bg-[#DFE3E4]/35"
          >
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">
              {item.label}
            </p>

            <p className="mt-2 text-2xl font-black text-[#0B1726]">
              {statusCounts[item.value] || 0}
            </p>
          </button>
        ))}
      </div>
    </CommandSection>
  );
}

function SelectedReportDetail({
  selectedReport,
  canManage,
  onEditReport,
  onClear,
}) {
  if (!selectedReport) {
    return (
      <CommandSection
        eyebrow="Selected report"
        title="No report selected"
        description="Click View on any report in the register to inspect report metadata, file link, publication status and visibility."
      >
        <div className="rounded-xl border border-dashed border-[#CAD2D7] bg-[#DFE3E4]/35 p-5 text-sm text-slate-500">
          Report details will appear here after selection.
        </div>
      </CommandSection>
    );
  }

  return (
    <CommandSection
      eyebrow="Selected report"
      title={selectedReport.title}
      description={selectedReport.description || "No description provided."}
      actions={
        <div className="flex flex-wrap gap-3">
          {selectedReport.file_url && (
            <a
              href={selectedReport.file_url}
              target="_blank"
              rel="noreferrer"
              className="rounded-md bg-[#214560] px-5 py-3 text-xs font-black uppercase tracking-[0.08em] text-white transition hover:bg-[#19384f]"
            >
              Open File
            </a>
          )}

          {canManage && (
            <CommandButton
              variant="primary"
              onClick={() => onEditReport(selectedReport)}
            >
              Edit Report
            </CommandButton>
          )}

          <CommandButton variant="outline" onClick={onClear}>
            Clear Selection
          </CommandButton>
        </div>
      }
    >
      <div className="grid gap-4 md:grid-cols-4">
        <div className="rounded-xl border border-[#CAD2D7] bg-[#DFE3E4]/35 p-4">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">
            Type
          </p>
          <p className="mt-2 font-black text-[#0B1726]">
            {selectedReport.report_type_display ||
              getOptionLabel(reportTypeOptions, selectedReport.report_type)}
          </p>
        </div>

        <div className="rounded-xl border border-[#CAD2D7] bg-[#DFE3E4]/35 p-4">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">
            Status
          </p>
          <p className="mt-2 font-black text-[#0B1726]">
            {selectedReport.status_display ||
              getOptionLabel(statusOptions, selectedReport.status)}
          </p>
        </div>

        <div className="rounded-xl border border-[#CAD2D7] bg-[#DFE3E4]/35 p-4">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">
            Year
          </p>
          <p className="mt-2 font-black text-[#0B1726]">
            {selectedReport.reporting_year || "—"}
          </p>
        </div>

        <div className="rounded-xl border border-[#CAD2D7] bg-[#DFE3E4]/35 p-4">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">
            Visibility
          </p>
          <p className="mt-2 font-black text-[#0B1726]">
            {selectedReport.is_public ? "Public" : "Internal"}
          </p>
        </div>

        <div className="rounded-xl border border-[#CAD2D7] bg-white p-4 md:col-span-2">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">
            Source Module
          </p>
          <p className="mt-2 font-black text-[#0B1726]">
            {selectedReport.source_module || "Not specified"}
          </p>
        </div>

        <div className="rounded-xl border border-[#CAD2D7] bg-white p-4 md:col-span-2">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">
            Generated By
          </p>
          <p className="mt-2 font-black text-[#0B1726]">
            {selectedReport.generated_by_name || "—"}
          </p>
        </div>
      </div>

      {selectedReport.notes && (
        <div className="mt-5 rounded-xl border border-[#CAD2D7] bg-white p-4 text-sm">
          <p className="font-black text-[#0B1726]">Internal Notes</p>
          <p className="mt-2 leading-6 text-slate-600">
            {selectedReport.notes}
          </p>
        </div>
      )}
    </CommandSection>
  );
}

function ReportFormSection({
  form,
  updateForm,
  selectedFile,
  setSelectedFile,
  editingReport,
  canManage,
  isSaving,
  onSubmit,
  onCancel,
}) {
  if (!canManage) {
    return (
      <CommandNotice title="Access restricted" tone="gold">
        You do not have permission to create or edit report records.
      </CommandNotice>
    );
  }

  return (
    <form onSubmit={onSubmit}>
      <CommandSection
        eyebrow={editingReport ? "Edit report" : "Create report"}
        title={editingReport ? "Edit Report Document" : "Create Report Document"}
        description={
          editingReport
            ? "Update report metadata, file attachment, visibility or publication status."
            : "Create a report record and optionally attach a PDF, Word document, spreadsheet, CSV export or briefing file."
        }
        actions={
          <CommandButton variant="outline" onClick={onCancel}>
            Cancel
          </CommandButton>
        }
      >
        <div className="grid gap-4 md:grid-cols-3">
          <div className="md:col-span-2">
            <label className="mb-2 block text-sm font-bold text-[#0B1726]">
              Report Title
            </label>
            <input
              value={form.title}
              onChange={(event) => updateForm("title", event.target.value)}
              className={inputClass}
              placeholder="Example: Kaduna Climate Risk Brief 2026"
              required
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-bold text-[#0B1726]">
              Reporting Year
            </label>
            <input
              type="number"
              value={form.reporting_year}
              onChange={(event) =>
                updateForm("reporting_year", event.target.value)
              }
              className={inputClass}
              placeholder="2026"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-bold text-[#0B1726]">
              Report Type
            </label>
            <select
              value={form.report_type}
              onChange={(event) =>
                updateForm("report_type", event.target.value)
              }
              className={inputClass}
            >
              {reportTypeOptions.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-2 block text-sm font-bold text-[#0B1726]">
              Status
            </label>
            <select
              value={form.status}
              onChange={(event) => updateForm("status", event.target.value)}
              className={inputClass}
            >
              {statusOptions.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-2 block text-sm font-bold text-[#0B1726]">
              Source Module
            </label>
            <select
              value={form.source_module}
              onChange={(event) =>
                updateForm("source_module", event.target.value)
              }
              className={inputClass}
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
            <label className="mb-2 block text-sm font-bold text-[#0B1726]">
              Upload File
            </label>
            <input
              id="report-file-input"
              type="file"
              onChange={(event) =>
                setSelectedFile(event.target.files?.[0] || null)
              }
              className={inputClass}
            />

            {selectedFile && (
              <p className="mt-2 text-xs text-slate-500">
                Selected file:{" "}
                <span className="font-bold text-[#0B1726]">
                  {selectedFile.name}
                </span>
              </p>
            )}

            {editingReport?.file_url && !selectedFile && (
              <p className="mt-2 text-xs text-slate-500">
                Current file:{" "}
                <a
                  href={editingReport.file_url}
                  target="_blank"
                  rel="noreferrer"
                  className="font-bold text-[#214560] hover:text-[#2292A4]"
                >
                  Open existing file
                </a>
              </p>
            )}
          </div>

          <div className="md:col-span-3">
            <label className="mb-2 block text-sm font-bold text-[#0B1726]">
              Description
            </label>
            <textarea
              rows="3"
              value={form.description}
              onChange={(event) =>
                updateForm("description", event.target.value)
              }
              className={inputClass}
              placeholder="Describe what this report contains..."
            />
          </div>

          <div className="md:col-span-3">
            <label className="mb-2 block text-sm font-bold text-[#0B1726]">
              Notes
            </label>
            <textarea
              rows="2"
              value={form.notes}
              onChange={(event) => updateForm("notes", event.target.value)}
              className={inputClass}
              placeholder="Internal notes, assumptions, review comments or approval notes..."
            />
          </div>

          <div className="md:col-span-3">
            <label className="flex items-center gap-3 rounded-xl border border-[#CAD2D7] bg-[#DFE3E4]/35 px-4 py-3 text-sm text-slate-700">
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

        <div className="mt-6 flex flex-wrap gap-3">
          <CommandButton type="submit" disabled={isSaving}>
            {isSaving
              ? "Saving..."
              : editingReport
                ? "Update Report"
                : "Save Report"}
          </CommandButton>

          <CommandButton variant="outline" onClick={onCancel}>
            Cancel
          </CommandButton>
        </div>
      </CommandSection>
    </form>
  );
}

function ReportRegisterSection({
  filters,
  updateFilter,
  filteredReports,
  selectedReport,
  isLoading,
  canManage,
  onViewReport,
  onEditReport,
}) {
  return (
    <CommandSection
      eyebrow="Report records"
      title="Report Register"
      description="Filter, inspect, edit and open uploaded report documents."
      actions={
        <div className="grid w-full gap-3 md:grid-cols-2 xl:grid-cols-6">
          <select
            value={filters.report_type}
            onChange={(event) =>
              updateFilter("report_type", event.target.value)
            }
            className={inputClass}
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
            className={inputClass}
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
            className={inputClass}
          />

          <select
            value={filters.source_module}
            onChange={(event) =>
              updateFilter("source_module", event.target.value)
            }
            className={inputClass}
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
            className={inputClass}
          >
            <option value="all">All visibility</option>
            <option value="true">Public</option>
            <option value="false">Internal</option>
          </select>

          <input
            value={filters.search}
            onChange={(event) => updateFilter("search", event.target.value)}
            placeholder="Search reports..."
            className={inputClass}
          />
        </div>
      }
    >
      {isLoading ? (
        <p className="text-sm text-slate-500">Loading reports...</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1250px] text-left text-sm">
            <thead>
              <tr className="border-b border-[#CAD2D7] text-slate-500">
                <th className="px-3 py-3 font-bold">Report</th>
                <th className="px-3 py-3 font-bold">Type</th>
                <th className="px-3 py-3 font-bold">Status</th>
                <th className="px-3 py-3 font-bold">Year</th>
                <th className="px-3 py-3 font-bold">Module</th>
                <th className="px-3 py-3 font-bold">Visibility</th>
                <th className="px-3 py-3 font-bold">Generated By</th>
                <th className="px-3 py-3 font-bold">File</th>
                <th className="px-3 py-3 font-bold">Actions</th>
              </tr>
            </thead>

            <tbody>
              {filteredReports.map((report) => (
                <tr
                  key={report.id}
                  className={`border-b border-[#E6EAEC] last:border-0 hover:bg-[#DFE3E4]/35 ${
                    selectedReport?.id === report.id ? "bg-[#2292A4]/10" : ""
                  }`}
                >
                  <td className="px-3 py-4">
                    <p className="font-black text-[#0B1726]">{report.title}</p>
                    <p className="mt-1 line-clamp-2 text-xs text-slate-400">
                      {report.description || "No description"}
                    </p>
                  </td>

                  <td className="px-3 py-4">
                    <span
                      className={`rounded-md px-3 py-1 text-xs font-bold ${getTypeClass(
                        report.report_type
                      )}`}
                    >
                      {report.report_type_display ||
                        getOptionLabel(reportTypeOptions, report.report_type)}
                    </span>
                  </td>

                  <td className="px-3 py-4">
                    <span
                      className={`rounded-md px-3 py-1 text-xs font-bold ${getStatusClass(
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
                      <span className="rounded-md bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">
                        Public
                      </span>
                    ) : (
                      <span className="rounded-md bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">
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
                        className="font-bold text-[#214560] hover:text-[#2292A4]"
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
                        onClick={() => onViewReport(report)}
                        className="rounded-md border border-[#CAD2D7] px-3 py-1 text-xs font-bold text-[#214560] hover:border-[#2292A4] hover:text-[#2292A4]"
                      >
                        View
                      </button>

                      {canManage && (
                        <button
                          type="button"
                          onClick={() => onEditReport(report)}
                          className="rounded-md bg-[#2292A4] px-3 py-1 text-xs font-bold text-white hover:bg-[#1d7f90]"
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
                    colSpan={9}
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
    </CommandSection>
  );
}

export default function ReportsCentrePage({ currentUser }) {
  const [reportsData, setReportsData] = useState(null);
  const [form, setForm] = useState(initialForm);
  const [selectedFile, setSelectedFile] = useState(null);
  const [editingReport, setEditingReport] = useState(null);
  const [selectedReport, setSelectedReport] = useState(null);
  const [activeTab, setActiveTab] = useState("overview");

  const [filters, setFilters] = useState({
    report_type: "all",
    status: "all",
    reporting_year: "",
    source_module: "all",
    is_public: "all",
    search: "",
  });

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const canManage = canManageReports(currentUser);

  const tabs = useMemo(() => {
    return canManage ? [...baseTabs, formTab] : baseTabs;
  }, [canManage]);

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

      delete params.search;

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

    const input = document.getElementById("report-file-input");
    if (input) {
      input.value = "";
    }
  }

  function startCreateReport() {
    resetForm();
    setMessage("");
    setError("");
    setActiveTab("form");
  }

  function handleEditReport(report) {
    setEditingReport(report);
    setSelectedReport(report);
    setForm(buildFormFromReport(report));
    setSelectedFile(null);
    setMessage("");
    setError("");
    setActiveTab("form");

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }

  function handleViewReport(report) {
    setSelectedReport(report);
    setActiveTab("overview");
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
      setActiveTab("register");
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
      <CommandPageHeader
        eyebrow="Reports centre"
        title="Reports Centre"
        description="Store, manage, review and publish climate risk reports, GHG inventory outputs, project portfolio reports, NDC progress reports, executive briefs and exported datasets."
        actions={
          <div className="flex flex-wrap gap-3">
            <CommandButton variant="outline" onClick={loadReports}>
              Refresh Reports
            </CommandButton>

            {canManage && (
              <CommandButton onClick={startCreateReport}>
                Add Report
              </CommandButton>
            )}
          </div>
        }
      />

      {error && (
        <CommandNotice title="Reports centre error" tone="red">
          {error}
        </CommandNotice>
      )}

      {message && (
        <CommandNotice title="Reports centre update" tone="blue">
          {message}
        </CommandNotice>
      )}

      <ReportSummaryCards summary={summary} />

      <div className="sticky top-24 z-10">
        <CommandTabs
          tabs={tabs}
          activeTab={activeTab}
          onChange={setActiveTab}
        />
      </div>

      {activeTab === "overview" && (
        <div className="space-y-6">
          <StatusBreakdown
            reports={reports}
            setActiveTab={setActiveTab}
            updateFilter={updateFilter}
          />

          <SelectedReportDetail
            selectedReport={selectedReport}
            canManage={canManage}
            onEditReport={handleEditReport}
            onClear={() => setSelectedReport(null)}
          />

          <CommandNotice title="Reports Centre Note" tone="gold">
            This page stores report files and metadata. Automated PDF generation
            can come later. For now, upload already prepared PDFs, Word files,
            Excel outputs, CSV exports, or briefing documents.
          </CommandNotice>
        </div>
      )}

      {activeTab === "register" && (
        <ReportRegisterSection
          filters={filters}
          updateFilter={updateFilter}
          filteredReports={filteredReports}
          selectedReport={selectedReport}
          isLoading={isLoading}
          canManage={canManage}
          onViewReport={handleViewReport}
          onEditReport={handleEditReport}
        />
      )}

      {activeTab === "export" && (
        <ReportsCentreExportPanel
          reports={reports}
          filteredReports={filteredReports}
          summary={summary}
        />
      )}

      {activeTab === "form" && (
        <ReportFormSection
          form={form}
          updateForm={updateForm}
          selectedFile={selectedFile}
          setSelectedFile={setSelectedFile}
          editingReport={editingReport}
          canManage={canManage}
          isSaving={isSaving}
          onSubmit={handleSubmit}
          onCancel={() => {
            resetForm();
            setActiveTab("overview");
          }}
        />
      )}
    </div>
  );
}