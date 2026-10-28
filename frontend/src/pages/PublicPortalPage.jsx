import { useEffect, useMemo, useState } from "react";
import {
  PublicDataNotice,
  PublicGreenButton,
  PublicNavyButton,
  PublicPrimaryButton,
} from "../components/PublicPortalChrome";
import { getClimateIntelligence, getPublicPortalSummary } from "../services/api";
import { isMilestoneOneDemo } from "../config/demoMode";

// Composite Climate Intelligence — same fixed thresholds as the Atlas's
// composite layer (rainfall anomaly < -10%, SPI <= -1, NDVI < 0.35,
// LST > 36°C). Duplicated here (not imported) because the Atlas's version is
// page-local, not a shared module, and this hotfix only touches this file.
// Missing indicators are excluded from eligible/triggered — never zeroed.
const HOME_COMPOSITE_ELIGIBLE_KEYS = ["rainfall_anomaly", "spi", "ndvi", "lst"];
const HOME_COMPOSITE_YEAR = 2025;

function isHomeCompositeTriggered(key, value) {
  if (key === "rainfall_anomaly") return value < -10;
  if (key === "spi") return value <= -1;
  if (key === "ndvi") return value < 0.35;
  if (key === "lst") return value > 36;
  return false;
}

function classifyHomeComposite(indicators) {
  let eligible = 0;
  let triggered = 0;
  for (const key of HOME_COMPOSITE_ELIGIBLE_KEYS) {
    const raw = indicators?.[key]?.value;
    const num = Number(raw);
    if (raw === null || raw === undefined || !Number.isFinite(num)) continue;
    eligible += 1;
    if (isHomeCompositeTriggered(key, num)) triggered += 1;
  }
  if (eligible === 0) return "insufficient_data";
  if (triggered === 0) return "low";
  const ratio = triggered / eligible;
  if (ratio <= 0.33) return "monitor";
  if (ratio <= 0.66) return "elevated";
  return "urgent";
}

const partnerLogos = [
  {
    name: "MacArthur Foundation",
    shortName: "MacArthur",
    src: "/logos/MacArth.png",
  },
  {
    name: "Centre for Policy Research & Development Solutions",
    shortName: "CPRDS",
    src: "/logos/CPRDS.png",
  },
];

const publicNewsItems = [
  {
    category: "Implementation",
    date: "May 2026",
    title: "Priority climate project tracking begins across selected LGAs",
    summary:
      "The portal will support public visibility of climate action projects, expected beneficiaries and implementation progress across Kaduna State.",
    href: "/public/projects",
  },
  {
    category: "Policy",
    date: "May 2026",
    title: "Climate evidence portal supports coordinated decision-making",
    summary:
      "The public portal improves access to approved Climate Impact summaries, GHG information and published evidence documents.",
    href: "/public/reports",
  },
  {
    category: "Reporting",
    date: "May 2026",
    title: "Public reports centre prepared for approved climate documents",
    summary:
      "Validated reports, briefs and evidence documents can be published through the reports portal once approved for public access.",
    href: "/public/reports",
  },
];

const priorityCards = [
  {
    key: "risk",
    index: "01",
    kicker: "Risk & resilience",
    title: "Prioritise climate resilience.",
    description:
      "Explore Kaduna's climate risk profiles and vegetation monitoring across 23 LGAs to compare adaptation needs.",
    linkLabel: "Explore Climate Impact",
    href: "/public/climate-risk",
    tone: "risk",
  },
  {
    key: "emissions",
    index: "02",
    kicker: "Emissions",
    title: "Make emissions visible.",
    description:
      "Review public greenhouse gas inventory summaries and sector-level emissions insights where approved data is available.",
    linkLabel: "View GHG Inventory",
    href: "/public/ghg-inventory",
    tone: "emissions",
  },
  {
    key: "accountability",
    index: "03",
    kicker: "Public accountability",
    title: "Show what is changing.",
    description:
      "Follow climate action projects, expected beneficiaries and implementation progress across Kaduna State.",
    linkLabel: "View Projects",
    href: "/public/projects",
    tone: "accountability",
  },
];

