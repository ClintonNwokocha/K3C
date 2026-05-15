export default function Dashboard({ health, foundation }) {
  const lgas = foundation?.lgas || [];
  const gwpValues = foundation?.gwp_values || [];
  const ndc = foundation?.ndc_constant;

  return (
    <div className="space-y-8">
      <section>
        <p className="text-sm font-medium text-emerald-700">
          Executive Dashboard
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">
          KS-CCC Foundation Overview
        </h1>
        <p className="mt-2 max-w-3xl text-slate-600">
          This is the first working dashboard shell. It confirms that the
          frontend can read seeded foundation data from the Django backend.
        </p>
      </section>

      <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-sm text-slate-500">Backend Status</p>
          <h2 className="mt-3 text-2xl font-bold text-emerald-700">
            {health?.status || "Loading"}
          </h2>
          <p className="mt-2 text-sm text-slate-500">
            {health?.message || "Checking API connection..."}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-sm text-slate-500">Kaduna LGAs</p>
          <h2 className="mt-3 text-2xl font-bold">{lgas.length}</h2>
          <p className="mt-2 text-sm text-slate-500">
            Seeded into the shared LGA registry.
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-sm text-slate-500">GWP Values</p>
          <h2 className="mt-3 text-2xl font-bold">{gwpValues.length}</h2>
          <p className="mt-2 text-sm text-slate-500">
            CO₂, CH₄ and N₂O reference values loaded.
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-sm text-slate-500">NDC Target Year</p>
          <h2 className="mt-3 text-2xl font-bold">
            {ndc?.target_year || "—"}
          </h2>
          <p className="mt-2 text-sm text-slate-500">
            Kaduna baseline: {ndc?.kaduna_baseline_mt || "—"} MtCO₂e
          </p>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm xl:col-span-2">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold">LGA Registry</h2>
              <p className="text-sm text-slate-500">
                Shared location reference for all modules.
              </p>
            </div>
            <span className="rounded-full bg-emerald-50 px-3 py-1 text-sm font-medium text-emerald-700">
              {lgas.length} records
            </span>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {lgas.map((lga) => (
              <div
                key={lga.lga_id}
                className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3"
              >
                <p className="text-sm font-semibold">
                  {lga.lga_id}. {lga.lga_name}
                </p>
                <p className="text-xs text-slate-500">{lga.state} State</p>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-bold">GWP Reference</h2>
            <p className="mt-1 text-sm text-slate-500">
              Global warming potential values.
            </p>

            <div className="mt-5 space-y-3">
              {gwpValues.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3"
                >
                  <span className="font-medium">{item.gas}</span>
                  <span className="font-bold">{item.gwp100_ar5}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-bold">NDC Constants</h2>
            <div className="mt-5 space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500">Nigeria baseline</span>
                <span className="font-semibold">
                  {ndc?.nigeria_baseline_mt || "—"} Mt
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Kaduna share</span>
                <span className="font-semibold">
                  {ndc?.kaduna_share_pct || "—"}%
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Unconditional target</span>
                <span className="font-semibold">
                  {ndc?.unconditional_pct || "—"}%
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Conditional target</span>
                <span className="font-semibold">
                  {ndc?.conditional_pct || "—"}%
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}