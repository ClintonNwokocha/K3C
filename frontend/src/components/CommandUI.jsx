export function CommandPageHeader({ eyebrow, title, description, actions }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col justify-between gap-5 xl:flex-row xl:items-start">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-[#030454]">
            {title}
          </h1>

          {description && (
            <p className="mt-3 max-w-4xl text-sm leading-7 text-slate-600">
              {description}
            </p>
          )}
        </div>

        {actions && <div className="flex flex-wrap gap-3">{actions}</div>}
      </div>
    </section>
  );
}

export function CommandSection({
  eyebrow,
  title,
  description,
  children,
  actions,
  className = "",
}) {
  return (
    <section
      className={`rounded-2xl border border-slate-200 bg-white p-6 shadow-sm ${className}`}
    >
      {(title || description || actions) && (
        <div className="mb-5 flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
          <div>
            {title && (
              <h2 className="text-2xl font-black tracking-tight text-[#030454]">
                {title}
              </h2>
            )}

            {description && (
              <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-600">
                {description}
              </p>
            )}
          </div>

          {actions && <div className="flex flex-wrap gap-3">{actions}</div>}
        </div>
      )}

      {children}
    </section>
  );
}

export function CommandStatCard({
  label,
  value,
  helper,
  tone = "default",
}) {
  const toneClasses = {
    default: "border-slate-200 bg-white",
    white: "border-slate-200 bg-white",

    blue: "border-[#030454]/15 bg-[#030454]/5",
    navy: "border-[#030454]/15 bg-[#030454]/5",

    green: "border-[#009B35]/20 bg-[#009B35]/8",
    teal: "border-[#009B35]/20 bg-[#009B35]/8",

    yellow: "border-[#F3F74B]/70 bg-[#F3F74B]/25",
    gold: "border-[#F3F74B]/70 bg-[#F3F74B]/25",

    red: "border-red-200 bg-red-50",
    orange: "border-orange-200 bg-orange-50",
    grey: "border-slate-200 bg-slate-50",
  };

  return (
    <div
      className={`rounded-xl border p-5 shadow-sm ${
        toneClasses[tone] || toneClasses.default
      }`}
    >
      <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">
        {label}
      </p>

      <p className="mt-3 text-2xl font-black text-[#030454]">{value}</p>

      {helper && (
        <p className="mt-2 text-sm leading-6 text-slate-600">{helper}</p>
      )}
    </div>
  );
}

// Shared interaction language for every admin action button: subtle lift +
// shadow on hover, settle on press, visible focus-visible ring, motion-safe
// so prefers-reduced-motion keeps the colour/shadow cue but drops the
// transform. Mirrors the public-portal CTA system in PublicPortalChrome.jsx.
const commandCtaTransition =
  "transition-all duration-200 ease-out motion-safe:hover:-translate-y-0.5 motion-safe:active:translate-y-0";
const commandCtaFocus =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2";
const commandCtaDisabled =
  "disabled:cursor-not-allowed disabled:pointer-events-none disabled:shadow-none disabled:translate-y-0";

