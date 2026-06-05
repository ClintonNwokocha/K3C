import { useEffect, useMemo, useState } from "react";
import {
  PublicDataNotice,
  PublicEmptyState,
  PublicPortalFooter,
  PublicPortalHeader,
  PublicSectionIntro,
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
  },
  {
    category: "Policy",
    date: "May 2026",
    title: "Climate evidence portal supports coordinated decision-making",
    summary:
      "The public portal is designed to improve access to approved climate risk summaries, GHG information and published evidence documents.",
  },
  {
    category: "Reporting",
    date: "May 2026",
    title: "Public reports centre prepared for approved climate documents",
    summary:
      "Validated reports, briefs and evidence documents can be published through the reports portal once approved for public access.",
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

function GatewayCard({ title, description, buttonLabel, href, tone = "blue" }) {
  const toneClasses = {
    blue: "border-[#030454]/20 hover:border-[#030454]",
    green: "border-[#009B35]/25 hover:border-[#009B35]",
    yellow: "border-[#F3F74B] hover:border-[#030454]",
  };

  return (
    <article
      className={`rounded-md border bg-white p-8 shadow-sm transition hover:-translate-y-1 hover:shadow-[0_18px_45px_rgba(3,4,84,0.12)] ${
        toneClasses[tone] || toneClasses.blue
      }`}
    >
      <h3 className="font-['Playfair_Display'] text-3xl font-bold leading-tight text-[#030454]">
        {title}
      </h3>

      <p className="mt-4 text-sm leading-7 text-slate-600">{description}</p>

      <button
        type="button"
        onClick={() => {
          window.location.href = href;
        }}
        className="mt-7 rounded-md bg-[#030454] px-5 py-3 text-xs font-black uppercase tracking-[0.1em] text-white transition hover:bg-[#009B35]"
      >
        {buttonLabel}
      </button>
    </article>
  );
}

function NewsCard({ item }) {
  return (
    <article className="rounded-md border border-[#D8DDE2] bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:border-[#009B35]/70 hover:shadow-md">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <span className="rounded-sm bg-[#009B35]/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-[#009B35]">
          {item.category}
        </span>

        <span className="text-xs font-bold uppercase tracking-[0.1em] text-slate-400">
          {item.date}
        </span>
      </div>

      <h3 className="text-lg font-black leading-snug text-[#030454]">
        {item.title}
      </h3>

      <p className="mt-3 text-sm leading-7 text-slate-600">{item.summary}</p>
    </article>
  );
}

function PartnerLogoCard({ partner, duplicate = false }) {
  return (
    <article
      aria-hidden={duplicate}
      title={partner.name}
      className="flex h-[220px] w-[420px] min-w-[420px] items-center justify-center rounded-md border border-[#D8DDE2] bg-white p-10 shadow-[0_14px_35px_rgba(3,4,84,0.10)] transition duration-300 hover:-translate-y-1 hover:shadow-[0_20px_45px_rgba(3,4,84,0.14)] max-sm:h-[180px] max-sm:w-[300px] max-sm:min-w-[300px] max-sm:p-6"
    >
      {partner.src ? (
        <img
          src={partner.src}
          alt={partner.name}
          className="max-h-[155px] max-w-[320px] object-contain max-sm:max-h-[120px] max-sm:max-w-[230px]"
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
        className="hidden text-center text-4xl font-black uppercase tracking-[0.08em] text-[#030454]"
      >
        {partner.shortName}
      </span>
    </article>
  );
}

function PartnersSection() {
  const scrollingPartners = [...partnerLogos, ...partnerLogos];

  return (
    <section className="overflow-hidden border-y border-[#D8DDE2] bg-[#F7F9FA] px-4 py-16 sm:px-8 lg:px-10 lg:py-20">
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
          <h2 className="text-3xl font-black uppercase tracking-tight text-[#030454] sm:text-4xl">
            OUR PARTNERS
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
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadSummary();
  }, []);

  const climateRisk = summaryData?.climate_risk || {};
  const projects = summaryData?.projects || {};

  const heroStats = useMemo(() => {
    return [
      {
        label: "LGAs Assessed",
        value: climateRisk.total_lgas || 0,
      },
      {
        label: "High-Risk LGAs",
        value: climateRisk.high_or_very_high_lgas || 0,
      },
      {
        label: "Active Projects",
        value: projects.total_projects || 0,
      },
      {
        label: "Estimated GHG Reduction",
        value: formatCompactNumber(projects.total_expected_ghg_reduction_tco2e),
      },
    ];
  }, [climateRisk, projects]);

  return (
    <main className="min-h-screen bg-[#DFE3E4] font-['DM_Sans'] text-[#030454]">
      <PublicPortalHeader
        activePage="home"
        tag="Kaduna public climate evidence portal"
        title={<>Climate intelligence for public decision support</>}
        description="Access public climate risk summaries, greenhouse gas inventory insights, climate action project information and published evidence documents from the Kaduna State Climate Command Centre."
        stats={heroStats}
        showStats
        primaryActionLabel="Explore Climate Risk"
        secondaryActionLabel="View Public Reports"
        onPrimaryAction={() => {
          window.location.href = "/public/climate-risk";
        }}
        onSecondaryAction={() => {
          window.location.href = "/public/reports";
        }}
      />

      {error && (
        <section className="px-4 py-4 sm:px-8 lg:px-10">
          <div className="mx-auto max-w-7xl rounded-sm border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        </section>
      )}

      {isLoading ? (
        <section className="px-4 py-16 sm:px-8 lg:px-10">
          <div className="mx-auto max-w-7xl rounded-sm border border-[#CAD2D7] bg-white p-8 text-sm text-slate-500 shadow-sm">
            Loading public climate intelligence...
          </div>
        </section>
      ) : (
        <>
          <section className="bg-white px-4 py-16 sm:px-8 lg:px-10 lg:py-20">
            <div className="mx-auto max-w-7xl">
              <PublicSectionIntro
                centered
                title="Explore public climate information"
                description="The public portal is organised into focused sections so visitors can quickly understand climate risk, emissions information, project implementation and published evidence."
              />

              <div className="mt-12 grid gap-6 lg:grid-cols-3">
                <GatewayCard
                  title="Climate Risk Intelligence"
                  description="Understand where climate risks are concentrated across Kaduna State, including high-risk LGAs and public risk summaries."
                  buttonLabel="Explore Climate Risk"
                  href="/public/climate-risk"
                  tone="blue"
                />

                <GatewayCard
                  title="GHG Inventory"
                  description="View public greenhouse gas inventory summaries and sector-level emissions insights where approved data is available."
                  buttonLabel="View GHG Inventory"
                  href="/public/ghg-inventory"
                  tone="green"
                />

                <GatewayCard
                  title="Climate Action Portfolio"
                  description="Explore climate action projects, expected beneficiaries and estimated greenhouse gas reduction outcomes."
                  buttonLabel="View Projects"
                  href="/public/projects"
                  tone="yellow"
                />
              </div>
            </div>
          </section>

          <section className="bg-[#F7F9FA] px-4 py-16 sm:px-8 lg:px-10 lg:py-20">
            <div className="mx-auto max-w-7xl">
              <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
                <PublicSectionIntro
                  title="News and Policy Updates"
                  description="Follow public updates on climate project implementation, policy decisions, reports and stakeholder coordination."
                />

                <button
                  type="button"
                  onClick={() => {
                    window.location.href = "/public/reports";
                  }}
                  className="w-fit rounded-md border-2 border-[#009B35] px-5 py-3 text-xs font-black uppercase tracking-[0.1em] text-[#009B35] transition hover:bg-[#009B35] hover:text-white"
                >
                  View Evidence Reports
                </button>
              </div>

              <div className="mt-10 grid gap-6 lg:grid-cols-3">
                {publicNewsItems.map((item) => (
                  <NewsCard key={item.title} item={item} />
                ))}
              </div>
            </div>
          </section>

          <PartnersSection />

          <section className="border-y border-[#CAD2D7] bg-white px-4 py-12 sm:px-8 lg:px-10">
            <div className="mx-auto grid max-w-7xl gap-8 md:grid-cols-[1fr_auto] md:items-center">
              <div>
                <h3 className="font-['Playfair_Display'] text-3xl font-bold text-[#030454]">
                  Access the public reports portal
                </h3>

                <p className="mt-3 max-w-2xl text-sm font-light leading-7 text-slate-500">
                  Published reports, briefs and validated official documents are
                  available for public access where they have been approved for
                  publication.
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  window.location.href = "/public/reports";
                }}
                className="w-fit rounded-sm border-2 border-[#009B35] px-6 py-3 text-sm font-black uppercase tracking-[0.08em] text-[#009B35] transition hover:bg-[#009B35] hover:text-white"
              >
                Go to Reports →
              </button>
            </div>
          </section>

          <PublicDataNotice />
        </>
      )}

      <PublicPortalFooter />
    </main>
  );
}