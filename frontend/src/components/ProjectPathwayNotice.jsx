export default function ProjectPathwayNotice({ context }) {
  if (!context.recommendation && !context.contributingOnly) return null;
  return <aside className="rounded-xl border border-slate-200 bg-white p-4 text-sm leading-6 text-slate-700">
    {context.recommendation && <>
      <p><strong>Suggested Action context:</strong> {context.suggestedProjectType || context.recommendation}{context.lga ? ` in ${context.lga}` : ""}.</p>
      <p>{[context.indicator, context.year, context.period, context.season].filter(Boolean).join(" · ")}</p>
      <p>This suggestion is not a registered or approved project. Review the project type, sector and LGA before submitting a new record.</p>
    </>}
    {context.contributingOnly && <p>{context.projectIds.length ? "Showing only registered project IDs supplied by the sector mitigation summary." : "No contributing project IDs are available from a mitigation assessment. No project has been assumed to contribute."}</p>}
    {context.sector && <a className="font-bold text-[#173B91] underline" href={`/public/ghg-inventory?sector=${encodeURIComponent(context.sector)}&from_lga=${encodeURIComponent(context.lga)}`}>View GHG Sector — Kaduna State inventory</a>}
  </aside>;
}
