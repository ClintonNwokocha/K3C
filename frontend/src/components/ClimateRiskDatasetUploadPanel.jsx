import { useEffect, useMemo, useState } from "react";
import {
  getClimateRiskDatasetUploads,
  uploadClimateRiskDataset,
} from "../services/api";

const datasetTypeOptions = [
  {
    value: "flood_scores",
    label: "Flood Scores CSV",
    requiredColumns:
      "one of lga_id/lga_name/lganame/lga_code/lgacode, year, flood_score",
    example:
      "lganame,year,flood_score,flood_occurrence_count,flood_prone_area_km2,population_exposed,data_source,notes",
    templateRows: [
      [
        "lganame",
        "year",
        "flood_score",
        "flood_occurrence_count",
        "flood_prone_area_km2",
        "population_exposed",
        "data_source",
        "notes",
      ],
      [
        "Birnin Gwari",
        "2025",
        "82",
        "4",
        "125.5",
        "84000",
        "Development test",
        "Replace with processed flood evidence",
      ],
      [
        "Chikun",
        "2025",
        "68",
        "2",
        "88.2",
        "52000",
        "Development test",
        "Replace with processed flood evidence",
      ],
    ],
  },
  {
    value: "drought_scores",
    label: "Drought Scores CSV",
    requiredColumns:
      "one of lga_id/lga_name/lganame/lga_code/lgacode, year, drought_score",
    example:
      "lganame,year,drought_score,rainfall_anomaly,consecutive_dry_days,vegetation_stress_index,data_source,notes",
    templateRows: [
      [
        "lganame",
        "year",
        "drought_score",
        "rainfall_anomaly",
        "consecutive_dry_days",
        "vegetation_stress_index",
        "data_source",
        "notes",
      ],
      [
        "Birnin Gwari",
        "2025",
        "70",
        "-18.5",
        "26",
        "0.42",
        "CHIRPS/MODIS development test",
        "Replace with processed drought evidence",
      ],
      [
        "Chikun",
        "2025",
        "62",
        "-12.1",
        "18",
        "0.55",
        "CHIRPS/MODIS development test",
        "Replace with processed drought evidence",
      ],
    ],
  },
  {
    value: "heat_scores",
    label: "Heat Scores CSV",
    requiredColumns:
      "one of lga_id/lga_name/lganame/lga_code/lgacode, year, heat_score",
    example:
      "lganame,year,heat_score,mean_lst,temperature_anomaly,urban_heat_exposure,data_source,notes",
    templateRows: [
      [
        "lganame",
        "year",
        "heat_score",
        "mean_lst",
        "temperature_anomaly",
        "urban_heat_exposure",
        "data_source",
        "notes",
      ],
      [
        "Kaduna North",
        "2025",
        "78",
        "38.2",
        "2.4",
        "0.81",
        "MODIS/ERA5 development test",
        "Replace with processed heat evidence",
      ],
      [
        "Kaduna South",
        "2025",
        "80",
        "39.1",
        "2.7",
        "0.86",
        "MODIS/ERA5 development test",
        "Replace with processed heat evidence",
      ],
    ],
  },
  {
    value: "erosion_scores",
    label: "Erosion Scores CSV",
    requiredColumns:
      "one of lga_id/lga_name/lganame/lga_code/lgacode, year, erosion_score",
    example:
      "lganame,year,erosion_score,slope_index,soil_erodibility,rainfall_erosivity,data_source,notes",
    templateRows: [
      [
        "lganame",
        "year",
        "erosion_score",
        "slope_index",
        "soil_erodibility",
        "rainfall_erosivity",
        "data_source",
        "notes",
      ],
      [
        "Kachia",
        "2025",
        "70",
        "0.68",
        "0.55",
        "0.72",
        "DEM/SoilGrids development test",
        "Replace with processed erosion evidence",
      ],
      [
        "Zangon Kataf",
        "2025",
        "75",
        "0.73",
        "0.61",
        "0.78",
        "DEM/SoilGrids development test",
        "Replace with processed erosion evidence",
      ],
    ],
  },
  {
    value: "exposure_scores",
    label: "Exposure Scores CSV",
    requiredColumns:
      "one of lga_id/lga_name/lganame/lga_code/lgacode, year, exposure_score",
    example:
      "lganame,year,exposure_score,population_exposed,schools_exposed,hospitals_exposed,roads_exposed_km,data_source,notes",
    templateRows: [
      [
        "lganame",
        "year",
        "exposure_score",
        "population_exposed",
        "schools_exposed",
        "hospitals_exposed",
        "roads_exposed_km",
        "data_source",
        "notes",
      ],
      [
        "Kaduna North",
        "2025",
        "75",
        "120000",
        "42",
        "8",
        "64.3",
        "OSM/KADGIS development test",
        "Replace with processed exposure evidence",
      ],
      [
        "Chikun",
        "2025",
        "70",
        "98000",
        "35",
        "5",
        "52.1",
        "OSM/KADGIS development test",
        "Replace with processed exposure evidence",
      ],
    ],
  },
  {
    value: "vulnerability_scores",
    label: "Vulnerability Scores CSV",
    requiredColumns:
      "one of lga_id/lga_name/lganame/lga_code/lgacode, year, vulnerability_score",
    example:
      "lganame,year,vulnerability_score,poverty_index,population_density,agric_livelihood_dependency,access_to_services_index,data_source,notes",
    templateRows: [
      [
        "lganame",
        "year",
        "vulnerability_score",
        "poverty_index",
        "population_density",
        "agric_livelihood_dependency",
        "access_to_services_index",
        "data_source",
        "notes",
      ],
      [
        "Birnin Gwari",
        "2025",
        "80",
        "0.74",
        "185",
        "0.69",
        "0.31",
        "NBS/KADGIS development test",
        "Replace with processed vulnerability evidence",
      ],
      [
        "Kachia",
        "2025",
        "67",
        "0.61",
        "142",
        "0.58",
        "0.45",
        "NBS/KADGIS development test",
        "Replace with processed vulnerability evidence",
      ],
    ],
  },
  {
    value: "adaptive_capacity_scores",
    label: "Adaptive Capacity Scores CSV",
    requiredColumns:
      "one of lga_id/lga_name/lganame/lga_code/lgacode, year, adaptive_capacity_score",
    example:
      "lganame,year,adaptive_capacity_score,health_facility_access,early_warning_access,drainage_capacity,response_capacity,data_source,notes",
    templateRows: [
      [
        "lganame",
        "year",
        "adaptive_capacity_score",
        "health_facility_access",
        "early_warning_access",
        "drainage_capacity",
        "response_capacity",
        "data_source",
        "notes",
      ],
      [
        "Birnin Gwari",
        "2025",
        "38",
        "0.35",
        "0.28",
        "0.31",
        "0.41",
        "KADGIS/field survey development test",
        "Higher adaptive capacity is better",
      ],
      [
        "Kaduna North",
        "2025",
        "60",
        "0.72",
        "0.64",
        "0.58",
        "0.66",
        "KADGIS/field survey development test",
        "Higher adaptive capacity is better",
      ],
    ],
  },
  {
    value: "parameter_records",
    label: "Generic Parameter Records CSV",
    requiredColumns:
      "one of lga_id/lga_name/lganame/lga_code/lgacode, year, category, parameter_key, parameter_label, raw_value",
    example:
      "lganame,year,category,parameter_key,parameter_label,raw_value,unit,normalized_score,data_source,notes",
    templateRows: [
      [
        "lganame",
        "year",
        "category",
        "parameter_key",
        "parameter_label",
        "raw_value",
        "unit",
        "normalized_score",
        "data_source",
        "notes",
      ],
      [
        "Birnin Gwari",
        "2025",
        "flood",
        "flood_prone_area_km2",
        "Flood-prone area",
        "125.5",
        "km2",
        "78",
        "Development test",
        "Raw value is measured data; normalized score is /100",
      ],
      [
        "Birnin Gwari",
        "2025",
        "drought",
        "rainfall_anomaly",
        "Rainfall anomaly",
        "-18.5",
        "%",
        "70",
        "Development test",
        "Raw value is measured data; normalized score is /100",
      ],
    ],
  },
];


