import { useState } from "react";
import { importClimateProjectsCsv } from "../services/api";

const templateRows = [
  [
    "title",
    "project_code",
    "project_type",
    "sector",
    "status",
    "priority",
    "lganame",
    "description",
    "implementing_agency",
    "funding_source",
    "estimated_budget_naira",
    "expected_ghg_reduction_tco2e",
    "expected_beneficiaries",
    "start_date",
    "end_date",
    "climate_risk_relevance",
    "location_notes",
  ],
  [
    "Kaduna Urban Flood Drainage Upgrade",
    "KCCC-PRJ-001",
    "adaptation",
    "infrastructure",
    "planned",
    "very_high",
    "Kaduna South",
    "Drainage improvement project for flood-prone urban communities",
    "Ministry of Environment",
    "State Budget",
    "250000000",
    "0",
    "120000",
    "2026-01-01",
    "2026-12-31",
    "Responds to urban flood risk and exposed infrastructure",
    "Priority flood-prone wards",
  ],
  [
    "Chikun Solar Mini-grid Project",
    "KCCC-PRJ-002",
    "mitigation",
    "energy",
    "proposed",
    "high",
    "Chikun",
    "Solar mini-grid for public facilities and surrounding communities",
    "Ministry of Energy",
    "Donor",
    "180000000",
    "2500",
    "30000",
    "2026-03-01",
    "2027-03-01",
    "Supports low-carbon energy access and resilience",
    "Public facilities and surrounding communities",
  ],
];

function buildCsvContent(rows) {
  return rows
    .map((row) =>
      row
        .map((cell) => {
          const value = String(cell ?? "");

          if (value.includes(",") || value.includes('"') || value.includes("\n")) {
            return `"${value.replace(/"/g, '""')}"`;
          }

          return value;
        })
        .join(",")
    )
    .join("\n");
}

