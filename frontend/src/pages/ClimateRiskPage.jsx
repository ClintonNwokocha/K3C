import { useEffect, useMemo, useState } from "react";
import ClimateActionLensMap from "../components/ClimateActionLensMap";
import ClimateRiskDatasetUploadPanel from "../components/ClimateRiskDatasetUploadPanel";
import ClimateRiskScoringPanel from "../components/ClimateRiskScoringPanel";
import ClimateRiskEditPanel from "../components/ClimateRiskEditPanel";
import ClimateRiskMap from "../components/ClimateRiskMap";
import ClimateRiskParameterPanel from "../components/ClimateRiskParameterPanel";
import ClimateRiskHazardExplorer from "../components/ClimateRiskHazardExplorer";
import ClimateRiskEvidenceBrief from "../components/ClimateRiskEvidenceBrief";
import ClimateInfrastructureAtRiskLayer from "../components/ClimateInfrastructureAtRiskLayer";
import ClimateInfrastructureAssetImportPanel from "../components/ClimateInfrastructureAssetImportPanel";
import ClimateRiskDataQualityPanel from "../components/ClimateRiskDataQualityPanel";
import ClimateRiskScoringTransparencyPanel from "../components/ClimateRiskScoringTransparencyPanel";
import ClimateRiskLinkedProjectsPanel from "../components/ClimateRiskLinkedProjectsPanel";
import {
  CommandButton,
  CommandNotice,
  CommandPageHeader,
  CommandSection,
  CommandStatCard,
  CommandTabs,
} from "../components/CommandUI";
import { getClimateActionScreeningData, getClimateRiskProfiles } from "../services/api";
import { canManageClimateRisk, canViewInternalModules } from "../utils/permissions";
import { derivePathwaysFromIndicators, READINESS } from "../utils/climatePathways";

const COLORS = {
  blue: "#030454",
  green: "#009B35",
  yellow: "#F3F74B",
  white: "#FFFFFF",
};