function formatNumber(value, maximumFractionDigits = 2) {
  return Number(value || 0).toLocaleString(undefined, {
    maximumFractionDigits,
  });
}

function formatCompactNumber(value) {
  const number = Number(value || 0);

  if (number >= 1_000_000) {
    return `${formatNumber(number / 1_000_000, 2)}M`;
  }

  if (number >= 1_000) {
    return `${formatNumber(number / 1_000, 1)}K`;
  }

  return formatNumber(number, 0);
}

function navigateTo(href) {
  window.location.href = href;
}

function HomeTopNav() {
  const fullNavItems = [
    { label: "Home", href: "/public", active: true },
    { label: "Climate Impact", href: "/public/climate-risk" },
    { label: "GHG Inventory", href: "/public/ghg-inventory" },
    { label: "Projects", href: "/public/projects" },
    { label: "Reports", href: "/public/reports" },
  ];
  // Milestone 1 demo hides GHG/Projects/Reports from nav only — routes and
  // components stay intact, see frontend/src/config/demoMode.js.
  const navItems = isMilestoneOneDemo
    ? fullNavItems.filter((item) => item.label === "Home" || item.label === "Climate Impact")
    : fullNavItems;

  return (
    <header className="border-b border-white/10 bg-[#030454] px-4 py-5 text-white sm:px-8 lg:px-10">
      <div className="mx-auto flex max-w-[1536px] flex-col gap-5 md:flex-row md:items-center md:justify-between">
        <button
          type="button"
          onClick={() => navigateTo("/public")}
          className="flex items-center gap-3 text-left"
        >
          <img
            src="/logos/KCCC.png"
            alt="Kaduna Climate Command Centre"
            className="h-12 w-12 object-contain"
          />

          <span>
            <span className="block text-sm font-black uppercase tracking-[0.08em]">
              Kaduna Climate Command Centre
            </span>
            <span className="block text-xs text-white/65">
              Climate Impact, Evidence and Reporting Portal
            </span>
          </span>
        </button>

        <nav className="flex flex-wrap gap-2">
          {navItems.map((item) => (
            <button
              key={item.label}
              type="button"
              onClick={() => navigateTo(item.href)}
              className={`rounded-md border px-4 py-2.5 text-xs font-black uppercase tracking-[0.12em] transition ${
                item.active
                  ? "border-[#F3F74B] bg-[#F3F74B] text-[#030454]"
                  : "border-white/15 bg-white/5 text-white hover:bg-white/10"
              }`}
            >
              {item.label}
            </button>
          ))}

          <PublicGreenButton
            onClick={() => navigateTo("/login")}
            className="px-4 py-2.5 text-xs focus-visible:ring-offset-[#030454]"
          >
            Staff Login
          </PublicGreenButton>
        </nav>
      </div>
    </header>
  );
}

