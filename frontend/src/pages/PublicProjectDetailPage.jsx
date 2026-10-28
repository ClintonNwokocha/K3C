import { useEffect, useMemo, useState } from "react";
import { ArrowLeft } from "lucide-react";
import {
  PublicCard,
  PublicDisclaimerNote,
  PublicEmptyState,
  PublicErrorBanner,
  PublicLoadingState,
  PublicPortalFooter,
  PublicPortalHeader,
  PublicSecondaryButton,
} from "../components/PublicPortalChrome";
import { getPublicPortalSummary } from "../services/api";
import { SECTOR_LABELS } from "../decision-support/climateRecommendations.js";
import { ProjectImage, ProjectKeyMetrics } from "./PublicProjectsPage";
import {
  getProjectDescription,
  getProjectExternalLink,
  getProjectLga,
  getProjectPeriod,
  getProjectSector,
  getProjectStatus,
  getProjectStatusKey,
  getProjectSummary,
  getStatusMeta,
} from "../utils/publicProjectFields.js";

function navigateToDirectory() {
  window.location.href = "/public/projects";
}

function ProjectDetailContent({ project }) {
  const statusMeta = getStatusMeta(getProjectStatusKey(project));
  const period = getProjectPeriod(project);
  const externalLink = getProjectExternalLink(project);
  const latitude = Number(project.latitude);
  const longitude = Number(project.longitude);
  const hasCoordinates = Number.isFinite(latitude) && Number.isFinite(longitude);
  const hasGhgSectorLink = Object.hasOwn(SECTOR_LABELS, project.sector);

  return (
    <>
      <section className="relative overflow-hidden bg-gradient-to-br from-[#030454] via-[#0b1455] to-[#063b35] text-white">
        <div className="h-48 bg-[#030454] sm:h-64">
          <ProjectImage project={project} alt={project.title} label="Climate Action Project" />
        </div>
        <div className="px-4 py-8 sm:px-8 lg:px-10">
          <div className="mx-auto max-w-5xl">
            <PublicSecondaryButton
              inverse
              onClick={navigateToDirectory}
              className="mb-5 px-3 py-2 text-xs"
            >
              <span className="flex items-center gap-2">
                <ArrowLeft size={14} aria-hidden="true" /> Back to directory
              </span>
            </PublicSecondaryButton>

            <span className={`rounded-full px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.08em] ${statusMeta.badge}`}>
              {getProjectStatus(project)}
            </span>

            <h1 className="mt-4 text-balance font-['Playfair_Display'] text-3xl font-black leading-tight sm:text-4xl">
              {project.title}
            </h1>

            <p className="mt-3 text-sm text-white/75">
              {getProjectSector(project)} · {getProjectLga(project)}
            </p>

            <p className="mt-4 max-w-3xl text-base leading-7 text-white/80">
              {getProjectSummary(project)}
            </p>
          </div>
        </div>
      </section>

      <section className="bg-[#F7F9FA] px-4 py-10 sm:px-8 lg:px-10">
        <div className="mx-auto max-w-5xl space-y-8">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#009B35]">
              Key metrics
            </p>
            <div className="mt-3">
              <ProjectKeyMetrics project={project} />
            </div>
          </div>

          <PublicCard className="p-6">
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#009B35]">
              Project overview
            </p>
            <p className="mt-3 text-sm leading-7 text-slate-600">{getProjectDescription(project)}</p>
          </PublicCard>

          {period && (
            <PublicCard className="p-6">
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#009B35]">
                Timeline
              </p>
              <p className="mt-3 text-sm font-bold text-[#030454]">{period}</p>
            </PublicCard>
          )}

          <PublicCard className="p-6">
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#009B35]">
              Location
            </p>
            <p className="mt-3 text-sm font-bold text-[#030454]">{getProjectLga(project)}</p>
            {hasCoordinates && (
              <p className="mt-1 text-xs text-slate-500">
                Coordinates: {latitude.toFixed(4)}, {longitude.toFixed(4)}
              </p>
            )}
          </PublicCard>

          {(externalLink || hasGhgSectorLink) && (
            <PublicCard className="p-6">
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#009B35]">
                Reporting &amp; evidence
              </p>
              <div className="mt-3 flex flex-col gap-3">
                {hasGhgSectorLink && (
                  <a
                    href={`/public/ghg-inventory?sector=${encodeURIComponent(project.sector)}&from_lga=${encodeURIComponent(getProjectLga(project))}`}
                    className="text-sm font-bold text-[#173B91] underline"
                  >
                    View GHG Sector — Kaduna State inventory
                  </a>
                )}
                {externalLink && (
                  <a
                    href={externalLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-[0.08em] text-[#009B35] underline-offset-4 hover:underline"
                  >
                    Visit project resource <span aria-hidden="true">→</span>
                  </a>
                )}
              </div>
            </PublicCard>
          )}

          <PublicDisclaimerNote className="">
            This public detail view excludes budget and financial values not already published by the project record.
          </PublicDisclaimerNote>
        </div>
      </section>
    </>
  );
}

export default function PublicProjectDetailPage({ projectId }) {
  const [projectList, setProjectList] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    getPublicPortalSummary()
      .then((data) => {
        if (cancelled) return;
        const projects = data?.summary?.projects || {};
        const rows = projects.public_projects || projects.top_projects || projects.results || [];
        setProjectList(rows);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error(err);
        setError("Could not load this project's public record.");
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const project = useMemo(() => {
    if (!projectList) return null;
    return (
      projectList.find((row) => String(row.id) === String(projectId)) ||
      projectList.find((row) => String(row.project_code) === String(projectId)) ||
      null
    );
  }, [projectList, projectId]);

  return (
    <main className="min-h-screen bg-[#DFE3E4] font-['DM_Sans'] text-[#030454]">
      <PublicPortalHeader activePage="projects" compact showHero={false} showActions={false} />
      <PublicErrorBanner message={error} />

      {isLoading ? (
        <PublicLoadingState message="Loading project details..." />
      ) : !project ? (
        <section className="px-4 py-14 sm:px-8 lg:px-10">
          <div className="mx-auto max-w-3xl">
            <PublicEmptyState
              title="Project not found"
              message="This project is not currently published, or the link may be out of date."
            />
            <div className="mt-6">
              <PublicSecondaryButton onClick={navigateToDirectory}>
                Back to Project Directory
              </PublicSecondaryButton>
            </div>
          </div>
        </section>
      ) : (
        <ProjectDetailContent project={project} />
      )}

      <PublicPortalFooter />
    </main>
  );
}
