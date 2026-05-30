import { useEffect, useMemo, useState } from "react";
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
import { getClimateRiskProfiles } from "../services/api";
import { canManageClimateRisk } from "../utils/permissions";

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
  if (level === "moderate") return "bg-[#C8A84A]/15 text-[#0B1726]";
  return "bg-[#4E7492]/10 text-[#214560]";
}

function getRiskBarColor(level) {
  if (level === "very_high") return "#B91C1C";
  if (level === "high") return "#EA580C";
  if (level === "moderate") return "#C8A84A";
  return "#4E7492";
}

function getMetricBarColor(value, reverse = false) {
  const number = Number(value || 0);

  if (reverse) {
    if (number >= 70) return "#4E7492";
    if (number >= 55) return "#2292A4";
    if (number >= 40) return "#C8A84A";
    return "#B91C1C";
  }

  if (number >= 75) return "#B91C1C";
  if (number >= 60) return "#EA580C";
  if (number >= 40) return "#C8A84A";
  return "#4E7492";
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
];

function IndexExplanationBox() {
  return (
    <CommandNotice title="How to read the climate risk scores" tone="blue">
      <p>
        Risk values shown on this page are normalized indexes from{" "}
        <strong>0 to 100</strong>. A higher hazard, exposure, or vulnerability
        score means higher concern. Adaptive capacity is different: a higher
        adaptive capacity score means stronger ability to cope.
      </p>

      <div className="mt-4 grid gap-2 text-xs md:grid-cols-4">
        <div className="rounded-lg bg-[#4E7492]/10 px-3 py-2 font-semibold text-[#214560]">
          0–39: Low
        </div>
        <div className="rounded-lg bg-[#C8A84A]/15 px-3 py-2 font-semibold text-[#0B1726]">
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

        <span className="font-bold text-[#0B1726]">
          {formatNumber(number, 2)} / 100
        </span>
      </div>

      <div className="h-2 overflow-hidden rounded-full bg-[#DFE3E4]">
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
        eyebrow="LGA detail"
        title="No LGA selected"
        description="Click any LGA polygon on the map or any row in the table to view its climate risk details."
      >
        <div />
      </CommandSection>
    );
  }

  if (!selectedProfile) {
    return (
      <CommandNotice title={selectedLgaName} tone="gold">
        This LGA was selected, but no matching climate risk profile was found.
        Check that the GeoJSON LGA name matches the database LGA name.
      </CommandNotice>
    );
  }

  return (
    <CommandSection
      eyebrow="Selected LGA"
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
      <div className="rounded-xl border border-[#CAD2D7] bg-[#DFE3E4]/35 p-5">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">
          Overall Climate Risk Index
        </p>

        <p className="mt-3 text-4xl font-black text-[#0B1726]">
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

      <div className="mt-6 rounded-xl border border-[#CAD2D7] p-4 text-sm">
        <p className="font-black text-[#0B1726]">Notes</p>
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
        tone="teal"
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
      eyebrow="Priority ranking"
      title="Highest-risk LGAs"
      description="Top LGAs by overall climate risk index."
      actions={
        showOpenTable && typeof setActiveTab === "function" ? (
          <CommandButton variant="outline" onClick={() => setActiveTab("table")}>
            Open Table
          </CommandButton>
        ) : null
      }
    >
      <div className="space-y-3">
        {topLgas.map((profile, index) => (
          <button
            key={profile.id}
            type="button"
            onClick={() => setSelectedLgaName(profile.lga_name)}
            className="w-full rounded-xl border border-[#CAD2D7] bg-white p-4 text-left transition hover:border-[#4E7492]/60 hover:bg-[#DFE3E4]/35"
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-black text-[#0B1726]">
                  {index + 1}. {profile.lga_name}
                </p>
                <p className="text-xs text-slate-500">
                  {profile.risk_level_display}
                </p>
              </div>

              <span className="text-lg font-black text-[#0B1726]">
                {formatNumber(profile.overall_risk_score, 2)}
              </span>
            </div>
          </button>
        ))}

        {topLgas.length === 0 && (
          <div className="rounded-xl border border-dashed border-[#CAD2D7] bg-[#DFE3E4]/35 p-5 text-sm text-slate-500">
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
      eyebrow="Risk map"
      title="LGA risk choropleth map"
      description="Click an LGA polygon to open its full risk detail panel. Use the selector to switch between risk dimensions."
      actions={
        <select
          value={mapMetric}
          onChange={(event) => setMapMetric(event.target.value)}
          className="rounded-md border border-[#CAD2D7] bg-white px-4 py-3 text-sm outline-none focus:border-[#2292A4] focus:ring-2 focus:ring-[#2292A4]/10"
        >
          <option value="overall">Overall Climate Risk Index</option>
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
            <CommandNotice title="Boundary source" tone="gold">
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
        eyebrow="Data ingestion"
        title="Climate risk dataset upload"
        description="Upload climate risk profile datasets when validated data is available."
      >
        <ClimateRiskDatasetUploadPanel
          canManage={canManageRisk}
          onUploaded={loadRiskProfiles}
        />
      </CommandSection>

      <CommandSection
        eyebrow="Raw evidence"
        title="Climate risk parameter records"
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
        eyebrow="Scoring engine"
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
        eyebrow="Asset import"
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
        eyebrow="Infrastructure-at-risk"
        title="Exposed assets layer"
        description="Map and manage infrastructure assets exposed to climate risk."
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
        eyebrow="Risk records"
        title="LGA risk table"
        description="Filter and compare climate risk across LGAs. Click a row to update the selected LGA detail panel."
        className="xl:col-span-2"
        actions={
          <div className="flex flex-wrap gap-3">
            <select
              value={selectedYear}
              onChange={(event) => setSelectedYear(event.target.value)}
              className="rounded-md border border-[#CAD2D7] bg-white px-4 py-3 text-sm outline-none focus:border-[#2292A4] focus:ring-2 focus:ring-[#2292A4]/10"
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
              className="rounded-md border border-[#CAD2D7] bg-white px-4 py-3 text-sm outline-none focus:border-[#2292A4] focus:ring-2 focus:ring-[#2292A4]/10"
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
              className="rounded-md border border-[#CAD2D7] bg-white px-4 py-3 text-sm outline-none focus:border-[#2292A4] focus:ring-2 focus:ring-[#2292A4]/10"
            />
          </div>
        }
      >
        {isLoading ? (
          <p className="text-sm text-slate-500">
            Loading climate risk profiles...
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1000px] text-left text-sm">
              <thead>
                <tr className="border-b border-[#CAD2D7] text-slate-500">
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
                      className={`cursor-pointer border-b border-[#E6EAEC] transition last:border-0 hover:bg-[#DFE3E4]/35 ${
                        isSelected ? "bg-[#2292A4]/10" : ""
                      }`}
                    >
                      <td className="px-3 py-4 font-bold text-[#0B1726]">
                        {profile.lga_name}
                      </td>

                      <td className="px-3 py-4">
                        <div className="flex items-center gap-3">
                          <span className="w-12 font-bold text-[#0B1726]">
                            {formatNumber(profile.overall_risk_score, 2)}
                          </span>

                          <div className="h-2 w-24 overflow-hidden rounded-full bg-[#DFE3E4]">
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
            <div className="flex justify-between">
              <span className="text-slate-500">Low</span>
              <span className="font-bold">
                {summary?.risk_counts?.low || 0}
              </span>
            </div>

            <div className="flex justify-between">
              <span className="text-slate-500">Moderate</span>
              <span className="font-bold">
                {summary?.risk_counts?.moderate || 0}
              </span>
            </div>

            <div className="flex justify-between">
              <span className="text-slate-500">High</span>
              <span className="font-bold">
                {summary?.risk_counts?.high || 0}
              </span>
            </div>

            <div className="flex justify-between">
              <span className="text-slate-500">Very High</span>
              <span className="font-bold">
                {summary?.risk_counts?.very_high || 0}
              </span>
            </div>
          </div>
        </CommandSection>

        <CommandNotice title="Boundary/data notice" tone="gold">
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
      setError("Could not load climate risk profiles.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadRiskProfiles();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedYear, riskLevel]);

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
        eyebrow="Climate risk intelligence"
        title="Kaduna LGA Climate Risk Profiles"
        description="Climate risk workspace for flood, drought, heat, erosion, exposure, vulnerability and adaptive-capacity scoring across Kaduna LGAs."
        actions={
          <CommandButton onClick={loadRiskProfiles} variant="primary">
            Refresh Risk Data
          </CommandButton>
        }
      />

      {error && (
        <CommandNotice title="Error loading climate risk profiles" tone="red">
          {error}
        </CommandNotice>
      )}

      <div className="sticky top-24 z-10">
        <CommandTabs
          tabs={climateRiskTabs}
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
          eyebrow="Hazard explorer"
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
          eyebrow="Evidence brief"
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
          eyebrow="Data quality"
          title="Climate risk data quality review"
          description="Review missing fields, data completeness and scoring readiness."
        >
          <ClimateRiskDataQualityPanel profiles={profiles} />
        </CommandSection>
      )}

      {activeTab === "transparency" && (
        <CommandSection
          eyebrow="Scoring transparency"
          title="Risk scoring transparency"
          description="Inspect how final climate risk scores are derived."
        >
          <ClimateRiskScoringTransparencyPanel
            selectedProfile={selectedProfile}
          />
        </CommandSection>
      )}

      {activeTab === "projects" && (
        <CommandSection
          eyebrow="Linked projects"
          title="Climate projects linked to selected LGA"
          description="Review action responses connected to the selected climate risk profile."
        >
          <ClimateRiskLinkedProjectsPanel
            selectedProfile={selectedProfile}
            canManage={canManageRisk}
          />
        </CommandSection>
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