function HomeHero() {
  return (
    <section className="relative overflow-hidden bg-[#030454] px-4 py-12 text-white sm:px-8 sm:py-14 lg:px-10 lg:py-16">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_78%_18%,rgba(0,155,53,0.24),transparent_28%),radial-gradient(circle_at_20%_20%,rgba(243,247,75,0.12),transparent_24%),linear-gradient(120deg,#030454_0%,#07105f_48%,#0f3f4b_100%)]" />
      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(3,4,84,0.92),rgba(3,4,84,0.72),rgba(3,4,84,0.42))]" />

      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-40 -top-64 h-[36rem] w-[36rem] rounded-full border border-[#F3F74B]/18"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-20 -top-36 h-[24rem] w-[24rem] rounded-full border border-[#F3F74B]/14"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute right-10 -top-10 h-[13rem] w-[13rem] rounded-full border border-[#F3F74B]/10"
      />

      <div className="relative mx-auto max-w-[1536px]">
        <div className="max-w-5xl">
          <p className="text-xs font-black uppercase tracking-[0.22em] text-[#F3F74B]">
            Kaduna Public Climate Evidence Portal
          </p>

          <h1 className="mt-5 max-w-5xl font-['Playfair_Display'] text-[2.65rem] font-bold leading-[0.98] tracking-[-0.05em] text-white sm:text-[3.6rem] lg:text-[4.9rem]">
            Climate intelligence for decision support
          </h1>

          <p className="mt-5 max-w-3xl text-base leading-7 text-white/78 sm:text-lg sm:leading-8">
            {isMilestoneOneDemo
             ? "KCCC brings climate and environmental evidence together for Kaduna State, integrating satellite-derived indicators, LGA-level risk context, and climate-action signals covering all 23 LGAs."
    : "KCCC brings satellite-derived climate data, Climate Impact, greenhouse gas information, climate projects, and public evidence for Kaduna State into one portal covering all 23 LGAs."}
          </p>

          <div className="mt-8 flex">
            <PublicPrimaryButton
              onClick={() => navigateTo("/public/climate-atlas")}
              showArrow
              className="px-7 py-3.5 text-sm tracking-[0.13em] focus-visible:ring-offset-[#030454]"
            >
              Climate Change Intelligence Tool
            </PublicPrimaryButton>
          </div>
        </div>
      </div>
    </section>
  );
}

function MilestoneFramingSection() {
  return (
    <section className="border-b border-[#D8DDE2] bg-[#F7F9FA] px-4 py-6 sm:px-8 lg:px-10">
      <div className="mx-auto max-w-[1536px]">
        {/*<p className="text-xs font-black uppercase tracking-[0.16em] text-[#009B35]">
          Milestone 1 — Framework &amp; Architecture Demonstration
        </p>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
          Demonstrating the application framework, frontend–backend integration and the
          first operational climate intelligence module.
        </p>*/}
      </div>
    </section>
  );
}

const architecturePreviewCards = [
  { title: "Climate Impact", status: "Operational", href: "/public/climate-risk", tone: "blue" },
  { title: "GHG Inventory", status: "In development", href: null, tone: "green" },
  { title: "Projects", status: "In development", href: null, tone: "yellow" },
  { title: "Reports", status: "In development", href: null, tone: "yellow" },
];

function ArchitecturePreviewCard({ item }) {
  const isOperational = item.status === "Operational";
  const statusToneClass = isOperational
    ? "border-[#009B35]/30 bg-[#009B35]/10 text-[#007a29]"
    : "border-[#CAD2D7] bg-[#F7F9FA] text-slate-500";

  return (
    <article
      className={`flex h-full flex-col rounded-md border border-[#D8DDE2] bg-white p-6 shadow-sm ${
        isOperational ? "" : "opacity-80"
      }`}
    >
      <h3 className="font-['Playfair_Display'] text-xl font-bold text-[#030454]">{item.title}</h3>

      <span
        className={`mt-3 inline-flex w-fit items-center rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.1em] ${statusToneClass}`}
      >
        {item.status}
      </span>

      {isOperational && item.href ? (
        <PublicNavyButton
          onClick={() => navigateTo(item.href)}
          showArrow
          className="mt-6 w-fit px-4 py-2.5"
        >
          Explore Climate Impact
        </PublicNavyButton>
      ) : (
        <p className="mt-6 text-xs leading-5 text-slate-400">Not yet part of the Milestone 1 demonstration.</p>
      )}
    </article>
  );
}

function ArchitecturePreviewSection() {
  return (
    <section className="bg-white px-4 py-14 sm:px-8 lg:px-10 lg:py-16">
      <div className="mx-auto max-w-7xl">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="font-['Playfair_Display'] text-4xl font-bold tracking-tight text-[#030454] md:text-5xl">
            Platform architecture
          </h2>
          <p className="mt-3 text-sm leading-7 text-slate-500">
            KCCC is being built as a multi-module climate evidence platform. This preview shows
            the planned modules and their current status.
          </p>
        </div>

        <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {architecturePreviewCards.map((item) => (
            <ArchitecturePreviewCard key={item.title} item={item} />
          ))}
        </div>
      </div>
    </section>
  );
}

