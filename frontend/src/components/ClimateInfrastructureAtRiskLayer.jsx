import L from "leaflet";
import { useEffect, useMemo, useState } from "react";
import {
  CircleMarker,
  MapContainer,
  Popup,
  TileLayer,
  useMap,
} from "react-leaflet";
import {
  createClimateInfrastructureAsset,
  getClimateInfrastructureAssets,
} from "../services/api";

const NIGERIA_BOUNDS = [
  [3.5, 2.5],
  [14.5, 15.5],
];

const assetTypeOptions = [
  { value: "school", label: "School" },
  { value: "hospital", label: "Hospital" },
  { value: "market", label: "Market" },
  { value: "road_bridge", label: "Road / Bridge" },
  { value: "water_facility", label: "Water Facility" },
  { value: "settlement", label: "Settlement" },
  { value: "government_facility", label: "Government Facility" },
  { value: "other", label: "Other" },
];

const riskStatusOptions = [
  { value: "low", label: "Low" },
  { value: "moderate", label: "Moderate" },
  { value: "high", label: "High" },
  { value: "very_high", label: "Very High" },
];

const initialForm = {
  asset_type: "school",
  asset_name: "",
  latitude: "",
  longitude: "",
  exposure_score: "50",
  risk_status: "moderate",
  data_source: "",
  notes: "",
};

function formatNumber(value, maximumFractionDigits = 2) {
  if (value === null || value === undefined || value === "") return "—";

  return Number(value || 0).toLocaleString(undefined, {
    maximumFractionDigits,
  });
}

function getRiskClass(status) {
  if (status === "very_high") return "bg-red-50 text-red-700";
  if (status === "high") return "bg-orange-50 text-orange-700";
  if (status === "moderate") return "bg-amber-50 text-amber-700";
  return "bg-emerald-50 text-emerald-700";
}

function getCircleColor(status) {
  if (status === "very_high") return "#dc2626";
  if (status === "high") return "#f97316";
  if (status === "moderate") return "#f59e0b";
  return "#16a34a";
}

function FitAssetBounds({ assets }) {
  const map = useMap();

  useEffect(() => {
    const validPoints = assets
      .map((asset) => [Number(asset.latitude), Number(asset.longitude)])
      .filter(([lat, lng]) => Number.isFinite(lat) && Number.isFinite(lng));

    if (!validPoints.length) return;

    const bounds = L.latLngBounds(validPoints);

    if (bounds.isValid()) {
      map.fitBounds(bounds, {
        padding: [30, 30],
        maxZoom: 12,
      });
    }
  }, [assets, map]);

  return null;
}

