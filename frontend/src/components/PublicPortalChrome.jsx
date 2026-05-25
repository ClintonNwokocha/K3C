function PublicNavButton({ label, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
        active
          ? "bg-emerald-400 text-slate-950"
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
    <section className="border-b border-slate-800 bg-slate-950 px-6 py-10 text-white">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-col justify-between gap-8 lg:flex-row lg:items-start">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-emerald-300">
              Kaduna State Climate Command Centre
            </p>

            <h1 className="mt-4 text-4xl font-bold tracking-tight md:text-5xl">
              {title}
            </h1>

            <p className="mt-4 max-w-3xl text-base leading-7 text-slate-300">
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
              className="rounded-full border border-white/20 px-4 py-2 text-sm font-semibold text-white hover:bg-white/10"
            >
              Staff Login
            </button>
          </div>
        </div>

        <div className="mt-8 grid gap-4 border-t border-white/10 pt-6 text-sm text-slate-300 md:grid-cols-3">
          <div>
            <p className="font-semibold text-white">Climate Risk</p>
            <p className="mt-1">
              Public summaries of climate risk conditions across Kaduna LGAs.
            </p>
          </div>

          <div>
            <p className="font-semibold text-white">Climate Action</p>
            <p className="mt-1">
              Portfolio-level view of projects, expected beneficiaries and
              mitigation outcomes.
            </p>
          </div>

          <div>
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
    <footer className="border-t border-slate-200 bg-white px-6 py-8">
      <div className="mx-auto flex max-w-7xl flex-col justify-between gap-4 text-sm text-slate-500 md:flex-row md:items-center">
        <div>
          <p className="font-semibold text-slate-800">
            Kaduna State Climate Command Centre
          </p>
          <p className="mt-1">
            Public climate information portal for summary-level communication.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
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