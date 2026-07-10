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

const inputClass =
  "w-full rounded-md border border-slate-200 bg-white px-4 py-3 text-sm text-[#030454] outline-none transition placeholder:text-slate-400 focus:border-[#009B35] focus:ring-2 focus:ring-[#009B35]/10";

function formatNumber(value, maximumFractionDigits = 2) {
  if (value === null || value === undefined || value === "") return "—";

  return Number(value || 0).toLocaleString(undefined, {
    maximumFractionDigits,
  });
}

function getRiskClass(status) {
  if (status === "very_high") return "bg-red-50 text-red-700";
  if (status === "high") return "bg-orange-50 text-orange-700";
  if (status === "moderate") return "bg-[#F3F74B]/45 text-[#030454]";
  return "bg-[#009B35]/10 text-[#009B35]";
}

function getCircleColor(status) {
  if (status === "very_high") return "#B91C1C";
  if (status === "high") return "#EA580C";
  if (status === "moderate") return "#F3F74B";
  return "#009B35";
}

function StatCard({ label, value, tone = "blue" }) {
  const toneClasses = {
    blue: "border-[#030454]/15 bg-[#030454]/5",
    green: "border-[#009B35]/20 bg-[#009B35]/8",
    yellow: "border-[#F3F74B]/70 bg-[#F3F74B]/25",
    red: "border-red-200 bg-red-50",
    orange: "border-orange-200 bg-orange-50",
  };

  return (
    <div
      className={`rounded-2xl border p-4 shadow-sm ${
        toneClasses[tone] || toneClasses.blue
      }`}
    >
      <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">
        {label}
      </p>

      <p className="mt-2 text-2xl font-black text-[#030454]">{value}</p>
    </div>
  );
}

function Notice({ type = "success", children }) {
  const classes = {
    success: "border-[#009B35] bg-[#009B35]/8 text-[#030454]",
    error: "border-red-400 bg-red-50 text-red-700",
  };

  return (
    <div
      className={`rounded-r-xl border-l-4 px-5 py-4 text-sm leading-6 ${
        classes[type] || classes.success
      }`}
    >
      {children}
    </div>
  );
}

