import { useEffect, useMemo, useRef, useState } from "react";
import {
  PublicDataNotice,
  PublicPortalFooter,
  PublicGreenButton,
  PublicNavyButton,
  PublicPrimaryButton,
} from "../components/PublicPortalChrome";
import { getPublicPortalSummary } from "../services/api";
import { isMilestoneOneDemo } from "../config/demoMode";
import { useScrollReveal, revealClasses, useMotionEnabled } from "../hooks/useScrollReveal";
import { K3CWhiteTextLogo } from "../components/K3CLogo";
import { MotionProvider } from "../hooks/MotionContext";

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
    category: "Climate intelligence",
    title: "Explore climate intelligence",
    summary:
      "Explore published climate indicators and assessment information available through the portal.",
    linkLabel: "Explore climate information",
    href: "/public/climate-risk",
  },
  {
    category: "GHG inventory",
    title: "Greenhouse gas information",
    summary:
      "Open the public inventory explorer to inspect reported values alongside their publication status.",
    linkLabel: "Open public GHG explorer",
    href: "/public/ghg-inventory",
  },
  {
    category: "Project information",
    title: "Climate action portfolio",
    summary:
      "View the project information that is publicly available, including implementation status where provided.",
    linkLabel: "Explore project information",
    href: "/public/projects",
  },
];

function hasNumber(value) {
  return value !== null && value !== undefined && Number.isFinite(Number(value));
}

function formatNumber(value, maximumFractionDigits = 2) {
  return Number(value || 0).toLocaleString(undefined, {
    maximumFractionDigits,
  });
}

function navigateTo(href) {
  window.location.href = href;
}

