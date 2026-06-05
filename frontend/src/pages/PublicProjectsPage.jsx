import { useEffect, useMemo, useState } from "react";
import {
  PublicEmptyState,
  PublicPortalFooter,
  PublicPortalHeader,
  PublicSectionIntro,
} from "../components/PublicPortalChrome";
import { getPublicPortalSummary } from "../services/api";

function formatNumber(value, maximumFractionDigits = 2) {
  return Number(value || 0).toLocaleString(undefined, {
    maximumFractionDigits,
  });
}

function formatCompactNumber(value) {
  const number = Number(value || 0);

  if (number >= 1_000_000) {
    return `${formatNumber(number / 1_000_000, 2)}M`;
  }

  if (number >= 1_000) {
    return `${formatNumber(number / 1_000, 1)}K`;
  }

  return formatNumber(number, 0);
}

function getStatusClass(status) {
  if (status === "completed") return "bg-[#009B35]/10 text-[#009B35]";
  if (status === "ongoing") return "bg-[#030454]/10 text-[#030454]";
  if (status === "planned") return "bg-sky-50 text-sky-700";
  if (status === "suspended") return "bg-amber-50 text-amber-700";
  if (status === "cancelled") return "bg-red-50 text-red-700";
  return "bg-purple-50 text-purple-700";
}

function getPriorityClass(priority) {
  if (priority === "very_high") return "bg-red-50 text-red-700";
  if (priority === "high") return "bg-orange-50 text-orange-700";
  if (priority === "medium") return "bg-[#F3F74B]/25 text-[#030454]";
  return "bg-[#009B35]/10 text-[#009B35]";
}

function MetricCard({ label, value, helper }) {
  return (
    <div className="rounded-md border border-[#D8DDE2] bg-white p-6 shadow-sm">
      <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">
        {label}
      </p>

      <p className="mt-3 font-['Playfair_Display'] text-4xl font-bold text-[#030454]">
        {value}
      </p>

      {helper && <p className="mt-2 text-sm leading-6 text-slate-500">{helper}</p>}
    </div>
  );
}

function ProjectCard({ project }) {
  return (
    <article className="rounded-sm border border-[#CAD2D7] bg-white p-5 shadow-sm transition hover:border-[#009B35]/70 hover:shadow-md">
      <div className="mb-4 flex flex-wrap gap-2">
        <span
          className={`rounded-sm px-3 py-1 text-[10px] font-bold uppercase tracking-[0.1em] ${getPriorityClass(
            project.priority
          )}`}
        >
          {project.priority_display || project.priority || "Priority"}
        </span>

        <span
          className={`rounded-sm px-3 py-1 text-[10px] font-bold uppercase tracking-[0.1em] ${getStatusClass(
            project.status
          )}`}
        >
          {project.status_display || project.status || "Status"}
        </span>
      </div>

      <h3 className="text-base font-black leading-snug text-[#030454]">
        {project.title}
      </h3>

      <p className="mt-2 text-xs leading-5 text-slate-500">
        {project.project_code || "No code"} · {project.lga_name || "Statewide"}
      </p>

      <div className="mt-5 grid grid-cols-2 gap-x-5 gap-y-4">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">
            Sector
          </p>

          <p className="mt-1 text-sm font-bold text-[#030454]">
            {project.sector_display || project.sector || "Not specified"}
          </p>
        </div>

        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">
            Beneficiaries
          </p>

          <p className="mt-1 text-sm font-bold text-[#030454]">
            {formatCompactNumber(project.expected_beneficiaries)}
          </p>
        </div>

        <div className="col-span-2">
          <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">
            Estimated GHG Reduction
          </p>

          <p className="mt-1 text-sm font-bold text-[#030454]">
            {formatNumber(project.expected_ghg_reduction_tco2e, 0)} tCO₂e
          </p>
        </div>
      </div>
    </article>
  );
}