function normalizeName(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function formatNumber(value, maximumFractionDigits = 2) {
  return Number(value || 0).toLocaleString(undefined, {
    maximumFractionDigits,
  });
}

function getRiskClass(level) {
  if (level === "very_high") return "bg-red-50 text-red-700";
  if (level === "high") return "bg-orange-50 text-orange-700";
  if (level === "moderate") return "bg-[#F3F74B]/45 text-[#030454]";
  return "bg-[#009B35]/10 text-[#009B35]";
}

function getRiskBarColor(level) {
  if (level === "very_high") return "#B91C1C";
  if (level === "high") return "#EA580C";
  if (level === "moderate") return COLORS.yellow;
  return COLORS.green;
}

function getMetricBarColor(value, reverse = false) {
  const number = Number(value || 0);

  if (reverse) {
    if (number >= 70) return COLORS.green;
    if (number >= 55) return "#26B45B";
    if (number >= 40) return COLORS.yellow;
    return "#B91C1C";
  }

  if (number >= 75) return "#B91C1C";
  if (number >= 60) return "#EA580C";
  if (number >= 40) return COLORS.yellow;
  return COLORS.green;
}

function scoreLabel(value) {
  const number = Number(value || 0);

  if (number >= 75) return "Very High";
  if (number >= 60) return "High";
  if (number >= 40) return "Moderate";
  return "Low";
}

const climateRiskTabs = [
  { key: "overview", label: "Overview" },
  { key: "map", label: "Risk Map" },
  { key: "parameters", label: "Parameters" },
  { key: "scoring", label: "Scoring Engine" },
  { key: "hazards", label: "Hazards" },
  { key: "evidence", label: "Evidence" },
  { key: "infrastructure", label: "Infrastructure" },
  { key: "quality", label: "Data Quality" },
  { key: "transparency", label: "Transparency" },
  { key: "projects", label: "Linked Projects" },
  { key: "table", label: "Risk Table" },
  { key: "screening", label: "Climate Action Screening" },
];

function IndexExplanationBox() {
  return (
    <CommandNotice title="How to read the Climate Intelligence scores" tone="blue">
      <p>
        Risk values shown on this page are normalized indexes from{" "}
        <strong>0 to 100</strong>. A higher hazard, exposure, or vulnerability
        score means higher concern. Adaptive capacity is different: a higher
        adaptive capacity score means stronger ability to cope.
      </p>

      <div className="mt-4 grid gap-2 text-xs md:grid-cols-4">
        <div className="rounded-lg bg-[#009B35]/10 px-3 py-2 font-semibold text-[#009B35]">
          0–39: Low
        </div>
        <div className="rounded-lg bg-[#F3F74B]/40 px-3 py-2 font-semibold text-[#030454]">
          40–59: Moderate
        </div>
        <div className="rounded-lg bg-orange-50 px-3 py-2 font-semibold text-orange-700">
          60–74: High
        </div>
        <div className="rounded-lg bg-red-50 px-3 py-2 font-semibold text-red-700">
          75–100: Very High
        </div>
      </div>
    </CommandNotice>
  );
}

function MetricRow({ label, value, reverse = false, helperText = "" }) {
  const number = Number(value || 0);
  const width = `${Math.min(Math.max(number, 0), 100)}%`;

  return (
    <div>
      <div className="mb-1 flex justify-between gap-3 text-sm">
        <div>
          <span className="font-medium text-slate-600">{label}</span>
          {helperText && <p className="text-xs text-slate-400">{helperText}</p>}
        </div>

        <span className="font-bold text-[#030454]">
          {formatNumber(number, 2)} / 100
        </span>
      </div>

      <div className="h-2 overflow-hidden rounded-full bg-slate-100">
        <div
          className="h-full rounded-full"
          style={{
            width,
            backgroundColor: getMetricBarColor(number, reverse),
          }}
        />
      </div>
    </div>
  );
}

function LGADetailPanel({ selectedLgaName, selectedProfile }) {
  if (!selectedLgaName) {
    return (
      <CommandSection
        title="No LGA selected"
        description="Click any LGA polygon on the map or any row in the table to view its Climate Intelligence details."
      >
        <div />
      </CommandSection>
    );
  }

  if (!selectedProfile) {
    return (
      <CommandNotice title={selectedLgaName} tone="yellow">
        This LGA was selected, but no matching Climate Intelligence profile was found.
        Check that the GeoJSON LGA name matches the database LGA name.
      </CommandNotice>
    );
  }

  return (
    <CommandSection
      title={selectedProfile.lga_name}
      description={`Risk profile year: ${selectedProfile.year}`}
      actions={
        <span
          className={`rounded-md px-3 py-1 text-xs font-black uppercase tracking-[0.08em] ${getRiskClass(
            selectedProfile.risk_level
          )}`}
        >
          {selectedProfile.risk_level_display}
        </span>
      }
    >
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-5">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">
          Overall Climate Intelligence Index
        </p>

        <p className="mt-3 text-4xl font-black text-[#030454]">
          {formatNumber(selectedProfile.overall_risk_score, 2)}
          <span className="text-lg font-semibold text-slate-400"> / 100</span>
        </p>

        <p className="mt-1 text-sm text-slate-500">
          Class: {scoreLabel(selectedProfile.overall_risk_score)}
        </p>
      </div>

      <div className="mt-6 space-y-4">
        <MetricRow
          label="Flood Risk Index"
          value={selectedProfile.flood_risk_score}
          helperText="Higher score means higher flood concern."
        />

        <MetricRow
          label="Drought Risk Index"
          value={selectedProfile.drought_risk_score}
          helperText="Higher score means higher drought concern."
        />

        <MetricRow
          label="Heat Risk Index"
          value={selectedProfile.heat_risk_score}
          helperText="Higher score means higher heat concern."
        />

        <MetricRow
          label="Erosion Risk Index"
          value={selectedProfile.erosion_risk_score}
          helperText="Higher score means higher erosion concern."
        />

        <MetricRow
          label="Exposure Index"
          value={selectedProfile.exposure_score}
          helperText="Higher score means more people/assets are exposed."
        />

        <MetricRow
          label="Vulnerability Index"
          value={selectedProfile.vulnerability_score}
          helperText="Higher score means greater social or economic sensitivity."
        />

        <MetricRow
          label="Adaptive Capacity Index"
          value={selectedProfile.adaptive_capacity_score}
          reverse
          helperText="Higher score is better; it reduces final risk."
        />
      </div>

      <div className="mt-6 rounded-xl border border-slate-200 p-4 text-sm">
        <p className="font-black text-[#030454]">Notes</p>
        <p className="mt-1 text-slate-500">
          {selectedProfile.notes || "No notes provided."}
        </p>
      </div>

      <div className="mt-4 text-xs text-slate-400">
        Data source: {selectedProfile.data_source || "Not specified"}
      </div>
    </CommandSection>
  );
}

function SummaryCards({ summary }) {
  return (
    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <CommandStatCard
        label="LGAs Assessed"
        value={summary?.total_lgas || 0}
        helper="Active risk profiles in current view."
        tone="blue"
      />

      <CommandStatCard
        label="Average Risk Index"
        value={formatNumber(summary?.average_overall_risk, 2)}
        helper="Weighted average across selected LGAs."
        tone="green"
      />

      <CommandStatCard
        label="Highest Risk Index"
        value={formatNumber(summary?.highest_overall_risk, 2)}
        helper="Highest overall score in current view."
        tone="red"
      />

      <CommandStatCard
        label="High / Very High LGAs"
        value={summary?.high_or_very_high_count || 0}
        helper="Priority LGAs for adaptation planning."
        tone="orange"
      />
    </section>
  );
}

function TopLgasPanel({
  topLgas,
  setSelectedLgaName,
  setActiveTab,
  showOpenTable = false,
}) {
  return (
    <CommandSection
      title="Highest-risk LGAs"
      description="Top LGAs by overall Climate Intelligence index."
      actions={
        showOpenTable && typeof setActiveTab === "function" ? (
          <CommandButton variant="outline" onClick={() => setActiveTab("table")}>
            Open Table
          </CommandButton>
        ) : null
      }
    >
      <div className="space-y-3">
        {topLgas.map((profile, index) => {
          const riskWidth = `${Math.min(
            Math.max(Number(profile.overall_risk_score || 0), 4),
            100
          )}%`;

          return (
            <button
              key={profile.id}
              type="button"
              onClick={() => setSelectedLgaName(profile.lga_name)}
              className="w-full rounded-xl border border-slate-200 bg-white p-4 text-left transition hover:border-[#009B35]/60 hover:bg-[#009B35]/5"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-black text-[#030454]">
                    {index + 1}. {profile.lga_name}
                  </p>
                  <p className="text-xs text-slate-500">
                    {profile.risk_level_display}
                  </p>
                </div>

                <span className="text-lg font-black text-[#030454]">
                  {formatNumber(profile.overall_risk_score, 2)}
                </span>
              </div>

              <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: riskWidth,
                    backgroundColor: getRiskBarColor(profile.risk_level),
                  }}
                />
              </div>
            </button>
          );
        })}

        {topLgas.length === 0 && (
          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-5 text-sm text-slate-500">
            No highest-risk ranking available yet.
          </div>
        )}
      </div>
    </CommandSection>
  );
}

function OverviewSection({
  summary,
  selectedLgaName,
  selectedProfile,
  topLgas,
  setSelectedLgaName,
  setActiveTab,
}) {
  return (
    <>
      <SummaryCards summary={summary} />

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <LGADetailPanel
          selectedLgaName={selectedLgaName}
          selectedProfile={selectedProfile}
        />

        <TopLgasPanel
          topLgas={topLgas}
          setSelectedLgaName={setSelectedLgaName}
          setActiveTab={setActiveTab}
          showOpenTable
        />
      </div>

      <IndexExplanationBox />
    </>
  );
}

