import { useState } from "react";
import { uploadClimateRiskDataset } from "../services/api";

const templateRows = [
  [
    "lganame",
    "year",
    "asset_type",
    "asset_name",
    "latitude",
    "longitude",
    "exposure_score",
    "risk_status",
    "data_source",
    "notes",
  ],
  [
    "Kaduna South",
    "2025",
    "hospital",
    "Test General Hospital",
    "10.5222",
    "7.4383",
    "75",
    "high",
    "Development test",
    "Replace with OSM/KADGIS/field survey asset",
  ],
  [
    "Chikun",
    "2025",
    "school",
    "Test Primary School",
    "10.5100",
    "7.3900",
    "62",
    "high",
    "Development test",
    "Replace with OSM/KADGIS/field survey asset",
  ],
];

const inputClass =
  "w-full rounded-md border border-slate-200 bg-white px-4 py-3 text-sm text-[#030454] outline-none transition placeholder:text-slate-400 focus:border-[#009B35] focus:ring-2 focus:ring-[#009B35]/10";

function downloadCsvTemplate() {
  const csvContent = templateRows
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

  const blob = new Blob([csvContent], {
    type: "text/csv;charset=utf-8;",
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.setAttribute("download", "infrastructure_assets_template.csv");
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  URL.revokeObjectURL(url);
}

function Notice({ type = "success", children }) {
  const classes = {
    success: "border-[#009B35] bg-[#009B35]/8 text-[#030454]",
    error: "border-red-400 bg-red-50 text-red-700",
    yellow: "border-[#F3F74B] bg-[#F3F74B]/25 text-[#030454]",
    blue: "border-[#030454] bg-[#030454]/5 text-[#030454]",
  };

  return (
    <div
      className={`rounded-r-xl border-l-4 px-5 py-4 text-sm leading-6 ${
        classes[type] || classes.blue
      }`}
    >
      {children}
    </div>
  );
}

export default function ClimateInfrastructureAssetImportPanel({
  selectedProfile,
  canManage,
  onImported,
}) {
  const [year, setYear] = useState(String(selectedProfile?.year || 2025));
  const [file, setFile] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  if (!canManage) {
    return null;
  }

  async function handleSubmit(event) {
    event.preventDefault();

    setMessage("");
    setError("");

    if (!file) {
      setError("Please select an infrastructure CSV file.");
      return;
    }

    if (!file.name.toLowerCase().endsWith(".csv")) {
      setError("Only CSV files are supported.");
      return;
    }

    setIsUploading(true);

    try {
      const result = await uploadClimateRiskDataset({
        dataset_type: "infrastructure_assets",
        year,
        file,
      });

      const upload = result.upload;

      setMessage(
        `Upload processed. Imported: ${upload.imported_count}, Failed: ${upload.failed_count}.`
      );

      setFile(null);

      const input = document.getElementById("infrastructure-assets-csv");
      if (input) {
        input.value = "";
      }

      if (onImported) {
        onImported();
      }
    } catch (err) {
      console.error(err);
      setError(
        err?.response?.data
          ? JSON.stringify(err.response.data)
          : "Could not import infrastructure assets."
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
            Infrastructure Data Import
          </p>

          <h2 className="mt-2 text-2xl font-black text-[#030454]">
            Upload Infrastructure Assets CSV
          </h2>

          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            Upload point-based assets prepared from QGIS, OSM, KADGIS, GPS, or
            field survey data. Each row should include LGA identifier, asset
            type, asset name, latitude and longitude.
          </p>
        </div>

        <button
          type="button"
          onClick={downloadCsvTemplate}
          className="rounded-md bg-[#030454] px-5 py-3 text-xs font-black uppercase tracking-[0.08em] text-white transition hover:bg-[#02033d]"
        >
          Download Asset CSV Template
        </button>
      </div>

      <div className="mb-5 space-y-4">
        {message && <Notice type="success">{message}</Notice>}
        {error && <Notice type="error">{error}</Notice>}
      </div>

      <form
        onSubmit={handleSubmit}
        className="rounded-2xl border border-slate-200 bg-slate-50 p-5"
      >
        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <label className="mb-2 block text-sm font-bold text-[#030454]">
              Year
            </label>

            <input
              type="number"
              value={year}
              onChange={(event) => setYear(event.target.value)}
              className={inputClass}
              required
            />
          </div>

          <div className="md:col-span-2">
            <label className="mb-2 block text-sm font-bold text-[#030454]">
              CSV File
            </label>

            <input
              id="infrastructure-assets-csv"
              type="file"
              accept=".csv,text/csv"
              onChange={(event) => setFile(event.target.files?.[0] || null)}
              className="w-full rounded-md border border-slate-200 bg-white px-4 py-3 text-sm text-[#030454] outline-none transition file:mr-4 file:rounded-md file:border-0 file:bg-[#030454] file:px-4 file:py-2 file:text-xs file:font-bold file:text-white focus:border-[#009B35] focus:ring-2 focus:ring-[#009B35]/10"
              required
            />
          </div>
        </div>

        <div className="mt-5 rounded-xl border-l-4 border-[#F3F74B] bg-[#F3F74B]/25 px-5 py-4 text-sm leading-6 text-[#030454]">
          <p className="font-black">CSV structure guide</p>

          <p className="mt-2 font-bold">Required columns</p>
          <p className="mt-1">
            one of lga_id/lga_name/lganame/lga_code/lgacode, asset_type,
            asset_name, latitude, longitude
          </p>

          <p className="mt-3 font-bold">Optional columns</p>
          <p className="mt-1">
            year, exposure_score, risk_status, data_source, notes
          </p>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <div className="rounded-lg bg-white/65 p-3">
              <p className="font-bold">Accepted asset_type values</p>
              <p className="mt-1 text-xs">
                school, hospital, market, road_bridge, water_facility,
                settlement, government_facility, other
              </p>
            </div>

            <div className="rounded-lg bg-white/65 p-3">
              <p className="font-bold">Accepted risk_status values</p>
              <p className="mt-1 text-xs">low, moderate, high, very_high</p>
            </div>
          </div>
        </div>

        <button
          type="submit"
          disabled={isUploading}
          className="mt-5 rounded-md bg-[#009B35] px-5 py-3 text-xs font-black uppercase tracking-[0.08em] text-white transition hover:bg-[#00842e] disabled:cursor-not-allowed disabled:bg-slate-400"
        >
          {isUploading ? "Importing..." : "Import Infrastructure Assets"}
        </button>
      </form>
    </section>
  );
}