function FitAssetBounds({ assets }) {
  const map = useMap();

  useEffect(() => {
    const validPoints = assets
      .map((asset) => [Number(asset.latitude), Number(asset.longitude)])
      .filter(([lat, lng]) => Number.isFinite(lat) && Number.isFinite(lng));

    if (!validPoints.length) return undefined;

    const fit = () => {
      try {
        map.invalidateSize();

        const bounds = L.latLngBounds(validPoints);

        if (bounds.isValid()) {
          map.fitBounds(bounds, {
            padding: [30, 30],
            maxZoom: 12,
          });
        }
      } catch (error) {
        console.error(error);
      }
    };

    const timer = window.setTimeout(fit, 150);

    return () => window.clearTimeout(timer);
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
        <h2 className="text-xl font-black text-[#030454]">
          Infrastructure-at-Risk Layer
        </h2>

        <p className="mt-2 text-sm leading-6 text-slate-500">
          Select an LGA to view exposed infrastructure and critical assets.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-5 flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.14em] text-[#009B35]">
            Infrastructure-at-Risk Layer
          </p>

          <h2 className="mt-2 text-2xl font-black text-[#030454]">
            Exposed Assets in {selectedProfile.lga_name}
          </h2>

          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            Map and manage schools, hospitals, markets, roads/bridges, water
            facilities, settlements, and other assets exposed to Climate Intelligence.
          </p>
        </div>

        <button
          type="button"
          onClick={loadAssets}
          className="rounded-md border border-slate-200 bg-white px-5 py-3 text-xs font-black uppercase tracking-[0.08em] text-[#030454] transition hover:border-[#009B35] hover:text-[#009B35]"
        >
          Refresh Assets
        </button>
      </div>

      <div className="mb-5 space-y-4">
        {error && <Notice type="error">{error}</Notice>}
        {message && <Notice type="success">{message}</Notice>}
      </div>

      <div className="mb-5 grid gap-4 md:grid-cols-4">
        <StatCard label="Total Assets" value={summary.total} tone="blue" />
        <StatCard label="Very High Risk" value={summary.very_high} tone="red" />
        <StatCard label="High Risk" value={summary.high} tone="orange" />
        <StatCard label="Moderate Risk" value={summary.moderate} tone="yellow" />
      </div>

      {canManage && (
        <form
          onSubmit={handleSubmit}
          className="mb-6 rounded-2xl border border-slate-200 bg-slate-50 p-5"
        >
          <div className="mb-4">
            <h3 className="text-xl font-black text-[#030454]">
              Add Infrastructure Asset
            </h3>

            <p className="mt-1 text-sm leading-6 text-slate-600">
              Use latitude and longitude from QGIS, GPS, OSM, KADGIS, or field
              survey data.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <label className="mb-2 block text-sm font-bold text-[#030454]">
                Asset Type
              </label>

              <select
                value={form.asset_type}
                onChange={(event) =>
                  updateForm("asset_type", event.target.value)
                }
                className={inputClass}
              >
                {assetTypeOptions.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-bold text-[#030454]">
                Asset Name
              </label>

              <input
                value={form.asset_name}
                onChange={(event) =>
                  updateForm("asset_name", event.target.value)
                }
                className={inputClass}
                placeholder="Example: General Hospital Kafanchan"
                required
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-bold text-[#030454]">
                Risk Status
              </label>

              <select
                value={form.risk_status}
                onChange={(event) =>
                  updateForm("risk_status", event.target.value)
                }
                className={inputClass}
              >
                {riskStatusOptions.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-bold text-[#030454]">
                Latitude
              </label>

              <input
                type="number"
                step="0.0000001"
                value={form.latitude}
                onChange={(event) => updateForm("latitude", event.target.value)}
                className={inputClass}
                placeholder="10.5222"
                required
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-bold text-[#030454]">
                Longitude
              </label>

              <input
                type="number"
                step="0.0000001"
                value={form.longitude}
                onChange={(event) =>
                  updateForm("longitude", event.target.value)
                }
                className={inputClass}
                placeholder="7.4383"
                required
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-bold text-[#030454]">
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
                className={inputClass}
                required
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-bold text-[#030454]">
                Data Source
              </label>

              <input
                value={form.data_source}
                onChange={(event) =>
                  updateForm("data_source", event.target.value)
                }
                className={inputClass}
                placeholder="OSM, KADGIS, Field Survey..."
              />
            </div>

            <div className="md:col-span-2">
              <label className="mb-2 block text-sm font-bold text-[#030454]">
                Notes
              </label>

              <input
                value={form.notes}
                onChange={(event) => updateForm("notes", event.target.value)}
                className={inputClass}
                placeholder="Describe hazard exposure or asset condition..."
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isSaving}
            className="mt-4 rounded-md bg-[#009B35] px-5 py-3 text-xs font-black uppercase tracking-[0.08em] text-white transition hover:bg-[#00842e] disabled:cursor-not-allowed disabled:bg-slate-400"
          >
            {isSaving ? "Saving..." : "Save Asset"}
          </button>
        </form>
      )}

      <div className="mb-5 flex flex-wrap gap-3">
        <select
          value={assetTypeFilter}
          onChange={(event) => setAssetTypeFilter(event.target.value)}
          className="rounded-md border border-slate-200 bg-white px-4 py-3 text-sm text-[#030454] outline-none transition focus:border-[#009B35] focus:ring-2 focus:ring-[#009B35]/10"
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
          className="rounded-md border border-slate-200 bg-white px-4 py-3 text-sm text-[#030454] outline-none transition focus:border-[#009B35] focus:ring-2 focus:ring-[#009B35]/10"
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
            style={{ height: "520px", width: "100%" }}
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
          <h3 className="text-xl font-black text-[#030454]">Asset List</h3>

          <p className="mt-1 text-sm leading-6 text-slate-500">
            Assets currently recorded for {selectedProfile.lga_name}.
          </p>

          {isLoading ? (
            <p className="mt-4 text-sm text-slate-500">Loading assets...</p>
          ) : assets.length === 0 ? (
            <p className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
              No infrastructure assets recorded for this LGA/year yet.
            </p>
          ) : (
            <div className="mt-4 max-h-[520px] space-y-3 overflow-y-auto pr-1">
              {assets.map((asset) => (
                <div
                  key={asset.id}
                  className="rounded-xl border border-slate-200 p-4 transition hover:border-[#009B35]/60 hover:bg-[#009B35]/5"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-black text-[#030454]">
                        {asset.asset_name}
                      </p>

                      <p className="text-xs text-slate-500">
                        {asset.asset_type_display}
                      </p>
                    </div>

                    <span
                      className={`rounded-md px-3 py-1 text-xs font-bold ${getRiskClass(
                        asset.risk_status
                      )}`}
                    >
                      {asset.risk_status_display}
                    </span>
                  </div>

                  <p className="mt-3 text-sm text-slate-600">
                    Exposure:{" "}
                    <span className="font-black text-[#030454]">
                      {formatNumber(asset.exposure_score, 2)} / 100
                    </span>
                  </p>

                  <p className="mt-1 text-xs text-slate-400">
                    {formatNumber(asset.latitude, 6)},{" "}
                    {formatNumber(asset.longitude, 6)}
                  </p>

                  {asset.notes && (
                    <p className="mt-2 text-xs leading-5 text-slate-500">
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