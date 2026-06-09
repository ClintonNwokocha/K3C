import { useEffect, useMemo, useState } from "react";
import {
  PublicEmptyState,
  PublicPortalFooter,
  PublicPortalHeader,
} from "../components/PublicPortalChrome";
import { getPublicPortalSummary } from "../services/api";

const STANDARD_SECTOR_OPTIONS = [
  "Energy",
  "IPPU",
  "Agriculture",
  "LULUCF",
  "Waste",
  "Infrastructure",
  "Water Resources",
];

const aboutDataItems = [
  {
    title: "What project information is shown publicly?",
    body: "The public project portfolio shows approved summary information such as project title, sector, LGA, implementation status, funding source, expected beneficiaries and estimated GHG reduction.",
  },
  {
    title: "Why are financial values not shown?",
    body: "Financial values are intentionally excluded from the public project view. Detailed budget, funding amount and procurement information should only be shown through approved official reporting channels where appropriate.",
  },
  {
    title: "How should funding source be interpreted?",
    body: "Funding source identifies the organisation, programme or source associated with project support where this information is approved for public display. It does not show the amount of money provided.",
  },
  {
    title: "How should estimated GHG reduction be interpreted?",
    body: "Estimated GHG reduction represents expected mitigation outcomes from registered climate action projects. These are planning estimates unless independently verified and published through approved technical reports.",
  },
  {
    title: "Proper use of the data",
    body: "The public portfolio should support transparency, coordination and awareness. Technical users should consult approved project documents, implementation reports and evidence records before making formal decisions.",
  },
];

function hasValidNumber(value) {
  if (value === null || value === undefined || value === "") return false;
  return Number.isFinite(Number(value));
}

function formatNumber(value, maximumFractionDigits = 2) {
  if (!hasValidNumber(value)) return "—";

  return Number(value).toLocaleString(undefined, {
    maximumFractionDigits,
  });
}

function formatCompactNumber(value) {
  if (!hasValidNumber(value)) return "—";

  const number = Number(value);

  if (number >= 1_000_000) return `${formatNumber(number / 1_000_000, 2)}M`;
  if (number >= 1_000) return `${formatNumber(number / 1_000, 1)}K`;

  return formatNumber(number, 0);
}

function titleCase(value) {
  return String(value || "")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\w\S*/g, (word) => {
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    });
}

function getProjectSector(project) {
  return (
    project.sector_display ||
    project.sector_name ||
    project.sector ||
    "Not specified"
  );
}

function getProjectStatus(project) {
  return project.status_display || titleCase(project.status) || "Not specified";
}

function getProjectLga(project) {
  return project.lga_name || project.lga || "Statewide";
}

function getProjectFundingSource(project) {
  return project.funding_source || "Not specified";
}

function getProjectReduction(project) {
  return (
    project.expected_ghg_reduction_tco2e ||
    project.estimated_ghg_reduction_tco2e ||
    project.ghg_reduction_tco2e ||
    0
  );
}

function getProjectBeneficiaries(project) {
  return (
    project.expected_beneficiaries ||
    project.beneficiaries ||
    project.total_beneficiaries ||
    0
  );
}

function getStatusClass(status) {
  const normalized = String(status || "").toLowerCase();

  if (normalized.includes("completed")) return "bg-[#009B35]/10 text-[#009B35]";
  if (normalized.includes("ongoing") || normalized.includes("active")) {
    return "bg-[#030454]/10 text-[#030454]";
  }
  if (normalized.includes("planned")) return "bg-sky-50 text-sky-700";
  if (normalized.includes("suspended")) return "bg-amber-50 text-amber-700";
  if (normalized.includes("cancelled")) return "bg-red-50 text-red-700";

  return "bg-purple-50 text-purple-700";
}

function SummaryChip({ label, value, helper }) {
  return (
    <div className="rounded-md border border-[#D8DDE2] bg-white px-4 py-4">
      <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">
        {label}
      </p>

      <p className="mt-2 text-xl font-black text-[#030454]">{value}</p>

      {helper && (
        <p className="mt-1 text-xs leading-5 text-slate-500">{helper}</p>
      )}
    </div>
  );
}

function ControlField({ label, children }) {
  return (
    <label className="block">
      <span className="mb-2 block text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">
        {label}
      </span>

      {children}
    </label>
  );
}

