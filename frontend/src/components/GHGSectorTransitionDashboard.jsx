import { useEffect, useState } from "react";
import { api } from "../services/api.js";
import { fetchProjectMitigationSummary, normalizeProjectMitigation } from "../services/projectMitigation.js";
import { buildSectorTransitionRows } from "../utils/ghgTransition.js";

function amount(value, missing = "Not Available") {
  return value === null || value === undefined ? missing : `${Number(value).toLocaleString(undefined, { maximumFractionDigits: 2 })} tCO2e`;
}

export default function GHGSectorTransitionDashboard({ ghg, highlightSector, publicView = false }) {
  const [pipeline, setPipeline] = useState(() => normalizeProjectMitigation(null));
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    const endpoint = publicView ? null : import.meta.env.VITE_PROJECT_GHG_SUMMARY_ENDPOINT;
    if (!endpoint) return undefined;
    let cancelled = false;
    // Schedule loading with the asynchronous request rather than deriving inventory state from project data.
    Promise.resolve().then(() => { if (!cancelled) setLoading(true); });
    fetchProjectMitigationSummary({ endpoint, request: (url) => api.get(url) }).then((result) => {
      if (!cancelled) { setPipeline(result); setLoading(false); }
    });
    return () => { cancelled = true; };
  }, [publicView]);
  const rows = buildSectorTransitionRows(ghg);
  return <div className="space-y-6">
    <section className="rounded-xl border border-slate-200 bg-white p-5" aria-label="Statewide GHG sector transition">
      <h2 className="text-xl font-black text-[#030454]">Statewide GHG Sector Progress</h2>
      <p className="mt-2 text-sm leading-6 text-slate-700">Approved Kaduna State inventory, in tCO2e. LGA links provide planning context only. Sector baselines and targets must be explicitly configured; the first reporting year is not assumed to be a baseline.</p>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-left text-xs text-slate-700">
          <caption className="sr-only">Official statewide sector totals and configured reduction targets</caption>
          <thead><tr>{["Sector", "Baseline", "Latest", "Target", "Change from baseline", "Progress toward target", "Remaining gap", "Trend"].map((label) => <th key={label} scope="col" className="p-3">{label}</th>)}</tr></thead>
          <tbody>{rows.map((row) => <tr key={row.sector} className={`border-t border-slate-200 ${highlightSector === row.sector ? "bg-[#EEF1FD]" : ""}`}>
            <th scope="row" className="p-3">{row.label}</th>
            <td className="p-3">{amount(row.baseline)}{row.baselineYear ? ` (${row.baselineYear})` : ""}</td>
            <td className="p-3">{amount(row.latest)}{row.year ? ` (${row.year})` : ""}</td>
            <td className="p-3">{amount(row.target, "Not Configured")}{row.targetYear ? ` (${row.targetYear})` : ""}</td>
            <td className="p-3">{amount(row.change)}</td>
            <td className="p-3">{row.progress === null ? "Not Available" : `${row.progress.toFixed(1)}%`}</td>
            <td className="p-3">{amount(row.gap)}</td>
            <td className="p-3">{row.trend}<p>{row.history.map((h) => `${h.year}: ${amount(h.total_co2e)}`).join("; ")}</p></td>
          </tr>)}</tbody>
        </table>
      </div>
      <h3 className="mt-6 font-bold text-[#030454]">Priority Intervention Types</h3>
      <div className="mt-3 divide-y divide-slate-200">{rows.map((row) => <div key={row.sector} className="py-3 text-sm leading-6 text-slate-700">
        <h4 className="font-bold">{row.label}</h4><p>{row.interventions.join(" · ")}</p>
        <a className="font-bold text-[#173B91] underline" href={`/public/projects?sector=${row.sector}`}>View Suitable Climate Projects</a>
      </div>)}</div>
    </section>
    <section className="rounded-xl border border-slate-300 bg-slate-50 p-5" aria-label="Project mitigation pipeline">
      <h2 className="text-xl font-black text-[#030454]">Project Mitigation Pipeline</h2>
      <p className="mt-2 text-sm leading-6 text-slate-700">Project contributions are separate from official inventory. Expected and verified annual impacts must not be subtracted from inventory totals or added together.</p>
      <p role="status" className="mt-2 text-sm text-slate-700">{loading ? "Loading project assessments…" : pipeline.message}{pipeline.reason ? ` (${pipeline.reason})` : ""}</p>
      <div className="mt-4 overflow-x-auto"><table className="w-full text-left text-xs text-slate-700">
        <caption className="sr-only">Project mitigation assessments, annual tCO2e</caption>
        <thead><tr>{["Sector", "Contributing projects", "Expected annual impact", "Verified annual impact", "Expected reductions / avoided emissions (annual)", "Expected removals (annual)", "Projects"].map((label) => <th scope="col" className="p-3" key={label}>{label}</th>)}</tr></thead>
        <tbody>{rows.map((row) => {
          const p = pipeline.sectors.find((s) => s.sector === row.sector);
          return <tr key={row.sector} className="border-t border-slate-200"><th scope="row" className="p-3">{row.label}</th><td className="p-3">{p?.contributing_projects ?? "Not Available"}</td>
            {["expected_annual_tco2e", "verified_annual_tco2e", "reductions_avoided_tco2e", "removals_tco2e"].map((key) => <td className="p-3" key={key}>{amount(p?.[key])}</td>)}
            <td className="p-3"><a className="font-bold text-[#173B91] underline" href={`${publicView ? "/public/projects" : "/?page=projects"}${publicView ? "?" : "&"}sector=${row.sector}&mitigation=assessed&project_ids=${(p?.contributing_project_ids || []).join(",")}`}>View Contributing Projects</a></td>
          </tr>;
        })}</tbody>
      </table></div>
    </section>
  </div>;
}