export default function ClimateInfrastructureAtRiskLayer({
  selectedProfile,
  canManage,
}) {
  const [assets, setAssets] = useState([]);
  const [assetTypeFilter, setAssetTypeFilter] = useState("all");
  const [riskStatusFilter, setRiskStatusFilter] = useState("all");
  const [form, setForm] = useState(initialForm);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const selectedLgaId = selectedProfile?.lga || selectedProfile?.lga_id || "";

  async function loadAssets() {
    if (!selectedLgaId) {
      setAssets([]);
      return;
    }

    setIsLoading(true);
    setError("");

    try {
      const params = {
        lga: selectedLgaId,
        year: selectedProfile?.year || 2025,
      };

      if (assetTypeFilter !== "all") {
        params.asset_type = assetTypeFilter;
      }

      if (riskStatusFilter !== "all") {
        params.risk_status = riskStatusFilter;
      }

      const data = await getClimateInfrastructureAssets(params);
      setAssets(data.results || []);
    } catch (err) {
      console.error(err);
      setError("Could not load infrastructure assets.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadAssets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    selectedLgaId,
    selectedProfile?.year,
    assetTypeFilter,
    riskStatusFilter,
  ]);

  const summary = useMemo(() => {
    const counts = {
      total: assets.length,
      low: 0,
      moderate: 0,
      high: 0,
      very_high: 0,
    };

    assets.forEach((asset) => {
      if (counts[asset.risk_status] !== undefined) {
        counts[asset.risk_status] += 1;
      }
    });

    return counts;
  }, [assets]);

  function updateForm(field, value) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (!selectedLgaId || !canManage) return;

    setIsSaving(true);
    setMessage("");
    setError("");

    const payload = {
      lga: Number(selectedLgaId),
      year: Number(selectedProfile?.year || 2025),
      asset_type: form.asset_type,
      asset_name: form.asset_name,
      latitude: Number(form.latitude),
      longitude: Number(form.longitude),
      exposure_score: Number(form.exposure_score),
      risk_status: form.risk_status,
      data_source: form.data_source,
      notes: form.notes,
      is_active: true,
    };

    try {
      await createClimateInfrastructureAsset(payload);

      setMessage("Infrastructure asset added successfully.");
      setForm(initialForm);
      await loadAssets();
    } catch (err) {
      console.error(err);
      setError(
        err?.response?.data
          ? JSON.stringify(err.response.data)
          : "Could not save infrastructure asset."
      );
    } finally {
      setIsSaving(false);
    }
  }

  if (!selectedProfile) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-bold">Infrastructure-at-Risk Layer</h2>
        <p className="mt-2 text-sm text-slate-500">
          Select an LGA to view exposed infrastructure and critical assets.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-5 flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
        <div>
          <p className="text-sm font-medium text-emerald-700">
            Infrastructure-at-Risk Layer
          </p>
          <h2 className="mt-1 text-2xl font-bold">
            Exposed Assets in {selectedProfile.lga_name}
          </h2>
          <p className="mt-2 max-w-3xl text-sm text-slate-500">
            Map and manage schools, hospitals, markets, roads/bridges, water
            facilities, settlements, and other assets exposed to climate risk.
          </p>
        </div>

        <button
          type="button"
          onClick={loadAssets}
          className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          Refresh Assets
        </button>
      </div>

      {error && (
        <div className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {message && (
        <div className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
          {message}
        </div>
      )}

      <div className="mb-5 grid gap-4 md:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs text-slate-500">Total Assets</p>
          <p className="mt-2 text-2xl font-bold">{summary.total}</p>
        </div>

        <div className="rounded-2xl border border-red-200 bg-red-50 p-4">
          <p className="text-xs text-red-700">Very High Risk</p>
          <p className="mt-2 text-2xl font-bold text-red-700">
            {summary.very_high}
          </p>
        </div>

        <div className="rounded-2xl border border-orange-200 bg-orange-50 p-4">
          <p className="text-xs text-orange-700">High Risk</p>
          <p className="mt-2 text-2xl font-bold text-orange-700">
            {summary.high}
          </p>
        </div>

        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-xs text-amber-700">Moderate Risk</p>
          <p className="mt-2 text-2xl font-bold text-amber-700">
            {summary.moderate}
          </p>
        </div>
      </div>

      {canManage && (
        <form
          onSubmit={handleSubmit}
          className="mb-6 rounded-2xl border border-slate-200 bg-slate-50 p-5"
        >
          <div className="mb-4">
            <h3 className="font-bold">Add Infrastructure Asset</h3>
            <p className="text-sm text-slate-500">
              Use latitude and longitude from QGIS, GPS, OSM, KADGIS, or field
              survey data.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                Asset Type
              </label>
              <select
                value={form.asset_type}
                onChange={(event) =>
                  updateForm("asset_type", event.target.value)
                }
                className="w-full rounded-xl border border-slate-300 px-4 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
              >
                {assetTypeOptions.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                Asset Name
              </label>
              <input
                value={form.asset_name}
                onChange={(event) =>
                  updateForm("asset_name", event.target.value)
                }
                className="w-full rounded-xl border border-slate-300 px-4 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                placeholder="Example: General Hospital Kafanchan"
                required
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                Risk Status
              </label>
              <select
                value={form.risk_status}
                onChange={(event) =>
                  updateForm("risk_status", event.target.value)
                }
                className="w-full rounded-xl border border-slate-300 px-4 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
              >
                {riskStatusOptions.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                Latitude
              </label>
              <input
                type="number"
                step="0.0000001"
                value={form.latitude}
                onChange={(event) => updateForm("latitude", event.target.value)}
                className="w-full rounded-xl border border-slate-300 px-4 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                placeholder="10.5222"
                required
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                Longitude
              </label>
              <input
                type="number"
                step="0.0000001"
                value={form.longitude}
                onChange={(event) =>
                  updateForm("longitude", event.target.value)
                }
                className="w-full rounded-xl border border-slate-300 px-4 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                placeholder="7.4383"
                required
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                Exposure Score /100
              </label>
              <input
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={form.exposure_score}
                onChange={(event) =>
                  updateForm("exposure_score", event.target.value)
                }
                className="w-full rounded-xl border border-slate-300 px-4 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                required
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                Data Source
              </label>
              <input
                value={form.data_source}
                onChange={(event) =>
                  updateForm("data_source", event.target.value)
                }
                className="w-full rounded-xl border border-slate-300 px-4 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                placeholder="OSM, KADGIS, Field Survey..."
              />
            </div>

            <div className="md:col-span-2">
              <label className="mb-2 block text-sm font-medium text-slate-700">
                Notes
              </label>
              <input
                value={form.notes}
                onChange={(event) => updateForm("notes", event.target.value)}
                className="w-full rounded-xl border border-slate-300 px-4 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                placeholder="Describe hazard exposure or asset condition..."
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isSaving}
            className="mt-4 rounded-xl bg-emerald-600 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-400"
          >
            {isSaving ? "Saving..." : "Save Asset"}
          </button>
        </form>
      )}

      <div className="mb-5 flex flex-wrap gap-3">
        <select
          value={assetTypeFilter}
          onChange={(event) => setAssetTypeFilter(event.target.value)}
          className="rounded-xl border border-slate-300 px-4 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
        >
          <option value="all">All asset types</option>
          {assetTypeOptions.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>

        <select
          value={riskStatusFilter}
          onChange={(event) => setRiskStatusFilter(event.target.value)}
          className="rounded-xl border border-slate-300 px-4 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
        >
          <option value="all">All risk levels</option>
          {riskStatusOptions.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
      </div>

      <div className="grid items-start gap-6 xl:grid-cols-3">
        <div className="h-fit self-start overflow-hidden rounded-2xl border border-slate-200 xl:col-span-2">
          <MapContainer
            center={[10.45, 7.75]}
            zoom={8}
            minZoom={6}
            maxZoom={15}
            maxBounds={NIGERIA_BOUNDS}
            maxBoundsViscosity={1.0}
            scrollWheelZoom={false}
            style={{ height: "420px", width: "100%" }}
          >
            <TileLayer
              attribution="&copy; OpenStreetMap contributors"
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />

            <FitAssetBounds assets={assets} />

            {assets.map((asset) => {
              const lat = Number(asset.latitude);
              const lng = Number(asset.longitude);

              if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
                return null;
              }

              return (
                <CircleMarker
                  key={asset.id}
                  center={[lat, lng]}
                  radius={8}
                  pathOptions={{
                    color: getCircleColor(asset.risk_status),
                    fillColor: getCircleColor(asset.risk_status),
                    fillOpacity: 0.85,
                    weight: 2,
                  }}
                >
                  <Popup>
                    <div style={{ minWidth: "210px" }}>
                      <strong>{asset.asset_name}</strong>
                      <br />
                      <span>{asset.asset_type_display}</span>
                      <br />
                      <span>
                        Exposure:{" "}
                        <strong>
                          {formatNumber(asset.exposure_score, 2)} / 100
                        </strong>
                      </span>
                      <br />
                      <span>Risk: {asset.risk_status_display}</span>
                      <br />
                      <span>Source: {asset.data_source || "—"}</span>
                    </div>
                  </Popup>
                </CircleMarker>
              );
            })}
          </MapContainer>
        </div>

        <div className="h-fit self-start rounded-2xl border border-slate-200 bg-white p-5">
          <h3 className="font-bold">Asset List</h3>
          <p className="mt-1 text-sm text-slate-500">
            Assets currently recorded for {selectedProfile.lga_name}.
          </p>

          {isLoading ? (
            <p className="mt-4 text-sm text-slate-500">Loading assets...</p>
          ) : assets.length === 0 ? (
            <p className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
              No infrastructure assets recorded for this LGA/year yet.
            </p>
          ) : (
            <div className="mt-4 max-h-[420px] space-y-3 overflow-y-auto pr-1">
              {assets.map((asset) => (
                <div
                  key={asset.id}
                  className="rounded-xl border border-slate-200 p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold">{asset.asset_name}</p>
                      <p className="text-xs text-slate-500">
                        {asset.asset_type_display}
                      </p>
                    </div>

                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${getRiskClass(
                        asset.risk_status
                      )}`}
                    >
                      {asset.risk_status_display}
                    </span>
                  </div>

                  <p className="mt-3 text-sm text-slate-600">
                    Exposure:{" "}
                    <span className="font-semibold">
                      {formatNumber(asset.exposure_score, 2)} / 100
                    </span>
                  </p>

                  <p className="mt-1 text-xs text-slate-400">
                    {formatNumber(asset.latitude, 6)},{" "}
                    {formatNumber(asset.longitude, 6)}
                  </p>

                  {asset.notes && (
                    <p className="mt-2 text-xs text-slate-500">
                      {asset.notes}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}