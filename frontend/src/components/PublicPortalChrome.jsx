const COLORS = {
  blue: "#030454",
  green: "#009B35",
  yellow: "#F3F74B",
  white: "#FFFFFF",
};

function PublicNavButton({ label, active, onClick, variant = "ghost" }) {
  const baseClass =
    "rounded-sm px-4 py-2 text-xs font-bold uppercase tracking-[0.12em] transition";

  const activeClass = "bg-[#F3F74B] text-[#030454]";
  const primaryClass = "bg-[#009B35] text-white hover:bg-[#00842e]";
  const ghostClass =
    "border border-white/20 text-white/80 hover:border-white/45 hover:text-white";

  return (
    <button
      type="button"
      onClick={onClick}
      className={`${baseClass} ${
        active ? activeClass : variant === "primary" ? primaryClass : ghostClass
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
  stats = [],
  showStats = false,
  compact = false,
  showActions = true,
  primaryActionLabel = "Explore Risk Landscape",
  secondaryActionLabel = "View Reports",
  onPrimaryAction,
  onSecondaryAction,
}) {
  return (
    <header className="bg-[#030454] font-['DM_Sans'] text-white">
      <nav className="border-b border-white/15 px-4 py-4 sm:px-8 lg:px-10">
        <div className="mx-auto flex max-w-7xl flex-col justify-between gap-4 lg:flex-row lg:items-center">
          <button
            type="button"
            onClick={() => {
              window.location.href = "/public";
            }}
            className="flex items-center gap-3 text-left"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-sm bg-[#009B35]">
              <span className="text-sm font-black text-white">K</span>
            </div>

            <div>
              <p className="text-xs font-black uppercase tracking-[0.16em] text-white">
                Kaduna Climate Command Centre
              </p>
              <p className="mt-1 text-xs text-white/60">
                Climate intelligence, evidence and reporting portal
              </p>
            </div>
          </button>

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

            <PublicNavButton
              label="Staff Login"
              variant="primary"
              onClick={() => {
                window.location.href = "/";
              }}
            />
          </div>
        </div>
      </nav>

      <section
        className={`border-b border-white/15 px-4 sm:px-8 lg:px-10 ${
          compact ? "py-14" : "py-20 lg:py-24"
        }`}
      >
        <div className="mx-auto max-w-7xl">
          <div className="max-w-5xl">
            <h1 className="font-['Playfair_Display'] text-5xl font-bold leading-[1.05] tracking-tight text-white sm:text-6xl lg:text-7xl">
              {title}
            </h1>

            {description && (
              <div className="mt-8 max-w-3xl space-y-4 text-base font-light leading-8 text-white/78 sm:text-lg">
                {Array.isArray(description) ? (
                  description.map((paragraph, index) => (
                    <p key={`${paragraph}-${index}`}>{paragraph}</p>
                  ))
                ) : (
                  <p>{description}</p>
                )}
              </div>
            )}

            {showActions && (
              <div className="mt-9 flex flex-wrap gap-4">
                <button
                  type="button"
                  onClick={() => {
                    if (typeof onPrimaryAction === "function") {
                      onPrimaryAction();
                      return;
                    }

                    const section = document.getElementById("risk-landscape");
                    section?.scrollIntoView({ behavior: "smooth" });
                  }}
                  className="rounded-sm bg-[#009B35] px-7 py-4 text-sm font-black uppercase tracking-[0.08em] text-white transition hover:bg-[#00842e]"
                >
                  {primaryActionLabel}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    if (typeof onSecondaryAction === "function") {
                      onSecondaryAction();
                      return;
                    }

                    window.location.href = "/public/reports";
                  }}
                  className="rounded-sm border border-white/35 px-7 py-4 text-sm font-black uppercase tracking-[0.08em] text-white/90 transition hover:border-[#F3F74B] hover:text-[#F3F74B]"
                >
                  {secondaryActionLabel}
                </button>
              </div>
            )}
          </div>
        </div>
      </section>

      {showStats && stats.length > 0 && (
        <section className="border-b border-white/15 bg-[#02033d] px-4 sm:px-8 lg:px-10">
          <div className="mx-auto grid max-w-7xl divide-y divide-white/15 md:grid-cols-4 md:divide-x md:divide-y-0">
            {stats.map((stat) => (
              <div key={stat.label} className="py-6 md:px-6 first:md:pl-0">
                <p className="font-['Playfair_Display'] text-4xl font-bold text-white">
                  {stat.value}
                </p>

                <p className="mt-2 text-[11px] font-black uppercase tracking-[0.14em] text-white/50">
                  {stat.label}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}
    </header>
  );
}

export function PublicSectionIntro({ title, description }) {
  return (
    <div>
      <h2 className="font-['Playfair_Display'] text-4xl font-bold leading-tight text-[#030454]">
        {title}
      </h2>

      {description && (
        <p className="mt-4 max-w-2xl text-sm font-light leading-7 text-slate-600">
          {description}
        </p>
      )}
    </div>
  );
}

export function PublicPortalFooter() {
  return (
    <footer className="bg-[#030454] px-4 py-10 font-['DM_Sans'] text-xs text-white/55 sm:px-8 lg:px-10">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 md:flex-row md:items-center md:justify-between">
        <p className="text-white/70">
          Powered by <span className="font-bold text-white">Quintessence</span>
        </p>

        <div className="flex flex-wrap gap-6">
          <button
            type="button"
            onClick={() => {
              window.location.href = "/public";
            }}
            className="hover:text-white"
          >
            Public Home
          </button>

          <button
            type="button"
            onClick={() => {
              window.location.href = "/public/reports";
            }}
            className="hover:text-white"
          >
            Reports
          </button>

          <button
            type="button"
            onClick={() => {
              window.location.href = "/";
            }}
            className="hover:text-white"
          >
            Staff Login
          </button>
        </div>
      </div>

      <div className="mx-auto mt-8 max-w-7xl border-t border-white/15 pt-6">
        <p className="uppercase tracking-[0.12em] text-white/40">
          © 2026 Kaduna State Climate Command Centre. All rights reserved.
        </p>
      </div>
    </footer>
  );
}

export function PublicDataNotice() {
  return null;
}

export function PublicEmptyState({ title, message }) {
  return (
    <div className="rounded-sm border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-500">
      <p className="font-bold text-[#030454]">{title}</p>
      <p className="mt-2 leading-6">{message}</p>
    </div>
  );
}