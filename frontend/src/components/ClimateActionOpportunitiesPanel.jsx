import { READINESS } from "../utils/climatePathways";
import { getOpportunityForPathway } from "../decision-support/climateActionOpportunityCatalog";

// Presentational only. Receives pathways already derived by
// deriveActionPathways()/deriveActionPathwaysCore() (climatePathways.js) —
// it never recalculates risk, evidence, confidence, or readiness itself. It
// only looks up integration metadata (category/GHG sector) for each pathway
// id via climateActionOpportunityCatalog.js.

function ReadinessBadge({ status }) {
  const r = READINESS[status] || READINESS.insufficient_evidence;
  return (
    <span className={`inline-block rounded px-2 py-0.5 text-[10px] font-bold leading-tight ${r.cls}`}>
      {r.label}
    </span>
  );
}

function getProjectSectorCode(project) {
  return project.sector || "";
}

function getProjectLgaName(project) {
  return project.lga_name || project.lga || "";
}

function findMatchingProjects(existingProjects, lgaName, ghgSectors) {
  if (!Array.isArray(existingProjects) || !lgaName) return [];
  const normalizedLga = String(lgaName).trim().toLowerCase();
  return existingProjects.filter((project) => {
    const projectLga = String(getProjectLgaName(project)).trim().toLowerCase();
    if (projectLga !== normalizedLga) return false;
    if (ghgSectors.length === 0) return true;
    return ghgSectors.includes(getProjectSectorCode(project));
  });
}

const GHG_SECTOR_LABELS = {
  energy: "Energy",
  agriculture: "Agriculture",
  waste: "Waste",
  ippu: "IPPU",
  lulucf: "LULUCF",
};

function OpportunityCard({ lgaName, pathway, existingProjects, onViewGhgSector }) {
  const opportunity = getOpportunityForPathway(pathway.id);
  if (!opportunity || !opportunity.category) return null;

  const matches = findMatchingProjects(existingProjects, lgaName, opportunity.ghgSectors);

  return (
    <div className="rounded-xl border border-[#E6EAEC] bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[#173B91]">
            Suggested Opportunity · {opportunity.category}
          </p>
          <p className="mt-1 text-sm font-black text-[#030454]">{pathway.theme}</p>
        </div>
        <ReadinessBadge status={pathway.readinessStatus} />
      </div>

      {pathway.triggers?.length > 0 && (
        <div className="mt-3">
          <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-500">
            Why this was suggested for {lgaName}
          </p>
          {pathway.triggers.map((t, i) => (
            <p key={i} className="mt-1 text-xs leading-5 text-slate-700">
              · {t}
            </p>
          ))}
        </div>
      )}

      <div className="mt-3">
        <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-500">Supporting evidence</p>
        <p className="mt-1 text-xs leading-5 text-slate-700">{pathway.evidenceBasis}</p>
      </div>

      {opportunity.exampleInterventions.length > 0 && (
        <div className="mt-3">
          <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-500">Example interventions</p>
          <ul className="mt-1 list-disc pl-4 text-xs leading-5 text-slate-700">
            {opportunity.exampleInterventions.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-3">
        <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-500">Confidence</p>
        <p className="mt-1 text-xs leading-5 text-slate-700">{pathway.confidence}</p>
      </div>

      <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-2">
        <p className="text-[10px] leading-5 text-amber-700">⚠ {pathway.scientificCaution}</p>
      </div>

      <div className="mt-3 border-t border-[#E6EAEC] pt-3">
        <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-500">Relevant GHG sector</p>
        {opportunity.ghgSectors.length > 0 ? (
          <>
            <p className="mt-1 text-xs font-bold text-[#030454]">
              {opportunity.ghgSectors.map((s) => GHG_SECTOR_LABELS[s] || s).join(", ")}
            </p>
            <p className="mt-1 text-xs leading-5 text-slate-600">{opportunity.ghgRelationship}</p>
            {typeof onViewGhgSector === "function" ? (
              <button
                type="button"
                onClick={() => onViewGhgSector(opportunity.ghgSectors[0])}
                className="mt-2 text-xs font-bold text-[#173B91] underline"
              >
                View related emissions →
              </button>
            ) : (
              <a
                href={`/public/ghg-inventory?sector=${encodeURIComponent(opportunity.ghgSectors[0])}&from_lga=${encodeURIComponent(lgaName)}`}
                className="mt-2 inline-block text-xs font-bold text-[#173B91] underline"
              >
                View related emissions →
              </a>
            )}
          </>
        ) : (
          <p className="mt-1 text-xs leading-5 text-slate-500">
            No direct GHG mitigation sector applies to this adaptation pathway.
          </p>
        )}
      </div>

      <div className="mt-4 border-t border-[#E6EAEC] pt-3">
        <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-500">
          Existing Registered Projects
        </p>
        {matches.length > 0 ? (
          <ul className="mt-1 space-y-1 text-xs leading-5 text-slate-700">
            {matches.map((project) => (
              <li key={project.id || project.project_code || project.title}>
                · {project.title} ({project.status_display || project.status})
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-xs italic leading-5 text-slate-500">
            No existing registered project currently matches this opportunity in {lgaName}.
          </p>
        )}
      </div>
    </div>
  );
}

export default function ClimateActionOpportunitiesPanel({
  lgaName,
  pathways,
  existingProjects = [],
  onViewGhgSector,
}) {
  if (!lgaName || !pathways?.length) return null;

  const cards = pathways
    .map((pathway) => (
      <OpportunityCard
        key={pathway.id}
        lgaName={lgaName}
        pathway={pathway}
        existingProjects={existingProjects}
        onViewGhgSector={onViewGhgSector}
      />
    ))
    .filter(Boolean);

  if (cards.length === 0) return null;

  return (
    <section className="mx-auto max-w-5xl px-4 py-8 sm:px-8 lg:px-10">
      <p className="text-[10px] font-black uppercase tracking-[0.15em] text-[#173B91]">
        Suggested Project Opportunities
      </p>
      <p className="mt-1 text-xl font-black text-[#030454]">{lgaName}</p>
      <p className="mt-2 max-w-3xl text-xs leading-5 text-slate-600">
        Generated from the existing rule-based Climate Action Pathway engine. These are screening-level
        considerations, not approved project decisions, and all require field verification.
      </p>
      <div className="mt-5 grid gap-4 md:grid-cols-2">{cards}</div>
    </section>
  );
}
