import { buildActionLinks } from "../decision-support/climateRecommendations.js";

export default function RecommendedActions({ recommendations = [], onViewGhgSector }) {
  return (
    <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-4" aria-label="Recommended Actions">
      <h2 className="text-lg font-black text-[#030454]">Recommended Actions</h2>
      <p className="text-xs leading-5 text-slate-700">Deterministic screening suggestions. These are not approved interventions or registered projects.</p>
      {recommendations.length === 0 && <p className="text-sm text-slate-700">No specific action is supported by the available selected metric. Continue monitoring; missing evidence does not indicate safe conditions.</p>}
      {recommendations.map((action) => {
        const links = buildActionLinks(action);
        return <article key={action.id} className="space-y-3 border-t border-slate-200 pt-4">
          <h3 className="font-bold text-[#030454]">{action.title}</h3>
          <p className="text-xs leading-5 text-slate-700"><strong>Why this action: </strong>{action.rationale}</p>
          <ul className="list-disc pl-5 text-xs leading-5 text-slate-700">{action.interventions.map((item) => <li key={item}>{item}</li>)}</ul>
          <dl className="space-y-2 text-xs leading-5 text-slate-700">
            <div><dt className="font-bold">Priority: {action.priority}</dt><dd>{action.priorityBasis}</dd></div>
            <div><dt className="font-bold">Suggested Project Type</dt><dd>{action.suggestedProjectType}</dd></div>
            <div><dt className="font-bold">Suggested GHG Sector</dt><dd>{action.suggestedGhgSector}</dd></div>
            <div><dt className="font-bold">Adaptation relevance</dt><dd>{action.adaptationRelevance}</dd></div>
            <div><dt className="font-bold">Mitigation relevance</dt><dd>{action.mitigationRelevance}</dd></div>
          </dl>
          <p className="text-xs leading-5 text-amber-800">{action.limitations.join(" ")}</p>
          <div className="flex flex-wrap gap-3 text-xs font-bold text-[#173B91]">
            <a className="underline focus-visible:outline-2" href={links.projects}>View Relevant Projects</a>
            <a className="underline focus-visible:outline-2" href={links.register}>Create / Register Project</a>
            {onViewGhgSector && action.suggestedGhgSectors.length ? <button type="button" className="underline" onClick={() => onViewGhgSector(action.suggestedGhgSectors[0])}>View GHG Sector</button> : <a className="underline focus-visible:outline-2" href={links.ghg}>{action.suggestedGhgSectors.length ? "View GHG Sector" : "View GHG Inventory (sector not assessed)"}</a>}
          </div>
        </article>;
      })}
    </section>
  );
}
