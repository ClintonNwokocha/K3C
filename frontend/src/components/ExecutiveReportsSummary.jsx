import { useEffect, useMemo, useState } from "react";
import { getReportDocuments } from "../services/api";

function formatNumber(value, maximumFractionDigits = 0) {
  return Number(value || 0).toLocaleString(undefined, {
    maximumFractionDigits,
  });
}

function getStatusClass(status) {
  if (status === "published") return "bg-[#009B35]/10 text-[#009B35]";
  if (status === "approved") return "bg-[#030454]/10 text-[#030454]";
  if (status === "review") return "bg-[#F3F74B]/45 text-[#030454]";
  if (status === "archived") return "bg-slate-100 text-slate-600";
  return "bg-slate-50 text-slate-700";
}

function getTypeClass(type) {
  if (type === "climate_risk") return "bg-[#009B35]/10 text-[#009B35]";
  if (type === "ghg_inventory") return "bg-[#030454]/10 text-[#030454]";
  if (type === "project_portfolio") return "bg-[#F3F74B]/45 text-[#030454]";
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

function StatCard({ label, value, helper, tone = "blue" }) {
  const toneClasses = {
    blue: "border-[#030454]/15 bg-[#030454]/5",
    green: "border-[#009B35]/20 bg-[#009B35]/8",
    yellow: "border-[#F3F74B]/70 bg-[#F3F74B]/25",
    white: "border-slate-200 bg-white",
  };

  return (
    <div
      className={`rounded-2xl border p-6 shadow-sm ${
        toneClasses[tone] || toneClasses.white
      }`}
    >
      <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">
        {label}
      </p>

      <h3 className="kccc-kpi-value mt-3 text-3xl font-black text-[#030454]">{value}</h3>

      <p className="mt-2 text-sm leading-6 text-slate-500">{helper}</p>
    </div>
  );
}

function CountRow({ label, value }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-slate-500">{label}</span>
      <span className="font-black text-[#030454]">{value}</span>
    </div>
  );
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
          <p className="text-xs font-black uppercase tracking-[0.14em] text-[#009B35]">
            Reports Intelligence
          </p>

          <h2 className="mt-2 text-2xl font-black text-[#030454]">
            Reports Centre Executive Summary
          </h2>

          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            Live summary of report records, publication status, review queue,
            public-facing reports and recent documents.
          </p>
        </div>

        <button
          type="button"
          onClick={loadReportsDashboard}
          className="rounded-md border border-slate-200 bg-white px-5 py-3 text-xs font-black uppercase tracking-[0.08em] text-[#030454] transition hover:border-[#009B35] hover:text-[#009B35]"
        >
          Refresh Reports
        </button>
      </div>

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Total Reports"
          value={formatNumber(summary.total_reports)}
          helper="Active report records."
          tone="blue"
        />

        <StatCard
          label="Reports Under Review"
          value={dashboardStats.reviewQueueCount}
          helper="Reports awaiting approval."
          tone="yellow"
        />

        <StatCard
          label="Approved Reports"
          value={formatNumber(summary.approved_reports)}
          helper="Reports approved for official use."
          tone="white"
        />

        <StatCard
          label="Published / Public Reports"
          value={formatNumber(summary.published_reports || summary.public_reports)}
          helper="Reports available for broader use."
          tone="green"
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm xl:col-span-2">
          <h3 className="text-xl font-black text-[#030454]">Recent Reports</h3>

          <p className="mt-1 text-sm leading-6 text-slate-500">
            Most recently created report records.
          </p>

          <div className="mt-5 space-y-4">
            {dashboardStats.recentReports.map((report) => (
              <div
                key={report.id}
                className="rounded-2xl border border-slate-200 p-4 transition hover:border-[#009B35]/60 hover:bg-[#009B35]/5"
              >
                <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
                  <div>
                    <p className="font-black text-[#030454]">{report.title}</p>

                    <p className="mt-1 text-xs text-slate-500">
                      {report.reporting_year || "No year"} ·{" "}
                      {report.source_module || "No module"}
                    </p>

                    <div className="mt-3 flex flex-wrap gap-2">
                      <span
                        className={`rounded-md px-3 py-1 text-xs font-bold ${getTypeClass(
                          report.report_type
                        )}`}
                      >
                        {report.report_type_display ||
                          titleCase(report.report_type)}
                      </span>

                      <span
                        className={`rounded-md px-3 py-1 text-xs font-bold ${getStatusClass(
                          report.status
                        )}`}
                      >
                        {report.status_display || titleCase(report.status)}
                      </span>

                      <span
                        className={`rounded-md px-3 py-1 text-xs font-bold ${
                          report.is_public
                            ? "bg-[#009B35]/10 text-[#009B35]"
                            : "bg-slate-100 text-slate-700"
                        }`}
                      >
                        {report.is_public ? "Public" : "Internal"}
                      </span>
                    </div>
                  </div>

                  {report.file_url ? (
                    <a
                      href={report.file_url}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-md bg-[#030454] px-4 py-2 text-sm font-bold text-white transition hover:bg-[#02033d]"
                    >
                      Open File
                    </a>
                  ) : (
                    <span className="rounded-md border border-slate-200 px-4 py-2 text-sm font-bold text-slate-400">
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
            <h3 className="text-xl font-black text-[#030454]">
              Reports by Type
            </h3>

            <div className="mt-5 space-y-3 text-sm">
              <CountRow label="Climate Intelligence" value={summary.by_type?.climate_risk || 0} />
              <CountRow label="GHG Inventory" value={summary.by_type?.ghg_inventory || 0} />
              <CountRow
                label="Project Portfolio"
                value={summary.by_type?.project_portfolio || 0}
              />
              <CountRow label="NDC Progress" value={summary.by_type?.ndc_progress || 0} />
              <CountRow
                label="Executive Briefs"
                value={summary.by_type?.executive_brief || 0}
              />
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="text-xl font-black text-[#030454]">
              Reports by Status
            </h3>

            <div className="mt-5 space-y-3 text-sm">
              <CountRow label="Draft" value={summary.by_status?.draft || 0} />
              <CountRow
                label="Under Review"
                value={summary.by_status?.review || 0}
              />
              <CountRow label="Approved" value={summary.by_status?.approved || 0} />
              <CountRow label="Published" value={summary.by_status?.published || 0} />
              <CountRow label="Archived" value={summary.by_status?.archived || 0} />
            </div>
          </div>

          <div className="rounded-xl border-l-4 border-[#030454] bg-[#030454]/5 px-5 py-4 text-sm leading-6 text-[#030454] shadow-sm">
            <h3 className="font-black">Governance Note</h3>
            <p className="mt-1">
              Reports under review should be checked for data source quality,
              approval status, visibility setting and file completeness before
              publication.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}