function ErrorNotice({ message }) {
  if (!message) return null;

  return (
    <section className="bg-[#DFE3E4] px-4 py-5 sm:px-8 lg:px-10">
      <div className="mx-auto max-w-7xl rounded-md border border-red-200 bg-red-50 px-5 py-4 text-sm font-bold text-red-700">
        {message}
      </div>
    </section>
  );
}

function MovingIntelligenceSummary({ summaryData, hasError, compositeSummary }) {
  const projects = summaryData?.projects || {};

  // Never let a failed/missing API value fall through to `|| 0` — that would
  // render a fabricated "0" indistinguishable from a genuine zero count.
  // hasError (the fetch itself failed) takes priority over a merely-absent
  // field (fetch succeeded but this particular value wasn't published).
  function metricValue(rawValue, formatter) {
    if (hasError) return "Temporarily unavailable";
    if (rawValue === null || rawValue === undefined) return "Not yet published";
    return formatter(rawValue);
  }

  const summaryItems = [
    {
      label: "Estimated Year",
      value: compositeSummary?.latestYear != null
        ? String(compositeSummary.latestYear)
        : metricValue(summaryData?.climate_risk?.latest_year, (value) => String(value)),
      description: "Latest Composite Climate Impact assessment",
    },
    {
      label: "Expected Project Beneficiaries",
      value: metricValue(projects.total_expected_beneficiaries, (value) => formatCompactNumber(value)),
      description: "Planned beneficiaries reported for public projects",
    },
    {
      label: "Estimated GHG Reductions",
      value: metricValue(
        projects.total_expected_ghg_reduction_tco2e,
        (value) => `${formatCompactNumber(value)} tCO₂e`
      ),
      description: "Expected reductions from public project records",
    },
  ];

  const toneClasses = [
    "border-[#d9dcff] bg-[#eef0ff] text-[#28266f]",
    "border-[#c9eed8] bg-[#e8f8ef] text-[#075f37]",
    "border-[#ffd6dc] bg-[#fff0f1] text-[#982b43]",
  ];

  return (
    <section
      aria-label="Climate portal metrics"
      className="border-y border-[#D8DDE2] bg-[#F4F6FB] px-4 py-6 sm:px-8 lg:px-10"
    >
      <div className="mx-auto max-w-[1536px]">
        <div className="grid gap-4 sm:grid-cols-3">
          {summaryItems.map((item, index) => {
            const toneClass = toneClasses[index % toneClasses.length];
            const cardClassName =
              "group relative flex h-full flex-col overflow-hidden rounded-xl border p-5 transition duration-300 motion-safe:hover:-translate-y-1 hover:shadow-[0_14px_28px_rgba(8,12,65,0.12)] " +
              toneClass;

            return (
              <div key={item.label} className={cardClassName}>
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full bg-current opacity-[0.06] transition-transform duration-500 motion-safe:group-hover:scale-125"
                />

                <p className="relative z-[1] flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.14em] opacity-80">
                  <span className="h-2 w-2 shrink-0 rounded-full bg-current" aria-hidden="true" />
                  {item.label}
                </p>

                <strong className="relative z-[1] mt-2 block text-[1.9rem] font-black leading-tight tracking-tight sm:text-[2.1rem]">
                  {item.value}
                </strong>

                <p className="relative z-[1] mt-1 text-xs leading-5 opacity-80">
                  {item.description}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function PriorityCard({ item }) {
  const toneClasses = {
    risk: "bg-[#F3F74B] text-[#030454]",
    emissions: "bg-[#030454] text-white",
    accountability: "bg-[#DCEAFF] text-[#030454]",
  };
  const shadowClasses = {
    risk: "hover:shadow-[0_24px_52px_rgba(213,233,0,0.35)]",
    emissions: "hover:shadow-[0_24px_52px_rgba(3,4,84,0.35)]",
    accountability: "hover:shadow-[0_24px_52px_rgba(71,120,197,0.28)]",
  };

  return (
    <article
      className={`group relative isolate flex min-h-[380px] flex-col overflow-hidden rounded-[28px] p-8 transition duration-300 motion-safe:hover:-translate-y-2 focus-within:outline focus-within:outline-[3px] focus-within:outline-offset-4 focus-within:outline-[#009B35] ${toneClasses[item.tone]} ${shadowClasses[item.tone]}`}
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute right-[10%] top-[16%] aspect-square w-40 rounded-full border border-current opacity-30 transition-transform duration-500 motion-safe:group-hover:scale-125 motion-safe:group-hover:rotate-[18deg]"
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute right-[10%] top-[16%] aspect-square w-28 rounded-full border border-current opacity-20"
      />

      <p className="relative z-[1] text-[11px] font-black uppercase tracking-[0.14em] opacity-80">
        {item.index} / {item.kicker}
      </p>

      <div className="relative z-[1] mt-auto max-w-[27rem] pt-40">
        <h3 className="font-['Playfair_Display'] text-[1.7rem] font-bold leading-[1.1] tracking-tight sm:text-3xl">
          {item.title}
        </h3>
        <p className="mt-4 text-sm leading-7 opacity-90">{item.description}</p>
        <button
          type="button"
          onClick={() => navigateTo(item.href)}
          className="mt-7 inline-flex items-center gap-3 border-b-2 border-current pb-1 text-xs font-black uppercase tracking-[0.1em] transition-[gap] duration-200 group-hover:gap-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current"
        >
          {item.linkLabel}
          <span
            aria-hidden="true"
            className="inline-block transition-transform duration-200 motion-safe:group-hover:translate-x-1 motion-safe:group-hover:-translate-y-0.5"
          >
            ↗
          </span>
        </button>
      </div>

      <span
        aria-hidden="true"
        className="pointer-events-none absolute bottom-3 right-6 select-none text-[70px] font-black leading-none tracking-tighter opacity-10"
      >
        {item.index}
      </span>
    </article>
  );
}

function ClimateActionPrioritySection() {
  return (
    <section className="bg-white px-4 py-16 sm:px-8 lg:px-10 lg:py-20">
      <div className="mx-auto max-w-7xl">
        <div className="mb-10 flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-[#009B35]">
              From plans to progress
            </p>
            <h2 className="mt-3 font-['Playfair_Display'] text-4xl font-bold tracking-tight text-[#030454] md:text-5xl">
              Climate action, tracked with purpose.
            </h2>
            <p className="mt-3 max-w-xl text-sm leading-7 text-slate-500">
              A clearer view of climate risk, emissions priorities and on-the-ground project implementation.
            </p>
          </div>

          <PublicGreenButton
            onClick={() => navigateTo("/public/projects")}
            showArrow
            className="w-fit px-5 py-3"
          >
            Explore project portfolio
          </PublicGreenButton>
        </div>

        <div className="grid gap-5 lg:grid-cols-3">
          {priorityCards.map((item) => (
            <PriorityCard key={item.key} item={item} />
          ))}
        </div>
      </div>
    </section>
  );
}

function NewsCard({ item }) {
  return (
    <article className="group flex h-full flex-col rounded-md border border-[#D8DDE2] bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:border-[#009B35]/70 hover:shadow-md">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="rounded-sm bg-[#009B35]/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-[#009B35]">
          {item.category}
        </span>

        <span className="text-xs font-bold uppercase tracking-[0.1em] text-slate-400">
          {item.date}
        </span>
      </div>

      <h3 className="text-xl font-black leading-snug text-[#030454]">
        {item.title}
      </h3>

      <p className="mt-3 flex-1 text-sm leading-7 text-slate-600">
        {item.summary}
      </p>

      <button
        type="button"
        onClick={() => navigateTo(item.href)}
        className="mt-6 flex items-center justify-between border-t border-[#E6EAEC] pt-4 text-xs font-black uppercase tracking-[0.08em] text-[#009B35] transition-colors duration-200 hover:text-[#00722A] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#009B35] focus-visible:ring-offset-2"
      >
        View Update{" "}
        <span aria-hidden="true" className="transition-transform duration-200 group-hover:translate-x-1">
          →
        </span>
      </button>
    </article>
  );
}

function NewsPolicySection() {
  return (
    <section id="updates" className="bg-[#F7F9FA] px-4 py-12 sm:px-8 lg:px-10 lg:py-16">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <h2 className="font-['Playfair_Display'] text-4xl font-bold tracking-tight text-[#030454] md:text-5xl">
            News and policy updates
          </h2>

          <button
            type="button"
            onClick={() => navigateTo("/public/reports")}
            className="w-fit rounded-md border border-[#009B35] px-5 py-3 text-xs font-black uppercase tracking-[0.1em] text-[#009B35] transition hover:bg-[#009B35] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#009B35] focus-visible:ring-offset-2"
          >
            View Reports
          </button>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          {publicNewsItems.map((item) => (
            <NewsCard key={item.title} item={item} />
          ))}
        </div>
      </div>
    </section>
  );
}

function PartnerLogoCard({ partner, duplicate = false }) {
  return (
    <article
      aria-hidden={duplicate}
      title={partner.name}
      className="flex h-[180px] w-[360px] min-w-[360px] items-center justify-center rounded-md border border-[#D8DDE2] bg-white p-10 shadow-[0_14px_35px_rgba(3,4,84,0.08)] transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_20px_45px_rgba(3,4,84,0.12)] max-sm:h-[160px] max-sm:w-[280px] max-sm:min-w-[280px] max-sm:p-6"
    >
      {partner.src ? (
        <img
          src={partner.src}
          alt={partner.name}
          className="max-h-[110px] max-w-[260px] object-contain max-sm:max-h-[95px] max-sm:max-w-[210px]"
          onError={(event) => {
            event.currentTarget.style.display = "none";

            const fallback =
              event.currentTarget.parentElement?.querySelector(
                "[data-logo-fallback]"
              );

            if (fallback) {
              fallback.style.display = "block";
            }
          }}
        />
      ) : null}

      <span
        data-logo-fallback
        className="hidden text-center text-3xl font-black uppercase tracking-[0.08em] text-[#030454]"
      >
        {partner.shortName}
      </span>
    </article>
  );
}

function PartnersSection() {
  const scrollingPartners = [...partnerLogos, ...partnerLogos];

  return (
    <section className="overflow-hidden border-y border-[#D8DDE2] bg-white px-4 py-14 sm:px-8 lg:px-10 lg:py-16">
      <style>
        {`
          @keyframes partners-marquee {
            0% {
              transform: translateX(0);
            }

            100% {
              transform: translateX(-50%);
            }
          }

          .partners-marquee-track {
            width: max-content;
            animation: partners-marquee 75s linear infinite;
            will-change: transform;
          }

          .partners-marquee-track:hover {
            animation-play-state: paused;
          }

          @media (max-width: 640px) {
            .partners-marquee-track {
              animation-duration: 90s;
            }
          }

          @media (prefers-reduced-motion: reduce) {
            .partners-marquee-track {
              animation: none;
              flex-wrap: wrap;
              width: 100%;
              justify-content: center;
            }
          }
        `}
      </style>

      <div className="mx-auto max-w-7xl">
        <div className="mb-10 text-center">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[#009B35]">
            Institutional collaboration
          </p>

          <h2 className="mt-3 text-4xl font-black uppercase tracking-tight text-[#030454] sm:text-5xl">
            Our Partners
          </h2>

          <div className="mx-auto mt-5 h-[3px] w-28 bg-[#009B35]" />
        </div>

        <div className="overflow-hidden">
          <div className="partners-marquee-track flex gap-8">
            {scrollingPartners.map((partner, index) => (
              <PartnerLogoCard
                key={`${partner.name}-${index}`}
                partner={partner}
                duplicate={index >= partnerLogos.length}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

const footerClimateIntelligenceLinks = [
  { key: "climate-intelligence", label: "Climate Impact", href: "/public/climate-intelligence" },
  { key: "climate-atlas", label: "Climate Change Intelligence Tool", href: "/public/climate-atlas" },
];

const footerClimateActionLinks = [
  { key: "ghg", label: "GHG Inventory", href: "/public/ghg-inventory" },
  { key: "projects", label: "Projects", href: "/public/projects" },
  { key: "reports", label: "Reports", href: "/public/reports" },
];

const milestoneOneHiddenFooterLinkKeys = new Set(["ghg", "projects", "reports"]);

const visibleFooterClimateActionLinks = isMilestoneOneDemo
  ? footerClimateActionLinks.filter((item) => !milestoneOneHiddenFooterLinkKeys.has(item.key))
  : footerClimateActionLinks;

function HomepageFooterLinkColumn({ title, items }) {
  if (!items.length) {
    return null;
  }

  return (
    <div>
      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-white/35">
        {title}
      </p>
      <ul className="mt-1.5 space-y-1">
        {items.map((item) => (
          <li key={item.key}>
            <button
              type="button"
              onClick={() => navigateTo(item.href)}
              className="text-left text-xs text-white/65 transition-colors duration-200 hover:text-[#F3F74B] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F3F74B] focus-visible:ring-offset-2 focus-visible:ring-offset-[#030454]"
            >
              {item.label}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function HomepagePublicFooter() {
  return (
    <footer className="relative overflow-hidden bg-[#030454] font-['DM_Sans'] text-white">
      <div
        aria-hidden="true"
        className="h-1 w-full bg-gradient-to-r from-[#F3F74B] via-[#009B35] to-[#7db8ff]"
      />

      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-32 -top-32 h-96 w-96 rounded-full border border-white/10"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-14 -top-14 h-56 w-56 rounded-full border border-white/8"
      />

      <div className="relative mx-auto max-w-[1536px] px-4 py-2.5 sm:px-8 lg:px-10">
        <div className="flex flex-col gap-2 border-b border-white/10 pb-2 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-xl">
            <h2 className="font-['Playfair_Display'] text-base font-bold leading-[1.1] tracking-tight sm:text-lg">
              Better evidence. <span className="text-[#A7E5BD]">Stronger climate action.</span>
            </h2>

            <button
              type="button"
              onClick={() => navigateTo("/public")}
              className="mt-1 flex items-center gap-1.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F3F74B] focus-visible:ring-offset-2 focus-visible:ring-offset-[#030454]"
            >
              <img
                src="/logos/KCCC.png"
                alt="Kaduna Climate Command Centre"
                className="h-5 w-5 shrink-0 object-contain"
              />
              <span className="text-xs font-black uppercase tracking-[0.08em] text-white">
                Kaduna Climate Command Centre
              </span>
            </button>
          </div>

          <button
            type="button"
            onClick={() =>
              document.getElementById("resources")?.scrollIntoView({ behavior: "smooth", block: "start" })
            }
            className="group inline-flex w-fit items-center gap-2 rounded-md bg-[#F3F74B] px-3 py-1.5 text-xs font-black uppercase tracking-[0.08em] text-[#030454] transition duration-200 motion-safe:hover:-translate-y-0.5 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#030454]"
          >
            View all public resources
            <span
              aria-hidden="true"
              className="transition-transform duration-200 motion-safe:group-hover:translate-x-1"
            >
              →
            </span>
          </button>
        </div>

        <div className="grid grid-cols-1 gap-2 py-2 sm:grid-cols-3">
          <HomepageFooterLinkColumn title="Climate Impact" items={footerClimateIntelligenceLinks} />
          <HomepageFooterLinkColumn title="Climate Action" items={visibleFooterClimateActionLinks} />

          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-white/35">
              Access
            </p>
            <button
              type="button"
              onClick={() => navigateTo("/")}
              className="mt-1 inline-flex items-center gap-2 rounded-md border border-white/20 bg-white/5 px-2.5 py-1 text-xs font-black uppercase tracking-[0.08em] text-white transition duration-200 hover:border-[#009B35] hover:bg-[#009B35] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F3F74B] focus-visible:ring-offset-2 focus-visible:ring-offset-[#030454]"
            >
              Staff Login
            </button>
          </div>
        </div>

        <div className="border-t border-white/10 pt-1.5">
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-white/35">
            Institutional collaboration
          </p>
          <p className="mt-0.5 max-w-3xl text-xs leading-4 text-white/55">
            In collaboration with Kaduna State Government, MacArthur Foundation,
            and Centre for Policy Research &amp; Development Solutions.
          </p>
        </div>

        <div className="mt-1.5 border-t border-white/10 pt-1.5">
          <p className="text-[10px] uppercase tracking-[0.14em] text-white/45">
            © 2026 Kaduna State Climate Command Centre. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}

export default function PublicPortalPage() {
  const [summaryData, setSummaryData] = useState(null);
  const [isLoading, setIsLoading] = useState(!isMilestoneOneDemo);
  const [error, setError] = useState("");
  const [compositeSummary, setCompositeSummary] = useState(null);
  const [, setCompositeError] = useState(false);

  // Statewide Composite Climate Intelligence — same already-public
  // /remote-sensing/climate-intelligence/ endpoint the Atlas uses, consumed
  // independently of the (currently all-unpublished) ClimateRiskProfile
  // summary so the homepage shows real indicator-derived counts instead of
  // "Not yet published" / 0 while risk profiles await review.
  useEffect(() => {
    if (isMilestoneOneDemo) return undefined;

    let isMounted = true;

    getClimateIntelligence({ year: HOME_COMPOSITE_YEAR, season: "annual" })
      .then((data) => {
        if (!isMounted) return;
        const results = data.results || [];
        const counts = { low: 0, monitor: 0, elevated: 0, urgent: 0, insufficient: 0 };
        for (const item of results) {
          const classification = classifyHomeComposite(item.indicators || null);
          counts[classification === "insufficient_data" ? "insufficient" : classification] += 1;
        }
        setCompositeSummary({
          latestYear: results.length > 0 ? HOME_COMPOSITE_YEAR : null,
          lowCount: counts.low,
          monitorCount: counts.monitor,
          elevatedCount: counts.elevated,
          urgentCount: counts.urgent,
          insufficientCount: counts.insufficient,
          assessedLGAs: counts.low + counts.monitor + counts.elevated + counts.urgent,
          highRiskLGAs: counts.elevated + counts.urgent,
        });
      })
      .catch((reason) => {
        if (!isMounted) return;
        console.error(reason);
        setCompositeError(true);
        setCompositeSummary(null);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (isMilestoneOneDemo) {
      return;
    }

    let isMounted = true;

    getPublicPortalSummary()
      .then((result) => {
        if (!isMounted) return;

        setSummaryData(result.summary || {});
      })
      .catch((reason) => {
        if (!isMounted) return;

        console.error(reason);
        setError("Could not load public portal summary.");
        setSummaryData(null);
      })
      .finally(() => {
        if (!isMounted) return;

        setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const safeSummaryData = useMemo(() => summaryData || {}, [summaryData]);

  return (
    <main className="min-h-screen bg-[#DFE3E4] font-['DM_Sans'] text-[#030454]">
      <HomeTopNav />
      <HomeHero />
      {isMilestoneOneDemo && <MilestoneFramingSection />}
      <ErrorNotice message={error} />

      {isLoading ? (
        <section className="px-4 py-14 sm:px-8 lg:px-10">
          <div className="mx-auto max-w-7xl rounded-md border border-[#CAD2D7] bg-white p-8 text-sm text-slate-500 shadow-sm">
            Loading public climate intelligence...
          </div>
        </section>
      ) : isMilestoneOneDemo ? (
        <>
          <ArchitecturePreviewSection />
          <PartnersSection />
          <PublicDataNotice />
        </>
      ) : (
        <>
          <MovingIntelligenceSummary
            summaryData={safeSummaryData}
            hasError={Boolean(error)}
            compositeSummary={compositeSummary}
          />
          <ClimateActionPrioritySection />
          <NewsPolicySection />
          <PartnersSection />
          <PublicDataNotice />
        </>
      )}

      <HomepagePublicFooter />
    </main>
  );
}