export default function PublicProjectsPage() {
  const [summaryData, setSummaryData] = useState(null);
  const [sectorFilter, setSectorFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
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

  const projects = summaryData?.projects || {};
  const projectList = projects.top_projects || [];

  const sectors = useMemo(() => {
    return Array.from(
      new Set(
        projectList
          .map((project) => project.sector_display || project.sector)
          .filter(Boolean)
      )
    );
  }, [projectList]);

  const statuses = useMemo(() => {
    return Array.from(
      new Set(
        projectList
          .map((project) => project.status_display || project.status)
          .filter(Boolean)
      )
    );
  }, [projectList]);

  const filteredProjects = useMemo(() => {
    return projectList.filter((project) => {
      const sector = project.sector_display || project.sector;
      const status = project.status_display || project.status;

      const sectorMatches = sectorFilter === "all" || sector === sectorFilter;
      const statusMatches = statusFilter === "all" || status === statusFilter;

      return sectorMatches && statusMatches;
    });
  }, [projectList, sectorFilter, statusFilter]);

  return (
    <main className="min-h-screen bg-[#DFE3E4] font-['DM_Sans'] text-[#030454]">
      <PublicPortalHeader
        activePage="projects"
        compact
        tag="Public climate action portfolio"
        title={<>Climate action projects</>}
        description="Explore public climate action projects, expected beneficiaries and estimated greenhouse gas reduction outcomes across Kaduna State."
        showActions={false}
      />

      {error && (
        <section className="px-4 py-4 sm:px-8 lg:px-10">
          <div className="mx-auto max-w-7xl rounded-sm border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        </section>
      )}

      {isLoading ? (
        <section className="px-4 py-16 sm:px-8 lg:px-10">
          <div className="mx-auto max-w-7xl rounded-sm border border-[#CAD2D7] bg-white p-8 text-sm text-slate-500 shadow-sm">
            Loading public project portfolio...
          </div>
        </section>
      ) : (
        <section className="bg-white px-4 py-16 sm:px-8 lg:px-10 lg:py-20">
          <div className="mx-auto max-w-7xl">
            <PublicSectionIntro
              title="Where action is happening"
              description="Selected public climate action projects from the portfolio. Financial values are intentionally excluded from the public view."
            />

            <div className="mt-10 grid gap-6 md:grid-cols-3">
              <MetricCard
                label="Active Projects"
                value={projects.total_projects || 0}
                helper="Projects currently registered in the public portfolio."
              />

              <MetricCard
                label="Estimated GHG Reduction"
                value={`${formatCompactNumber(
                  projects.total_expected_ghg_reduction_tco2e
                )} tCO₂e`}
                helper="Estimated mitigation outcome from public project summaries."
              />

              <MetricCard
                label="Expected Beneficiaries"
                value={formatCompactNumber(projects.total_expected_beneficiaries)}
                helper="People expected to benefit from public project summaries."
              />
            </div>

            <div className="mt-10 flex flex-wrap gap-3">
              <select
                value={sectorFilter}
                onChange={(event) => setSectorFilter(event.target.value)}
                className="rounded-md border border-slate-200 bg-white px-4 py-3 text-sm text-[#030454] outline-none focus:border-[#009B35] focus:ring-2 focus:ring-[#009B35]/10"
              >
                <option value="all">All sectors</option>
                {sectors.map((sector) => (
                  <option key={sector} value={sector}>
                    {sector}
                  </option>
                ))}
              </select>

              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
                className="rounded-md border border-slate-200 bg-white px-4 py-3 text-sm text-[#030454] outline-none focus:border-[#009B35] focus:ring-2 focus:ring-[#009B35]/10"
              >
                <option value="all">All statuses</option>
                {statuses.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </div>

            <div className="mt-8 grid gap-6 md:grid-cols-2 xl:grid-cols-3">
              {filteredProjects.map((project) => (
                <ProjectCard key={project.id} project={project} />
              ))}

              {filteredProjects.length === 0 && (
                <PublicEmptyState
                  title="No public project summary available"
                  message="No public project summary records match the current filters."
                />
              )}
            </div>
          </div>
        </section>
      )}

      <PublicPortalFooter />
    </main>
  );
}