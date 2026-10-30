// Shared presentational chart primitives for internal/authenticated
// dashboards. These components never fetch data and never apply
// business/domain logic - callers supply already-resolved values. None of
// the current or planned KPI domains here (counts, MtCO2e, budgets,
// percentages) are legitimately negative, so negative/non-finite values are
// treated as explicitly invalid rather than being coerced to zero, which
// would otherwise silently misrepresent the underlying data.

function isValidNonNegativeNumber(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

// Horizontal bar: label + proportional bar + numeric value. `max` sets the
// 100%-width reference (e.g. a target or the largest value in a group).
export function ChartBarRow({ label, value, max, tone = "accent" }) {
  const toneClasses = {
    accent: "bg-command-navy",
    success: "bg-command-green",
    warning: "bg-command-lime",
    danger: "bg-red-500",
    neutral: "bg-slate-400",
  };

  const hasValidValue = isValidNonNegativeNumber(value);
  const hasValidMax = isValidNonNegativeNumber(max) && max > 0;
  const isUsable = hasValidValue && hasValidMax;

  // Width is clamped to 100% so a value exceeding `max` still renders a
  // full, non-broken bar instead of overflowing its track.
  const widthPercent = isUsable ? Math.min(100, (value / max) * 100) : 0;

  return (
    <div className="flex items-center gap-3">
      <p className="w-32 shrink-0 truncate text-sm font-semibold text-slate-600">
        {label || "—"}
      </p>

      <div
        className="relative h-3 flex-1 overflow-hidden rounded-full bg-slate-100"
        role="img"
        aria-label={`${label || "Value"}: ${
          isUsable ? value : "not available"
        }`}
      >
        {isUsable && (
          <div
            className={`h-full rounded-full ${
              toneClasses[tone] || toneClasses.accent
            }`}
            style={{ width: `${widthPercent}%` }}
          />
        )}
      </div>

      <p className="w-16 shrink-0 text-right text-sm font-bold text-slate-700">
        {isUsable ? value.toLocaleString() : "—"}
      </p>
    </div>
  );
}

// CSS-only donut (conic-gradient) + legend. `data` is an array of
// { label, value, color } segments; proportions are derived from the sum of
// valid (finite, non-negative) values only. Invalid/negative entries are
// excluded from both the gradient and the percentage math rather than
// being treated as zero, which would otherwise understate the total.
export function ChartDonut({ data }) {
  const entries = Array.isArray(data) ? data : [];
  const validEntries = entries.filter((entry) =>
    isValidNonNegativeNumber(entry?.value)
  );
  const total = validEntries.reduce((sum, entry) => sum + entry.value, 0);

  const hasRenderableData = validEntries.length > 0 && total > 0;

  let gradient = "#e2e8f0";

  if (hasRenderableData) {
    let cursor = 0;
    const stops = validEntries.map((entry) => {
      const start = cursor;
      const percent = (entry.value / total) * 100;
      cursor += percent;
      return `${entry.color || "#94a3b8"} ${start}% ${cursor}%`;
    });
    gradient = stops.join(", ");
  }

  return (
    <div className="flex items-center gap-5">
      <div
        className="h-28 w-28 shrink-0 rounded-full"
        style={{
          background: hasRenderableData
            ? `conic-gradient(${gradient})`
            : gradient,
        }}
        role="img"
        aria-label={
          hasRenderableData
            ? validEntries
                .map(
                  (entry) =>
                    `${entry.label}: ${((entry.value / total) * 100).toFixed(
                      0
                    )}%`
                )
                .join(", ")
            : "No data available"
        }
      >
        <div className="flex h-full w-full items-center justify-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white text-xs font-bold text-slate-500">
            {hasRenderableData ? "" : "No data"}
          </div>
        </div>
      </div>

      <ul className="flex flex-col gap-2">
        {entries.length === 0 && (
          <li className="text-sm text-slate-500">No data available.</li>
        )}

        {entries.map((entry, index) => {
          const isEntryValid = isValidNonNegativeNumber(entry?.value);
          const percent =
            isEntryValid && hasRenderableData
              ? ((entry.value / total) * 100).toFixed(0)
              : null;

          return (
            <li
              key={`${entry?.label || "segment"}-${index}`}
              className="flex items-center gap-2 text-sm text-slate-600"
            >
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: entry?.color || "#94a3b8" }}
                aria-hidden="true"
              />
              <span className="font-semibold text-slate-700">
                {entry?.label || "—"}
              </span>
              <span>{percent !== null ? `${percent}%` : "—"}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
