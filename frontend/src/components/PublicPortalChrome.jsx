import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { isMilestoneOneDemo } from "../config/demoMode";

// Shared interaction treatment for every public-facing primary/secondary CTA:
// subtle lift + shadow on hover, settle on press, visible focus-visible ring,
// motion-safe-gated so prefers-reduced-motion drops the transform but keeps
// the colour/shadow change as the non-motion hover cue.
const ctaTransition =
  "transition-all duration-200 ease-out motion-safe:hover:-translate-y-0.5 motion-safe:active:translate-y-0";
const ctaFocus =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2";
const ctaDisabled =
  "disabled:pointer-events-none disabled:opacity-50 disabled:shadow-none disabled:translate-y-0";

function CtaArrow({ size = 16 }) {
  return (
    <ArrowRight
      size={size}
      className="shrink-0 transition-transform duration-200 motion-safe:group-hover:translate-x-1"
      aria-hidden="true"
    />
  );
}
const publicPortalClasses = {
  navy: "#030454",
  green: "#009B35",
  yellow: "#F3F74B",
  maxWidth: "max-w-[1536px]",
  pageX: "px-4 sm:px-8 lg:px-10",
  sectionY: "py-12 lg:py-14",
  cardRadius: "rounded-lg",
  cardBorder: "border border-[#D8DDE2]",
  cardShadow: "shadow-sm",
  mutedText: "text-slate-600",
  heading:
    "text-balance font-['Playfair_Display'] text-3xl font-bold leading-tight text-[#030454] sm:text-4xl",
  body: "text-pretty text-sm leading-7 text-slate-600",
};

const publicNavItems = [
  { key: "home", label: "Home", href: "/public" },
  { key: "climate-intelligence", label: "Climate Intelligence", href: "/public/climate-intelligence" },
  { key: "ghg", label: "GHG Inventory", href: "/public/ghg-inventory" },
  { key: "projects", label: "Projects", href: "/public/projects" },
  { key: "reports", label: "Reports", href: "/public/reports" },
];

// Milestone 1 demo hides GHG/Projects/Reports from nav only — routes and
// components stay intact, see frontend/src/config/demoMode.js.
const MILESTONE1_HIDDEN_NAV_KEYS = new Set(["ghg", "projects", "reports"]);
const visiblePublicNavItems = isMilestoneOneDemo
  ? publicNavItems.filter((item) => !MILESTONE1_HIDDEN_NAV_KEYS.has(item.key))
  : publicNavItems;

const footerExploreItems = [
  { key: "home", label: "Home", href: "/public" },
  {
    key: "climate-intelligence",
    label: "Climate Intelligence",
    href: "/public/climate-intelligence",
  },
  {
    key: "climate-atlas",
    label: "Climate Change Intelligence System",
    href: "/public/climate-atlas",
  },
];

const footerResourceItems = [
  { key: "ghg", label: "GHG Inventory", href: "/public/ghg-inventory" },
  { key: "projects", label: "Projects", href: "/public/projects" },
  { key: "reports", label: "Reports", href: "/public/reports" },
];
const visibleFooterResourceItems = isMilestoneOneDemo
  ? footerResourceItems.filter((item) => !MILESTONE1_HIDDEN_NAV_KEYS.has(item.key))
  : footerResourceItems;

const footerAccessItems = [{ key: "staff-login", label: "Staff Login", href: "/" }];

