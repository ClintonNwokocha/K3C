import { useEffect, useMemo, useState } from "react";
import {
  PublicDataNotice,
  PublicPortalFooter,
  PublicGreenButton,
  PublicNavyButton,
  PublicPrimaryButton,
} from "../components/PublicPortalChrome";
import { getPublicPortalSummary } from "../services/api";
import { isMilestoneOneDemo } from "../config/demoMode";

const partnerLogos = [
  {
    name: "MacArthur Foundation",
    shortName: "MacArthur",
    src: "/logos/MacArth.png",
  },
  {
    name: "Kaduna State Government",
    shortName: "KDSG",
    src: "/logos/KCCC.png",
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
      "The public portal improves access to approved Climate Intelligence summaries, GHG information and published evidence documents.",
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

const gatewayCards = [
  {
    title: "Climate Intelligence",
    description:
      "Explore Kaduna's vegetation monitoring, climate risk profiles, and data availability across 23 LGAs.",
    buttonLabel: "Explore Climate Intelligence",
    href: "/public/climate-risk",
    tone: "blue",
  },
  {
    title: "GHG Inventory",
    description:
      "View public greenhouse gas inventory summaries and sector-level emissions insights where approved data is available.",
    buttonLabel: "View GHG Inventory",
    href: "/public/ghg-inventory",
    tone: "green",
  },
  {
    title: "Climate Action Portfolio",
    description:
      "Explore climate action projects, expected beneficiaries and estimated greenhouse gas reduction outcomes.",
    buttonLabel: "View Projects",
    href: "/public/projects",
    tone: "yellow",
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
    { label: "Climate Intelligence", href: "/public/climate-risk" },
    { label: "GHG Inventory", href: "/public/ghg-inventory" },
    { label: "Projects", href: "/public/projects" },
    { label: "Reports", href: "/public/reports" },
  ];
  // Milestone 1 demo hides GHG/Projects/Reports from nav only — routes and
  // components stay intact, see frontend/src/config/demoMode.js.
  const navItems = isMilestoneOneDemo
    ? fullNavItems.filter((item) => item.label === "Home" || item.label === "Climate Intelligence")
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
              Climate Intelligence, Evidence and Reporting Portal
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
    : "KCCC brings satellite-derived climate data, Climate Intelligence, greenhouse gas information, climate projects, and public evidence for Kaduna State into one portal covering all 23 LGAs."}
          </p>

          <div className="mt-8 flex">
            <PublicPrimaryButton
              onClick={() => navigateTo("/public/climate-atlas")}
              showArrow
              className="px-7 py-3.5 text-sm tracking-[0.13em] focus-visible:ring-offset-[#030454]"
            >
              Climate Change Intelligence System
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
  { title: "Climate Intelligence", status: "Operational", href: "/public/climate-risk", tone: "blue" },
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
          Explore Climate Intelligence
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

function MovingIntelligenceSummary({ summaryData }) {
  const climateRisk = summaryData?.climate_risk || {};
  const projects = summaryData?.projects || {};
  const reports = summaryData?.reports || {};

  const summaryItems = [
    {
      label: "Latest Assessment Year",
      value: climateRisk.latest_year || "Latest approved",
      description: "Latest approved Climate Intelligence assessment",
    },
    {
      label: "Assessed LGAs",
      value: formatNumber(climateRisk.total_lgas || 0, 0),
      description: "Kaduna LGAs with published assessment records",
    },
    {
      label: "High / Very High Risk LGAs",
      value: formatNumber(climateRisk.high_or_very_high_lgas || 0, 0),
      description: "LGAs requiring closer adaptation attention",
    },
    {
      label: "Public Climate Projects",
      value: formatNumber(projects.total_projects || 0, 0),
      description: "Approved projects visible on the public portal",
    },
    {
      label: "Expected Project Beneficiaries",
      value: formatCompactNumber(projects.total_expected_beneficiaries),
      description: "Planned beneficiaries reported for public projects",
    },
    {
      label: "Estimated GHG Reduction",
      value: `${formatCompactNumber(
        projects.total_expected_ghg_reduction_tco2e
      )} tCO₂e`,
      description: "Expected reductions from public project records",
    },
    {
      label: "Public Evidence Reports",
      value: formatNumber(reports.total_public_reports || 0, 0),
      description: "Approved reports and evidence documents",
    },
    {
      label: "Satellite Vegetation Coverage",
      value: "Annual · Wet · Dry seasons",
      description: "Sentinel-2 NDVI summaries for Kaduna LGAs",
    },
  ];

  const movingItems = [...summaryItems, ...summaryItems];

  return (
    <section className="overflow-hidden border-y border-[#D8DDE2] bg-white">
      <style>
        {`
          @keyframes kccc-large-summary-marquee {
            0% {
              transform: translateX(0);
            }

            100% {
              transform: translateX(-50%);
            }
          }

          .kccc-large-summary-track {
            width: max-content;
            animation: kccc-large-summary-marquee 60s linear infinite;
            will-change: transform;
          }

          .kccc-large-summary-track:hover {
            animation-play-state: paused;
          }

          @media (prefers-reduced-motion: reduce) {
            .kccc-large-summary-track {
              animation: none;
              flex-wrap: wrap;
              width: 100%;
            }
          }
        `}
      </style>

      <div className="kccc-large-summary-track flex">
        {movingItems.map((item, index) => (
          <div
            key={`${item.label}-${item.value}-${index}`}
            className="flex min-w-[330px] items-start gap-4 border-r border-[#E6EAEC] px-7 py-5"
          >
            <span className="mt-1.5 h-3.5 w-3.5 shrink-0 rounded-full bg-[#009B35]" />

            <span>
              <span className="block text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">
                {item.label}
              </span>

              <strong className="mt-1 block text-xl font-black tracking-tight text-[#030454]">
                {item.value}
              </strong>

              <span className="mt-1 block max-w-[260px] text-xs leading-5 text-slate-500">
                {item.description}
              </span>
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

function GatewayCard({ item }) {
  const toneClasses = {
    blue: "hover:border-[#030454]",
    green: "hover:border-[#009B35]",
    yellow: "hover:border-[#F3F74B]",
  };

  return (
    <article
      className={`group flex h-full flex-col overflow-hidden rounded-md border border-[#D8DDE2] bg-white p-8 shadow-sm transition hover:-translate-y-1 hover:shadow-[0_18px_45px_rgba(3,4,84,0.12)] ${
        toneClasses[item.tone] || toneClasses.blue
      }`}
    >
      <div className="mb-5 h-1.5 w-20 rounded-full bg-[#009B35]" />

      <h3 className="font-['Playfair_Display'] text-3xl font-bold leading-tight text-[#030454]">
        {item.title}
      </h3>

      <p className="mt-4 flex-1 text-sm leading-7 text-slate-600">
        {item.description}
      </p>

      <PublicNavyButton
        onClick={() => navigateTo(item.href)}
        showArrow
        className="mt-8 w-fit"
      >
        {item.buttonLabel}
      </PublicNavyButton>
    </article>
  );
}

function ExploreSection() {
  return (
    <section className="bg-white px-4 py-14 sm:px-8 lg:px-10 lg:py-20">
      <div className="mx-auto max-w-7xl">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="font-['Playfair_Display'] text-4xl font-bold tracking-tight text-[#030454] md:text-5xl">
            Explore public climate information
          </h2>
        </div>

        <div className="mt-10 grid gap-6 lg:grid-cols-3">
          {gatewayCards.map((item) => (
            <GatewayCard key={item.title} item={item} />
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
        className="mt-6 flex items-center justify-between border-t border-[#E6EAEC] pt-4 text-xs font-black uppercase tracking-[0.08em] text-[#009B35]"
      >
        View Update <span>→</span>
      </button>
    </article>
  );
}

function NewsPolicySection() {
  return (
    <section className="bg-[#F7F9FA] px-4 py-12 sm:px-8 lg:px-10 lg:py-16">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <h2 className="font-['Playfair_Display'] text-4xl font-bold tracking-tight text-[#030454] md:text-5xl">
            News and policy updates
          </h2>

          <button
            type="button"
            onClick={() => navigateTo("/public/reports")}
            className="w-fit rounded-md border border-[#009B35] px-5 py-3 text-xs font-black uppercase tracking-[0.1em] text-[#009B35] transition hover:bg-[#009B35] hover:text-white"
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

function ReportsCallout() {
  return (
    <section className="bg-[#030454] px-4 py-12 text-white sm:px-8 lg:px-10 lg:py-14">
      <div className="mx-auto max-w-7xl">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[#F3F74B]">
            Stay informed
          </p>

          <h3 className="mt-3 font-['Playfair_Display'] text-4xl font-bold tracking-tight">
            Access reports, briefs and public evidence
          </h3>

          <p className="mt-4 max-w-2xl text-sm leading-7 text-white/70">
            Published reports and validated official documents are available for
            public access where they have been approved for publication.
          </p>
        </div>
      </div>
    </section>
  );
}

export default function PublicPortalPage() {
  const [summaryData, setSummaryData] = useState(null);
  const [isLoading, setIsLoading] = useState(!isMilestoneOneDemo);
  const [error, setError] = useState("");

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
        setSummaryData({});
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
          <MovingIntelligenceSummary summaryData={safeSummaryData} />
          <ExploreSection />
          <NewsPolicySection />
          <PartnersSection />
          <ReportsCallout />
          <PublicDataNotice />
        </>
      )}

      <PublicPortalFooter />
    </main>
  );
}

