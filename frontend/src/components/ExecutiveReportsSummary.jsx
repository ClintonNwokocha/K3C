import { useEffect, useMemo, useState } from "react";
import { getReportDocuments } from "../services/api";

function formatNumber(value, maximumFractionDigits = 0) {
  return Number(value || 0).toLocaleString(undefined, {
    maximumFractionDigits,
  });
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

function titleCase(value) {
  return String(value || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default function ExecutiveReportsSummary() {
  const [reportsData, setReportsData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadReportsDashboard() {
    setIsLoading(true);
    setError("");

    try {
      const data = await getReportDocuments({});
      setReportsData(data);
    } catch (err) {
      console.error(err);
      setError("Could not load reports dashboard summary.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadReportsDashboard();
  }, []);

  const reports = reportsData?.results || [];
  const summary = reportsData?.summary || {};

  const dashboardStats = useMemo(() => {
    const recentReports = [...reports]
      .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
      .slice(0, 5);

    const reviewQueue = reports.filter((report) => report.status === "review");
    const publicReports = reports.filter((report) => report.is_public);
    const reportsWithFiles = reports.filter((report) => report.file_url);

    return {
      recentReports,
      reviewQueueCount: reviewQueue.length,
      publicReportsCount: publicReports.length,
      reportsWithFilesCount: reportsWithFiles.length,
    };
  }, [reports]);

  if (isLoading) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-sm text-slate-500">
          Loading reports dashboard summary...
        </p>
      </section>
    );
  }

  if (error) {
    return (
      <section className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700 shadow-sm">
        {error}
      </section>
    );
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
        <div>
          <p className="text-sm font-medium text-emerald-700">
            Reports Intelligence
          </p>
          <h2 className="mt-1 text-2xl font-bold">
            Reports Centre Executive Summary
          </h2>
          <p className="mt-2 max-w-3xl text-sm text-slate-500">
            Live summary of report records, publication status, review queue,
            public-facing reports, and recent documents.
          </p>
        </div>

        <button
          type="button"
          onClick={loadReportsDashboard}
          className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          Refresh Reports
        </button>
      </div>

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-sm text-slate-500">Total Reports</p>
          <h3 className="mt-3 text-3xl font-bold">
            {formatNumber(summary.total_reports)}
          </h3>
          <p className="mt-2 text-sm text-slate-500">
            Active report records.
          </p>
        </div>

        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 shadow-sm">
          <p className="text-sm text-amber-700">Reports Under Review</p>
          <h3 className="mt-3 text-3xl font-bold text-amber-700">
            {dashboardStats.reviewQueueCount}
          </h3>
          <p className="mt-2 text-sm text-amber-700">
            Reports awaiting approval.
          </p>
        </div>

        <div className="rounded-2xl border border-blue-200 bg-blue-50 p-6 shadow-sm">
          <p className="text-sm text-blue-700">Approved Reports</p>
          <h3 className="mt-3 text-3xl font-bold text-blue-700">
            {formatNumber(summary.approved_reports)}
          </h3>
          <p className="mt-2 text-sm text-blue-700">
            Reports approved for official use.
          </p>
        </div>

        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 shadow-sm">
          <p className="text-sm text-emerald-700">Published/Public Reports</p>
          <h3 className="mt-3 text-3xl font-bold text-emerald-700">
            {formatNumber(summary.published_reports || summary.public_reports)}
          </h3>
          <p className="mt-2 text-sm text-emerald-700">
            Reports available for broader use.
          </p>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm xl:col-span-2">
          <h3 className="text-lg font-bold">Recent Reports</h3>
          <p className="mt-1 text-sm text-slate-500">
            Most recently created report records.
          </p>

          <div className="mt-5 space-y-4">
            {dashboardStats.recentReports.map((report) => (
              <div
                key={report.id}
                className="rounded-2xl border border-slate-200 p-4"
              >
                <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
                  <div>
                    <p className="font-bold">{report.title}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {report.reporting_year || "No year"} •{" "}
                      {report.source_module || "No module"}
                    </p>

                    <div className="mt-3 flex flex-wrap gap-2">
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-semibold ${getTypeClass(
                          report.report_type
                        )}`}
                      >
                        {report.report_type_display ||
                          titleCase(report.report_type)}
                      </span>

                      <span
                        className={`rounded-full px-3 py-1 text-xs font-semibold ${getStatusClass(
                          report.status
                        )}`}
                      >
                        {report.status_display || titleCase(report.status)}
                      </span>

                      <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                        {report.is_public ? "Public" : "Internal"}
                      </span>
                    </div>
                  </div>

                  {report.file_url ? (
                    <a
                      href={report.file_url}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
                    >
                      Open File
                    </a>
                  ) : (
                    <span className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-400">
                      No File
                    </span>
                  )}
                </div>
              </div>
            ))}

            {dashboardStats.recentReports.length === 0 && (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-500">
                No report records available yet.
              </div>
            )}
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="text-lg font-bold">Reports by Type</h3>

            <div className="mt-5 space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500">Climate Risk</span>
                <span className="font-semibold">
                  {summary.by_type?.climate_risk || 0}
                </span>
              </div>

              <div className="flex justify-between">
                <span className="text-slate-500">GHG Inventory</span>
                <span className="font-semibold">
                  {summary.by_type?.ghg_inventory || 0}
                </span>
              </div>

              <div className="flex justify-between">
                <span className="text-slate-500">Project Portfolio</span>
                <span className="font-semibold">
                  {summary.by_type?.project_portfolio || 0}
                </span>
              </div>

              <div className="flex justify-between">
                <span className="text-slate-500">NDC Progress</span>
                <span className="font-semibold">
                  {summary.by_type?.ndc_progress || 0}
                </span>
              </div>

              <div className="flex justify-between">
                <span className="text-slate-500">Executive Briefs</span>
                <span className="font-semibold">
                  {summary.by_type?.executive_brief || 0}
                </span>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="text-lg font-bold">Reports by Status</h3>

            <div className="mt-5 space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500">Draft</span>
                <span className="font-semibold">
                  {summary.by_status?.draft || 0}
                </span>
              </div>

              <div className="flex justify-between">
                <span className="text-slate-500">Under Review</span>
                <span className="font-semibold">
                  {summary.by_status?.review || 0}
                </span>
              </div>

              <div className="flex justify-between">
                <span className="text-slate-500">Approved</span>
                <span className="font-semibold">
                  {summary.by_status?.approved || 0}
                </span>
              </div>

              <div className="flex justify-between">
                <span className="text-slate-500">Published</span>
                <span className="font-semibold">
                  {summary.by_status?.published || 0}
                </span>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-blue-200 bg-blue-50 p-6 text-sm text-blue-900 shadow-sm">
            <h3 className="font-bold">Governance Note</h3>
            <p className="mt-2">
              Reports under review should be checked for data source quality,
              approval status, visibility setting, and file completeness before
              publication.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}