export function CommandButton({
  children,
  onClick,
  type = "button",
  variant = "primary",
  disabled = false,
  className = "",
}) {
  const variantClasses = {
    primary:
      "bg-[#009B35] text-white shadow-[0_8px_18px_rgba(0,155,53,0.22)] hover:bg-[#00842e] hover:shadow-[0_14px_26px_rgba(0,132,46,0.32)] active:bg-[#00722a] disabled:bg-[#009B35]/50 focus-visible:ring-[#F3F74B] focus-visible:ring-offset-white",

    green:
      "bg-[#009B35] text-white shadow-[0_8px_18px_rgba(0,155,53,0.22)] hover:bg-[#00842e] hover:shadow-[0_14px_26px_rgba(0,132,46,0.32)] active:bg-[#00722a] disabled:bg-[#009B35]/50 focus-visible:ring-[#F3F74B] focus-visible:ring-offset-white",

    blue:
      "bg-[#030454] text-white shadow-[0_8px_18px_rgba(3,4,84,0.2)] hover:bg-[#0B1A78] hover:shadow-[0_14px_26px_rgba(3,4,84,0.3)] active:bg-[#030454] disabled:bg-[#030454]/50 focus-visible:ring-[#F3F74B] focus-visible:ring-offset-white",

    navy:
      "bg-[#030454] text-white shadow-[0_8px_18px_rgba(3,4,84,0.2)] hover:bg-[#0B1A78] hover:shadow-[0_14px_26px_rgba(3,4,84,0.3)] active:bg-[#030454] disabled:bg-[#030454]/50 focus-visible:ring-[#F3F74B] focus-visible:ring-offset-white",

    yellow:
      "bg-[#F3F74B] text-[#030454] shadow-[0_8px_18px_rgba(243,247,75,0.28)] hover:bg-[#E3E730] hover:shadow-[0_14px_26px_rgba(227,231,48,0.36)] active:bg-[#D9DC22] disabled:bg-[#F3F74B]/50 focus-visible:ring-[#030454] focus-visible:ring-offset-white",

    gold:
      "bg-[#F3F74B] text-[#030454] shadow-[0_8px_18px_rgba(243,247,75,0.28)] hover:bg-[#E3E730] hover:shadow-[0_14px_26px_rgba(227,231,48,0.36)] active:bg-[#D9DC22] disabled:bg-[#F3F74B]/50 focus-visible:ring-[#030454] focus-visible:ring-offset-white",

    outline:
      "border border-slate-200 bg-white text-[#030454] hover:border-[#009B35] hover:bg-[#009B35]/5 hover:text-[#009B35] focus-visible:ring-[#009B35] focus-visible:ring-offset-white",

    outlineGreen:
      "border border-[#009B35] bg-white text-[#009B35] hover:bg-[#009B35]/8 focus-visible:ring-[#009B35] focus-visible:ring-offset-white",

    outlineBlue:
      "border border-[#030454] bg-white text-[#030454] hover:bg-[#030454]/6 focus-visible:ring-[#009B35] focus-visible:ring-offset-white",

    danger:
      "bg-red-600 text-white shadow-[0_8px_18px_rgba(220,38,38,0.22)] hover:bg-red-700 hover:shadow-[0_14px_26px_rgba(185,28,28,0.32)] active:bg-red-800 disabled:bg-red-300 focus-visible:ring-red-600 focus-visible:ring-offset-white",
  };

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`rounded-md px-5 py-3 text-xs font-black uppercase tracking-[0.08em] ${commandCtaTransition} ${commandCtaFocus} ${commandCtaDisabled} ${
        variantClasses[variant] || variantClasses.primary
      } ${className}`}
    >
      {children}
    </button>
  );
}

export function CommandNotice({ title, children, tone = "blue" }) {
  const toneClasses = {
    blue: "border-[#030454] bg-[#030454]/5 text-[#030454]",
    navy: "border-[#030454] bg-[#030454]/5 text-[#030454]",

    green: "border-[#009B35] bg-[#009B35]/8 text-[#030454]",
    teal: "border-[#009B35] bg-[#009B35]/8 text-[#030454]",

    yellow: "border-[#F3F74B] bg-[#F3F74B]/25 text-[#030454]",
    gold: "border-[#F3F74B] bg-[#F3F74B]/25 text-[#030454]",

    red: "border-red-400 bg-red-50 text-red-700",
    grey: "border-slate-300 bg-slate-50 text-slate-600",
  };

  return (
    <div
      className={`rounded-r-xl border-l-4 px-5 py-4 text-sm leading-6 ${
        toneClasses[tone] || toneClasses.blue
      }`}
    >
      {title && <p className="font-black">{title}</p>}
      <div className={title ? "mt-1" : ""}>{children}</div>
    </div>
  );
}

export function CommandTabs({ tabs, activeTab, onChange }) {
  return (
    <div className="flex flex-wrap gap-2 rounded-xl border border-slate-200 bg-white p-2 shadow-sm">
      {tabs.map((tab) => {
        const isActive = activeTab === tab.key;

        return (
          <button
            key={tab.key}
            type="button"
            onClick={() => onChange(tab.key)}
            className={`rounded-lg px-4 py-2 text-xs font-black uppercase tracking-[0.08em] transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#009B35] focus-visible:ring-offset-2 ${
              isActive
                ? "bg-[#030454] text-white shadow-sm"
                : "text-slate-500 hover:bg-[#009B35]/8 hover:text-[#009B35]"
            }`}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}