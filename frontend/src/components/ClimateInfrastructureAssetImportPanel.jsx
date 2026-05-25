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
          <p className="text-sm font-medium text-emerald-700">
            Infrastructure Data Import
          </p>
          <h2 className="mt-1 text-lg font-bold">
            Upload Infrastructure Assets CSV
          </h2>
          <p className="mt-1 max-w-3xl text-sm text-slate-500">
            Upload point-based assets prepared from QGIS, OSM, KADGIS, GPS, or
            field survey data. Each row should include LGA identifier, asset
            type, asset name, latitude and longitude.
          </p>
        </div>

        <button
          type="button"
          onClick={downloadCsvTemplate}
          className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
        >
          Download Asset CSV Template
        </button>
      </div>

      {(message || error) && (
        <div
          className={`mb-5 rounded-xl border p-4 text-sm ${
            error
              ? "border-red-200 bg-red-50 text-red-700"
              : "border-emerald-200 bg-emerald-50 text-emerald-700"
          }`}
        >
          {error || message}
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        className="rounded-2xl border border-slate-200 bg-slate-50 p-5"
      >
        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">
              Year
            </label>
            <input
              type="number"
              value={year}
              onChange={(event) => setYear(event.target.value)}
              className="w-full rounded-xl border border-slate-300 px-4 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
              required
            />
          </div>

          <div className="md:col-span-2">
            <label className="mb-2 block text-sm font-medium text-slate-700">
              CSV File
            </label>
            <input
              id="infrastructure-assets-csv"
              type="file"
              accept=".csv,text/csv"
              onChange={(event) => setFile(event.target.files?.[0] || null)}
              className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
              required
            />
          </div>
        </div>

        <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
          <p className="font-semibold">Required columns</p>
          <p className="mt-1">
            one of lga_id/lga_name/lganame/lga_code/lgacode, asset_type,
            asset_name, latitude, longitude
          </p>

          <p className="mt-3 font-semibold">Optional columns</p>
          <p className="mt-1">
            year, exposure_score, risk_status, data_source, notes
          </p>

          <p className="mt-3 font-semibold">Accepted asset_type values</p>
          <p className="mt-1">
            school, hospital, market, road_bridge, water_facility, settlement,
            government_facility, other
          </p>

          <p className="mt-3 font-semibold">Accepted risk_status values</p>
          <p className="mt-1">low, moderate, high, very_high</p>
        </div>

        <button
          type="submit"
          disabled={isUploading}
          className="mt-5 rounded-xl bg-emerald-600 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-400"
        >
          {isUploading ? "Importing..." : "Import Infrastructure Assets"}
        </button>
      </form>
    </section>
  );
}