function getStatusClass(status) {
  if (status === "completed") {
    return "bg-emerald-50 text-emerald-700";
  }

  if (status === "completed_with_errors") {
    return "bg-amber-50 text-amber-700";
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
          <p className="text-sm font-medium text-emerald-700">
            Climate Data Intake
          </p>
          <h2 className="mt-1 text-lg font-bold">
            Upload Processed Climate Risk CSV
          </h2>
          <p className="mt-1 max-w-3xl text-sm text-slate-500">
            Upload pre-processed LGA-level climate datasets prepared from GIS,
            remote sensing, NiMet, CHIRPS, MODIS, ERA5, NBS, OSM, or KADGIS
            workflows. The importer updates LGA risk scores and stores extra
            numeric columns as parameter evidence.
          </p>
        </div>

        <button
          type="button"
          onClick={loadUploads}
          className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Refresh uploads
        </button>
      </div>

      {!canManage && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          Only Admin and Analyst users can upload climate risk datasets.
        </div>
      )}

      {canManage && (
        <form
          onSubmit={handleSubmit}
          className="rounded-2xl border border-slate-200 bg-slate-50 p-5"
        >
          {(message || error) && (
            <div
              className={`mb-5 rounded-xl border p-3 text-sm ${
                error
                  ? "border-red-200 bg-red-50 text-red-700"
                  : "border-emerald-200 bg-emerald-50 text-emerald-700"
              }`}
            >
              {error || message}
            </div>
          )}

          <div className="grid gap-4 lg:grid-cols-3">
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                Dataset Type
              </label>
              <select
                value={datasetType}
                onChange={(event) => setDatasetType(event.target.value)}
                className="w-full rounded-xl border border-slate-300 px-4 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
              >
                {datasetTypeOptions.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>

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

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                CSV File
              </label>
              <input
                id="climate-risk-upload-file"
                type="file"
                accept=".csv,text/csv"
                onChange={(event) => setFile(event.target.files?.[0] || null)}
                className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                required
              />
            </div>
          </div>

          <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
            <div className="mb-4 flex flex-col justify-between gap-3 md:flex-row md:items-center">
              <div>
                <p className="font-semibold">Template for selected dataset</p>
                <p className="text-xs">
                  Download, edit in Excel/QGIS/Python, then upload the completed CSV.
                </p>
              </div>

              <button
                type="button"
                onClick={() => downloadCsvTemplate(selectedDataset)}
                className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700"
              >
                Download CSV Template
              </button>
            </div>
            <p className="font-semibold">Required columns</p>
            <p className="mt-1">{selectedDataset?.requiredColumns}</p>

            <p className="mt-3 font-semibold">Example header</p>
            <code className="mt-1 block overflow-x-auto rounded-lg bg-white px-3 py-2 text-xs text-slate-700">
              {selectedDataset?.example}
            </code>
          </div>

          <button
            type="submit"
            disabled={isUploading}
            className="mt-5 rounded-xl bg-emerald-600 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-400"
          >
            {isUploading ? "Uploading..." : "Upload and Import CSV"}
          </button>
        </form>
      )}

      <div className="mt-6">
        <div className="mb-3 flex items-center justify-between gap-4">
          <h3 className="font-bold">Recent Uploads</h3>
          {isLoadingUploads && (
            <span className="text-sm text-slate-500">Loading...</span>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1000px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="px-3 py-3 font-medium">Dataset</th>
                <th className="px-3 py-3 font-medium">Year</th>
                <th className="px-3 py-3 font-medium">File</th>
                <th className="px-3 py-3 font-medium">Status</th>
                <th className="px-3 py-3 font-medium">Rows</th>
                <th className="px-3 py-3 font-medium">Imported</th>
                <th className="px-3 py-3 font-medium">Failed</th>
                <th className="px-3 py-3 font-medium">Uploaded By</th>
                <th className="px-3 py-3 font-medium">Date</th>
              </tr>
            </thead>

            <tbody>
              {uploads.map((upload) => (
                <tr
                  key={upload.id}
                  className="border-b border-slate-100 align-top last:border-0"
                >
                  <td className="px-3 py-4 font-semibold">
                    {upload.dataset_type_display}
                  </td>
                  <td className="px-3 py-4">{upload.year}</td>
                  <td className="px-3 py-4">
                    <p>{upload.original_filename}</p>

                    {upload.validation_errors?.length > 0 && (
                      <details className="mt-2">
                        <summary className="cursor-pointer text-xs font-medium text-red-600">
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
                      className={`rounded-full px-3 py-1 text-xs font-medium ${getStatusClass(
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
    </section>
  );
}