function downloadCsvTemplate() {
  const csvContent = buildCsvContent(templateRows);

  const blob = new Blob([csvContent], {
    type: "text/csv;charset=utf-8;",
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.setAttribute("download", "climate_projects_template.csv");
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  URL.revokeObjectURL(url);
}

function Notice({ type = "info", children }) {
  const classes = {
    success: "border-[#009B35] bg-[#009B35]/8 text-[#030454]",
    error: "border-red-400 bg-red-50 text-red-700",
    info: "border-[#030454] bg-[#030454]/5 text-[#030454]",
    yellow: "border-[#F3F74B] bg-[#F3F74B]/25 text-[#030454]",
  };

  return (
    <div
      className={`rounded-r-xl border-l-4 px-5 py-4 text-sm leading-6 ${
        classes[type] || classes.info
      }`}
    >
      {children}
    </div>
  );
}

export default function ProjectPortfolioImportPanel({ canManage, onImported }) {
  const [file, setFile] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [importErrors, setImportErrors] = useState([]);

  if (!canManage) {
    return null;
  }

  async function handleSubmit(event) {
    event.preventDefault();

    setMessage("");
    setError("");
    setImportErrors([]);

    if (!file) {
      setError("Please select a project CSV file.");
      return;
    }

    if (!file.name.toLowerCase().endsWith(".csv")) {
      setError("Only CSV files are supported.");
      return;
    }

    setIsUploading(true);

    try {
      const result = await importClimateProjectsCsv(file);
      const importResult = result.result || {};

      setMessage(
        `Import processed. Rows: ${importResult.row_count || 0}, Created: ${
          importResult.imported_count || 0
        }, Updated: ${importResult.updated_count || 0}, Failed: ${
          importResult.failed_count || 0
        }.`
      );

      setImportErrors(importResult.errors || []);
      setFile(null);

      const input = document.getElementById("project-portfolio-csv");
      if (input) {
        input.value = "";
      }

      if (onImported) {
        await onImported();
      }
    } catch (err) {
      console.error(err);
      setError(
        err?.response?.data
          ? JSON.stringify(err.response.data)
          : "Could not import climate projects."
      );
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-5 flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.14em] text-[#009B35]">
            Project Import
          </p>

          <h2 className="mt-2 text-2xl font-black text-[#030454]">
            Upload Climate Projects CSV
          </h2>

          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            Import multiple adaptation, mitigation and cross-cutting projects
            from a CSV file. Use project_code to update existing projects during
            import.
          </p>
        </div>

        <button
          type="button"
          onClick={downloadCsvTemplate}
          className="rounded-md bg-[#030454] px-5 py-3 text-xs font-black uppercase tracking-[0.08em] text-white transition hover:bg-[#02033d]"
        >
          Download CSV Template
        </button>
      </div>

      <div className="space-y-5">
        {message && <Notice type="success">{message}</Notice>}
        {error && <Notice type="error">{error}</Notice>}

        <form
          onSubmit={handleSubmit}
          className="rounded-2xl border border-slate-200 bg-slate-50 p-5"
        >
          <div>
            <label className="mb-2 block text-sm font-bold text-[#030454]">
              CSV File
            </label>

            <input
              id="project-portfolio-csv"
              type="file"
              accept=".csv,text/csv"
              onChange={(event) => setFile(event.target.files?.[0] || null)}
              className="w-full rounded-md border border-slate-200 bg-white px-4 py-3 text-sm text-[#030454] outline-none transition file:mr-4 file:rounded-md file:border-0 file:bg-[#030454] file:px-4 file:py-2 file:text-xs file:font-bold file:text-white focus:border-[#009B35] focus:ring-2 focus:ring-[#009B35]/10"
              required
            />

            {file && (
              <p className="mt-2 text-xs text-slate-500">
                Selected file:{" "}
                <span className="font-bold text-[#030454]">{file.name}</span>
              </p>
            )}
          </div>

          <div className="mt-5 rounded-xl border-l-4 border-[#F3F74B] bg-[#F3F74B]/25 px-5 py-4 text-sm leading-6 text-[#030454]">
            <p className="font-black">CSV structure guide</p>

            <p className="mt-2">
              Required column: <span className="font-bold">title</span>
            </p>

            <p className="mt-3 font-bold">Recommended columns</p>
            <p className="mt-1 text-sm">
              project_code, project_type, sector, status, priority, lganame,
              description, implementing_agency, funding_source,
              estimated_budget_naira, expected_ghg_reduction_tco2e,
              expected_beneficiaries, start_date, end_date,
              climate_risk_relevance, location_notes
            </p>

            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <div className="rounded-lg bg-white/65 p-3">
                <p className="font-bold">project_type</p>
                <p className="mt-1 text-xs">
                  adaptation, mitigation, cross_cutting
                </p>
              </div>

              <div className="rounded-lg bg-white/65 p-3">
                <p className="font-bold">status</p>
                <p className="mt-1 text-xs">
                  proposed, planned, ongoing, completed, suspended, cancelled
                </p>
              </div>

              <div className="rounded-lg bg-white/65 p-3">
                <p className="font-bold">priority</p>
                <p className="mt-1 text-xs">low, medium, high, very_high</p>
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={isUploading}
            className="mt-5 rounded-md bg-[#009B35] px-5 py-3 text-xs font-black uppercase tracking-[0.08em] text-white transition hover:bg-[#00842e] disabled:cursor-not-allowed disabled:bg-slate-400"
          >
            {isUploading ? "Importing..." : "Import Projects"}
          </button>
        </form>

        {importErrors.length > 0 && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">
            <p className="font-black">Import validation errors</p>

            <p className="mt-1">
              Some rows failed. Correct the CSV and upload again.
            </p>

            <div className="mt-4 max-h-72 overflow-auto rounded-xl bg-white p-4">
              <table className="w-full min-w-[700px] text-left text-xs">
                <thead>
                  <tr className="border-b border-red-100 text-red-700">
                    <th className="px-2 py-2 font-bold">Row</th>
                    <th className="px-2 py-2 font-bold">Field</th>
                    <th className="px-2 py-2 font-bold">Error</th>
                  </tr>
                </thead>

                <tbody>
                  {importErrors.map((item, index) => (
                    <tr
                      key={`${item.row}-${item.field}-${index}`}
                      className="border-b border-red-50"
                    >
                      <td className="px-2 py-2">{item.row}</td>
                      <td className="px-2 py-2">{item.field}</td>
                      <td className="px-2 py-2">{item.error}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}