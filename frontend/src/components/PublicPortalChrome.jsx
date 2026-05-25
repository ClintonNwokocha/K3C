function PublicNavButton({ label, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
        active
          ? "bg-emerald-400 text-slate-950 shadow-sm"
          : "border border-white/20 text-white hover:bg-white/10"
      }`}
    >
      {label}
    </button>
  );
}

export function PublicPortalHeader({
  activePage = "home",
  title,
  description,
}) {
  return (
    <section className="border-b border-slate-800 bg-slate-950 px-4 py-8 text-white sm:px-6 sm:py-10">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-col justify-between gap-8 lg:flex-row lg:items-start">
          <div className="max-w-4xl">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-300 sm:text-sm">
              Kaduna State Climate Command Centre
            </p>

            <h1 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl md:text-5xl">
              {title}
            </h1>

            <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-300 sm:text-base">
              {description}
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <PublicNavButton
              label="Public Home"
              active={activePage === "home"}
              onClick={() => {
                window.location.href = "/public";
              }}
            />

            <PublicNavButton
              label="Reports"
              active={activePage === "reports"}
              onClick={() => {
                window.location.href = "/public/reports";
              }}
            />

            <button
              type="button"
              onClick={() => {
                window.location.href = "/";
              }}
              className="rounded-full border border-white/20 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/10"
            >
              Staff Login
            </button>
          </div>
        </div>

        <div className="mt-8 grid gap-4 border-t border-white/10 pt-6 text-sm text-slate-300 md:grid-cols-3">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <p className="font-semibold text-white">Climate Risk</p>
            <p className="mt-1">
              Public summaries of climate risk conditions across Kaduna LGAs.
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <p className="font-semibold text-white">Climate Action</p>
            <p className="mt-1">
              Portfolio-level view of projects, expected beneficiaries and
              mitigation outcomes.
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <p className="font-semibold text-white">Reports</p>
            <p className="mt-1">
              Published public reports, briefs and validated documents.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

export function PublicPortalFooter() {
  return (
    <footer className="border-t border-slate-200 bg-white px-4 py-8 sm:px-6">
      <div className="mx-auto flex max-w-7xl flex-col justify-between gap-6 text-sm text-slate-500 md:flex-row md:items-center">
        <div>
          <p className="font-semibold text-slate-800">
            Kaduna State Climate Command Centre
          </p>
          <p className="mt-1 max-w-2xl">
            Public climate information portal for summary-level communication,
            official documents and climate action visibility.
          </p>
        </div>

        <div className="flex flex-wrap gap-4">
          <button
            type="button"
            onClick={() => {
              window.location.href = "/public";
            }}
            className="font-semibold text-slate-600 hover:text-emerald-700"
          >
            Public Home
          </button>

          <button
            type="button"
            onClick={() => {
              window.location.href = "/public/reports";
            }}
            className="font-semibold text-slate-600 hover:text-emerald-700"
          >
            Reports
          </button>

          <button
            type="button"
            onClick={() => {
              window.location.href = "/";
            }}
            className="font-semibold text-slate-600 hover:text-emerald-700"
          >
            Staff Login
          </button>
        </div>
      </div>
    </footer>
  );
}

export function PublicDataNotice() {
  return (
    <section className="rounded-2xl border border-blue-200 bg-blue-50 p-5 text-sm text-blue-900">
      <p className="font-bold">Public Data Notice</p>
      <p className="mt-2">
        This public portal provides summary-level information for awareness and
        communication. Official datasets, validated technical documents and
        detailed evidence should be accessed through the published reports
        portal.
      </p>
    </section>
  );
}

export function PublicEmptyState({ title, message }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-500">
      <p className="font-semibold text-slate-700">{title}</p>
      <p className="mt-2">{message}</p>
    </div>
  );
}