function FilterSelect({ value, onChange, children }) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="h-11 w-full rounded-md border border-[#D8DDE2] bg-white px-4 text-sm font-bold text-[#030454] outline-none transition focus:border-[#009B35] focus:ring-2 focus:ring-[#009B35]/10"
    >
      {children}
    </select>
  );
}

function ExplorerControlBar({
  sectorFilter,
  setSectorFilter,
  statusFilter,
  setStatusFilter,
  fundingFilter,
  setFundingFilter,
  lgaFilter,
  setLgaFilter,
  sectors,
  statuses,
  fundingSources,
  lgas,
  totalProjects,
}) {
  return (
    <div className="rounded-md border border-[#D8DDE2] bg-[#F7F9FA] p-4">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <ControlField label="Sector">
          <FilterSelect value={sectorFilter} onChange={setSectorFilter}>
            <option value="all">All sectors</option>
            {sectors.map((sector) => (
              <option key={sector} value={sector}>
                {sector}
              </option>
            ))}
          </FilterSelect>
        </ControlField>

        <ControlField label="Status">
          <FilterSelect value={statusFilter} onChange={setStatusFilter}>
            <option value="all">All statuses</option>
            {statuses.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </FilterSelect>
        </ControlField>

        <ControlField label="Funding Source">
          <FilterSelect value={fundingFilter} onChange={setFundingFilter}>
            <option value="all">All funding sources</option>
            {fundingSources.map((source) => (
              <option key={source} value={source}>
                {source}
              </option>
            ))}
          </FilterSelect>
        </ControlField>

        <ControlField label="LGA">
          <FilterSelect value={lgaFilter} onChange={setLgaFilter}>
            <option value="all">All LGAs</option>
            {lgas.map((lga) => (
              <option key={lga} value={lga}>
                {lga}
              </option>
            ))}
          </FilterSelect>
        </ControlField>
      </div>

      <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-500">
        <span className="rounded-full bg-white px-3 py-2">
          Public projects:{" "}
          <strong className="text-[#030454]">{totalProjects}</strong>
        </span>

        <span className="rounded-full bg-white px-3 py-2">
          Financial values:{" "}
          <strong className="text-[#030454]">Not shown publicly</strong>
        </span>
      </div>
    </div>
  );
}

function ProjectPortfolioTable({ projects }) {
  if (projects.length === 0) {
    return (
      <PublicEmptyState
        title="No public project summary available"
        message="No public project summary records match the current filters."
      />
    );
  }

  return (
    <div className="overflow-x-auto rounded-md border border-[#D8DDE2] bg-white">
      <table className="w-full min-w-[1050px] text-left text-sm">
        <thead>
          <tr className="border-b border-slate-200 bg-[#F7F9FA] text-slate-500">
            <th className="px-4 py-4 font-black">Project</th>
            <th className="px-4 py-4 font-black">LGA</th>
            <th className="px-4 py-4 font-black">Sector</th>
            <th className="px-4 py-4 font-black">Status</th>
            <th className="px-4 py-4 font-black">Funded by</th>
            <th className="px-4 py-4 font-black">Beneficiaries</th>
            <th className="px-4 py-4 font-black">Estimated GHG Reduction</th>
          </tr>
        </thead>

        <tbody>
          {projects.map((project, index) => {
            const status = getProjectStatus(project);

            return (
              <tr
                key={
                  project.id ||
                  project.project_code ||
                  `${project.title}-${index}`
                }
                className="border-b border-slate-100 last:border-0"
              >
                <td className="px-4 py-5">
                  <p className="font-black text-[#030454]">{project.title}</p>

                  <p className="mt-1 text-xs text-slate-500">
                    {project.project_code || "No public code"}
                  </p>
                </td>

                <td className="px-4 py-5 font-bold text-[#030454]">
                  {getProjectLga(project)}
                </td>

                <td className="px-4 py-5 font-bold text-[#030454]">
                  {getProjectSector(project)}
                </td>

                <td className="px-4 py-5">
                  <span
                    className={`rounded-sm px-3 py-1 text-[10px] font-black uppercase tracking-[0.08em] ${getStatusClass(
                      status
                    )}`}
                  >
                    {status}
                  </span>
                </td>

                <td className="px-4 py-5 font-bold text-[#030454]">
                  {getProjectFundingSource(project)}
                </td>

                <td className="px-4 py-5 font-mono font-black text-[#030454]">
                  {formatCompactNumber(getProjectBeneficiaries(project))}
                </td>

                <td className="px-4 py-5 font-mono font-black text-[#030454]">
                  {formatNumber(getProjectReduction(project), 0)} tCO₂e
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ProjectPortfolioPanel({
  projects,
  filteredProjects,
  summary,
  sectorFilter,
  setSectorFilter,
  statusFilter,
  setStatusFilter,
  fundingFilter,
  setFundingFilter,
  lgaFilter,
  setLgaFilter,
  sectors,
  statuses,
  fundingSources,
  lgas,
}) {
  const fundingSourcesRepresented = Array.from(
    new Set(
      projects
        .map((project) => getProjectFundingSource(project))
        .filter((source) => source && source !== "Not specified")
    )
  ).length;

  const totalReduction = summary.total_expected_ghg_reduction_tco2e;
  const totalBeneficiaries = summary.total_expected_beneficiaries;

  return (
    <section className="bg-[#F7F9FA] px-4 py-8 sm:px-8 lg:px-10">
      <div className="mx-auto max-w-[1536px]">
        <div className="rounded-md border border-[#CAD2D7] bg-white shadow-sm">
          <div className="border-b border-[#E6EAEC] px-6 py-5">
            <h2 className="font-['Playfair_Display'] text-3xl font-bold text-[#030454]">
              Public climate action portfolio
            </h2>

            <p className="mt-3 max-w-5xl text-sm leading-7 text-slate-600">
              This public view shows approved climate action project summaries,
              expected beneficiaries, funding sources and estimated GHG
              reduction. Budget and financing values are intentionally excluded
              from this page.
            </p>
          </div>

          <div className="space-y-6 p-5">
            <ExplorerControlBar
              sectorFilter={sectorFilter}
              setSectorFilter={setSectorFilter}
              statusFilter={statusFilter}
              setStatusFilter={setStatusFilter}
              fundingFilter={fundingFilter}
              setFundingFilter={setFundingFilter}
              lgaFilter={lgaFilter}
              setLgaFilter={setLgaFilter}
              sectors={sectors}
              statuses={statuses}
              fundingSources={fundingSources}
              lgas={lgas}
              totalProjects={summary.total_projects || projects.length}
            />

            <div className="grid gap-4 md:grid-cols-4">
              <SummaryChip
                label="Public projects"
                value={summary.total_projects || projects.length || 0}
                helper="Projects registered for public display."
              />

              <SummaryChip
                label="Estimated GHG reduction"
                value={`${formatCompactNumber(totalReduction)} tCO₂e`}
                helper="Expected mitigation outcome."
              />

              <SummaryChip
                label="Expected beneficiaries"
                value={formatCompactNumber(totalBeneficiaries)}
                helper="People expected to benefit."
              />

              <SummaryChip
                label="Funding sources"
                value={fundingSourcesRepresented}
                helper="Funding sources represented in the public portfolio."
              />
            </div>

            <ProjectPortfolioTable projects={filteredProjects} />
          </div>
        </div>
      </div>
    </section>
  );
}

function AboutDataAccordion() {
  const [openItems, setOpenItems] = useState([]);

  function toggleItem(title) {
    setOpenItems((current) =>
      current.includes(title)
        ? current.filter((item) => item !== title)
        : [...current, title]
    );
  }

  return (
    <section className="bg-[#F7F9FA] px-4 pb-14 sm:px-8 lg:px-10">
      <div className="mx-auto max-w-5xl">
        <h2 className="font-['Playfair_Display'] text-3xl font-bold text-[#030454]">
          About the data
        </h2>

        <div className="mt-6 divide-y divide-[#D8DDE2] rounded-md border border-[#D8DDE2] bg-white">
          {aboutDataItems.map((item) => {
            const isOpen = openItems.includes(item.title);

            return (
              <div key={item.title}>
                <button
                  type="button"
                  onClick={() => toggleItem(item.title)}
                  className="flex w-full items-center justify-between gap-6 px-5 py-5 text-left"
                >
                  <span className="font-bold text-[#030454]">{item.title}</span>

                  <span className="text-xl font-black text-[#009B35]">
                    {isOpen ? "−" : "+"}
                  </span>
                </button>

                {isOpen && (
                  <div className="px-5 pb-5 text-sm leading-7 text-slate-600">
                    {item.body}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export default function PublicProjectsPage() {
  const [summaryData, setSummaryData] = useState(null);
  const [sectorFilter, setSectorFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [fundingFilter, setFundingFilter] = useState("all");
  const [lgaFilter, setLgaFilter] = useState("all");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadSummary() {
    setIsLoading(true);
    setError("");

    try {
      const data = await getPublicPortalSummary();
      setSummaryData(data.summary || {});
    } catch (err) {
      console.error(err);
      setError("Could not load public project portfolio summary.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadSummary();
  }, []);

  const projectSummary = summaryData?.projects || {};

  const projectList = useMemo(() => {
    const rows =
      projectSummary.public_projects ||
      projectSummary.top_projects ||
      projectSummary.results ||
      [];

    return [...rows];
  }, [projectSummary]);

  const sectors = useMemo(() => {
    const publishedSectors = projectList
      .map((project) => getProjectSector(project))
      .filter(Boolean);

    return Array.from(
      new Set([...STANDARD_SECTOR_OPTIONS, ...publishedSectors])
    );
  }, [projectList]);

  const statuses = useMemo(() => {
    return Array.from(
      new Set(
        projectList
          .map((project) => getProjectStatus(project))
          .filter(Boolean)
      )
    );
  }, [projectList]);

  const fundingSources = useMemo(() => {
    return Array.from(
      new Set(
        projectList
          .map((project) => getProjectFundingSource(project))
          .filter((source) => source && source !== "Not specified")
      )
    );
  }, [projectList]);

  const lgas = useMemo(() => {
    return Array.from(
      new Set(
        projectList.map((project) => getProjectLga(project)).filter(Boolean)
      )
    );
  }, [projectList]);

  const filteredProjects = useMemo(() => {
    return projectList.filter((project) => {
      const sector = getProjectSector(project);
      const status = getProjectStatus(project);
      const fundingSource = getProjectFundingSource(project);
      const lga = getProjectLga(project);

      const sectorMatches = sectorFilter === "all" || sector === sectorFilter;
      const statusMatches = statusFilter === "all" || status === statusFilter;
      const fundingMatches =
        fundingFilter === "all" || fundingSource === fundingFilter;
      const lgaMatches = lgaFilter === "all" || lga === lgaFilter;

      return sectorMatches && statusMatches && fundingMatches && lgaMatches;
    });
  }, [projectList, sectorFilter, statusFilter, fundingFilter, lgaFilter]);

  return (
    <main className="min-h-screen bg-[#DFE3E4] font-['DM_Sans'] text-[#030454]">
      <PublicPortalHeader
        activePage="projects"
        compact
        title={<>Climate action projects</>}
        description="Explore public climate action projects, expected beneficiaries and estimated greenhouse gas reduction outcomes across Kaduna State."
        showActions={false}
      />

      {error && (
        <section className="px-4 py-4 sm:px-8 lg:px-10">
          <div className="mx-auto max-w-[1536px] rounded-sm border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        </section>
      )}

      {isLoading ? (
        <section className="px-4 py-16 sm:px-8 lg:px-10">
          <div className="mx-auto max-w-[1536px] rounded-sm border border-[#CAD2D7] bg-white p-8 text-sm text-slate-500 shadow-sm">
            Loading public project portfolio...
          </div>
        </section>
      ) : (
        <>
          <ProjectPortfolioPanel
            projects={projectList}
            filteredProjects={filteredProjects}
            summary={projectSummary}
            sectorFilter={sectorFilter}
            setSectorFilter={setSectorFilter}
            statusFilter={statusFilter}
            setStatusFilter={setStatusFilter}
            fundingFilter={fundingFilter}
            setFundingFilter={setFundingFilter}
            lgaFilter={lgaFilter}
            setLgaFilter={setLgaFilter}
            sectors={sectors}
            statuses={statuses}
            fundingSources={fundingSources}
            lgas={lgas}
          />

          <AboutDataAccordion />
        </>
      )}

      <PublicPortalFooter />
    </main>
  );
}