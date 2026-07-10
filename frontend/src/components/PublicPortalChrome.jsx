import OfficialLogo from "./OfficialLogo";

const publicNavItems = [
  { key: "home", label: "Home", href: "/public" },
  { key: "climate-intelligence", label: "Climate Intelligence", href: "/public/climate-risk" },
  { key: "ghg", label: "GHG Inventory", href: "/public/ghg-inventory" },
  { key: "projects", label: "Projects", href: "/public/projects" },
  { key: "reports", label: "Reports", href: "/public/reports" },
];

function PublicNavButton({ label, active, onClick }) {
  const activeClass = "bg-[#F3F74B] text-[#030454]";
  const ghostClass =
    "border border-white/15 text-white/75 hover:border-[#F3F74B]/70 hover:text-white";

  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md px-4 py-2 text-xs font-bold uppercase tracking-[0.12em] transition ${
        active ? activeClass : ghostClass
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
  tag = "",
  stats = [],
  showStats = false,
  compact = false,
  showActions = true,
  primaryActionLabel = "Explore Climate Intelligence",
  secondaryActionLabel = "View Reports",
  onPrimaryAction,
  onSecondaryAction,
}) {
  return (
    <header className="relative overflow-hidden bg-[#030454] font-['DM_Sans'] text-white">
      <div className="absolute inset-0">
        <div className="absolute inset-0 bg-[linear-gradient(135deg,#030454_0%,#030454_58%,#009B35_160%)]" />
        <div className="absolute inset-0 opacity-20 bg-[radial-gradient(circle_at_20%_20%,#009B35_0,transparent_30%),radial-gradient(circle_at_85%_20%,#F3F74B_0,transparent_24%)]" />
      </div>

      <nav className="relative z-10 flex min-h-16 flex-col justify-between gap-4 border-b border-white/10 px-4 py-4 sm:px-8 lg:flex-row lg:items-center lg:px-10">
        <button
          type="button"
          onClick={() => {
            window.location.href = "/public";
          }}
          className="flex w-fit items-center"
          aria-label="Go to public home"
        >
          <OfficialLogo
            variant="light"
            className="max-w-[260px] sm:max-w-[360px] lg:max-w-[430px]"
          />
        </button>

        <div className="flex flex-wrap gap-3">
          {publicNavItems.map((item) => (
            <PublicNavButton
              key={item.key}
              label={item.label}
              active={activePage === item.key}
              onClick={() => {
                window.location.href = item.href;
              }}
            />
          ))}

          <button
            type="button"
            onClick={() => {
              window.location.href = "/";
            }}
            className="rounded-md bg-[#009B35] px-4 py-2 text-xs font-bold uppercase tracking-[0.12em] text-white transition hover:bg-[#00842e]"
          >
            Staff Login
          </button>
        </div>
      </nav>

      <section
        className={`relative z-10 flex items-center px-4 sm:px-8 lg:px-10 ${
          compact ? "min-h-[300px] py-12" : "min-h-[500px] py-16"
        }`}
      >
        <div className="max-w-4xl">
          {tag && (
            <p className="mb-5 text-xs font-black uppercase tracking-[0.18em] text-[#F3F74B]">
              {tag}
            </p>
          )}

          <h1 className="font-['Playfair_Display'] text-5xl font-black leading-tight tracking-tight text-white sm:text-6xl lg:text-7xl">
            {title}
          </h1>

          {description && (
            <p className="mt-6 max-w-3xl text-base font-light leading-8 text-white/75 sm:text-lg">
              {description}
            </p>
          )}

          {showActions && (
            <div className="mt-8 flex flex-wrap gap-4">
              <button
                type="button"
                onClick={() => {
                  if (typeof onPrimaryAction === "function") {
                    onPrimaryAction();
                  }
                }}
                className="rounded-md bg-[#F3F74B] px-7 py-4 text-sm font-black uppercase tracking-[0.08em] text-[#030454] transition hover:bg-[#eef23c]"
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
                className="rounded-md border border-white/35 px-7 py-4 text-sm font-black uppercase tracking-[0.08em] text-white/85 transition hover:border-[#F3F74B] hover:text-white"
              >
                {secondaryActionLabel}
              </button>
            </div>
          )}
        </div>
      </section>

      {showStats && stats.length > 0 && (
        <section className="relative z-10 grid border-t border-white/10 bg-[#030454]/85 backdrop-blur md:grid-cols-4">
          {stats.map((stat) => (
            <div
              key={stat.label}
              className="border-b border-white/10 px-6 py-5 md:border-b-0 md:border-r last:md:border-r-0"
            >
              <p className="font-['Playfair_Display'] text-4xl font-bold text-white">
                {stat.value}
              </p>

              <p className="mt-1 text-[11px] font-bold uppercase tracking-[0.14em] text-white/45">
                {stat.label}
              </p>
            </div>
          ))}
        </section>
      )}
    </header>
  );
}

export function PublicSectionIntro({ eyebrow, title, description, centered }) {
  return (
    <div className={centered ? "mx-auto max-w-3xl text-center" : ""}>
      {eyebrow && (
        <p className="mb-3 text-[11px] font-black uppercase tracking-[0.18em] text-[#009B35]">
          {eyebrow}
        </p>
      )}

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
    <footer className="bg-[#030454] px-4 py-8 font-['DM_Sans'] text-xs text-white/45 sm:px-10">
      <div className="mx-auto flex max-w-[1536px] flex-col justify-between gap-6 md:flex-row md:items-start">
        <div>

          <p className="mt-4 font-bold text-white/70">
            Powered by Quintessence
          </p>
        </div>

        <div className="flex flex-wrap gap-6">
          {publicNavItems.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => {
                window.location.href = item.href;
              }}
              className="hover:text-white"
            >
              {item.label}
            </button>
          ))}

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

      <div className="mx-auto mt-8 max-w-[1536px] border-t border-white/10 pt-5">
        <p className="uppercase tracking-[0.12em]">
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
    <div className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-500">
      <p className="font-bold text-[#030454]">{title}</p>
      <p className="mt-2 leading-6">{message}</p>
    </div>
  );
}