function RiskMapSection({
  profiles,
  mapMetric,
  setMapMetric,
  selectedLgaName,
  setSelectedLgaName,
  selectedProfile,
  canManageRisk,
  loadRiskProfiles,
}) {
  return (
    <CommandSection
      title="LGA risk choropleth map"
      description="Click an LGA polygon to open its full risk detail panel. Use the selector to switch between risk dimensions."
      actions={
        <select
          value={mapMetric}
          onChange={(event) => setMapMetric(event.target.value)}
          className="rounded-md border border-slate-200 bg-white px-4 py-3 text-sm text-[#030454] outline-none focus:border-[#009B35] focus:ring-2 focus:ring-[#009B35]/10"
        >
          <option value="overall">Overall Climate Intelligence Index</option>
          <option value="flood">Flood Risk Index</option>
          <option value="drought">Drought Risk Index</option>
          <option value="heat">Heat Risk Index</option>
          <option value="erosion">Erosion Risk Index</option>
          <option value="exposure">Exposure Index</option>
          <option value="vulnerability">Vulnerability Index</option>
          <option value="adaptive_capacity">Adaptive Capacity Index</option>
        </select>
      }
    >
      <div className="grid items-start gap-6 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <ClimateRiskMap
            profiles={profiles}
            metric={mapMetric}
            selectedLgaName={selectedLgaName}
            onSelectLgaName={setSelectedLgaName}
          />

          <div className="mt-4">
            <CommandNotice title="Boundary source" tone="yellow">
              The map first checks for{" "}
              <code className="rounded bg-white/70 px-1">
                public/data/kaduna_lgas.geojson
              </code>
              . If that official file is unavailable, it uses the development
              placeholder boundary.
            </CommandNotice>
          </div>
        </div>

        <div className="space-y-6">
          <LGADetailPanel
            selectedLgaName={selectedLgaName}
            selectedProfile={selectedProfile}
          />

          <ClimateRiskEditPanel
            profile={selectedProfile}
            canManage={canManageRisk}
            onSaved={loadRiskProfiles}
          />
        </div>
      </div>
    </CommandSection>
  );
}

function ParametersSection({
  riskData,
  selectedProfile,
  canManageRisk,
  loadRiskProfiles,
}) {
  return (
    <>
      <CommandSection
        title="Climate Intelligence dataset upload"
        description="Upload Climate Intelligence profile datasets when validated data is available."
      >
        <ClimateRiskDatasetUploadPanel
          canManage={canManageRisk}
          onUploaded={loadRiskProfiles}
        />
      </CommandSection>

      <CommandSection
        title="Climate Intelligence parameter records"
        description="Store raw hazard, exposure, vulnerability, and adaptive-capacity evidence behind final normalized scores."
      >
        <ClimateRiskParameterPanel
          lgas={
            riskData?.results?.map((profile) => ({
              lga_id: profile.lga,
              lga_name: profile.lga_name,
            })) || []
          }
          selectedProfile={selectedProfile}
          canManage={canManageRisk}
        />
      </CommandSection>
    </>
  );
}

function ScoringSection({
  selectedProfile,
  selectedYear,
  canManageRisk,
  loadRiskProfiles,
}) {
  return (
    <>
      <IndexExplanationBox />

      <CommandSection
        title="Recalculate risk indexes from parameter records"
        description="Use normalized parameter values to update flood, drought, heat, erosion, exposure, vulnerability and adaptive capacity indexes."
      >
        <ClimateRiskScoringPanel
          selectedProfile={selectedProfile}
          selectedYear={selectedYear}
          canManage={canManageRisk}
          onRecalculated={loadRiskProfiles}
        />
      </CommandSection>
    </>
  );
}

function InfrastructureSection({
  selectedProfile,
  canManageRisk,
  infrastructureRefreshKey,
  setInfrastructureRefreshKey,
}) {
  return (
    <>
      <CommandSection
        title="Import exposed infrastructure assets"
        description="Upload schools, hospitals, markets, roads, water facilities and other exposed assets."
      >
        <ClimateInfrastructureAssetImportPanel
          selectedProfile={selectedProfile}
          canManage={canManageRisk}
          onImported={() =>
            setInfrastructureRefreshKey((currentValue) => currentValue + 1)
          }
        />
      </CommandSection>

      <CommandSection
        title="Exposed assets layer"
        description="Map and manage infrastructure assets exposed to Climate Intelligence."
      >
        <ClimateInfrastructureAtRiskLayer
          key={`infrastructure-${
            selectedProfile?.id || "none"
          }-${infrastructureRefreshKey}`}
          selectedProfile={selectedProfile}
          canManage={canManageRisk}
        />
      </CommandSection>
    </>
  );
}

