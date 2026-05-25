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
          <p className="text-sm font-medium text-emerald-700">
            Project Import
          </p>
          <h2 className="mt-1 text-lg font-bold">
            Upload Climate Projects CSV
          </h2>
          <p className="mt-1 max-w-3xl text-sm text-slate-500">
            Import multiple adaptation, mitigation, and cross-cutting projects
            from a CSV file. Use project_code to update existing projects during
            import.
          </p>
        </div>

        <button
          type="button"
          onClick={downloadCsvTemplate}
          className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
        >
          Download Project CSV Template
        </button>
      </div>

      {message && (
        <div className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
          {message}
        </div>
      )}

      {error && (
        <div className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        className="rounded-2xl border border-slate-200 bg-slate-50 p-5"
      >
        <div>
          <label className="mb-2 block text-sm font-medium text-slate-700">
            CSV File
          </label>
          <input
            id="project-portfolio-csv"
            type="file"
            accept=".csv,text/csv"
            onChange={(event) => setFile(event.target.files?.[0] || null)}
            className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
            required
          />
        </div>

        <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
          <p className="font-semibold">Required column</p>
          <p className="mt-1">title</p>

          <p className="mt-3 font-semibold">Recommended columns</p>
          <p className="mt-1">
            project_code, project_type, sector, status, priority, lganame,
            description, implementing_agency, funding_source,
            estimated_budget_naira, expected_ghg_reduction_tco2e,
            expected_beneficiaries, start_date, end_date,
            climate_risk_relevance, location_notes
          </p>

          <p className="mt-3 font-semibold">Accepted project_type values</p>
          <p className="mt-1">adaptation, mitigation, cross_cutting</p>

          <p className="mt-3 font-semibold">Accepted status values</p>
          <p className="mt-1">
            proposed, planned, ongoing, completed, suspended, cancelled
          </p>

          <p className="mt-3 font-semibold">Accepted priority values</p>
          <p className="mt-1">low, medium, high, very_high</p>
        </div>

        <button
          type="submit"
          disabled={isUploading}
          className="mt-5 rounded-xl bg-emerald-600 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-400"
        >
          {isUploading ? "Importing..." : "Import Projects"}
        </button>
      </form>

      {importErrors.length > 0 && (
        <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">
          <p className="font-bold">Import validation errors</p>
          <p className="mt-1">
            Some rows failed. Correct the CSV and upload again.
          </p>

          <div className="mt-4 max-h-72 overflow-auto rounded-xl bg-white p-4">
            <table className="w-full min-w-[700px] text-left text-xs">
              <thead>
                <tr className="border-b border-red-100 text-red-700">
                  <th className="px-2 py-2 font-semibold">Row</th>
                  <th className="px-2 py-2 font-semibold">Field</th>
                  <th className="px-2 py-2 font-semibold">Error</th>
                </tr>
              </thead>

              <tbody>
                {importErrors.map((item, index) => (
                  <tr key={`${item.row}-${item.field}-${index}`} className="border-b border-red-50">
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
    </section>
  );
}