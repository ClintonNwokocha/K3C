const BRAND = {
  commandNavy: "#0B1726",
  officialBlue: "#214560",
  dataBlue: "#4E7492",
  climateTeal: "#2292A4",
  mistGrey: "#DFE3E4",
  gold: "#C8A84A",
};

function PublicNavButton({ label, active, onClick, variant = "ghost" }) {
  const baseClass =
    "rounded-sm px-4 py-2 text-xs font-bold uppercase tracking-[0.12em] transition";

  const activeClass = "bg-[#C8A84A] text-[#0B1726]";
  const primaryClass = "bg-[#2292A4] text-white hover:bg-[#1d7f90]";
  const ghostClass =
    "border border-white/15 text-white/75 hover:border-white/35 hover:text-white";

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
  tag = "Public climate intelligence portal",
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
    <header className="bg-[#0B1726] font-['DM_Sans'] text-white">
      <nav className="border-b border-white/10 px-4 py-4 sm:px-8 lg:px-10">
        <div className="mx-auto flex max-w-7xl flex-col justify-between gap-4 lg:flex-row lg:items-center">
          <button
            type="button"
            onClick={() => {
              window.location.href = "/public";
            }}
            className="flex items-center gap-3 text-left"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-sm bg-[#2292A4]">
              <span className="text-sm font-black text-white">K</span>
            </div>

            <div>
              <p className="text-xs font-black uppercase tracking-[0.16em] text-white">
                Kaduna Climate Command Centre
              </p>
              <p className="mt-1 text-xs text-white/50">
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
        className={`border-b border-white/10 px-4 sm:px-8 lg:px-10 ${
          compact ? "py-16" : "py-20 lg:py-24"
        }`}
      >
        <div className="mx-auto grid max-w-7xl gap-12 lg:grid-cols-[1.15fr_0.85fr] lg:items-end">
          <div>
            <p className="mb-6 text-xs font-black uppercase tracking-[0.2em] text-[#C8A84A]">
              {tag}
            </p>

            <h1 className="max-w-4xl font-['Playfair_Display'] text-5xl font-bold leading-[1.05] tracking-tight text-white sm:text-6xl lg:text-7xl">
              {title}
            </h1>

            <p className="mt-7 max-w-2xl text-base font-light leading-8 text-white/70 sm:text-lg">
              {description}
            </p>

            {showActions && (
              <div className="mt-8 flex flex-wrap gap-4">
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
                  className="rounded-sm bg-[#C8A84A] px-7 py-4 text-sm font-black uppercase tracking-[0.08em] text-[#0B1726] transition hover:bg-[#d8b85c]"
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
                  className="rounded-sm border border-white/35 px-7 py-4 text-sm font-black uppercase tracking-[0.08em] text-white/85 transition hover:border-[#C8A84A] hover:text-white"
                >
                  {secondaryActionLabel}
                </button>
              </div>
            )}
          </div>

          <div className="hidden border-l border-white/10 pl-10 lg:block">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-white/40">
              Portal purpose
            </p>

            <div className="mt-6 space-y-5 text-sm leading-7 text-white/65">
              <p>
                Provides public-facing access to climate risk summaries,
                priority climate action projects, published reports and evidence
                documents.
              </p>

              <p>
                Designed to support transparency, coordination and evidence-led
                decision making across Kaduna State.
              </p>
            </div>
          </div>
        </div>
      </section>

      {showStats && stats.length > 0 && (
        <section className="border-b border-white/10 bg-[#091320] px-4 sm:px-8 lg:px-10">
          <div className="mx-auto grid max-w-7xl divide-y divide-white/10 md:grid-cols-4 md:divide-x md:divide-y-0">
            {stats.map((stat) => (
              <div key={stat.label} className="py-6 md:px-6 first:md:pl-0">
                <p className="font-['Playfair_Display'] text-4xl font-bold text-white">
                  {stat.value}
                </p>

                <p className="mt-2 text-[11px] font-black uppercase tracking-[0.14em] text-white/45">
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

export function PublicSectionIntro({ eyebrow, title, description }) {
  return (
    <div>
      {eyebrow && (
        <p className="mb-3 text-[11px] font-black uppercase tracking-[0.18em] text-[#2292A4]">
          {eyebrow}
        </p>
      )}

      <h2 className="font-['Playfair_Display'] text-4xl font-bold leading-tight text-[#0B1726]">
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
    <footer className="bg-[#0B1726] px-4 py-10 font-['DM_Sans'] text-xs text-white/50 sm:px-8 lg:px-10">
      <div className="mx-auto grid max-w-7xl gap-8 md:grid-cols-[1fr_auto] md:items-end">
        <div>
          <p className="font-black uppercase tracking-[0.14em] text-white">
            Kaduna State Climate Command Centre
          </p>

          <p className="mt-3 max-w-xl leading-6 text-white/50">
            Public climate intelligence, evidence and reporting portal for
            summary-level climate risk, project and reports information.
          </p>

          <p className="mt-4 text-white/60">
            Powered by{" "}
            <span className="font-bold text-white">
              Quintessence Environmental Consult
            </span>
          </p>
        </div>

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

      <div className="mx-auto mt-8 max-w-7xl border-t border-white/10 pt-6">
        <p className="uppercase tracking-[0.12em] text-white/35">
          © 2026 Kaduna State Climate Command Centre. All rights reserved.
        </p>
      </div>
    </footer>
  );
}

export function PublicDataNotice() {
  return (
    <section className="border-l-4 border-[#2292A4] bg-white px-5 py-4 font-['DM_Sans'] text-xs leading-6 text-slate-600">
      <strong className="text-[#0B1726]">Public data notice:</strong> This
      portal provides summary-level information for public awareness and
      communication. Official datasets, validated technical documents and
      detailed evidence should be accessed through the published reports portal.
    </section>
  );
}

export function PublicEmptyState({ title, message }) {
  return (
    <div className="rounded-sm border border-dashed border-[#B8C2C8] bg-white p-6 text-sm text-slate-500">
      <p className="font-bold text-[#0B1726]">{title}</p>
      <p className="mt-2 leading-6">{message}</p>
    </div>
  );
}