function RiskTableSection({
  riskData,
  selectedYear,
  setSelectedYear,
  riskLevel,
  setRiskLevel,
  searchText,
  setSearchText,
  isLoading,
  filteredProfiles,
  selectedLgaName,
  setSelectedLgaName,
  topLgas,
  summary,
}) {
  return (
    <div className="grid items-start gap-6 xl:grid-cols-3">
      <CommandSection
        title="LGA risk table"
        description="Filter and compare Climate Intelligence across LGAs. Click a row to update the selected LGA detail panel."
        className="xl:col-span-2"
        actions={
          <div className="flex flex-wrap gap-3">
            <select
              value={selectedYear}
              onChange={(event) => setSelectedYear(event.target.value)}
              className="rounded-md border border-slate-200 bg-white px-4 py-3 text-sm text-[#030454] outline-none focus:border-[#009B35] focus:ring-2 focus:ring-[#009B35]/10"
            >
              {(riskData?.available_years || []).map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>

            <select
              value={riskLevel}
              onChange={(event) => setRiskLevel(event.target.value)}
              className="rounded-md border border-slate-200 bg-white px-4 py-3 text-sm text-[#030454] outline-none focus:border-[#009B35] focus:ring-2 focus:ring-[#009B35]/10"
            >
              <option value="all">All risk levels</option>
              <option value="low">Low</option>
              <option value="moderate">Moderate</option>
              <option value="high">High</option>
              <option value="very_high">Very High</option>
            </select>

            <input
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              placeholder="Search LGA..."
              className="rounded-md border border-slate-200 bg-white px-4 py-3 text-sm text-[#030454] outline-none focus:border-[#009B35] focus:ring-2 focus:ring-[#009B35]/10"
            />
          </div>
        }
      >
        {isLoading ? (
          <p className="text-sm text-slate-500">
            Loading Climate Intelligence profiles...
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1000px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="px-3 py-3 font-bold">LGA</th>
                  <th className="px-3 py-3 font-bold">Overall /100</th>
                  <th className="px-3 py-3 font-bold">Level</th>
                  <th className="px-3 py-3 font-bold">Flood /100</th>
                  <th className="px-3 py-3 font-bold">Drought /100</th>
                  <th className="px-3 py-3 font-bold">Heat /100</th>
                  <th className="px-3 py-3 font-bold">Erosion /100</th>
                  <th className="px-3 py-3 font-bold">Exposure /100</th>
                  <th className="px-3 py-3 font-bold">Vulnerability /100</th>
                  <th className="px-3 py-3 font-bold">
                    Adaptive Capacity /100
                  </th>
                </tr>
              </thead>

              <tbody>
                {filteredProfiles.map((profile) => {
                  const isSelected =
                    normalizeName(selectedLgaName) ===
                    normalizeName(profile.lga_name);

                  const riskWidth = `${Math.min(
                    Number(profile.overall_risk_score || 0),
                    100
                  )}%`;

                  return (
                    <tr
                      key={profile.id}
                      onClick={() => setSelectedLgaName(profile.lga_name)}
                      className={`cursor-pointer border-b border-slate-100 transition last:border-0 hover:bg-[#009B35]/5 ${
                        isSelected ? "bg-[#009B35]/10" : ""
                      }`}
                    >
                      <td className="px-3 py-4 font-bold text-[#030454]">
                        {profile.lga_name}
                      </td>

                      <td className="px-3 py-4">
                        <div className="flex items-center gap-3">
                          <span className="w-12 font-bold text-[#030454]">
                            {formatNumber(profile.overall_risk_score, 2)}
                          </span>

                          <div className="h-2 w-24 overflow-hidden rounded-full bg-slate-100">
                            <div
                              className="h-full rounded-full"
                              style={{
                                width: riskWidth,
                                backgroundColor: getRiskBarColor(
                                  profile.risk_level
                                ),
                              }}
                            />
                          </div>
                        </div>
                      </td>

                      <td className="px-3 py-4">
                        <span
                          className={`rounded-md px-3 py-1 text-xs font-bold ${getRiskClass(
                            profile.risk_level
                          )}`}
                        >
                          {profile.risk_level_display}
                        </span>
                      </td>

                      <td className="px-3 py-4">
                        {formatNumber(profile.flood_risk_score, 2)} / 100
                      </td>
                      <td className="px-3 py-4">
                        {formatNumber(profile.drought_risk_score, 2)} / 100
                      </td>
                      <td className="px-3 py-4">
                        {formatNumber(profile.heat_risk_score, 2)} / 100
                      </td>
                      <td className="px-3 py-4">
                        {formatNumber(profile.erosion_risk_score, 2)} / 100
                      </td>
                      <td className="px-3 py-4">
                        {formatNumber(profile.exposure_score, 2)} / 100
                      </td>
                      <td className="px-3 py-4">
                        {formatNumber(profile.vulnerability_score, 2)} / 100
                      </td>
                      <td className="px-3 py-4">
                        {formatNumber(profile.adaptive_capacity_score, 2)} / 100
                      </td>
                    </tr>
                  );
                })}

                {filteredProfiles.length === 0 && (
                  <tr>
                    <td
                      colSpan={10}
                      className="px-3 py-8 text-center text-slate-500"
                    >
                      No risk profiles found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </CommandSection>

      <div className="space-y-6">
        <TopLgasPanel
          topLgas={topLgas}
          setSelectedLgaName={setSelectedLgaName}
        />

        <CommandSection title="Risk level distribution">
          <div className="space-y-3 text-sm">
            {[
              ["Low", summary?.risk_counts?.low || 0],
              ["Moderate", summary?.risk_counts?.moderate || 0],
              ["High", summary?.risk_counts?.high || 0],
              ["Very High", summary?.risk_counts?.very_high || 0],
            ].map(([label, value]) => (
              <div key={label} className="flex justify-between">
                <span className="text-slate-500">{label}</span>
                <span className="font-bold text-[#030454]">{value}</span>
              </div>
            ))}
          </div>
        </CommandSection>

        <CommandNotice title="Boundary/data notice" tone="yellow">
          Use official Kaduna LGA boundaries before production. The risk scores
          are still development seed scores and should later be replaced with
          validated hazard, exposure, vulnerability and adaptive-capacity
          datasets.
        </CommandNotice>
      </div>
    </div>
  );
}

export default function ClimateRiskPage({ currentUser }) {
  const [riskData, setRiskData] = useState(null);
  const [selectedYear, setSelectedYear] = useState("");
  const [riskLevel, setRiskLevel] = useState("all");
  const [activeTab, setActiveTab] = useState("overview");
  const [searchText, setSearchText] = useState("");
  const [infrastructureRefreshKey, setInfrastructureRefreshKey] = useState(0);
  const [mapMetric, setMapMetric] = useState("overall");
  const [selectedLgaName, setSelectedLgaName] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [ciData, setCiData] = useState(null);
  const [ciLoading, setCiLoading] = useState(false);
  const [ciPermissionDenied, setCiPermissionDenied] = useState(false);

  async function loadRiskProfiles() {
    setIsLoading(true);
    setError("");

    try {
      const params = {};

      if (selectedYear) {
        params.year = selectedYear;
      }

      if (riskLevel !== "all") {
        params.risk_level = riskLevel;
      }

      const data = await getClimateRiskProfiles(params);
      setRiskData(data);

      if (!selectedYear && data.available_years?.length) {
        setSelectedYear(String(data.available_years[0]));
      }
    } catch (err) {
      console.error(err);
      setError("Could not load Climate Intelligence profiles.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadRiskProfiles();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedYear, riskLevel]);

  useEffect(() => {
    if (!canViewInternalModules(currentUser)) return;
    setCiLoading(true);
    setCiPermissionDenied(false);
    getClimateActionScreeningData({ admin_level: "lga", season: "annual" })
      .then((data) => setCiData(data))
      .catch((err) => {
        const status = err?.response?.status;
        if (status === 401 || status === 403) {
          setCiPermissionDenied(true);
        }
        setCiData(null);
      })
      .finally(() => setCiLoading(false));
  }, [currentUser]);

  const profiles = riskData?.results || [];
  const summary = riskData?.summary;
  const topLgas = riskData?.top_lgas || [];
  const canManageRisk = canManageClimateRisk(currentUser);

  useEffect(() => {
    if (!profiles.length) {
      setSelectedLgaName("");
      return;
    }

    const selectedExists = profiles.some(
      (profile) =>
        normalizeName(profile.lga_name) === normalizeName(selectedLgaName)
    );

    if (!selectedLgaName || !selectedExists) {
      setSelectedLgaName(profiles[0].lga_name);
    }
  }, [profiles, selectedLgaName]);

  const visibleTabs = useMemo(
    () =>
      canViewInternalModules(currentUser)
        ? climateRiskTabs
        : climateRiskTabs.filter((t) => t.key !== "screening"),
    [currentUser]
  );

  const selectedProfile = useMemo(() => {
    if (!selectedLgaName) return null;

    return (
      profiles.find(
        (profile) =>
          normalizeName(profile.lga_name) === normalizeName(selectedLgaName)
      ) || null
    );
  }, [profiles, selectedLgaName]);

  const filteredProfiles = useMemo(() => {
    const search = searchText.trim().toLowerCase();

    if (!search) return profiles;

    return profiles.filter((profile) =>
      profile.lga_name.toLowerCase().includes(search)
    );
  }, [profiles, searchText]);

  return (
    <div className="space-y-6">
      <CommandPageHeader
        title="Kaduna LGA Climate Intelligence Profiles"
        description="Climate Intelligence workspace for flood, drought, heat, erosion, exposure, vulnerability and adaptive-capacity scoring across Kaduna LGAs."
        actions={
          <CommandButton onClick={loadRiskProfiles} variant="primary">
            Refresh Risk Data
          </CommandButton>
        }
      />

      {error && (
        <CommandNotice title="Error loading Climate Intelligence profiles" tone="red">
          {error}
        </CommandNotice>
      )}

      <div className="sticky top-24 z-10">
        <CommandTabs
          tabs={visibleTabs}
          activeTab={activeTab}
          onChange={setActiveTab}
        />
      </div>

      {activeTab === "overview" && (
        <OverviewSection
          summary={summary}
          selectedLgaName={selectedLgaName}
          selectedProfile={selectedProfile}
          topLgas={topLgas}
          setSelectedLgaName={setSelectedLgaName}
          setActiveTab={setActiveTab}
        />
      )}

      {activeTab === "map" && (
        <RiskMapSection
          profiles={profiles}
          mapMetric={mapMetric}
          setMapMetric={setMapMetric}
          selectedLgaName={selectedLgaName}
          setSelectedLgaName={setSelectedLgaName}
          selectedProfile={selectedProfile}
          canManageRisk={canManageRisk}
          loadRiskProfiles={loadRiskProfiles}
        />
      )}

      {activeTab === "parameters" && (
        <ParametersSection
          riskData={riskData}
          selectedProfile={selectedProfile}
          canManageRisk={canManageRisk}
          loadRiskProfiles={loadRiskProfiles}
        />
      )}

      {activeTab === "scoring" && (
        <ScoringSection
          selectedProfile={selectedProfile}
          selectedYear={selectedYear}
          canManageRisk={canManageRisk}
          loadRiskProfiles={loadRiskProfiles}
        />
      )}

      {activeTab === "hazards" && (
        <CommandSection
          title="Explore climate hazard dimensions"
          description="Review hazard-specific patterns and LGA-level comparisons."
        >
          <ClimateRiskHazardExplorer
            profiles={profiles}
            selectedLgaName={selectedLgaName}
            onSelectLgaName={setSelectedLgaName}
          />
        </CommandSection>
      )}

      {activeTab === "evidence" && (
        <CommandSection
          title="Selected LGA evidence summary"
          description="Review the evidence narrative behind the selected LGA profile."
        >
          <ClimateRiskEvidenceBrief selectedProfile={selectedProfile} />
        </CommandSection>
      )}

      {activeTab === "infrastructure" && (
        <InfrastructureSection
          selectedProfile={selectedProfile}
          canManageRisk={canManageRisk}
          infrastructureRefreshKey={infrastructureRefreshKey}
          setInfrastructureRefreshKey={setInfrastructureRefreshKey}
        />
      )}

      {activeTab === "quality" && (
        <CommandSection
          title="Climate Intelligence data quality review"
          description="Review missing fields, data completeness and scoring readiness."
        >
          <ClimateRiskDataQualityPanel profiles={profiles} />
        </CommandSection>
      )}

      {activeTab === "transparency" && (
        <CommandSection
          title="Risk scoring transparency"
          description="Inspect how final Climate Intelligence scores are derived."
        >
          <ClimateRiskScoringTransparencyPanel
            selectedProfile={selectedProfile}
          />
        </CommandSection>
      )}

      {activeTab === "projects" && (
        <CommandSection
          title="Climate projects linked to selected LGA"
          description="Review action responses connected to the selected Climate Intelligence profile."
        >
          <ClimateRiskLinkedProjectsPanel
            selectedProfile={selectedProfile}
            canManage={canManageRisk}
          />
        </CommandSection>
      )}

      {activeTab === "screening" && canViewInternalModules(currentUser) && (
        ciPermissionDenied ? (
          <CommandNotice title="Access denied" tone="red">
            You do not have permission to access Climate Action Screening. Contact your
            system administrator if you believe this is an error.
          </CommandNotice>
        ) : (
          <ScreeningMatrixSection
            ciData={ciData}
            ciLoading={ciLoading}
            setSelectedLgaName={setSelectedLgaName}
            setActiveTab={setActiveTab}
          />
        )
      )}

      {activeTab === "table" && (
        <RiskTableSection
          riskData={riskData}
          selectedYear={selectedYear}
          setSelectedYear={setSelectedYear}
          riskLevel={riskLevel}
          setRiskLevel={setRiskLevel}
          searchText={searchText}
          setSearchText={setSearchText}
          isLoading={isLoading}
          filteredProfiles={filteredProfiles}
          selectedLgaName={selectedLgaName}
          setSelectedLgaName={setSelectedLgaName}
          topLgas={topLgas}
          summary={summary}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Status display for the matrix overall-readiness column.
// Uses the four approved labels per project governance rules.
// ---------------------------------------------------------------------------
const MATRIX_STATUS_DISPLAY = {
  ready_for_planning_discussion: {
    label: "Ready for planning discussion",
    cls: "text-[#030454] bg-[#030454]/8 border border-[#030454]/20",
  },
  requires_field_verification: {
    label: "Requires field verification",
    cls: "text-amber-700 bg-amber-50 border border-amber-200",
  },
  insufficient_evidence: {
    label: "Insufficient evidence",
    cls: "text-slate-500 bg-slate-50 border border-slate-200",
  },
  not_assessed: {
    label: "Not assessed",
    cls: "text-slate-400 bg-white border border-slate-200",
  },
};

const STATUS_PRIORITY = [
  "ready_for_planning_discussion",
  "requires_field_verification",
  "insufficient_evidence",
  "not_assessed",
];

function computeOverallStatus(pathways) {
  return pathways.reduce((best, p) => {
    const bi = STATUS_PRIORITY.indexOf(best);
    const pi = STATUS_PRIORITY.indexOf(p.readinessStatus);
    return pi !== -1 && (bi === -1 || pi < bi) ? p.readinessStatus : best;
  }, "not_assessed");
}

const COMPLETENESS_KEYS = ["rainfall_anomaly", "spi", "ndvi", "lst"];

function computeCompleteness(indicators) {
  const present = COMPLETENESS_KEYS.filter((k) => indicators?.[k] != null).length;
  return { present, total: COMPLETENESS_KEYS.length };
}

function formatScreeningSeason(season) {
  if (season === "annual") return "Annual";
  if (season === "wet_season") return "Wet Season";
  if (season === "dry_season") return "Dry Season";
  return season || "—";
}

// ---------------------------------------------------------------------------
// ScreeningMatrixSection
// ---------------------------------------------------------------------------
function ScreeningMatrixSection({ ciData, ciLoading, setSelectedLgaName, setActiveTab }) {
  const [screeningView, setScreeningView] = useState("matrix");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [pathwayFilter, setPathwayFilter] = useState("all");
  const [sortField, setSortField] = useState("name");
  const [sortAsc, setSortAsc] = useState(true);
  const [expandedCode, setExpandedCode] = useState(null);

  const evidencePeriod = useMemo(() => {
    if (!ciData?.filters) return "—";
    return `${ciData.filters.year} · ${formatScreeningSeason(ciData.filters.season)}`;
  }, [ciData?.filters]);

  const matrixRows = useMemo(() => {
    if (!ciData?.results) return [];
    return ciData.results.map((item) => {
      const pathways = derivePathwaysFromIndicators(item.indicators);
      const overallStatus = computeOverallStatus(pathways);
      const completeness = computeCompleteness(item.indicators);
      return {
        admin_code: item.admin_code,
        admin_name: item.admin_name,
        indicators: item.indicators,
        pathways,
        overallStatus,
        completeness,
      };
    });
  }, [ciData]);

  const filtered = useMemo(() => {
    let rows = matrixRows;
    if (search.trim()) {
      const s = search.toLowerCase();
      rows = rows.filter((r) => r.admin_name.toLowerCase().includes(s));
    }
    if (statusFilter !== "all") {
      rows = rows.filter((r) => r.overallStatus === statusFilter);
    }
    if (pathwayFilter !== "all") {
      rows = rows.filter((r) => r.pathways.some((p) => p.id === pathwayFilter));
    }
    return [...rows].sort((a, b) => {
      let cmp = 0;
      if (sortField === "name") cmp = a.admin_name.localeCompare(b.admin_name);
      else if (sortField === "completeness")
        cmp = a.completeness.present - b.completeness.present;
      else if (sortField === "status")
        cmp =
          STATUS_PRIORITY.indexOf(a.overallStatus) -
          STATUS_PRIORITY.indexOf(b.overallStatus);
      return sortAsc ? cmp : -cmp;
    });
  }, [matrixRows, search, statusFilter, pathwayFilter, sortField, sortAsc]);

  function toggleSort(field) {
    if (sortField === field) setSortAsc((v) => !v);
    else {
      setSortField(field);
      setSortAsc(true);
    }
  }

  function SortIcon({ field }) {
    if (sortField !== field)
      return <span className="ml-1 text-slate-300">↕</span>;
    return <span className="ml-1">{sortAsc ? "↑" : "↓"}</span>;
  }

  function OverallStatusBadge({ status }) {
    const d = MATRIX_STATUS_DISPLAY[status] || MATRIX_STATUS_DISPLAY.not_assessed;
    return (
      <span className={`inline-block rounded px-2 py-0.5 text-xs font-bold ${d.cls}`}>
        {d.label}
      </span>
    );
  }

  function PathwayCell({ pathway }) {
    if (!pathway) {
      return (
        <span className="text-xs italic text-slate-400">
          No current screening signal in available indicators.
        </span>
      );
    }
    const r = READINESS[pathway.readinessStatus] || READINESS.insufficient_evidence;
    return (
      <span className={`inline-block rounded px-1.5 py-0.5 text-xs font-bold ${r.cls}`}>
        {r.label}
      </span>
    );
  }

  return (
    <>
      <CommandNotice title="Climate Action Screening — Scope and Limitations" tone="blue">
        Rule-based LGA screening for planning discussion and field validation. It is not a
        hazard model, prediction, investment ranking, or regulatory determination. Results
        are derived from satellite indicators aggregated to LGA administrative boundaries.
        All screening considerations require independent field verification before any
        planning action is taken.
      </CommandNotice>

      {/* View toggle — Screening Matrix | Map Lens */}
      <div className="flex gap-2">
        {[
          { id: "matrix", label: "Screening Matrix" },
          { id: "map", label: "Map Lens" },
        ].map((v) => (
          <button
            key={v.id}
            type="button"
            onClick={() => setScreeningView(v.id)}
            className={`rounded-md px-5 py-2.5 text-xs font-black uppercase tracking-[0.08em] transition ${
              screeningView === v.id
                ? "bg-[#030454] text-white shadow-sm"
                : "border border-slate-200 bg-white text-slate-500 hover:border-[#030454] hover:text-[#030454]"
            }`}
          >
            {v.label}
          </button>
        ))}
      </div>

      {screeningView === "map" ? (
        <ClimateActionLensMap
          ciData={ciData}
          ciLoading={ciLoading}
          setSelectedLgaName={setSelectedLgaName}
          setActiveTab={setActiveTab}
        />
      ) : (
      <CommandSection
        title="Climate Action Screening Matrix"
        description={`LGA-level rule-based action-pathway screening · ${evidencePeriod} · Click an LGA name to open its full Climate Intelligence evidence context.`}
        actions={
          <div className="flex flex-wrap gap-3">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search LGA..."
              className="rounded-md border border-slate-200 bg-white px-4 py-3 text-sm text-[#030454] outline-none focus:border-[#009B35] focus:ring-2 focus:ring-[#009B35]/10"
            />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-md border border-slate-200 bg-white px-4 py-3 text-sm text-[#030454] outline-none focus:border-[#009B35] focus:ring-2 focus:ring-[#009B35]/10"
            >
              <option value="all">All statuses</option>
              <option value="ready_for_planning_discussion">
                Ready for planning discussion
              </option>
              <option value="requires_field_verification">
                Requires field verification
              </option>
              <option value="insufficient_evidence">Insufficient evidence</option>
            </select>
            <select
              value={pathwayFilter}
              onChange={(e) => setPathwayFilter(e.target.value)}
              className="rounded-md border border-slate-200 bg-white px-4 py-3 text-sm text-[#030454] outline-none focus:border-[#009B35] focus:ring-2 focus:ring-[#009B35]/10"
            >
              <option value="all">All action pathways</option>
              <option value="drought_ag">Drought / Ag-adaptation</option>
              <option value="ecosystem">Vegetation / Restoration</option>
              <option value="heat_green">Heat / Urban-greening</option>
            </select>
          </div>
        }
      >
        {ciLoading ? (
          <p className="text-sm text-slate-500">
            Loading climate intelligence data...
          </p>
        ) : !ciData?.results?.length ? (
          <CommandNotice title="No CI data available" tone="grey">
            No climate intelligence records were found. Ensure GEE metrics have been
            synchronised before using this view.
          </CommandNotice>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1200px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th
                    className="cursor-pointer px-3 py-3 font-bold hover:text-[#030454]"
                    onClick={() => toggleSort("name")}
                  >
                    LGA
                    <SortIcon field="name" />
                  </th>
                  <th className="px-3 py-3 font-bold">Evidence period</th>
                  <th className="px-3 py-3 font-bold">Vegetation / restoration</th>
                  <th className="px-3 py-3 font-bold">Drought / ag-adaptation</th>
                  <th className="px-3 py-3 font-bold">Heat / urban-greening</th>
                  <th className="px-3 py-3 font-bold">Hist. water / drainage</th>
                  <th
                    className="cursor-pointer px-3 py-3 font-bold hover:text-[#030454]"
                    onClick={() => toggleSort("completeness")}
                  >
                    Evidence completeness
                    <SortIcon field="completeness" />
                  </th>
                  <th
                    className="cursor-pointer px-3 py-3 font-bold hover:text-[#030454]"
                    onClick={() => toggleSort("status")}
                  >
                    Action-readiness status
                    <SortIcon field="status" />
                  </th>
                  <th className="w-8 px-3 py-3" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => {
                  const droughtPath =
                    row.pathways.find((p) => p.id === "drought_ag") || null;
                  const vegPath =
                    row.pathways.find((p) => p.id === "ecosystem") || null;
                  const heatPath =
                    row.pathways.find((p) => p.id === "heat_green") || null;
                  const isExpanded = expandedCode === row.admin_code;

                  return (
                    <>
                      <tr
                        key={row.admin_code}
                        className={`border-b border-slate-100 transition last:border-0 ${
                          isExpanded ? "bg-[#EEF6FD]" : "hover:bg-slate-50"
                        }`}
                      >
                        <td className="px-3 py-3">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedLgaName(row.admin_name);
                              setActiveTab("evidence");
                            }}
                            className="font-bold text-[#030454] underline decoration-dotted hover:text-[#173B91]"
                          >
                            {row.admin_name}
                          </button>
                        </td>
                        <td className="px-3 py-3 text-slate-500">{evidencePeriod}</td>
                        <td className="px-3 py-3">
                          <PathwayCell pathway={vegPath} />
                        </td>
                        <td className="px-3 py-3">
                          <PathwayCell pathway={droughtPath} />
                        </td>
                        <td className="px-3 py-3">
                          <PathwayCell pathway={heatPath} />
                        </td>
                        <td className="px-3 py-3">
                          <span className="inline-block rounded border border-slate-200 px-2 py-0.5 text-xs italic text-slate-400">
                            Not assessed
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          <span
                            className={`text-sm font-bold ${
                              row.completeness.present === row.completeness.total
                                ? "text-[#009B35]"
                                : row.completeness.present >= 2
                                ? "text-[#030454]"
                                : "text-amber-600"
                            }`}
                          >
                            {row.completeness.present}/{row.completeness.total}
                          </span>
                          <span className="ml-1 text-xs text-slate-400">indicators</span>
                        </td>
                        <td className="px-3 py-3">
                          <OverallStatusBadge status={row.overallStatus} />
                        </td>
                        <td className="px-3 py-3">
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedCode(isExpanded ? null : row.admin_code)
                            }
                            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                            title={isExpanded ? "Collapse evidence" : "View evidence"}
                          >
                            {isExpanded ? "▲" : "▼"}
                          </button>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr
                          key={`${row.admin_code}-detail`}
                          className="border-b border-slate-200 bg-[#F8FAFE]"
                        >
                          <td colSpan={9} className="px-5 py-5">
                            <ScreeningEvidencePanel
                              row={row}
                              evidencePeriod={evidencePeriod}
                              onViewFull={() => {
                                setSelectedLgaName(row.admin_name);
                                setActiveTab("evidence");
                              }}
                            />
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
                {filtered.length === 0 && (
                  <tr>
                    <td
                      colSpan={9}
                      className="px-3 py-8 text-center text-slate-500"
                    >
                      No LGAs match the current filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </CommandSection>
      )}

      <CommandNotice
        title="Historical water / drainage column — not assessed in this matrix"
        tone="yellow"
      >
        Historical Surface Water (JRC GSW v1.4) data is not included in the statewide
        screening matrix. This column requires additional field-methodology validation
        before aggregated HSW data can be used as a planning-discussion screening input.
        Individual LGA Climate Intelligence Briefs in the Public Climate Atlas include
        this indicator where the data layer has been loaded.
      </CommandNotice>
    </>
  );
}

// ---------------------------------------------------------------------------
// ScreeningEvidencePanel — expandable row detail
// ---------------------------------------------------------------------------
const SCREENING_INDICATOR_DEFS = [
  {
    key: "rainfall_anomaly",
    label: "Rainfall anomaly",
    unit: "%",
    decimals: 1,
    source: "CHIRPS v2.0 · 1991–2020 baseline",
    caution: "Relative to 1991–2020 reference period; baseline period choice affects the result.",
  },
  {
    key: "spi",
    label: "Drought index (SPI)",
    unit: "index",
    decimals: 2,
    source: "CHIRPS-derived SPI",
    caution: "Precipitation-only index. Does not represent hydrological or agricultural drought.",
  },
  {
    key: "ndvi",
    label: "Vegetation (NDVI)",
    unit: "index",
    decimals: 3,
    source: "Sentinel-2 SR / Landsat C2L2",
    caution: "Does not distinguish drought, harvesting, seasonal variation, or land-use change.",
  },
  {
    key: "lst",
    label: "Surface temp. (LST)",
    unit: "°C",
    decimals: 1,
    source: "MODIS Terra LST",
    caution: "Satellite sensor reading. Not equivalent to air temperature.",
  },
];

function ScreeningEvidencePanel({ row, evidencePeriod, onViewFull }) {
  const { indicators, pathways, admin_name } = row;
  const triggeredPathways = pathways.filter((p) => p.id !== "no_signal");

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* Left: indicator table */}
      <div>
        <p className="mb-3 text-xs font-black uppercase tracking-[0.12em] text-slate-500">
          Indicators used · {evidencePeriod} · LGA administrative boundary (aggregated)
        </p>
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-slate-200 text-slate-400">
              <th className="py-1.5 text-left font-semibold">Indicator</th>
              <th className="py-1.5 text-left font-semibold">Value</th>
              <th className="py-1.5 text-left font-semibold">Classification</th>
              <th className="py-1.5 text-left font-semibold">Source</th>
            </tr>
          </thead>
          <tbody>
            {SCREENING_INDICATOR_DEFS.map(({ key, label, unit, decimals, source }) => {
              const ind = indicators?.[key];
              return (
                <tr key={key} className="border-b border-slate-100 last:border-0">
                  <td className="py-1.5 font-semibold text-slate-700">{label}</td>
                  <td className="py-1.5 text-slate-600">
                    {ind?.value != null ? (
                      `${Number(ind.value).toFixed(decimals)} ${unit}`
                    ) : (
                      <span className="italic text-slate-400">Not available</span>
                    )}
                  </td>
                  <td className="py-1.5 text-slate-600">
                    {ind?.condition || (
                      <span className="italic text-slate-400">—</span>
                    )}
                  </td>
                  <td className="py-1.5 text-slate-400">{source}</td>
                </tr>
              );
            })}
            <tr>
              <td className="py-1.5 font-semibold text-slate-400">
                Hist. surface water
              </td>
              <td colSpan={3} className="py-1.5 italic text-slate-400">
                Not assessed — see notice below matrix
              </td>
            </tr>
          </tbody>
        </table>

        <p className="mt-3 text-xs leading-5 text-slate-500">
          <strong>Geographic scale:</strong> All values are LGA administrative boundary
          aggregates. Sub-LGA and community-level variation is not captured by these
          indicators.
        </p>

        <div className="mt-3 space-y-1">
          {SCREENING_INDICATOR_DEFS.map(({ key, label, caution }) =>
            indicators?.[key] ? (
              <p key={key} className="text-[11px] leading-4 text-slate-400">
                <strong className="text-slate-500">{label}:</strong> {caution}
              </p>
            ) : null
          )}
        </div>
      </div>

      {/* Right: pathway details */}
      <div>
        <p className="mb-3 text-xs font-black uppercase tracking-[0.12em] text-slate-500">
          Screening pathways and required validation
        </p>

        {triggeredPathways.length === 0 ? (
          <p className="text-xs italic text-slate-400">
            No screening pathways triggered. All available indicators are within
            near-normal or stable classification ranges for this LGA.
          </p>
        ) : (
          <div className="space-y-4">
            {triggeredPathways.map((p) => (
              <div
                key={p.id}
                className="rounded-lg border border-slate-200 bg-white p-3"
              >
                <p className="text-xs font-bold text-[#030454]">{p.theme}</p>
                {p.triggers?.length > 0 && (
                  <p className="mt-1 text-xs text-slate-500">
                    <strong>Evidence:</strong> {p.triggers.join("; ")}
                  </p>
                )}
                <p className="mt-1.5 text-[11px] italic leading-4 text-amber-700">
                  {p.scientificCaution}
                </p>
                <div className="mt-2">
                  <p className="text-[11px] font-semibold text-slate-500">
                    Required next validation:
                  </p>
                  <ul className="mt-1 list-disc pl-4 text-[11px] leading-[1.5] text-slate-500">
                    {p.validationSteps?.map((step, i) => (
                      <li key={i}>{step}</li>
                    ))}
                  </ul>
                </div>
              </div>
            ))}
          </div>
        )}

        <button
          type="button"
          onClick={onViewFull}
          className="mt-4 text-xs font-bold text-[#030454] underline decoration-dotted hover:text-[#173B91]"
        >
          View full Climate Intelligence evidence for {admin_name} →
        </button>
      </div>
    </div>
  );
}