function FooterNavColumn({ title, items }) {
  if (!items.length) return null;

  return (
    <div className="min-w-[150px] flex-1">
      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-white/35">
        {title}
      </p>

      <ul className="mt-3 space-y-2">
        {items.map((item) => (
          <li key={item.key}>
            <button
              type="button"
              onClick={() => {
                window.location.href = item.href;
              }}
              className="text-white/65 transition-colors duration-200 hover:text-white"
            >
              {item.label}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function PublicNavButton({ label, active, onClick }) {
  const activeClass = "bg-[#F3F74B] text-[#030454]";
  const ghostClass =
    "border border-white/15 text-white/75 hover:border-white/35 hover:bg-white/10 hover:text-white";

  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md px-3.5 py-2 text-[11px] font-black uppercase tracking-[0.1em] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F3F74B]/70 sm:px-4 ${
        active ? activeClass : ghostClass
      }`}
    >
      {label}
    </button>
  );
}

function PublicHeaderBrand({ compact = false }) {
  return (
    <button
      type="button"
      onClick={() => {
        window.location.href = "/public";
      }}
      className="flex w-fit max-w-full items-center gap-3 text-left"
      aria-label="Go to public home"
    >
      <img
        src="/logos/KCCC.png"
        alt="Kaduna Climate Command Centre"
        className={`shrink-0 object-contain ${
          compact ? "h-12 w-12" : "h-12 w-12"
        }`}
      />

      <span className="min-w-0">
        <span className="block text-sm font-black uppercase tracking-[0.08em] text-white">
          Kaduna Climate Command Centre
        </span>
        <span className="block text-xs leading-5 text-white/65">
          Climate Intelligence, Evidence and Reporting Portal
        </span>
      </span>
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
  showHero = true,
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
        <div className="absolute inset-0 bg-[#030454]" />
        <div className="absolute inset-x-0 bottom-0 h-px bg-[#F3F74B]/45" />
      </div>

      <nav className="relative z-10 mx-auto flex max-w-[1536px] flex-col justify-between gap-5 border-b border-white/10 px-4 py-5 sm:px-8 md:flex-row md:items-center lg:px-10">
        <PublicHeaderBrand compact={compact} />

        <div className="flex flex-wrap items-center gap-2.5">
          {visiblePublicNavItems.map((item) => (
            <PublicNavButton
              key={item.key}
              label={item.label}
              active={activePage === item.key}
              onClick={() => {
                window.location.href = item.href;
              }}
            />
          ))}

          <PublicGreenButton
            onClick={() => {
              window.location.href = "/";
            }}
            className="px-4 py-2 text-[11px] focus-visible:ring-offset-[#030454]"
          >
            Staff Login
          </PublicGreenButton>
        </div>
      </nav>

      {showHero && (
        <>
          <section
            className={`relative z-10 mx-auto flex max-w-[1536px] items-center px-4 sm:px-8 lg:px-10 ${
              compact ? "min-h-[220px] py-9" : "min-h-[340px] py-12"
            }`}
          >
            <div className="max-w-5xl">
              {tag && (
                <p className="mb-4 inline-flex rounded-full border border-[#F3F74B]/35 bg-[#F3F74B]/10 px-3 py-1.5 text-xs font-black uppercase tracking-[0.14em] text-[#F3F74B]">
                  {tag}
                </p>
              )}

              <h1 className="max-w-4xl text-balance font-['Playfair_Display'] text-4xl font-black leading-[1.05] tracking-tight text-white sm:text-5xl lg:text-6xl">
                {title}
              </h1>

              {description && (
                <p className="mt-5 max-w-3xl text-pretty text-base font-light leading-8 text-white/80 sm:text-lg">
                  {description}
                </p>
              )}

              {showActions && (
                <div className="mt-7 flex flex-wrap gap-4">
                  <PublicPrimaryButton
                    onClick={() => {
                      if (typeof onPrimaryAction === "function") {
                        onPrimaryAction();
                      }
                    }}
                    className="py-3.5 focus-visible:ring-white/70"
                  >
                    {primaryActionLabel}
                  </PublicPrimaryButton>

                  <PublicSecondaryButton
                    inverse
                    onClick={() => {
                      if (typeof onSecondaryAction === "function") {
                        onSecondaryAction();
                        return;
                      }

                      window.location.href = "/public/reports";
                    }}
                    className="py-3.5"
                  >
                    {secondaryActionLabel}
                  </PublicSecondaryButton>
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
        </>
      )}
    </header>
  );
}

export function PublicSectionIntro({ eyebrow, title, description, centered }) {
  return (
    <PublicSectionHeading
      eyebrow={eyebrow}
      title={title}
      description={description}
      centered={centered}
    />
  );
}

export function PublicSection({
  children,
  className = "bg-white",
  innerClassName = "",
  ...props
}) {
  return (
    <section
      className={`${className} ${publicPortalClasses.pageX} ${publicPortalClasses.sectionY}`}
      {...props}
    >
      <div
        className={`mx-auto ${publicPortalClasses.maxWidth} ${innerClassName}`}
      >
        {children}
      </div>
    </section>
  );
}

export function PublicSectionHeading({
  eyebrow,
  title,
  description,
  centered = false,
  className = "",
}) {
  return (
    <div
      className={`${centered ? "mx-auto max-w-3xl text-center" : ""} ${className}`}
    >
      {eyebrow && (
        <p className="mb-3 text-[11px] font-black uppercase tracking-[0.18em] text-[#009B35]">
          {eyebrow}
        </p>
      )}
      <h2 className={publicPortalClasses.heading}>
        {title}
      </h2>

      {description && (
        <p className={`mt-4 max-w-3xl font-light ${publicPortalClasses.body}`}>
          {description}
        </p>
      )}
    </div>
  );
}

export function PublicCard({
  children,
  className = "",
  as: Component = "div",
}) {
  return (
    <Component
      className={`${publicPortalClasses.cardRadius} ${publicPortalClasses.cardBorder} bg-white ${publicPortalClasses.cardShadow} ${className}`}
    >
      {children}
    </Component>
  );
}

export function PublicBadge({ children, active = false, className = "" }) {
  const toneClass = active
    ? "border-[#009B35]/30 bg-[#009B35]/10 text-[#007a29]"
    : "border-[#D8DDE2] bg-white text-slate-600";

  return (
    <span
      className={`inline-flex w-fit items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-bold ${toneClass} ${className}`}
    >
      {children}
    </span>
  );
}

export function PublicPrimaryButton({
  children,
  className = "",
  as: Component = "button",
  showArrow = false,
  ...props
}) {
  const typeProps = Component === "button" ? { type: "button" } : {};

  return (
    <Component
      {...typeProps}
      className={`group inline-flex items-center justify-center gap-2 rounded-md bg-[#F3F74B] px-6 py-3 text-sm font-black uppercase tracking-[0.08em] text-[#030454] shadow-[0_10px_24px_rgba(243,247,75,0.28)] ${ctaTransition} hover:bg-[#E3E730] hover:shadow-[0_16px_34px_rgba(227,231,48,0.38)] active:bg-[#D9DC22] active:shadow-[0_8px_18px_rgba(217,220,34,0.3)] ${ctaFocus} focus-visible:ring-[#030454] focus-visible:ring-offset-white ${ctaDisabled} ${className}`}
      {...props}
    >
      {children}
      {showArrow && <CtaArrow />}
    </Component>
  );
}

export function PublicNavyButton({
  children,
  className = "",
  as: Component = "button",
  showArrow = false,
  ...props
}) {
  const typeProps = Component === "button" ? { type: "button" } : {};

  return (
    <Component
      {...typeProps}
      className={`group inline-flex items-center justify-center gap-2 rounded-md bg-[#030454] px-5 py-3 text-xs font-black uppercase tracking-[0.1em] text-white shadow-[0_10px_22px_rgba(3,4,84,0.2)] ${ctaTransition} hover:bg-[#0B1A78] hover:shadow-[0_16px_30px_rgba(3,4,84,0.3)] active:bg-[#030454] active:shadow-[0_8px_16px_rgba(3,4,84,0.22)] ${ctaFocus} focus-visible:ring-[#F3F74B] focus-visible:ring-offset-white ${ctaDisabled} ${className}`}
      {...props}
    >
      {children}
      {showArrow && <CtaArrow size={14} />}
    </Component>
  );
}

export function PublicGreenButton({
  children,
  className = "",
  as: Component = "button",
  showArrow = false,
  ...props
}) {
  const typeProps = Component === "button" ? { type: "button" } : {};

  return (
    <Component
      {...typeProps}
      className={`group inline-flex items-center justify-center gap-2 rounded-md bg-[#009B35] px-4 py-2.5 text-xs font-black uppercase tracking-[0.1em] text-white shadow-[0_8px_18px_rgba(0,155,53,0.22)] ${ctaTransition} hover:bg-[#00842E] hover:shadow-[0_14px_26px_rgba(0,132,46,0.32)] active:bg-[#00722A] active:shadow-[0_6px_14px_rgba(0,114,42,0.24)] ${ctaFocus} focus-visible:ring-[#F3F74B] focus-visible:ring-offset-white ${ctaDisabled} ${className}`}
      {...props}
    >
      {children}
      {showArrow && <CtaArrow size={14} />}
    </Component>
  );
}

export function PublicSecondaryButton({
  children,
  className = "",
  inverse = false,
  as: Component = "button",
  showArrow = false,
  ...props
}) {
  const typeProps = Component === "button" ? { type: "button" } : {};
  const toneClass = inverse
    ? "border-white/35 text-white/85 hover:border-white hover:bg-white/10 hover:text-white focus-visible:ring-white focus-visible:ring-offset-[#030454]"
    : "border-[#030454]/25 text-[#030454] hover:border-[#030454]/45 hover:bg-[#030454]/[0.06] focus-visible:ring-[#009B35] focus-visible:ring-offset-white";

  return (
    <Component
      {...typeProps}
      className={`group inline-flex items-center justify-center gap-2 rounded-md border px-6 py-3 text-sm font-black uppercase tracking-[0.08em] ${ctaTransition} ${ctaFocus} ${ctaDisabled} ${toneClass} ${className}`}
      {...props}
    >
      {children}
      {showArrow && <CtaArrow />}
    </Component>
  );
}

export function PublicPortalFooter() {
  return (
    <footer className="bg-[#030454] px-4 py-9 font-['DM_Sans'] text-xs text-white/55 sm:px-8 lg:px-10">
      <div className="mx-auto max-w-[1536px]">
        <div className="grid grid-cols-1 gap-x-10 gap-y-7 sm:max-w-4xl sm:grid-cols-[minmax(220px,1.2fr)_minmax(220px,1.2fr)_minmax(120px,0.6fr)] sm:items-start">
          <div className="max-w-sm">
            <div className="flex items-center gap-3">
              <img
                src="/logos/KCCC.png"
                alt="Kaduna Climate Command Centre"
                className="h-10 w-10 shrink-0 object-contain"
              />

              <p className="text-sm font-black uppercase tracking-[0.08em] text-white">
                Kaduna Climate Command Centre
              </p>
            </div>

            <p className="mt-3 leading-6 text-white/60">
              Public climate evidence, reporting and decision-support portal.
            </p>
          </div>

          <div className="flex flex-wrap gap-x-10 gap-y-7">
            <FooterNavColumn title="Explore" items={footerExploreItems} />
            <FooterNavColumn title="Resources" items={visibleFooterResourceItems} />
          </div>

          <FooterNavColumn title="Access" items={footerAccessItems} />
        </div>

        <div className="mt-7 border-t border-white/10 pt-4">
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-white/35">
            Institutional collaboration
          </p>

          <p className="mt-2 max-w-3xl leading-6 text-white/55">
            In collaboration with Kaduna State Government, MacArthur Foundation,
            and Centre for Policy Research &amp; Development Solutions.
          </p>
        </div>

        <div className="mt-4 border-t border-white/10 pt-4">
          <p className="uppercase tracking-[0.12em]">
            © 2026 Kaduna State Climate Command Centre. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}

export function PublicDataNotice() {
  return null;
}

export function PublicFaqAccordion({
  title = "About the data",
  items,
  className = "bg-white px-4 pb-14 sm:px-8 lg:px-10",
  containerClassName = "mx-auto max-w-4xl",
}) {
  const [openItems, setOpenItems] = useState([]);

  function toggleItem(itemTitle) {
    setOpenItems((current) =>
      current.includes(itemTitle)
        ? current.filter((item) => item !== itemTitle)
        : [...current, itemTitle]
    );
  }

  return (
    <section className={className}>
      <div className={containerClassName}>
        <h2 className="font-['Playfair_Display'] text-3xl font-bold text-[#030454]">
          {title}
        </h2>

        <div className="mt-6 divide-y divide-[#D8DDE2] overflow-hidden rounded-lg border border-[#D8DDE2] bg-white shadow-sm">
          {items.map((item) => {
            const isOpen = openItems.includes(item.title);

            return (
              <div key={item.title}>
                <button
                  type="button"
                  onClick={() => toggleItem(item.title)}
                  aria-expanded={isOpen}
                  className="flex w-full items-center justify-between gap-6 px-5 py-5 text-left outline-none transition hover:bg-[#F7F9FA] focus-visible:ring-2 focus-visible:ring-[#009B35]/40"
                >
                  <span className="font-bold text-[#030454]">
                    {item.title}
                  </span>

                  <span className="text-xl font-black text-[#009B35]">
                    {isOpen ? "\u2212" : "+"}
                  </span>
                </button>

                {isOpen && (
                  <div className="px-5 pb-5 text-sm leading-7 text-slate-600">
                    {item.body}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export function PublicDisclaimerNote({
  children,
  className = "mt-6",
  toneClassName = "bg-[#F3F74B]/25",
}) {
  return (
    <div
      className={`${className} rounded-lg border border-[#F3F74B]/70 ${toneClassName} px-5 py-4 text-sm leading-7 text-[#030454]`}
    >
      {children}
    </div>
  );
}

export function PublicLoadingState({
  message,
  className = "px-4 py-16 sm:px-8 lg:px-10",
  maxWidthClassName = "max-w-[1536px]",
}) {
  return (
    <section className={className}>
      <PublicCard
        className={`mx-auto ${maxWidthClassName} p-8 text-sm text-slate-500`}
      >
        {message}
      </PublicCard>
    </section>
  );
}

export function PublicErrorBanner({ message, maxWidthClassName = "max-w-[1536px]" }) {
  if (!message) return null;

  return (
    <section className="px-4 py-4 sm:px-8 lg:px-10">
      <div
        className={`mx-auto ${maxWidthClassName} rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-700`}
      >
        {message}
      </div>
    </section>
  );
}

export function PublicEmptyState({ title, message }) {
  return (
    <PublicCard className="border-dashed border-slate-300 p-6 text-sm text-slate-500">
      <p className="font-bold text-[#030454]">{title}</p>
      <p className="mt-2 leading-6">{message}</p>
    </PublicCard>
  );
}