function HomeTopNav() {
  const [menuOpen, setMenuOpen] = useState(false);
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

  useEffect(() => {
    if (!menuOpen) return undefined;

    function handleKeyDown(event) {
      if (event.key === "Escape") setMenuOpen(false);
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [menuOpen]);

  function goTo(href) {
    setMenuOpen(false);
    navigateTo(href);
  }

  return (
    <header className="relative border-b border-white/10 bg-[#030454] px-4 py-5 text-white sm:px-8 lg:px-10">
      <div className="mx-auto flex max-w-[1536px] items-center justify-between gap-5">
        <button
          type="button"
          onClick={() => goTo("/public")}
          className="flex shrink-0 items-center text-left"
        >
          <K3CWhiteTextLogo className="h-20 md:h-24 lg:h-[104px] xl:h-[116px]" />
        </button>

        <nav className="hidden flex-wrap gap-2 md:flex">
          {navItems.map((item) => (
            <button
              key={item.label}
              type="button"
              onClick={() => goTo(item.href)}
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
            onClick={() => goTo("/login")}
            className="px-4 py-2.5 text-xs focus-visible:ring-offset-[#030454]"
          >
            Staff Login
          </PublicGreenButton>
        </nav>

        <button
          type="button"
          onClick={() => setMenuOpen((open) => !open)}
          aria-expanded={menuOpen}
          aria-controls="home-mobile-nav"
          className="rounded-md border border-white/35 bg-transparent px-3 py-2 text-xs font-black uppercase tracking-[0.08em] text-white transition hover:bg-white/10 md:hidden"
        >
          {menuOpen ? "✕ Close" : "☰ Menu"}
        </button>
      </div>

      {menuOpen && (
        <nav
          id="home-mobile-nav"
          aria-label="Primary navigation"
          className="absolute inset-x-0 top-full z-20 flex flex-col gap-2 border-t border-white/10 bg-[#030454] px-4 py-4 shadow-[0_18px_30px_rgba(3,4,84,0.35)] md:hidden"
        >
          {navItems.map((item) => (
            <button
              key={item.label}
              type="button"
              onClick={() => goTo(item.href)}
              className={`rounded-md border px-4 py-3 text-left text-xs font-black uppercase tracking-[0.12em] transition ${
                item.active
                  ? "border-[#F3F74B] bg-[#F3F74B] text-[#030454]"
                  : "border-white/15 bg-white/5 text-white hover:bg-white/10"
              }`}
            >
              {item.label}
            </button>
          ))}

          <PublicGreenButton
            onClick={() => goTo("/login")}
            className="justify-center px-4 py-3 text-xs focus-visible:ring-offset-[#030454]"
          >
            Staff Login
          </PublicGreenButton>
        </nav>
      )}
    </header>
  );
}

function HomeHero() {
  const motionEnabled = useMotionEnabled();
  const [eyebrowRef, eyebrowVisible] = useScrollReveal();
  const [titleRef, titleVisible] = useScrollReveal();
  const [introRef, introVisible] = useScrollReveal();

  return (
    <section className="relative overflow-hidden bg-[#030454] px-4 py-12 text-white sm:px-8 sm:py-14 lg:px-10 lg:py-16">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_78%_18%,rgba(0,155,53,0.24),transparent_28%),radial-gradient(circle_at_20%_20%,rgba(243,247,75,0.12),transparent_24%),linear-gradient(120deg,#030454_0%,#07105f_48%,#0f3f4b_100%)]" />
      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(3,4,84,0.92),rgba(3,4,84,0.72),rgba(3,4,84,0.42))]" />

      <span
        aria-hidden="true"
        className={`pointer-events-none absolute -right-40 -top-56 h-[34rem] w-[34rem] rounded-full border border-[#F3F74B]/20 motion-reduce:animate-none ${
          motionEnabled ? "animate-[spin_38s_linear_infinite]" : ""
        }`}
      />
      <span
        aria-hidden="true"
        className={`pointer-events-none absolute right-[14%] -bottom-40 h-72 w-72 rounded-full bg-[#009B35] opacity-20 blur-[90px] motion-reduce:animate-none ${
          motionEnabled ? "animate-pulse" : ""
        }`}
      />

      <div className="relative mx-auto max-w-[1536px]">
        <div className="max-w-5xl">
          <p
            ref={eyebrowRef}
            className={revealClasses(
              eyebrowVisible,
              "text-xs font-black uppercase tracking-[0.22em] text-[#F3F74B]"
            )}
          >
            Kaduna Climate Evidence Portal
          </p>

          <h1
            ref={titleRef}
            className={revealClasses(
              titleVisible,
              "mt-5 max-w-5xl font-['Playfair_Display'] text-[2.65rem] font-bold leading-[0.98] tracking-[-0.05em] text-white sm:text-[3.6rem] lg:text-[4.9rem]"
            )}
            style={{ transitionDelay: titleVisible ? "80ms" : "0ms" }}
          >
            Climate intelligence for decision support
          </h1>

          <p
            ref={introRef}
            className={revealClasses(
              introVisible,
              "mt-5 max-w-3xl text-base leading-7 text-white/78 sm:text-lg sm:leading-8"
            )}
            style={{ transitionDelay: introVisible ? "160ms" : "0ms" }}
          >
            {isMilestoneOneDemo
             ? "K3C brings climate and environmental evidence together for Kaduna State, integrating satellite-derived indicators, LGA-level risk context, and climate-action signals covering all 23 LGAs."
    : "K3C brings satellite-derived climate data, Climate Impact, greenhouse gas information, climate projects, and public evidence for Kaduna State into one portal covering all 23 LGAs."}
          </p>

          <div
            className={revealClasses(introVisible, "mt-8 flex")}
            style={{ transitionDelay: introVisible ? "220ms" : "0ms" }}
          >
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

const aboutPillars = [
  {
    icon: "⌖",
    title: "Understand local risks",
    description: "Explore climate indicators and risk information across Kaduna State.",
  },
  {
    icon: "▥",
    title: "Connect the evidence",
    description: "Bring climate impact, emissions and project information into clearer view.",
    floatDelay: "0ms",
  },
  {
    icon: "↗",
    title: "Follow climate action",
    description: "Find public reports and track the progress information available through the portal.",
    floatDelay: "450ms",
  },
];

function WhyKcccSection() {
  const motionEnabled = useMotionEnabled();
  const [eyebrowRef, eyebrowVisible] = useScrollReveal();
  const [headingRef, headingVisible] = useScrollReveal();
  const [leadRef, leadVisible] = useScrollReveal();
  const [bodyRef, bodyVisible] = useScrollReveal();
  const [panelRef, panelVisible] = useScrollReveal();

  return (
    <section className="relative isolate overflow-hidden border-b border-[#D8DDE2] bg-gradient-to-br from-[#eef2ff] via-[#e2f5ec] to-[#f6fbd4] px-4 py-12 sm:px-8 sm:py-16 lg:px-10">
      <style>{`
        @keyframes aboutIconFloat {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-3px); }
        }
      `}</style>

      <span
        aria-hidden="true"
        className={`pointer-events-none absolute -right-28 -top-40 h-[26rem] w-[26rem] rounded-full border border-[#009B35]/25 motion-reduce:animate-none ${
          motionEnabled ? "animate-[spin_34s_linear_infinite]" : ""
        }`}
      />
      <span
        aria-hidden="true"
        className={`pointer-events-none absolute -left-24 -bottom-36 h-64 w-64 rounded-full bg-[radial-gradient(circle,rgba(7,139,67,0.22)_0%,rgba(116,136,229,0.1)_42%,transparent_72%)] motion-reduce:animate-none ${
          motionEnabled ? "animate-pulse" : ""
        }`}
      />

      <div className="relative mx-auto grid max-w-[1536px] gap-10 lg:grid-cols-[1.2fr_0.8fr] lg:items-center lg:gap-16">
        <div>
          <p
            ref={eyebrowRef}
            className={revealClasses(
              eyebrowVisible,
              "flex items-center gap-2.5 text-xs font-black uppercase tracking-[0.16em] text-[#009B35]"
            )}
          >
            <span className="h-[3px] w-6 rounded-full bg-[#009B35]" />
            Why K3C
          </p>

          <h2
            ref={headingRef}
            className={revealClasses(
              headingVisible,
              "mt-4 max-w-xl font-['Playfair_Display'] text-3xl font-bold leading-[1.1] tracking-tight text-[#030454] sm:text-4xl"
            )}
            style={{ transitionDelay: headingVisible ? "80ms" : "0ms" }}
          >
            Climate evidence is more powerful when everyone can use it.
          </h2>

          <p
            ref={leadRef}
            className={revealClasses(
              leadVisible,
              "mt-4 max-w-xl text-base leading-8 text-[#273451] sm:text-lg"
            )}
            style={{ transitionDelay: leadVisible ? "200ms" : "0ms" }}
          >
            Climate information is most useful when decision-makers, communities
            and partners can understand where risks are emerging, what
            interventions are underway, and what evidence exists about progress.
          </p>

          <p
            ref={bodyRef}
            className={revealClasses(
              bodyVisible,
              "mt-3 max-w-xl text-sm leading-7 text-slate-600"
            )}
            style={{ transitionDelay: bodyVisible ? "320ms" : "0ms" }}
          >
            K3C brings climate intelligence,
            greenhouse gas information, project updates and public evidence into
            one shared platform — helping make climate action easier to
            understand, monitor and communicate.
          </p>
        </div>

        <aside
          ref={panelRef}
          aria-label="What K3C brings together"
          className={revealClasses(
            panelVisible,
            "rounded-[20px] border border-white/40 bg-[#030454] p-7 text-white shadow-[0_20px_48px_rgba(8,13,82,0.25)] transition-[transform,box-shadow] duration-300 motion-safe:hover:-translate-y-1 motion-safe:hover:shadow-[0_28px_58px_rgba(8,9,78,0.33)]"
          )}
          style={{ transitionDelay: panelVisible ? "120ms" : "0ms" }}
        >
          <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.15em] text-[#F3F74B]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#F3F74B]" />
            From information to action
          </p>

          <div className="mt-5 divide-y divide-white/15">
            {aboutPillars.map((pillar) => (
              <div
                key={pillar.title}
                className="group grid grid-cols-[42px_1fr] items-start gap-3 rounded-lg py-4 transition-[padding,background-color] duration-200 first:pt-0 hover:bg-white/5 hover:pl-2"
              >
                <span
                  aria-hidden="true"
                  className={`grid h-10 w-10 place-items-center rounded-xl bg-white/10 text-base font-bold text-[#F3F74B] transition-[transform,background-color,color] duration-300 group-hover:-rotate-[7deg] group-hover:scale-110 group-hover:bg-[#F3F74B] group-hover:text-[#030454] motion-reduce:animate-none ${
                    motionEnabled && pillar.floatDelay !== undefined
                      ? "animate-[aboutIconFloat_4.5s_ease-in-out_infinite]"
                      : ""
                  }`}
                  style={
                    motionEnabled && pillar.floatDelay !== undefined
                      ? { animationDelay: pillar.floatDelay }
                      : undefined
                  }
                >
                  {pillar.icon}
                </span>
                <div>
                  <h3 className="text-sm font-black leading-tight text-white">{pillar.title}</h3>
                  <p className="mt-1 text-xs leading-6 text-white/75">{pillar.description}</p>
                </div>
              </div>
            ))}
          </div>

          <p className="mt-4 flex items-center gap-2 border-t border-white/15 pt-4 text-[10px] leading-5 text-white/75">
            <span aria-hidden="true" className="text-[#F3F74B]">
              ✳
            </span>
            A shared public climate evidence portal for Kaduna State
          </p>
        </aside>
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
          first operational Climate Impact module.
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
            K3C is being built as a multi-module climate evidence platform. This preview shows
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

const SUMMARY_CARD_TONES = [
  "bg-[#eef0ff] text-[#28266f] border-[#d9dcff]",
  "bg-[#e8f8ef] text-[#075f37] border-[#c9eed8]",
  "bg-[#fff0f1] text-[#982b43] border-[#ffd6dc]",
];

function CountUpValue({ end, isVisible, motionEnabled }) {
  const [display, setDisplay] = useState(() => (motionEnabled ? 0 : end));
  const startedRef = useRef(false);

  useEffect(() => {
    if (!motionEnabled || !isVisible || startedRef.current) return undefined;
    startedRef.current = true;

    const start = performance.now();
    const duration = 800;
    let frame;

    function tick(now) {
      const progress = Math.min((now - start) / duration, 1);
      setDisplay(Math.round(end * (1 - Math.pow(1 - progress, 3))));
      if (progress < 1) {
        frame = requestAnimationFrame(tick);
      } else {
        setDisplay(end);
      }
    }

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [isVisible, motionEnabled, end]);

  return <>{display.toLocaleString()}</>;
}

function MovingIntelligenceSummary({ summaryData }) {
  const motionEnabled = useMotionEnabled();
  const climateRisk = summaryData?.climate_risk || {};
  const projects = summaryData?.projects || {};

  const summaryItems = [
    {
      label: "Latest Assessment Year",
      value: hasNumber(climateRisk.latest_year)
        ? String(climateRisk.latest_year)
        : "Not available",
      rawValue: null,
      description: "Latest published Climate Impact assessment",
    },
    {
      label: "Assessed LGAs",
      value: hasNumber(climateRisk.total_lgas)
        ? formatNumber(climateRisk.total_lgas, 0)
        : "Not available",
      rawValue: hasNumber(climateRisk.total_lgas) ? Number(climateRisk.total_lgas) : null,
      description: "LGAs with published assessment records",
    },
    {
      label: "Public Climate Projects",
      value: hasNumber(projects.total_projects)
        ? formatNumber(projects.total_projects, 0)
        : "Not available",
      rawValue: hasNumber(projects.total_projects) ? Number(projects.total_projects) : null,
      description: "Approved projects visible on the portal",
    },
  ];

  return (
    <section className="border-y border-[#D8DDE2] bg-[#F7F9FA] px-4 py-6 sm:px-8 lg:px-10">
      <div className="mx-auto grid max-w-[1536px] gap-4 sm:grid-cols-3">
        {summaryItems.map((item, index) => (
          <SummaryKpiCard
            key={item.label}
            item={item}
            index={index}
            motionEnabled={motionEnabled}
          />
        ))}
      </div>
    </section>
  );
}

function SummaryKpiCard({ item, index, motionEnabled }) {
  const [cardRef, cardVisible] = useScrollReveal();

  return (
    <div
      ref={cardRef}
      style={{ transitionDelay: cardVisible ? `${index * 80}ms` : "0ms" }}
      className={revealClasses(
        cardVisible,
        `flex h-full flex-col items-start gap-1 rounded-xl border px-6 py-5 duration-300 motion-safe:hover:-translate-y-1 hover:shadow-[0_14px_28px_rgba(8,12,65,0.12)] ${SUMMARY_CARD_TONES[index]}`
      )}
    >
      <span className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.16em] opacity-80">
        <span className="h-2 w-2 shrink-0 rounded-full bg-current" />
        {item.label}
      </span>

      <strong className="block text-3xl font-black tracking-tight tabular-nums">
        {item.rawValue !== null ? (
          <CountUpValue end={item.rawValue} isVisible={cardVisible} motionEnabled={motionEnabled} />
        ) : (
          item.value
        )}
      </strong>

      <span className="block text-xs leading-5 opacity-80">
        {item.description}
      </span>
    </div>
  );
}

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

function PriorityCard({ item, index = 0 }) {
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
  const [cardRef, cardVisible] = useScrollReveal();

  return (
    <article
      ref={cardRef}
      className={revealClasses(
        cardVisible,
        `group relative isolate flex min-h-[380px] flex-col overflow-hidden rounded-[28px] p-8 duration-300 motion-safe:hover:-translate-y-2 focus-within:outline focus-within:outline-[3px] focus-within:outline-offset-4 focus-within:outline-[#009B35] ${toneClasses[item.tone]} ${shadowClasses[item.tone]}`
      )}
      style={{ transitionDelay: cardVisible ? `${index * 90}ms` : "0ms" }}
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
        className="pointer-events-none absolute bottom-3 right-6 select-none text-[70px] font-black leading-none tracking-tighter opacity-10 transition-[transform,opacity] duration-500 motion-safe:group-hover:-translate-y-2 motion-safe:group-hover:opacity-[0.18]"
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
          {priorityCards.map((item, index) => (
            <PriorityCard key={item.key} item={item} index={index} />
          ))}
        </div>
      </div>
    </section>
  );
}

// Per-card accent (green / violet / gold), matching the approved V10
// reference's --news-accent variants and its color-mix()-derived tints
// (precomputed here since Tailwind can't resolve arbitrary values built
// from interpolated class names at build time).
const NEWS_CARD_TONES = [
  {
    cardBg: "bg-[linear-gradient(145deg,#effbf3_0%,#ffffff_82%)]",
    cardHoverBorder: "hover:border-[#b8e7c9]",
    topBar: "bg-[#078b43]",
    tagText: "text-[#078b43]",
    tagBorder: "border-[#D2EADD]",
    linkText: "text-[#078b43]",
    linkBorder: "border-[#C8E5D6]",
    linkBg: "bg-[#E9F5EE]",
    linkHoverBg: "hover:bg-[#078b43]",
    linkHoverShadow: "hover:shadow-[0_8px_18px_rgba(7,139,67,0.22)]",
  },
  {
    cardBg: "bg-[linear-gradient(145deg,#f0f2ff_0%,#ffffff_82%)]",
    cardHoverBorder: "hover:border-[#c8c8f4]",
    topBar: "bg-[#3532a1]",
    tagText: "text-[#3532a1]",
    tagBorder: "border-[#DBDAEE]",
    linkText: "text-[#3532a1]",
    linkBorder: "border-[#D3D2EA]",
    linkBg: "bg-[#EDEDF7]",
    linkHoverBg: "hover:bg-[#3532a1]",
    linkHoverShadow: "hover:shadow-[0_8px_18px_rgba(53,50,161,0.22)]",
  },
  {
    cardBg: "bg-[linear-gradient(145deg,#fff8e5_0%,#ffffff_82%)]",
    cardHoverBorder: "hover:border-[#f2dfa0]",
    topBar: "bg-[#d19a00]",
    tagText: "text-[#d19a00]",
    tagBorder: "border-[#F7EDD1]",
    linkText: "text-[#d19a00]",
    linkBorder: "border-[#F5E9C7]",
    linkBg: "bg-[#FBF6E8]",
    linkHoverBg: "hover:bg-[#d19a00]",
    linkHoverShadow: "hover:shadow-[0_8px_18px_rgba(209,154,0,0.22)]",
  },
];

function NewsCard({ item, index = 0 }) {
  const [cardRef, cardVisible] = useScrollReveal();
  const tone = NEWS_CARD_TONES[index % NEWS_CARD_TONES.length];

  return (
    <article
      ref={cardRef}
      className={revealClasses(
        cardVisible,
        `group relative isolate flex min-h-[300px] flex-col overflow-hidden rounded-[13px] border border-transparent p-6 shadow-[0_7px_20px_rgba(8,12,65,0.03)] duration-300 motion-safe:hover:-translate-y-2 hover:shadow-[0_18px_38px_rgba(8,12,65,0.11)] sm:min-h-[340px] ${tone.cardBg} ${tone.cardHoverBorder}`
      )}
      style={{ transitionDelay: cardVisible ? `${index * 80}ms` : "0ms" }}
    >
      <span
        aria-hidden="true"
        className={`absolute inset-x-0 top-0 h-[5px] transition-[height] duration-200 group-hover:h-2 ${tone.topBar}`}
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span
          className={`rounded-sm border bg-white/70 px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em] ${tone.tagText} ${tone.tagBorder}`}
        >
          {item.category}
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
        className={`group mt-6 flex items-center justify-between rounded-lg border px-3.5 py-3 text-xs font-black uppercase tracking-[0.08em] transition-[transform,background-color,color,box-shadow] duration-200 motion-safe:hover:-translate-y-0.5 hover:text-white ${tone.linkBorder} ${tone.linkBg} ${tone.linkText} ${tone.linkHoverBg} ${tone.linkHoverShadow}`}
      >
        {item.linkLabel}
        <span
          aria-hidden="true"
          className="inline-block text-base transition-transform duration-200 motion-safe:group-hover:translate-x-1"
        >
          →
        </span>
      </button>
    </article>
  );
}

function NewsPolicySection() {
  const [headingRef, headingVisible] = useScrollReveal();

  return (
    <section className="bg-[#F7F9FA] px-4 py-12 sm:px-8 lg:px-10 lg:py-16">
      <div className="mx-auto max-w-7xl">
        <div
          ref={headingRef}
          className={revealClasses(
            headingVisible,
            "mb-8 flex flex-col justify-between gap-4 md:flex-row md:items-end"
          )}
        >
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-[#009B35]">
              From the command centre
            </p>
            <h2 className="mt-3 font-['Playfair_Display'] text-4xl font-bold tracking-tight text-[#030454] md:text-5xl">
              News and policy updates
            </h2>
            <p className="mt-3 max-w-xl text-sm leading-7 text-slate-500">
              Updates on climate implementation, evidence publication and policy coordination.
            </p>
          </div>

          <button
            type="button"
            onClick={() => navigateTo("/public/reports")}
            className="w-fit shrink-0 rounded-md border border-[#009B35] px-5 py-3 text-xs font-black uppercase tracking-[0.1em] text-[#009B35] transition-transform duration-200 motion-safe:hover:-translate-y-0.5 hover:bg-[#009B35] hover:text-white"
          >
            View all reports ↗
          </button>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          {publicNewsItems.map((item, index) => (
            <NewsCard key={item.title} item={item} index={index} />
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
  const motionEnabled = useMotionEnabled();
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

          .partners-marquee-track:hover,
          .partners-marquee-track:focus-within {
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

          <h2 className="mt-3 font-['Playfair_Display'] text-4xl font-bold tracking-tight text-[#030454] sm:text-5xl">
            Working together for climate action
          </h2>

          <p className="mx-auto mt-3 max-w-xl text-sm leading-7 text-slate-500">
            Institutional collaboration helps strengthen climate evidence,
            coordination and public accountability.
          </p>

          <div className="mx-auto mt-5 h-[3px] w-28 bg-[#009B35]" />
        </div>

        <div className="overflow-hidden">
          <div
            className="partners-marquee-track flex gap-8"
            style={{ animationPlayState: motionEnabled ? undefined : "paused" }}
          >
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

function HomepageMotionControls({ motionEnabled, onToggleMotion }) {
  function scrollToTop() {
    window.scrollTo({ top: 0, behavior: motionEnabled ? "smooth" : "auto" });
  }

  return (
    <div className="fixed bottom-4 right-4 z-40 flex flex-col items-end gap-2">
      <button
        type="button"
        onClick={scrollToTop}
        aria-label="Back to top"
        className="rounded-full border border-white/35 bg-[#030454] px-4 py-2.5 text-xs font-black uppercase tracking-[0.08em] text-white shadow-[0_7px_20px_rgba(0,0,0,0.2)] transition hover:bg-[#009B35]"
      >
        ↑ Top
      </button>
      <button
        type="button"
        onClick={onToggleMotion}
        aria-pressed={motionEnabled}
        className="rounded-full border border-white/35 bg-[#030454] px-4 py-2.5 text-xs font-black uppercase tracking-[0.08em] text-white shadow-[0_7px_20px_rgba(0,0,0,0.2)] transition hover:bg-[#009B35]"
      >
        Motion: {motionEnabled ? "On" : "Off"}
      </button>
    </div>
  );
}

function PublicPortalPageContent({ motionEnabled, onToggleMotion }) {
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
      <WhyKcccSection />
      {isMilestoneOneDemo && <MilestoneFramingSection />}
      <ErrorNotice message={error} />

      {isLoading ? (
        <section className="px-4 py-14 sm:px-8 lg:px-10">
          <div className="mx-auto max-w-7xl rounded-md border border-[#CAD2D7] bg-white p-8 text-sm text-slate-500 shadow-sm">
            Loading public Climate Impact data...
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
          <ClimateActionPrioritySection />
          <NewsPolicySection />
          <PartnersSection />
          <PublicDataNotice />
        </>
      )}

      <PublicPortalFooter />

      <HomepageMotionControls motionEnabled={motionEnabled} onToggleMotion={onToggleMotion} />
    </main>
  );
}

export default function PublicPortalPage() {
  const [motionEnabled, setMotionEnabled] = useState(
    () => !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  );

  return (
    <MotionProvider value={motionEnabled}>
      <PublicPortalPageContent
        motionEnabled={motionEnabled}
        onToggleMotion={() => setMotionEnabled((current) => !current)}
      />
    </MotionProvider>
  );
}

