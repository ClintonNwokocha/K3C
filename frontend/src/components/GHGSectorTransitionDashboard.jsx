import { buildSectorTransitionRows } from "../utils/ghgTransition.js";

function amount(value, missing = "Not Available") {
  return value === null || value === undefined ? missing : `${Number(value).toLocaleString(undefined, { maximumFractionDigits: 2 })} tCO2e`;
}

export default function GHGSectorTransitionDashboard({ ghg, highlightSector }) {
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
      <ul className="mt-3 flex flex-wrap gap-2" aria-label="Priority intervention types by sector">
        {rows.map((row) => (
          <li key={row.sector} className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs leading-5 text-slate-700">
            <span className="font-bold text-[#030454]">{row.label}:</span> {row.interventions.join(" · ")}
          </li>
        ))}
      </ul>
    </section>
  </div>;
}
