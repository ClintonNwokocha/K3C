import { useEffect, useMemo, useState } from "react";
import {
  PublicDataNotice,
  PublicEmptyState,
  PublicPortalFooter,
  PublicPortalHeader,
  PublicSectionIntro,
} from "../components/PublicPortalChrome";
import PublicClimateRiskMapPreview from "../components/PublicClimateRiskMapPreview";
import { getPublicPortalSummary } from "../services/api";

const partnerLogos = [
  {
    name: "MacArthur Foundation",
    shortName: "MacArthur",
    src: "/logos/MacArth_primary_logo_stacked.jpg",
  },
  {
    name: "Kaduna State Government",
    shortName: "KDSG",
    src: "/logos/KadState.jpeg",
  },
  {
    name: "Centre for Policy Research & Development Solutions",
    shortName: "CPRDS",
    src: "/logos/CPRDS.jpeg",
  },
];

function formatNumber(value, maximumFractionDigits = 2) {
  return Number(value || 0).toLocaleString(undefined, {
    maximumFractionDigits,
  });
}

function formatRiskScore(value) {
  return Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatCompactMoney(value) {
  const number = Number(value || 0);

  if (number >= 1_000_000_000) {
    return `₦${formatNumber(number / 1_000_000_000, 2)}B`;
  }

  if (number >= 1_000_000) {
    return `₦${formatNumber(number / 1_000_000, 0)}M`;
  }

  return `₦${formatNumber(number, 0)}`;
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

function getRiskBadgeClass(level) {
  if (level === "very_high") return "bg-red-50 text-red-700";
  if (level === "high") return "bg-orange-50 text-orange-700";
  if (level === "moderate") return "bg-[#C8A84A]/15 text-[#0B1726]";
  return "bg-[#4E7492]/10 text-[#214560]";
}

function getStatusClass(status) {
  if (status === "completed") return "bg-emerald-50 text-emerald-700";
  if (status === "ongoing") return "bg-blue-50 text-blue-700";
  if (status === "planned") return "bg-sky-50 text-sky-700";
  if (status === "suspended") return "bg-amber-50 text-amber-700";
  if (status === "cancelled") return "bg-red-50 text-red-700";
  return "bg-purple-50 text-purple-700";
}

function getPriorityClass(priority) {
  if (priority === "very_high") return "bg-red-50 text-red-700";
  if (priority === "high") return "bg-orange-50 text-orange-700";
  if (priority === "medium") return "bg-[#C8A84A]/15 text-[#0B1726]";
  return "bg-[#4E7492]/10 text-[#214560]";
}

function HighestRiskLgaList({ climateRisk }) {
  const topLgas = climateRisk.top_lgas || [];

  if (topLgas.length === 0) {
    return (
      <PublicEmptyState
        title="No risk summary available"
        message="No climate risk summary records are available yet."
      />
    );
  }

  return (
    <div className="rounded-sm border border-[#CAD2D7] bg-white shadow-sm">
      <div className="border-b border-[#E6EAEC] px-5 py-4">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">
          Highest-risk LGAs · {climateRisk.latest_year || "Latest"}
        </p>
      </div>

      <div className="divide-y divide-[#E6EAEC]">
        {topLgas.map((profile, index) => (
          <div
            key={profile.id || `${profile.lga_name}-${index}`}
            className="grid grid-cols-[52px_minmax(0,1fr)_100px] items-center gap-4 px-5 py-5"
          >
            <p className="font-['Playfair_Display'] text-3xl font-bold leading-none text-[#CAD2D7] tabular-nums">
              {String(index + 1).padStart(2, "0")}
            </p>

            <div className="min-w-0">
              <p className="truncate text-base font-black text-[#0B1726]">
                {profile.lga_name}
              </p>

              <p className="mt-1 text-xs text-slate-400">
                Risk profile {profile.year}
              </p>
            </div>

            <div className="text-right">
              <p className="font-mono text-xl font-black leading-none text-[#0B1726] tabular-nums">
                {formatRiskScore(profile.overall_risk_score)}
              </p>

              <span
                className={`mt-3 inline-flex min-w-[58px] justify-center rounded-sm px-3 py-1 text-[10px] font-black uppercase tracking-[0.1em] ${getRiskBadgeClass(
                  profile.risk_level
                )}`}
              >
                {profile.risk_level_display}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ProjectCard({ project }) {
  return (
    <article className="rounded-sm border border-[#CAD2D7] bg-white p-5 shadow-sm transition hover:border-[#4E7492]/70 hover:shadow-md">
      <div className="mb-4 flex flex-wrap gap-2">
        <span
          className={`rounded-sm px-3 py-1 text-[10px] font-bold uppercase tracking-[0.1em] ${getPriorityClass(
            project.priority
          )}`}
        >
          {project.priority_display || project.priority || "Priority"}
        </span>

        <span
          className={`rounded-sm px-3 py-1 text-[10px] font-bold uppercase tracking-[0.1em] ${getStatusClass(
            project.status
          )}`}
        >
          {project.status_display || project.status || "Status"}
        </span>
      </div>

      <h3 className="text-base font-black leading-snug text-[#0B1726]">
        {project.title}
      </h3>

      <p className="mt-2 text-xs leading-5 text-slate-500">
        {project.project_code || "No code"} · {project.lga_name || "Statewide"}
      </p>

      <div className="mt-5 grid grid-cols-2 gap-x-5 gap-y-4">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">
            Sector
          </p>
          <p className="mt-1 text-sm font-bold text-[#0B1726]">
            {project.sector_display || project.sector || "Not specified"}
          </p>
        </div>

        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">
            Budget
          </p>
          <p className="mt-1 text-sm font-bold text-[#0B1726]">
            {formatCompactMoney(project.estimated_budget_naira)}
          </p>
        </div>

        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">
            GHG reduction
          </p>
          <p className="mt-1 text-sm font-bold text-[#0B1726]">
            {formatNumber(project.expected_ghg_reduction_tco2e, 0)} tCO₂e
          </p>
        </div>

        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">
            Beneficiaries
          </p>
          <p className="mt-1 text-sm font-bold text-[#0B1726]">
            {formatCompactNumber(project.expected_beneficiaries)}
          </p>
        </div>

        {(project.implementing_agency || project.funding_source) && (
          <div className="col-span-2 border-t border-[#E6EAEC] pt-4">
            {project.implementing_agency && (
              <p className="text-xs leading-5 text-slate-500">
                <span className="font-bold text-[#0B1726]">Agency:</span>{" "}
                {project.implementing_agency}
              </p>
            )}

            {project.funding_source && (
              <p className="mt-1 text-xs leading-5 text-slate-500">
                <span className="font-bold text-[#0B1726]">Funding:</span>{" "}
                {project.funding_source}
              </p>
            )}
          </div>
        )}
      </div>
    </article>
  );
}

function IndicatorPanel({ items }) {
  return (
    <section className="border-y border-[#CAD2D7] bg-white px-4 py-8 sm:px-8 lg:px-10">
      <div className="mx-auto grid max-w-7xl gap-4 md:grid-cols-4">
        {items.map((item) => (
          <div
            key={item.label}
            className="rounded-sm border border-[#CAD2D7] bg-[#F7F9FA] p-5"
          >
            <p className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">
              {item.label}
            </p>

            <p className="mt-3 font-['Playfair_Display'] text-4xl font-bold text-[#0B1726]">
              {item.value}
            </p>

            {item.helper && (
              <p className="mt-2 text-xs leading-5 text-slate-500">
                {item.helper}
              </p>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

function PartnerLogoCard({ partner, duplicate = false }) {
  return (
    <article
      aria-hidden={duplicate}
      title={partner.name}
      className="flex h-[230px] w-[440px] min-w-[440px] items-center justify-center rounded-md border border-[#D8DDE2] bg-white p-10 shadow-[0_14px_35px_rgba(11,23,38,0.10)] transition duration-300 hover:-translate-y-1 hover:shadow-[0_20px_45px_rgba(11,23,38,0.14)] max-sm:h-[190px] max-sm:w-[320px] max-sm:min-w-[320px] max-sm:p-6"
    >
      {partner.src ? (
        <img
          src={partner.src}
          alt={partner.name}
          className="max-h-[165px] max-w-[340px] object-contain max-sm:max-h-[130px] max-sm:max-w-[250px]"
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
        className="hidden text-center text-4xl font-black uppercase tracking-[0.08em] text-[#214560]"
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
          <h2 className="text-3xl font-black uppercase tracking-tight text-[#0B1726] sm:text-4xl">
            OUR PARTNERS
          </h2>

          <div className="mx-auto mt-5 h-[3px] w-28 bg-[#C8A84A]" />
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
        label: "Portfolio Budget",
        value: formatCompactMoney(projects.total_budget_naira),
      },
    ];
  }, [climateRisk, projects]);

  const publicIndicators = useMemo(() => {
    return [
      {
        label: "LGAs Assessed",
        value: climateRisk.total_lgas || 0,
        helper: "Local government areas with available climate risk summaries.",
      },
      {
        label: "High-Risk LGAs",
        value: climateRisk.high_or_very_high_lgas || 0,
        helper: "LGAs currently classified as high or very high risk.",
      },
      {
        label: "Active Projects",
        value: projects.total_projects || 0,
        helper: "Climate action projects registered in the public portfolio.",
      },
      {
        label: "Portfolio Budget",
        value: formatCompactMoney(projects.total_budget_naira),
        helper: "Estimated value of climate action projects in the portal.",
      },
    ];
  }, [climateRisk, projects]);

  return (
    <main className="min-h-screen bg-[#DFE3E4] font-['DM_Sans'] text-[#0B1726]">
      <PublicPortalHeader
        activePage="home"
        tag="Kaduna public climate evidence portal"
        title={<>Climate intelligence for public decision support</>}
        description="Access public climate risk summaries, priority climate action projects and published evidence documents from the Kaduna State Climate Command Centre."
        stats={heroStats}
        showStats
        primaryActionLabel="Explore Risk Landscape"
        secondaryActionLabel="View Public Reports"
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
          <IndicatorPanel items={publicIndicators} />

          <section
            id="risk-landscape"
            className="bg-white px-4 py-16 sm:px-8 lg:px-10 lg:py-20"
          >
            <div className="mx-auto max-w-7xl">
              <PublicSectionIntro
                eyebrow="Risk landscape"
                title="Climate risk comes first"
                description="A public summary of where climate risk is concentrated across Kaduna State before reviewing projects, investments and reports."
              />

              <div className="mt-10 grid gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-start">
                <div className="rounded-sm border border-[#CAD2D7] bg-white p-4 shadow-sm">
                  <PublicClimateRiskMapPreview />
                </div>

                <HighestRiskLgaList climateRisk={climateRisk} />
              </div>
            </div>
          </section>

          <section className="bg-[#0B1726] px-4 py-12 text-white sm:px-8 lg:px-10">
            <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[1fr_auto] lg:items-center">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-[#C8A84A]">
                  Portfolio snapshot
                </p>

                <h2 className="mt-3 font-['Playfair_Display'] text-4xl font-bold">
                  Public climate action summary
                </h2>

                <p className="mt-3 max-w-xl text-sm font-light leading-7 text-white/60">
                  Summary of registered climate projects, estimated budget,
                  expected mitigation outcomes and intended beneficiaries.
                </p>
              </div>

              <div className="grid gap-8 sm:grid-cols-3">
                <div>
                  <p className="font-['Playfair_Display'] text-4xl font-bold text-[#C8A84A]">
                    {formatCompactMoney(projects.total_budget_naira)}
                  </p>
                  <p className="mt-1 text-[11px] font-black uppercase tracking-[0.14em] text-white/45">
                    Portfolio Budget
                  </p>
                </div>

                <div>
                  <p className="font-['Playfair_Display'] text-4xl font-bold text-[#C8A84A]">
                    {formatCompactNumber(
                      projects.total_expected_ghg_reduction_tco2e
                    )}
                  </p>
                  <p className="mt-1 text-[11px] font-black uppercase tracking-[0.14em] text-white/45">
                    tCO₂e Reduction
                  </p>
                </div>

                <div>
                  <p className="font-['Playfair_Display'] text-4xl font-bold text-[#C8A84A]">
                    {formatCompactNumber(projects.total_expected_beneficiaries)}
                  </p>
                  <p className="mt-1 text-[11px] font-black uppercase tracking-[0.14em] text-white/45">
                    Beneficiaries
                  </p>
                </div>
              </div>
            </div>
          </section>

          <section className="px-4 py-16 sm:px-8 lg:px-10 lg:py-20">
            <div className="mx-auto max-w-7xl">
              <PublicSectionIntro
                eyebrow="Priority climate projects"
                title="Where action is happening"
                description="Selected high-priority projects from the climate action portfolio, displayed for public awareness and reporting."
              />

              <div className="mt-10 grid gap-6 md:grid-cols-2 xl:grid-cols-3">
                {(projects.top_projects || []).map((project) => (
                  <ProjectCard key={project.id} project={project} />
                ))}

                {(projects.top_projects || []).length === 0 && (
                  <PublicEmptyState
                    title="No public project summary available"
                    message="No public project summary records are available yet."
                  />
                )}
              </div>
            </div>
          </section>

          <PartnersSection />

          <section className="border-y border-[#CAD2D7] bg-white px-4 py-12 sm:px-8 lg:px-10">
            <div className="mx-auto grid max-w-7xl gap-8 md:grid-cols-[1fr_auto] md:items-center">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-[#2292A4]">
                  Published evidence
                </p>

                <h3 className="mt-3 font-['Playfair_Display'] text-3xl font-bold text-[#0B1726]">
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
                className="w-fit rounded-sm border-2 border-[#2292A4] px-6 py-3 text-sm font-black uppercase tracking-[0.08em] text-[#2292A4] transition hover:bg-[#2292A4] hover:text-white"
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