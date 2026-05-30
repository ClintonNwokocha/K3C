export function CommandPageHeader({
  eyebrow,
  title,
  description,
  actions,
}) {
  return (
    <section className="rounded-2xl border border-[#CAD2D7] bg-white p-6 shadow-sm">
      <div className="flex flex-col justify-between gap-5 xl:flex-row xl:items-start">
        <div>
          {eyebrow && (
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#2292A4]">
              {eyebrow}
            </p>
          )}

          <h1 className="mt-2 text-3xl font-black tracking-tight text-[#0B1726]">
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
      className={`rounded-2xl border border-[#CAD2D7] bg-white p-6 shadow-sm ${className}`}
    >
      {(eyebrow || title || description || actions) && (
        <div className="mb-5 flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
          <div>
            {eyebrow && (
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#2292A4]">
                {eyebrow}
              </p>
            )}

            {title && (
              <h2 className="mt-2 text-2xl font-black tracking-tight text-[#0B1726]">
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
    default: "border-[#CAD2D7] bg-white",
    navy: "border-[#214560]/30 bg-[#214560]/5",
    blue: "border-[#4E7492]/30 bg-[#4E7492]/8",
    teal: "border-[#2292A4]/30 bg-[#2292A4]/8",
    gold: "border-[#C8A84A]/40 bg-[#C8A84A]/12",
    red: "border-red-200 bg-red-50",
    orange: "border-orange-200 bg-orange-50",
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

      <p className="mt-3 text-2xl font-black text-[#0B1726]">{value}</p>

      {helper && (
        <p className="mt-2 text-sm leading-6 text-slate-600">{helper}</p>
      )}
    </div>
  );
}

export function CommandButton({
  children,
  onClick,
  type = "button",
  variant = "primary",
  disabled = false,
}) {
  const variantClasses = {
    primary:
      "bg-[#2292A4] text-white hover:bg-[#1d7f90] disabled:bg-[#2292A4]/50",
    navy:
      "bg-[#214560] text-white hover:bg-[#19384f] disabled:bg-[#214560]/50",
    gold:
      "bg-[#C8A84A] text-[#0B1726] hover:bg-[#d8b85c] disabled:bg-[#C8A84A]/50",
    outline:
      "border border-[#CAD2D7] bg-white text-[#214560] hover:border-[#2292A4] hover:text-[#2292A4]",
    danger:
      "bg-red-600 text-white hover:bg-red-700 disabled:bg-red-300",
  };

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`rounded-md px-5 py-3 text-xs font-black uppercase tracking-[0.08em] transition disabled:cursor-not-allowed ${
        variantClasses[variant] || variantClasses.primary
      }`}
    >
      {children}
    </button>
  );
}

export function CommandNotice({ title, children, tone = "blue" }) {
  const toneClasses = {
    blue: "border-[#2292A4] bg-[#2292A4]/8 text-[#214560]",
    gold: "border-[#C8A84A] bg-[#C8A84A]/12 text-[#0B1726]",
    red: "border-red-400 bg-red-50 text-red-700",
    grey: "border-[#CAD2D7] bg-[#DFE3E4]/45 text-slate-600",
  };

  return (
    <div
      className={`border-l-4 px-5 py-4 text-sm leading-6 ${
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
    <div className="flex flex-wrap gap-2 rounded-xl border border-[#CAD2D7] bg-white p-2 shadow-sm">
      {tabs.map((tab) => {
        const isActive = activeTab === tab.key;

        return (
          <button
            key={tab.key}
            type="button"
            onClick={() => onChange(tab.key)}
            className={`rounded-lg px-4 py-2 text-xs font-black uppercase tracking-[0.08em] transition ${
              isActive
                ? "bg-[#214560] text-white"
                : "text-slate-500 hover:bg-[#DFE3E4]/60 hover:text-[#214560]"
            }`}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}