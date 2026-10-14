import RecommendedActions from "./RecommendedActions";
import { recommendationFromPathway, SECTOR_LABELS } from "../decision-support/climateRecommendations.js";

// Existing pathway evidence remains owned by climatePathways; this panel only
// adds suggestion metadata and displays registered records supplied by the caller.
export default function ClimateActionOpportunitiesPanel({
  lgaName, pathways, existingProjects = [], onViewGhgSector,
}) {
  if (!lgaName || !pathways?.length) return null;
  const recommendations = pathways.map((p) => recommendationFromPathway(p, { lga: lgaName })).filter(Boolean);
  const sectors = new Set(recommendations.flatMap((action) => action.suggestedGhgSectors));
  const matches = existingProjects.filter((project) => {
    const projectLga = String(project.lga_name || project.lga || "").trim().toLowerCase();
    return projectLga === lgaName.trim().toLowerCase() && (sectors.size === 0 || sectors.has(project.sector));
  });
  return <section className="mx-auto max-w-5xl space-y-4 px-4 py-8 sm:px-8 lg:px-10">
    <RecommendedActions recommendations={recommendations} onViewGhgSector={onViewGhgSector} />
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <h3 className="font-bold text-[#030454]">Registered Projects in {lgaName}</h3>
      {matches.length ? <ul className="mt-2 space-y-2 text-sm text-slate-700">
        {matches.map((project) => <li key={project.id || project.project_code}>
          {project.title} · {SECTOR_LABELS[project.sector] || project.sector_display || project.sector}
          {project.status_display || project.status ? ` · ${project.status_display || project.status}` : ""}
        </li>)}
      </ul> : <p className="mt-2 text-sm text-slate-700">No matching registered project records were supplied for this selection.</p>}
    </div>
  </section>;
}
