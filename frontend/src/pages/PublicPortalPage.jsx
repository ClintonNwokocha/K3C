import { useEffect, useMemo, useState } from "react";
import HomeClimateMapboxPreview from "../components/HomeClimateMapboxPreview";
import {
  PublicDataNotice,
  PublicPortalFooter,
} from "../components/PublicPortalChrome";
import { getPublicPortalSummary } from "../services/api";

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
      "The public portal improves access to approved climate risk summaries, GHG information and published evidence documents.",
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
    title: "Climate Risk Intelligence",
    description:
      "Understand where climate risks are concentrated across Kaduna State, including high-risk LGAs and public risk summaries.",
    buttonLabel: "Explore Climate Risk",
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
  const navItems = [
    { label: "Home", href: "/public", active: true },
    { label: "Climate Risk", href: "/public/climate-risk" },
    { label: "GHG Inventory", href: "/public/ghg-inventory" },
    { label: "Projects", href: "/public/projects" },
    { label: "Reports", href: "/public/reports" },
  ];

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

          <button
            type="button"
            onClick={() => navigateTo("/login")}
            className="rounded-md bg-[#009B35] px-4 py-2.5 text-xs font-black uppercase tracking-[0.12em] text-white transition hover:bg-[#007d2b]"
          >
            Staff Login
          </button>
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
            Climate intelligence for public decision support
          </h1>

          <p className="mt-5 max-w-3xl text-base leading-7 text-white/78 sm:text-lg sm:leading-8">
            Explore Kaduna State climate risk, emissions insights, project
            implementation and approved evidence reports in one public portal.
          </p>

          <div className="mt-7 flex flex-col gap-4 sm:flex-row">
            <button
              type="button"
              onClick={() => navigateTo("/public/climate-risk")}
              className="rounded-md bg-[#F3F74B] px-7 py-3.5 text-sm font-black uppercase tracking-[0.13em] text-[#030454] shadow-[0_18px_40px_rgba(243,247,75,0.18)] transition hover:-translate-y-0.5 hover:bg-white"
            >
              Explore Climate Risk
            </button>

            <button
              type="button"
              onClick={() => navigateTo("/public/reports")}
              className="rounded-md border border-white/25 bg-white/5 px-7 py-3.5 text-sm font-black uppercase tracking-[0.13em] text-white transition hover:-translate-y-0.5 hover:border-white hover:bg-white hover:text-[#030454]"
            >
              View Public Reports
            </button>
          </div>
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
      label: "Latest risk year",
      value: climateRisk.latest_year || "Latest approved",
    },
    {
      label: "LGAs assessed",
      value: formatNumber(climateRisk.total_lgas || 0, 0),
    },
    {
      label: "High concern LGAs",
      value: formatNumber(climateRisk.high_or_very_high_lgas || 0, 0),
    },
    {
      label: "Public projects",
      value: formatNumber(projects.total_projects || 0, 0),
    },
    {
      label: "Expected beneficiaries",
      value: formatCompactNumber(projects.total_expected_beneficiaries),
    },
    {
      label: "Estimated GHG reduction",
      value: `${formatCompactNumber(
        projects.total_expected_ghg_reduction_tco2e
      )} tCO₂e`,
    },
    {
      label: "Public reports",
      value: formatNumber(
        reports.total_reports || reports.public_reports || 0,
        0
      ),
    },
    {
      label: "GEE integration",
      value: "Rainfall and weather feeds planned",
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
            className="flex min-w-[310px] items-center gap-4 border-r border-[#E6EAEC] px-8 py-6"
          >
            <span className="h-3.5 w-3.5 shrink-0 rounded-full bg-[#009B35]" />

            <span>
              <span className="block text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">
                {item.label}
              </span>

              <strong className="mt-1 block text-xl font-black tracking-tight text-[#030454]">
                {item.value}
              </strong>
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

      <button
        type="button"
        onClick={() => navigateTo(item.href)}
        className="mt-8 w-fit rounded-md bg-[#030454] px-5 py-3 text-xs font-black uppercase tracking-[0.1em] text-white transition hover:bg-[#009B35]"
      >
        {item.buttonLabel}
      </button>
    </article>
  );
}

function ExploreSection() {
  return (
    <section className="bg-white px-4 py-16 sm:px-8 lg:px-10 lg:py-24">
      <div className="mx-auto max-w-7xl">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="font-['Playfair_Display'] text-4xl font-bold tracking-tight text-[#030454] md:text-5xl">
            Explore public climate information
          </h2>
        </div>

        <div className="mt-12 grid gap-6 lg:grid-cols-3">
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
    <section className="bg-[#F7F9FA] px-4 py-14 sm:px-8 lg:px-10 lg:py-20">
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
      className="flex h-[180px] w-[360px] min-w-[360px] items-center justify-center rounded-md border border-[#D8DDE2] bg-white p-10 shadow-[0_14px_35px_rgba(3,4,84,0.08)] grayscale transition duration-300 hover:-translate-y-1 hover:grayscale-0 hover:shadow-[0_20px_45px_rgba(3,4,84,0.12)] max-sm:h-[160px] max-sm:w-[280px] max-sm:min-w-[280px] max-sm:p-6"
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
    <section className="overflow-hidden border-y border-[#D8DDE2] bg-white px-4 py-16 sm:px-8 lg:px-10 lg:py-20">
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
        <div className="mb-12 text-center">
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
    <section className="bg-[#030454] px-4 py-16 text-white sm:px-8 lg:px-10">
      <div className="mx-auto grid max-w-7xl gap-8 md:grid-cols-[1fr_auto] md:items-center">
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

        <div className="flex flex-col gap-3 sm:flex-row md:flex-col">
          <button
            type="button"
            onClick={() => navigateTo("/public/reports")}
            className="rounded-md bg-[#F3F74B] px-6 py-4 text-sm font-black uppercase tracking-[0.1em] text-[#030454] transition hover:bg-white"
          >
            Go to Reports
          </button>

          <button
            type="button"
            onClick={() => navigateTo("/public/climate-risk")}
            className="rounded-md border border-white/25 px-6 py-4 text-sm font-black uppercase tracking-[0.1em] text-white transition hover:bg-white hover:text-[#030454]"
          >
            Explore Risk
          </button>
        </div>
      </div>
    </section>
  );
}

export default function PublicPortalPage() {
  const [summaryData, setSummaryData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadSummary() {
    setIsLoading(true);
    setError("");

    try {
      const data = await getPublicPortalSummary();
      setSummaryData(data.summary || {});
    } catch (err) {
      console.error(err);
      setError("Could not load public portal summary.");
      setSummaryData({});
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadSummary();
  }, []);

  const safeSummaryData = useMemo(() => summaryData || {}, [summaryData]);

  return (
    <main className="min-h-screen bg-[#DFE3E4] font-['DM_Sans'] text-[#030454]">
      <HomeTopNav />
      <HomeHero />
      <ErrorNotice message={error} />

      {isLoading ? (
        <section className="px-4 py-16 sm:px-8 lg:px-10">
          <div className="mx-auto max-w-7xl rounded-md border border-[#CAD2D7] bg-white p-8 text-sm text-slate-500 shadow-sm">
            Loading public climate intelligence...
          </div>
        </section>
      ) : (
        <>
          <MovingIntelligenceSummary summaryData={safeSummaryData} />

          <section className="bg-[#030454] px-4 py-16 text-white sm:px-8 lg:px-10 lg:py-20">
            <div className="mx-auto max-w-[1536px]">
              <HomeClimateMapboxPreview height="610px" />
            </div>
          </section>

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