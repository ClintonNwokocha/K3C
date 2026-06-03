import { useEffect, useMemo, useState } from "react";
import {
  getClimateRiskDatasetUploads,
  uploadClimateRiskDataset,
} from "../services/api";

/*
  Keep your existing datasetTypeOptions array here exactly as it is.
  Do not remove any of the templateRows.
*/

const inputClass =
  "w-full rounded-md border border-slate-200 bg-white px-4 py-3 text-sm text-[#030454] outline-none transition placeholder:text-slate-400 focus:border-[#009B35] focus:ring-2 focus:ring-[#009B35]/10";

function getStatusClass(status) {
  if (status === "completed") {
    return "bg-[#009B35]/10 text-[#009B35]";
  }

  if (status === "completed_with_errors") {
    return "bg-[#F3F74B]/45 text-[#030454]";
  }

  if (status === "failed") {
    return "bg-red-50 text-red-700";
  }

  return "bg-slate-100 text-slate-700";
}

function formatDate(value) {
  if (!value) return "—";
  return new Date(value).toLocaleString();
}

function downloadCsvTemplate(dataset) {
  if (!dataset?.templateRows?.length) return;

  const csvContent = dataset.templateRows
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
  link.setAttribute("download", `${dataset.value}_template.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  URL.revokeObjectURL(url);
}

function Notice({ type = "info", children }) {
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

export default function ClimateRiskDatasetUploadPanel({
  canManage,
  onUploaded,
}) {
  const [datasetType, setDatasetType] = useState("flood_scores");
  const [year, setYear] = useState("2025");
  const [file, setFile] = useState(null);
  const [uploads, setUploads] = useState([]);
  const [isLoadingUploads, setIsLoadingUploads] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const selectedDataset = useMemo(() => {
    return datasetTypeOptions.find((item) => item.value === datasetType);
  }, [datasetType]);

  async function loadUploads() {
    setIsLoadingUploads(true);

    try {
      const data = await getClimateRiskDatasetUploads();
      setUploads(data.results || []);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoadingUploads(false);
    }
  }

  useEffect(() => {
    loadUploads();
  }, []);

  async function handleSubmit(event) {
    event.preventDefault();

    if (!canManage) return;

    setMessage("");
    setError("");

    if (!file) {
      setError("Please select a CSV file.");
      return;
    }

    if (!file.name.toLowerCase().endsWith(".csv")) {
      setError("Only CSV files are supported for this upload.");
      return;
    }

    setIsUploading(true);

    try {
      const result = await uploadClimateRiskDataset({
        dataset_type: datasetType,
        year,
        file,
      });

      setMessage(result.message || "Dataset uploaded successfully.");
      setFile(null);

      const fileInput = document.getElementById("climate-risk-upload-file");

      if (fileInput) {
        fileInput.value = "";
      }

      await loadUploads();

      if (onUploaded) {
        await onUploaded();
      }
    } catch (err) {
      console.error(err);
      setError(
        err?.response?.data
          ? JSON.stringify(err.response.data)
          : "Could not upload dataset."
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
            Climate Data Intake
          </p>

          <h2 className="mt-2 text-2xl font-black text-[#030454]">
            Upload Processed Climate Risk CSV
          </h2>

          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            Upload pre-processed LGA-level climate datasets prepared from GIS,
            remote sensing, NiMet, CHIRPS, MODIS, ERA5, NBS, OSM, or KADGIS
            workflows. The importer updates LGA risk scores and stores extra
            numeric columns as parameter evidence.
          </p>
        </div>

        <button
          type="button"
          onClick={loadUploads}
          className="rounded-md border border-slate-200 bg-white px-5 py-3 text-xs font-black uppercase tracking-[0.08em] text-[#030454] transition hover:border-[#009B35] hover:text-[#009B35]"
        >
          Refresh Uploads
        </button>
      </div>

      <div className="space-y-5">
        {!canManage && (
          <Notice type="yellow">
            Only Admin and Analyst users can upload climate risk datasets.
          </Notice>
        )}

        {message && <Notice type="success">{message}</Notice>}
        {error && <Notice type="error">{error}</Notice>}

        {canManage && (
          <form
            onSubmit={handleSubmit}
            className="rounded-2xl border border-slate-200 bg-slate-50 p-5"
          >
            <div className="grid gap-4 lg:grid-cols-3">
              <div>
                <label className="mb-2 block text-sm font-bold text-[#030454]">
                  Dataset Type
                </label>

                <select
                  value={datasetType}
                  onChange={(event) => setDatasetType(event.target.value)}
                  className={inputClass}
                >
                  {datasetTypeOptions.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </div>

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

              <div>
                <label className="mb-2 block text-sm font-bold text-[#030454]">
                  CSV File
                </label>

                <input
                  id="climate-risk-upload-file"
                  type="file"
                  accept=".csv,text/csv"
                  onChange={(event) => setFile(event.target.files?.[0] || null)}
                  className="w-full rounded-md border border-slate-200 bg-white px-4 py-3 text-sm text-[#030454] outline-none transition file:mr-4 file:rounded-md file:border-0 file:bg-[#030454] file:px-4 file:py-2 file:text-xs file:font-bold file:text-white focus:border-[#009B35] focus:ring-2 focus:ring-[#009B35]/10"
                  required
                />
              </div>
            </div>

            <div className="mt-5 rounded-xl border-l-4 border-[#F3F74B] bg-[#F3F74B]/25 px-5 py-4 text-sm leading-6 text-[#030454]">
              <div className="mb-4 flex flex-col justify-between gap-3 md:flex-row md:items-center">
                <div>
                  <p className="font-black">Template for selected dataset</p>
                  <p className="text-xs">
                    Download, edit in Excel/QGIS/Python, then upload the completed CSV.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => downloadCsvTemplate(selectedDataset)}
                  className="rounded-md bg-[#030454] px-4 py-2 text-xs font-black uppercase tracking-[0.08em] text-white transition hover:bg-[#02033d]"
                >
                  Download CSV Template
                </button>
              </div>

              <p className="font-bold">Required columns</p>
              <p className="mt-1">{selectedDataset?.requiredColumns}</p>

              <p className="mt-3 font-bold">Example header</p>
              <code className="mt-1 block overflow-x-auto rounded-lg bg-white/75 px-3 py-2 text-xs text-[#030454]">
                {selectedDataset?.example}
              </code>
            </div>

            <button
              type="submit"
              disabled={isUploading}
              className="mt-5 rounded-md bg-[#009B35] px-5 py-3 text-xs font-black uppercase tracking-[0.08em] text-white transition hover:bg-[#00842e] disabled:cursor-not-allowed disabled:bg-slate-400"
            >
              {isUploading ? "Uploading..." : "Upload and Import CSV"}
            </button>
          </form>
        )}

        <div>
          <div className="mb-3 flex items-center justify-between gap-4">
            <h3 className="text-xl font-black text-[#030454]">
              Recent Uploads
            </h3>

            {isLoadingUploads && (
              <span className="text-sm text-slate-500">Loading...</span>
            )}
          </div>

          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
            <table className="w-full min-w-[1000px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-500">
                  <th className="px-3 py-3 font-bold">Dataset</th>
                  <th className="px-3 py-3 font-bold">Year</th>
                  <th className="px-3 py-3 font-bold">File</th>
                  <th className="px-3 py-3 font-bold">Status</th>
                  <th className="px-3 py-3 font-bold">Rows</th>
                  <th className="px-3 py-3 font-bold">Imported</th>
                  <th className="px-3 py-3 font-bold">Failed</th>
                  <th className="px-3 py-3 font-bold">Uploaded By</th>
                  <th className="px-3 py-3 font-bold">Date</th>
                </tr>
              </thead>

              <tbody>
                {uploads.map((upload) => (
                  <tr
                    key={upload.id}
                    className="border-b border-slate-100 align-top last:border-0 hover:bg-[#009B35]/5"
                  >
                    <td className="px-3 py-4 font-black text-[#030454]">
                      {upload.dataset_type_display}
                    </td>

                    <td className="px-3 py-4">{upload.year}</td>

                    <td className="px-3 py-4">
                      <p>{upload.original_filename}</p>

                      {upload.validation_errors?.length > 0 && (
                        <details className="mt-2">
                          <summary className="cursor-pointer text-xs font-bold text-red-600">
                            View validation errors
                          </summary>

                          <pre className="mt-2 max-h-48 overflow-auto rounded-lg bg-red-50 p-3 text-xs text-red-700">
                            {JSON.stringify(upload.validation_errors, null, 2)}
                          </pre>
                        </details>
                      )}
                    </td>

                    <td className="px-3 py-4">
                      <span
                        className={`rounded-md px-3 py-1 text-xs font-bold ${getStatusClass(
                          upload.status
                        )}`}
                      >
                        {upload.status_display}
                      </span>
                    </td>

                    <td className="px-3 py-4">{upload.row_count}</td>
                    <td className="px-3 py-4">{upload.imported_count}</td>
                    <td className="px-3 py-4">{upload.failed_count}</td>
                    <td className="px-3 py-4">
                      {upload.uploaded_by_username || "—"}
                    </td>
                    <td className="px-3 py-4">{formatDate(upload.created_at)}</td>
                  </tr>
                ))}

                {uploads.length === 0 && (
                  <tr>
                    <td
                      colSpan="9"
                      className="px-3 py-8 text-center text-slate-500"
                    >
                      No climate risk dataset uploads yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
}