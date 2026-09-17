import L from "leaflet";
import { useEffect, useMemo, useRef, useState } from "react";
import { GeoJSON, MapContainer, TileLayer, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FilterX,
  Info,
} from "lucide-react";
import {
  PublicBadge,
  PublicCard,
  PublicEmptyState,
  PublicErrorBanner,
  PublicFaqAccordion,
  PublicLoadingState,
  PublicPortalFooter,
  PublicPortalHeader,
  PublicSecondaryButton,
  PublicSection,
} from "../components/PublicPortalChrome";
import { getPublicGHGInventory, getPublicPortalSummary } from "../services/api";

const ALL = "all";
const KADUNA_CENTER = [10.45, 7.75];
const KADUNA_ZOOM = 7;
const NIGERIA_MAX_BOUNDS = [
  [4.0, 2.5],
  [14.5, 15.0],
];
const GHG_MAP_MIN_ZOOM = 5;
const GHG_MAP_MAX_ZOOM = 12;

const aboutDataItems = [
  {
    title: "What the inventory represents",
    body:
      "This explorer shows approved KCCC greenhouse gas inventory entries returned by the public backend. It is a public summary view of approved records, not a replacement for a formal inventory report.",
  },
  {
    title: "Unit and rounding",
    body:
      "Emissions are displayed in tonnes of carbon dioxide equivalent (tCO2e). Values are rounded for display only; filters and totals use the underlying API values.",
  },
  {
    title: "Methodology and proper use",
    body:
      "tCO2e means tonnes of carbon dioxide equivalent, a common unit for comparing greenhouse gases. Public explorer data supports awareness and planning; formal reporting should rely on approved methodology reports and validated datasets.",
  },
  {
    title: "Official versus modelled status",
    body:
      "Approved GHG inventory entries are labelled as official inventory values. NDC constants, baseline references, and expected project reductions are modelled or planning estimates unless separately published as official inventory values.",
  },
  {
    title: "Project reductions are separate",
    body:
      "Expected project reductions are not inventory emissions and are not added to published inventory totals. They describe planned mitigation outcomes in project records.",
  },
  {
    title: "Known limitations",
    body:
      "The current public inventory data is state-level and entry-based. Only a small subset of approved entries has LGA links, so a complete geographic GHG inventory map is not available.",
  },
];

function hasNumber(value) {
  return (
    value !== null &&
    value !== undefined &&
    value !== "" &&
    Number.isFinite(Number(value))
  );
}

function formatNumber(value, maximumFractionDigits = 2) {
  if (!hasNumber(value)) return "Not yet published";

  return Number(value).toLocaleString(undefined, {
    maximumFractionDigits,
  });
}

function formatDate(value) {
  if (!value) return "Not yet published";

  return new Date(value).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function getOptionLabel(options, value) {
  return (
    options.find((option) => String(option.value) === String(value))?.label ||
    value
  );
}

function uniqueOptions(options) {
  const seen = new Set();

  return options.filter((option) => {
    const key = String(option.value);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function FilterField({ id, label, value, onChange, options, disabled = false }) {
  return (
    <label htmlFor={id} className="block">
      <span className="mb-2 block text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">
        {label}
      </span>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        className="h-11 w-full rounded-md border border-[#D8DDE2] bg-white px-3 text-sm font-bold text-[#030454] outline-none transition disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400 focus:border-[#009B35] focus:ring-2 focus:ring-[#009B35]/15"
      >
        {options.map((option) => (
          <option
            key={`${id}-${option.value}`}
            value={option.value}
            disabled={option.disabled}
          >
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function YearSelectField({ id, label, prefix, value, onChange, options }) {
  return (
    <label htmlFor={id} className="block min-w-0">
      <span className="mb-2 block text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">
        {label}
      </span>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-11 w-full rounded-md border border-[#D8DDE2] bg-white px-3 text-sm font-bold text-[#030454] outline-none transition focus:border-[#009B35] focus:ring-2 focus:ring-[#009B35]/15"
      >
        {options.map((option) => (
          <option key={`${id}-${option.value}`} value={option.value}>
            {prefix} {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function getYearSpanLabel(years = []) {
  if (years.length === 0) return "selected period";
  if (years.length === 1) return String(years[0]);

  return `${years[0]}-${years[years.length - 1]}`;
}

function getBreakoutLabel(chart, filters) {
  if (chart?.breakout === "gas") return "Greenhouse Gas";
  if (chart?.breakout === "category") return "Category";
  if (chart?.breakout === "sector") return "Sector";

  return readableTitle(filters.breakout || "Sector");
}

function readableTitle(value) {
  return String(value || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function getChartTitle(filters, chart) {
  return `GHG Emissions by ${getBreakoutLabel(chart, filters)}`;
}

function getChartMetadataLine(chart, filters, optionLabels) {
  return [
    `Geography: ${optionLabels.geography || "All geographies"}`,
    `Reporting period: ${getYearSpanLabel(chart?.years || [])}`,
    `Breakout: ${getBreakoutLabel(chart, filters)}`,
  ].join(" | ");
}

function getSeriesColor(index) {
  const colors = [
    "#009B35",
    "#030454",
    "#55A3A1",
    "#8A6D1D",
    "#7B5AA6",
    "#D56B32",
    "#3F7E44",
    "#5B7083",
    "#B2456E",
    "#5472D3",
  ];

  return colors[index % colors.length];
}

function buildStackedSeries(chart, visibleKeys = null) {
  const years = chart?.years || [];
  const series = chart?.series || [];
  const stackByYear = new Map(years.map((year) => [Number(year), 0]));
  const visibleSet = visibleKeys ? new Set(visibleKeys) : null;

  return series.map((seriesRow, seriesIndex) => ({
    ...seriesRow,
    color: getSeriesColor(seriesIndex),
  })).filter((seriesRow) => !visibleSet || visibleSet.has(seriesRow.key)).map((seriesRow) => {
    const points = (seriesRow.values || []).map((point) => {
      const year = Number(point.year);
      const value = hasNumber(point.value) ? Number(point.value) : null;
      const lower = stackByYear.get(year) || 0;

      if (value === null) {
        return { year, value: null, lower: null, upper: null };
      }

      const upper = lower + value;
      stackByYear.set(year, upper);

      return { year, value, lower, upper };
    });

    return {
      ...seriesRow,
      points,
    };
  });
}

function buildCurveCommands(coords, firstCommand = "M") {
  if (coords.length === 0) return "";
  if (coords.length < 3) {
    return coords
      .map((point, index) => {
        const command = index === 0 ? firstCommand : "L";
        return `${command} ${point.x} ${point.y}`;
      })
      .join(" ");
  }

  return coords
    .map((point, index) => {
      if (index === 0) return `${firstCommand} ${point.x} ${point.y}`;

      const previous = coords[index - 1];
      const dx = point.x - previous.x;
      return `C ${previous.x + dx / 2} ${previous.y} ${point.x - dx / 2} ${point.y} ${point.x} ${point.y}`;
    })
    .join(" ");
}

function buildAreaPath(points, yForValue, xForYear) {
  const validPoints = points.filter(
    (point) => point.value !== null && point.lower !== null && point.upper !== null
  );

  if (validPoints.length < 2) return "";

  const upperCoords = validPoints.map((point) => ({
    x: xForYear(point.year),
    y: yForValue(point.upper),
  }));
  const lowerCoords = [...validPoints].reverse().map((point) => ({
    x: xForYear(point.year),
    y: yForValue(point.lower),
  }));
  const upperPath = buildCurveCommands(upperCoords);
  const lowerPath = buildCurveCommands(lowerCoords, "L");

  return `${upperPath} ${lowerPath} Z`;
}

function buildBoundaryPath(points, yForValue, xForYear) {
  const validPoints = points.filter(
    (point) => point.value !== null && point.upper !== null
  );

  if (validPoints.length < 2) return "";

  return buildCurveCommands(
    validPoints.map((point) => ({
      x: xForYear(point.year),
      y: yForValue(point.upper),
    }))
  );
}

function getSeriesPoint(seriesRow, year) {
  return seriesRow.points.find((item) => Number(item.year) === Number(year));
}

function getSeriesRowsAtYear(series, year) {
  return series
    .map((seriesRow) => ({
      key: seriesRow.key,
      label: seriesRow.label,
      color: seriesRow.color,
      point: getSeriesPoint(seriesRow, year),
    }))
    .filter(({ point }) => point?.value !== null);
}

function getVisibleYearTotal(series, year) {
  const values = series
    .map((seriesRow) => getSeriesPoint(seriesRow, year)?.value)
    .filter((value) => hasNumber(value))
    .map(Number);

  if (values.length === 0) return null;

  return values.reduce((sum, value) => sum + value, 0);
}

function nearestYearFromX(years, x, xForYear) {
  if (years.length === 0) return null;

  return years.reduce((closest, year) => {
    const distance = Math.abs(xForYear(year) - x);
    const closestDistance = Math.abs(xForYear(closest) - x);
    return distance < closestDistance ? year : closest;
  }, years[0]);
}

function normalizeMapName(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/’/g, "'")
    .replace(/`/g, "'")
    .replace(/-/g, " ")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getFeatureName(feature) {
  const properties = feature?.properties || {};
  return (
    properties.lganame ||
    properties.lga_name ||
    properties.LGA_NAME ||
    properties.LGANAME ||
    properties.ADM2_NAME ||
    properties.NAME_2 ||
    properties.NAME ||
    properties.name ||
    "Unnamed LGA"
  );
}

function StackedAreaChart({ chart, visibleKeys }) {
  const series = useMemo(() => buildStackedSeries(chart, visibleKeys), [chart, visibleKeys]);
  const [tooltip, setTooltip] = useState(null);
  const frameRef = useRef(null);
  const pendingPointerRef = useRef(null);
  const years = useMemo(() => chart?.years || [], [chart]);
  const totals = useMemo(
    () => years.map((year) => ({ year, value: getVisibleYearTotal(series, year) })),
    [series, years]
  );

  useEffect(() => () => {
    if (frameRef.current) cancelAnimationFrame(frameRef.current);
  }, []);

  if (series.length === 0) {
    return (
      <PublicEmptyState
        title="No approved public inventory record is available for this combination of period, sector, category, gas and geography."
        message="Change one or more filters to view available inventory records."
      />
    );
  }

  const totalValues = totals
    .map((row) => row.value)
    .filter((value) => hasNumber(value))
    .map(Number);
  const maxValue = Math.max(...totalValues, 1);
  const width = 760;
  const height = 520;
  const margin = { top: 28, right: 26, bottom: 54, left: 82 };
  const chartWidth = width - margin.left - margin.right;
  const chartHeight = height - margin.top - margin.bottom;
  const xForYear = (year) => {
    const index = years.findIndex((item) => Number(item) === Number(year));
    if (years.length <= 1) return margin.left + chartWidth / 2;

    return margin.left + (index / (years.length - 1)) * chartWidth;
  };
  const yForValue = (value) =>
    margin.top + chartHeight - (Number(value || 0) / maxValue) * chartHeight;
  const singleYear = years.length <= 1 || totalValues.length <= 1;

  if (singleYear) {
    const year = years[0] || "Selected year";
    const singleYearTotal = series.reduce(
      (sum, seriesRow) => sum + Number(seriesRow.points[0]?.value || 0),
      0
    );

    return (
      <div className="min-w-0">
        <div
          className="flex min-h-[340px] flex-col items-center justify-center gap-6 rounded-lg border border-[#E6EAEC] bg-[#F7F9FA] p-5 sm:flex-row"
          role="img"
          aria-label={`Single-year emissions composition for ${year}`}
        >
          <div className="flex h-72 w-32 flex-col-reverse overflow-hidden rounded-md border border-white bg-white shadow-sm">
            {series.map((seriesRow, index) => {
              const value = seriesRow.points[0]?.value;
              const heightPct = maxValue > 0 ? (Number(value || 0) / maxValue) * 100 : 0;

              return (
                <div
                  key={seriesRow.key}
                  className="min-h-[2px]"
                  style={{
                    height: `${heightPct}%`,
                    backgroundColor: getSeriesColor(index),
                  }}
                  aria-label={`${year}, ${seriesRow.label}: ${formatNumber(value, 2)} tCO2e. Gross total: ${formatNumber(singleYearTotal, 2)} tCO2e.`}
                />
              );
            })}
          </div>
          <div className="max-w-xs text-center text-sm leading-6 text-slate-600 sm:text-left">
            <p className="text-2xl font-black text-[#030454]">{year}</p>
            <p className="mt-1 font-mono text-xl font-black text-[#009B35]">
              {formatNumber(singleYearTotal, 2)} tCO2e
            </p>
            <p className="mt-2 max-w-sm">
              Trend analysis requires at least two reporting years.
            </p>
          </div>
        </div>
      </div>
    );
  }

  function shouldShowYearLabel(year, index) {
    return index === 0 || index === years.length - 1 || Number(year) % 5 === 0;
  }

  function buildTooltipState({ year, svgX, svgY, clientX, clientY, svgElement }) {
    const selectedYear = nearestYearFromX(years, svgX, xForYear);
    if (!selectedYear) return null;

    const yearTotal = getVisibleYearTotal(series, selectedYear);
    const seriesAtYear = getSeriesRowsAtYear(series, selectedYear);
    const active = seriesAtYear.find(({ point }) => {
      const upperY = yForValue(point.upper);
      const lowerY = yForValue(point.lower);
      return svgY >= upperY - 3 && svgY <= lowerY + 3;
    });
    const svgBounds = svgElement.getBoundingClientRect();
    const wrapperBounds = svgElement.parentElement.getBoundingClientRect();
    const tooltipWidth = 270;
    const tooltipHeight = active ? 128 : Math.min(300, 112 + seriesAtYear.length * 24);
    const pointerX = clientX - wrapperBounds.left;
    const pointerY = clientY - wrapperBounds.top;
    const isCompact = wrapperBounds.width < 560;
    const preferredRight = pointerX + 18;
    const preferredLeft = pointerX - tooltipWidth - 18;
    const x = isCompact
      ? Math.max(10, Math.min(wrapperBounds.width - tooltipWidth - 10, wrapperBounds.width / 2 - tooltipWidth / 2))
      : Math.max(
          10,
          Math.min(
            wrapperBounds.width - tooltipWidth - 10,
            preferredRight + tooltipWidth <= wrapperBounds.width - 10
              ? preferredRight
              : preferredLeft
          )
        );
    const y = isCompact
      ? svgBounds.height + 12
      : Math.max(12, Math.min(pointerY - tooltipHeight / 2, wrapperBounds.height - tooltipHeight - 12));

    return {
      year: year || selectedYear,
      selectedYear,
      activeKey: active?.key || null,
      label: active?.label || "",
      value: active?.point?.value,
      total: yearTotal,
      rows: seriesAtYear.map(({ key, label, color, point }) => ({
        key,
        label,
        color,
        value: point.value,
      })),
      x,
      y,
      compact: isCompact,
      showBreakdown: !active,
    };
  }

  function handlePointerMove(event) {
    const svg = event.currentTarget.ownerSVGElement;
    const bounds = svg.getBoundingClientRect();
    const svgX = ((event.clientX - bounds.left) / bounds.width) * width;
    const svgY = ((event.clientY - bounds.top) / bounds.height) * height;

    pendingPointerRef.current = {
        svgX: Math.min(Math.max(svgX, margin.left), width - margin.right),
        svgY: Math.min(Math.max(svgY, margin.top), height - margin.bottom),
        clientX: event.clientX,
        clientY: event.clientY,
        svgElement: svg,
    };

    if (frameRef.current) return;

    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null;
      if (!pendingPointerRef.current) return;
      setTooltip(buildTooltipState(pendingPointerRef.current));
    });
  }

  function handleKeyboard(event) {
    const currentIndex = Math.max(
      0,
      years.findIndex((year) => Number(year) === Number(tooltip?.selectedYear))
    );
    let nextIndex = currentIndex;

    if (event.key === "ArrowRight") nextIndex = Math.min(years.length - 1, currentIndex + 1);
    if (event.key === "ArrowLeft") nextIndex = Math.max(0, currentIndex - 1);
    if (event.key === "Escape") {
      setTooltip(null);
      return;
    }
    if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;

    event.preventDefault();

    const year = years[nextIndex];
    const selectedSeries = series
      .map((seriesRow) => ({
        key: seriesRow.key,
        label: seriesRow.label,
        color: seriesRow.color,
        point: getSeriesPoint(seriesRow, year),
      }))
      .filter(({ point }) => point?.value !== null);

    setTooltip({
      year,
      selectedYear: year,
      activeKey: null,
      label: "",
      value: null,
      total: getVisibleYearTotal(series, year),
      rows: selectedSeries.map(({ key, label, color, point }) => ({
        key,
        label,
        color,
        value: point.value,
      })),
      x: xForYear(year),
      y: margin.top + 96,
      compact: false,
      showBreakdown: true,
    });
  }

  const displayedTooltip =
    tooltip?.activeKey && !series.some((seriesRow) => seriesRow.key === tooltip.activeKey)
      ? {
          ...tooltip,
          activeKey: null,
          label: "",
          value: null,
          total: getVisibleYearTotal(series, tooltip.selectedYear),
          rows: getSeriesRowsAtYear(series, tooltip.selectedYear).map(
            ({ key, label, color, point }) => ({
              key,
              label,
              color,
              value: point.value,
            })
          ),
          showBreakdown: true,
        }
      : tooltip;
  const activeYear = displayedTooltip?.selectedYear;
  const activeX = activeYear ? xForYear(activeYear) : null;

  return (
    <div
      className="relative min-w-0"
      onMouseLeave={() => setTooltip(null)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setTooltip(null);
        }
      }}
    >
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Stacked area chart of approved public GHG emissions by year"
        className="h-[460px] w-full max-w-full rounded-lg border border-[#E6EAEC] bg-[#F7F9FA] outline-none transition focus:ring-2 focus:ring-[#009B35]/25 motion-reduce:transition-none"
        tabIndex="0"
        onKeyDown={handleKeyboard}
        onFocus={() => {
          if (tooltip || years.length === 0) return;
          const year = years[0];
          const selectedSeries = series
            .map((seriesRow) => ({
              key: seriesRow.key,
              label: seriesRow.label,
              color: seriesRow.color,
              point: getSeriesPoint(seriesRow, year),
            }))
            .filter(({ point }) => point?.value !== null);
          setTooltip({
            year,
            selectedYear: year,
            activeKey: null,
            label: "",
            value: null,
            total: getVisibleYearTotal(series, year),
            rows: selectedSeries.map(({ key, label, color, point }) => ({
              key,
              label,
              color,
              value: point.value,
            })),
            x: xForYear(year),
            y: margin.top + 96,
            compact: false,
            showBreakdown: true,
          });
        }}
      >
        <style>
          {`
            .ghg-chart-motion {
              transition: d 300ms ease-out, opacity 300ms ease-out, transform 300ms ease-out;
            }
            @media (prefers-reduced-motion: reduce) {
              .ghg-chart-motion {
                transition: none;
              }
            }
          `}
        </style>
        {[0, 0.25, 0.5, 0.75, 1].map((tick) => {
          const value = maxValue * tick;
          const y = yForValue(value);
          return (
            <g key={tick}>
              <line
                x1={margin.left}
                x2={width - margin.right}
                y1={y}
                y2={y}
                stroke="#D8DDE2"
                strokeDasharray={tick === 0 ? "" : "4 4"}
              />
              <text
                x={margin.left - 12}
                y={y + 4}
                textAnchor="end"
                className="fill-slate-500 text-[11px] font-bold"
              >
                {formatNumber(value, 0)}
              </text>
            </g>
          );
        })}

        {series.map((seriesRow) => {
          const areaPath = buildAreaPath(seriesRow.points, yForValue, xForYear);
          if (!areaPath) return null;

          return (
            <path
              key={seriesRow.key}
              d={areaPath}
              className="ghg-chart-motion"
              fill={seriesRow.color}
              fillOpacity={
                displayedTooltip?.activeKey && displayedTooltip.activeKey !== seriesRow.key
                  ? "0.48"
                  : "0.78"
              }
              stroke="rgba(255,255,255,0.78)"
              strokeWidth="1.4"
              strokeLinejoin="round"
            />
          );
        })}

        {series.map((seriesRow) => {
          const boundaryPath = buildBoundaryPath(seriesRow.points, yForValue, xForYear);
          if (!boundaryPath) return null;

          return (
            <path
              key={`${seriesRow.key}-boundary`}
              d={boundaryPath}
              className="ghg-chart-motion"
              fill="none"
              stroke={seriesRow.color}
              strokeOpacity="0.95"
              strokeWidth="1.6"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          );
        })}

        {activeYear ? (
          <g pointerEvents="none">
            <line
              x1={activeX}
              x2={activeX}
              y1={margin.top}
              y2={height - margin.bottom}
              stroke="#030454"
              strokeOpacity="0.32"
              strokeWidth="1.4"
              aria-hidden="true"
            />
            {series.map((seriesRow) => {
              const point = getSeriesPoint(seriesRow, activeYear);
              if (!point || point.value === null) return null;

              return (
                <circle
                  key={`${seriesRow.key}-${activeYear}-marker`}
                  cx={activeX}
                  cy={yForValue(point.upper)}
                  r={displayedTooltip?.activeKey === seriesRow.key ? "5" : "4"}
                  className="ghg-chart-motion"
                  fill="#fff"
                  stroke={seriesRow.color}
                  strokeWidth={displayedTooltip?.activeKey === seriesRow.key ? "2.6" : "1.8"}
                />
              );
            })}
          </g>
        ) : null}

        <rect
          x={margin.left}
          y={margin.top}
          width={chartWidth}
          height={chartHeight}
          fill="transparent"
          onMouseMove={handlePointerMove}
          onPointerMove={handlePointerMove}
          onMouseLeave={() => setTooltip(null)}
        />

        {years.map((year, index) => (
          <g key={year}>
            <line
              x1={xForYear(year)}
              x2={xForYear(year)}
              y1={height - margin.bottom}
              y2={height - margin.bottom + 6}
              stroke="#5B6472"
            />
            {shouldShowYearLabel(year, index) ? (
              <text
                x={xForYear(year)}
                y={height - 20}
                textAnchor="middle"
                className="fill-slate-600 text-[12px] font-black"
              >
                {year}
              </text>
            ) : null}
          </g>
        ))}
        <text
          x={20}
          y={margin.top + chartHeight / 2}
          transform={`rotate(-90 20 ${margin.top + chartHeight / 2})`}
          textAnchor="middle"
          className="fill-slate-600 text-[11px] font-black uppercase"
        >
          tCO2e
        </text>
      </svg>
      {displayedTooltip ? (
        <div
          className="pointer-events-none absolute z-20 w-[270px] rounded-md border border-[#D8DDE2] bg-white px-3 py-2 text-xs leading-5 text-slate-600 shadow-lg"
          style={{
            left: displayedTooltip.x,
            top: displayedTooltip.y,
          }}
          role="status"
          aria-live="polite"
        >
          <p className="font-black text-[#030454]">{displayedTooltip.year}</p>
          {displayedTooltip.showBreakdown ? (
            <div className="mt-1 space-y-1">
              {displayedTooltip.rows.map((row) => (
                <p key={row.key} className="flex justify-between gap-3">
                  <span className="inline-flex min-w-0 items-center gap-2 font-bold text-[#030454]">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-sm"
                      style={{ backgroundColor: row.color }}
                      aria-hidden="true"
                    />
                    <span className="truncate">{row.label}</span>
                  </span>
                  <span className="shrink-0 font-mono">
                    {formatNumber(row.value, 2)} tCO2e
                  </span>
                </p>
              ))}
            </div>
          ) : (
            <p>
              <span className="font-bold text-[#030454]">{tooltip.label}</span>
              {": "}
              {formatNumber(displayedTooltip.value, 2)} tCO2e
            </p>
          )}
          <p>Gross total: {formatNumber(displayedTooltip.total, 2)} tCO2e</p>
          <p className="sr-only">Unit: tCO2e</p>
        </div>
      ) : null}
    </div>
  );
}

function ChartLegend({ chart, visibleKeys, onToggleSeries, onShowAll }) {
  const series = chart?.series || [];
  const visibleSet = new Set(visibleKeys || []);
  const hasHiddenSeries = series.some((seriesRow) => !visibleSet.has(seriesRow.key));

  if (series.length === 0) return null;

  return (
    <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
      <ul
        className="flex flex-wrap gap-x-3 gap-y-2"
        aria-label="Toggle visible chart series"
      >
        {series.map((seriesRow, index) => {
          const isVisible = visibleSet.has(seriesRow.key);
          const isOnlyVisible = isVisible && visibleKeys.length <= 1;

          return (
            <li key={seriesRow.key} className="inline-flex max-w-full">
              <button
                type="button"
                onClick={() => onToggleSeries(seriesRow.key)}
                disabled={isOnlyVisible}
                aria-pressed={isVisible}
                className={`inline-flex max-w-full items-center gap-2 rounded-md border px-2.5 py-1.5 text-left font-bold transition focus:outline-none focus:ring-2 focus:ring-[#009B35]/25 motion-reduce:transition-none ${
                  isVisible
                    ? "border-[#D8DDE2] bg-white text-[#030454]"
                    : "border-[#E6EAEC] bg-[#F7F9FA] text-slate-500 opacity-65"
                } ${isOnlyVisible ? "cursor-not-allowed" : "hover:border-[#009B35]/45"}`}
              >
                <span
                  className="h-3 w-3 shrink-0 rounded-sm"
                  style={{
                    backgroundColor: getSeriesColor(index),
                    opacity: isVisible ? 1 : 0.35,
                  }}
                  aria-hidden="true"
                />
                <span className="truncate">{seriesRow.label}</span>
                <span className="sr-only">
                  {isVisible ? "visible" : "hidden"}
                  {isOnlyVisible ? ". At least one series must remain visible." : ""}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {hasHiddenSeries ? (
        <button
          type="button"
          onClick={onShowAll}
          className="rounded-md border border-[#D8DDE2] bg-white px-2.5 py-1.5 text-xs font-black text-[#030454] transition hover:border-[#009B35]/45 focus:outline-none focus:ring-2 focus:ring-[#009B35]/25 motion-reduce:transition-none"
        >
          Show all
        </button>
      ) : null}
    </div>
  );
}

function getRawSeriesValue(seriesRow, year) {
  return (seriesRow.values || []).find(
    (point) => Number(point.year) === Number(year)
  )?.value;
}

function calculateChangeRows(chart, visibleKeys) {
  const years = chart?.years || [];
  if (years.length <= 1) {
    return { periodLabel: years[0] ? String(years[0]) : "Selected year", rows: [], gross: null };
  }

  const startYear = years[0];
  const endYear = years[years.length - 1];
  const visibleSet = new Set(visibleKeys || []);
  const rows = (chart?.series || [])
    .map((seriesRow, index) => ({
      ...seriesRow,
      color: getSeriesColor(index),
    }))
    .filter((seriesRow) => visibleSet.has(seriesRow.key))
    .map((seriesRow) => {
      const startValue = getRawSeriesValue(seriesRow, startYear);
      const endValue = getRawSeriesValue(seriesRow, endYear);
      const canCalculate = hasNumber(startValue) && hasNumber(endValue) && Number(startValue) > 0;
      const percent = canCalculate
        ? ((Number(endValue) - Number(startValue)) / Number(startValue)) * 100
        : null;

      return {
        key: seriesRow.key,
        label: seriesRow.label,
        color: seriesRow.color,
        percent,
        startValue: hasNumber(startValue) ? Number(startValue) : null,
        endValue: hasNumber(endValue) ? Number(endValue) : null,
      };
    });

  const allGrossBoundariesAvailable = rows.length > 0 && rows.every(
    (row) => hasNumber(row.startValue) && hasNumber(row.endValue)
  );
  const grossStart = allGrossBoundariesAvailable
    ? rows.reduce((sum, row) => sum + row.startValue, 0)
    : null;
  const grossEnd = allGrossBoundariesAvailable
    ? rows.reduce((sum, row) => sum + row.endValue, 0)
    : null;
  const gross = hasNumber(grossStart) && grossStart > 0 && hasNumber(grossEnd)
    ? ((grossEnd - grossStart) / grossStart) * 100
    : null;

  return {
    periodLabel: `${startYear} to ${endYear}`,
    rows,
    gross,
  };
}

function formatChangeSymbol(percent) {
  if (!hasNumber(percent)) return "N/A";
  if (Math.abs(Number(percent)) < 0.05) return `\u2192 ${formatNumber(0, 1)}%`;
  if (Number(percent) > 0) return `\u2191 ${formatNumber(percent, 1)}%`;
  return `\u2193 ${formatNumber(Math.abs(percent), 1)}%`;
}

function ChangePanel({ chart, visibleKeys }) {
  const change = useMemo(
    () => calculateChangeRows(chart, visibleKeys),
    [chart, visibleKeys]
  );
  const isSingleYear = (chart?.years || []).length <= 1;

  return (
    <PublicCard className="p-5">
      <h3 className="text-lg font-black text-[#030454]">
        Change over selected period
      </h3>
      <p className="mt-1 text-xs font-bold uppercase tracking-[0.08em] text-slate-500">
        {change.periodLabel}
      </p>
      {isSingleYear ? (
        <p className="mt-4 rounded-md border border-[#E6EAEC] bg-[#F7F9FA] p-3 text-sm leading-6 text-slate-600">
          Percent change is not available for a single reporting year.
        </p>
      ) : (
        <div className="mt-4 rounded-md border border-[#E6EAEC] bg-[#F7F9FA] p-3">
          <p className="text-xs font-black uppercase tracking-[0.12em] text-slate-500">
            Percent change
          </p>
          {change.rows.length > 0 ? (
            <div className="mt-3 space-y-2">
              {change.rows.map((row) => (
                <p
                  key={row.key}
                  className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-3 text-sm"
                >
                  <span className="min-w-0 font-black" style={{ color: row.color }}>
                    {row.label}
                  </span>
                  <span className="font-mono font-black text-[#030454]">
                    {formatChangeSymbol(row.percent)}
                  </span>
                </p>
              ))}
              <div className="border-t border-[#D8DDE2] pt-3">
                <p className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-3 text-sm">
                  <span className="font-black text-[#030454]">Gross total</span>
                  <span className="font-mono font-black text-[#030454]">
                    {formatChangeSymbol(change.gross)}
                  </span>
                </p>
              </div>
            </div>
          ) : (
            <p className="mt-3 text-sm leading-6 text-slate-600">
              N/A
            </p>
          )}
        </div>
      )}
    </PublicCard>
  );
}

function describeComposition(chart, visibleKeys) {
  const years = chart?.years || [];
  const year = years[years.length - 1];
  const visibleSet = new Set(visibleKeys || []);
  const series = chart?.series || [];

  const rows = series
    .map((seriesRow, index) => {
      const value = getRawSeriesValue(seriesRow, year);

      return {
        key: seriesRow.key,
        label: seriesRow.label,
        color: getSeriesColor(index),
        value: hasNumber(value) ? Number(value) : null,
      };
    })
    .filter((row) => visibleSet.has(row.key))
    .filter((row) => row.value !== null && row.value > 0);
  const total = rows.reduce((sum, row) => sum + row.value, 0);

  return { year, total, rows };
}

function polarToCartesian(center, radius, angle) {
  const radians = ((angle - 90) * Math.PI) / 180;
  return {
    x: center + radius * Math.cos(radians),
    y: center + radius * Math.sin(radians),
  };
}

function describeArc(center, radius, startAngle, endAngle) {
  const start = polarToCartesian(center, radius, endAngle);
  const end = polarToCartesian(center, radius, startAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? "0" : "1";

  return [
    "M",
    start.x,
    start.y,
    "A",
    radius,
    radius,
    0,
    largeArcFlag,
    0,
    end.x,
    end.y,
  ].join(" ");
}

function CompositionPanel({ chart, filters, visibleKeys }) {
  const { year, total, rows } = describeComposition(chart, visibleKeys);
  const title = `${getBreakoutLabel(chart, filters)} composition ${year || ""}`.trim();

  if (!year || !hasNumber(total) || rows.length === 0) {
    return (
      <PublicCard className="p-5">
        <h2 className="text-xl font-black text-[#030454]">{title || "Composition"}</h2>
        <p className="mt-4 text-sm leading-6 text-slate-600">Not available.</p>
      </PublicCard>
    );
  }

  if (rows.length === 1) {
    return (
      <PublicCard className="p-5">
        <h2 className="text-xl font-black text-[#030454]">{title}</h2>
        <div className="mt-4 rounded-md border border-[#E6EAEC] bg-[#F7F9FA] p-4">
          <p className="text-sm font-black text-[#030454]">{rows[0].label}</p>
          <p className="mt-1 font-mono text-xl font-black text-[#009B35]">
            {formatNumber(rows[0].value, 2)} tCO2e
          </p>
          <p className="mt-1 text-sm text-slate-600">100.0% of visible composition.</p>
        </div>
      </PublicCard>
    );
  }

  const center = 74;
  const radius = 52;
  const arcs = rows.reduce(
    (acc, row) => {
      const share = row.value / Number(total);
      const startAngle = acc.angle;
      const endAngle = startAngle + share * 360;

      return {
        angle: endAngle,
        rows: [
          ...acc.rows,
          {
            ...row,
            share,
            startAngle,
            endAngle,
          },
        ],
      };
    },
    { angle: 0, rows: [] }
  ).rows;

  return (
    <PublicCard className="p-5">
      <h2 className="text-xl font-black text-[#030454]">{title}</h2>
      <div className="mt-5 flex flex-col gap-5 sm:flex-row sm:items-center">
        <svg
          viewBox="0 0 148 148"
          role="img"
          aria-label={`${title} chart`}
          className="h-40 w-40 shrink-0"
        >
          <circle cx={center} cy={center} r={radius} fill="none" stroke="#E6EAEC" strokeWidth="24" />
          {arcs.map((row) => (
            <path
              key={row.key}
              d={describeArc(center, radius, row.startAngle, row.endAngle)}
              fill="none"
              stroke={row.color}
              strokeWidth="24"
              strokeLinecap="butt"
              aria-label={`${row.label}: ${formatNumber(row.value, 2)} tCO2e, ${formatNumber(row.share * 100, 1)}%`}
            />
          ))}
          <circle cx={center} cy={center} r="32" fill="white" />
        </svg>

        <ul className="min-w-0 flex-1 space-y-2 text-sm" aria-label={`${title} values`}>
          {rows.map((row) => (
            <li key={row.key} className="grid grid-cols-[minmax(0,1fr)_auto] gap-3">
              <span className="inline-flex min-w-0 items-center gap-2 font-bold text-[#030454]">
                <span
                  className="h-3 w-3 shrink-0 rounded-sm"
                  style={{ backgroundColor: row.color }}
                  aria-hidden="true"
                />
                <span className="truncate">{row.label}</span>
              </span>
              <span className="font-mono text-slate-600">
                {formatNumber((row.value / Number(total)) * 100, 1)}%
              </span>
            </li>
          ))}
        </ul>
      </div>
    </PublicCard>
  );
}

function FitGhgMapBounds({ geoJson, selectedLga }) {
  const map = useMap();

  useEffect(() => {
    if (!geoJson) return;

    const timer = setTimeout(() => {
      map.invalidateSize();
      const selectedFeature = selectedLga
        ? geoJson.features?.find(
            (feature) => normalizeMapName(getFeatureName(feature)) === normalizeMapName(selectedLga)
          )
        : null;
      const layer = selectedFeature ? L.geoJSON(selectedFeature) : L.geoJSON(geoJson);
      const bounds = layer.getBounds();
      if (bounds.isValid()) {
        map.fitBounds(bounds, {
          padding: selectedFeature ? [56, 56] : [34, 34],
          maxZoom: selectedFeature ? 10 : 8,
        });
        map.panInsideBounds(NIGERIA_MAX_BOUNDS, { animate: false });
      }
    }, 150);

    return () => clearTimeout(timer);
  }, [geoJson, map, selectedLga]);

  return null;
}

function buildMapClasses(records) {
  const values = records
    .map((record) => record.value)
    .filter((value) => hasNumber(value))
    .map(Number)
    .sort((a, b) => a - b);

  if (values.length === 0) return [];

  const colors = ["#E8F5ED", "#BEE5CD", "#87C99F", "#45A567", "#087A34"];
  const min = values[0];
  const max = values[values.length - 1];

  if (Math.abs(max - min) < 0.000001) {
    return [{ min, max, color: colors[2], label: formatNumber(min, 0) }];
  }

  return colors.map((color, index) => {
    const startIndex = Math.floor((index / colors.length) * values.length);
    const endIndex = Math.min(
      values.length - 1,
      Math.floor(((index + 1) / colors.length) * values.length) - 1
    );
    const classMin = values[startIndex];
    const classMax = values[Math.max(startIndex, endIndex)];

    return {
      min: classMin,
      max: classMax,
      color,
      label: `${formatNumber(classMin, 0)}-${formatNumber(classMax, 0)}`,
    };
  });
}

function getMapColor(value, classes) {
  if (!hasNumber(value)) return "#E6EAEC";
  const numeric = Number(value);
  const match = classes.find((row) => numeric >= row.min && numeric <= row.max);
  return match?.color || classes.at(-1)?.color || "#E6EAEC";
}

function GhgMapLegend({ mapData, classes, filters, optionLabels }) {
  const context = [
    optionLabels.sector || "All sectors",
    optionLabels.category || "All categories",
    optionLabels.gas || "All gases",
  ].join(" | ");

  return (
    <div className="rounded-md border border-[#D8DDE2] bg-white p-3 text-xs leading-5 text-slate-600">
      <p className="font-black uppercase tracking-[0.12em] text-slate-500">
        Map legend
      </p>
      <p className="mt-1 font-bold text-[#030454]">
        {mapData?.year || filters.year_to} | tCO2e
      </p>
      <p className="mt-1">{context}</p>
      {classes.length > 0 ? (
        <ul className="mt-3 space-y-1" aria-label="Map emissions ranges">
          {classes.map((row) => (
            <li key={`${row.min}-${row.max}`} className="flex items-center gap-2">
              <span
                className="h-3 w-5 rounded-sm border border-slate-300"
                style={{ backgroundColor: row.color }}
                aria-hidden="true"
              />
              <span>{row.label} tCO2e</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3">No LGA values available.</p>
      )}
    </div>
  );
}

function GhgMapView({ mapData, filters, optionLabels, onFilterChange }) {
  const [geoJson, setGeoJson] = useState(null);
  const [geoJsonError, setGeoJsonError] = useState("");
  const records = useMemo(() => mapData?.records || [], [mapData]);
  const recordsByName = useMemo(
    () =>
      records.reduce((acc, record) => {
        acc[normalizeMapName(record.lga_name)] = record;
        return acc;
      }, {}),
    [records]
  );
  const classes = useMemo(() => buildMapClasses(records), [records]);
  const selectedLga = filters.geography?.startsWith("lga:")
    ? filters.geography.replace("lga:", "")
    : "";
  const total = mapData?.total;
  const hasAnyValue = records.some((record) => hasNumber(record.value));

  useEffect(() => {
    let isMounted = true;
    fetch("/data/kaduna_lgas.geojson", { cache: "no-cache" })
      .then((response) => {
        if (!response.ok) throw new Error("Kaduna LGA boundary file could not be loaded.");
        return response.json();
      })
      .then((payload) => {
        if (isMounted) setGeoJson(payload);
      })
      .catch((error) => {
        if (isMounted) setGeoJsonError(error.message);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  function resolveFeature(feature) {
    const featureName = String(getFeatureName(feature)).trim();
    const record = recordsByName[normalizeMapName(featureName)] || null;
    const name = record?.lga_name || featureName;
    const isSelected = selectedLga && normalizeMapName(selectedLga) === normalizeMapName(name);

    return {
      name,
      record,
      value: record?.value,
      isSelected,
      color: getMapColor(record?.value, classes),
    };
  }

  function styleFeature(feature) {
    const info = resolveFeature(feature);

    return {
      color: info.isSelected ? "#030454" : "rgba(3,4,84,0.42)",
      weight: info.isSelected ? 3 : 1.2,
      fillColor: info.color,
      fillOpacity: hasNumber(info.value) ? 0.82 : 0.22,
      opacity: 1,
      dashArray: hasNumber(info.value) ? "" : "4",
    };
  }

  function tooltipHtml(feature) {
    const info = resolveFeature(feature);
    const share = hasNumber(info.value) && hasNumber(total) && Number(total) > 0
      ? (Number(info.value) / Number(total)) * 100
      : null;

    return `
      <div style="min-width:210px">
        <strong style="color:#030454">${escapeHtml(info.name)}</strong><br/>
        <span style="font-size:11px;color:#475569">${escapeHtml(String(mapData?.year || ""))}</span><br/>
        <span style="font-size:12px;color:#030454;font-weight:800">${escapeHtml(formatNumber(info.value, 2))} tCO2e</span><br/>
        ${
          hasNumber(share)
            ? `<span style="font-size:11px;color:#475569">${escapeHtml(formatNumber(share, 1))}% of Kaduna State filtered total</span><br/>`
            : ""
        }
        <span style="font-size:11px;color:#475569">${escapeHtml(optionLabels.sector || "All sectors")} | ${escapeHtml(optionLabels.category || "All categories")} | ${escapeHtml(optionLabels.gas || "All gases")}</span>
      </div>
    `;
  }

  function onEachFeature(feature, layer) {
    layer.bindTooltip(tooltipHtml(feature), {
      sticky: true,
      direction: "top",
      className: "kccc-ghg-map-tooltip",
    });
    layer.on({
      mouseover: (event) => {
        event.target.setStyle({
          weight: 3,
          color: "#F3F74B",
          fillOpacity: 0.92,
        });
        event.target.bringToFront?.();
      },
      mouseout: (event) => {
        event.target.setStyle(styleFeature(feature));
      },
      click: () => {
        const info = resolveFeature(feature);
        onFilterChange("geography", `lga:${info.name}`);
      },
    });
  }

  if (!mapData?.eligible) {
    return (
      <PublicCard className="p-5">
        <PublicEmptyState
          title="Map View is unavailable because complete LGA-level inventory coverage is not available for the selected year and filters."
          message={`${mapData?.coverage_count || 0} of ${mapData?.expected_count || 23} LGAs available for map year ${mapData?.year || "selected year"}.`}
        />
      </PublicCard>
    );
  }

  return (
    <PublicCard className="min-w-0 overflow-hidden p-5">
      <div className="mb-4 flex flex-col justify-between gap-3 md:flex-row md:items-start">
        <div>
          <h2 className="text-2xl font-black text-[#030454]">GHG Emissions Map</h2>
          <p className="mt-1 text-xs font-bold uppercase tracking-[0.08em] text-slate-500">
            Map year: {mapData.year} | {mapData.coverage_count} of {mapData.expected_count} LGAs
          </p>
        </div>
        {selectedLga ? (
          <PublicSecondaryButton onClick={() => onFilterChange("geography", ALL)}>
            View all LGAs
          </PublicSecondaryButton>
        ) : null}
      </div>

      <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(220px,1fr)]">
        <div className="relative min-h-[440px] min-w-0 overflow-hidden rounded-lg border border-[#E6EAEC] bg-[#F7F9FA]">
          <style>{`
            .kccc-ghg-map-tooltip {
              background: rgba(255,255,255,.97);
              border: 1px solid rgba(3,4,84,.18);
              border-radius: 8px;
              box-shadow: 0 12px 32px rgba(15,23,42,.22);
              padding: 10px 12px;
            }
            .kccc-ghg-map-tooltip::before { display:none; }
            .leaflet-control-attribution { font-size:9px; }
          `}</style>
          {geoJsonError ? (
            <div className="flex h-[440px] items-center justify-center p-6 text-center text-sm text-slate-600">
              {geoJsonError}
            </div>
          ) : geoJson ? (
            <MapContainer
              center={KADUNA_CENTER}
              zoom={KADUNA_ZOOM}
              minZoom={GHG_MAP_MIN_ZOOM}
              maxZoom={GHG_MAP_MAX_ZOOM}
              maxBounds={NIGERIA_MAX_BOUNDS}
              maxBoundsViscosity={1.0}
              scrollWheelZoom
              style={{ height: "440px", width: "100%" }}
            >
              <TileLayer
                attribution="OpenStreetMap"
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              <FitGhgMapBounds geoJson={geoJson} selectedLga={selectedLga} />
              <GeoJSON
                key={`${mapData.year}-${filters.sector}-${filters.category}-${filters.gas}-${filters.geography}-${records.length}`}
                data={geoJson}
                style={styleFeature}
                onEachFeature={onEachFeature}
              />
            </MapContainer>
          ) : (
            <div className="flex h-[440px] items-center justify-center text-sm text-slate-600">
              Loading Kaduna LGA boundary...
            </div>
          )}
          {!hasAnyValue ? (
            <div className="absolute inset-x-4 top-4 z-[450] rounded-md border border-[#D8DDE2] bg-white/95 p-3 text-sm text-slate-600 shadow-sm">
              No approved public inventory record is available for the selected map year and filters.
            </div>
          ) : null}
        </div>

        <GhgMapLegend
          mapData={mapData}
          classes={classes}
          filters={filters}
          optionLabels={optionLabels}
        />
      </div>
    </PublicCard>
  );
}

function escapeCsvValue(value) {
  const text = value === null || value === undefined ? "" : String(value);
  if (/[",\n]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`;
  }

  return text;
}

function buildChartCsv(chart, filters, optionLabels) {
  if ((chart?.csv_rows || []).length > 0) {
    const rows = [
      [
        "year",
        "geography",
        "sector",
        "category",
        "gas",
        "emissions_tco2e",
        "source",
        "preview_batch_id",
        "breakout_dimension",
        "breakout_value",
        "publication_status",
      ],
      ...chart.csv_rows.map((row) => [
        row.year,
        row.geography,
        row.sector,
        row.category,
        row.gas,
        row.emissions_tco2e,
        row.source,
        row.preview_batch_id,
        row.breakout_dimension,
        row.breakout_value,
        row.publication_status,
      ]),
    ];

    return rows.map((row) => row.map(escapeCsvValue).join(",")).join("\n");
  }

  const rows = [
    [
      "year",
      "breakout_dimension",
      "breakout_value",
      "geography",
      "sector_filter",
      "category_filter",
      "gas_filter",
      "emissions_tco2e",
      "publication_status",
      "source_reference",
      "preview_batch_id",
    ],
  ];

  (chart?.table?.rows || []).forEach((row) => {
    (row.values || []).forEach((value) => {
      if (!hasNumber(value.value)) return;
      rows.push([
        value.year,
        row.is_total ? "total" : chart.breakout,
        row.label,
        optionLabels.geography,
        optionLabels.sector,
        optionLabels.category,
        optionLabels.gas,
        value.value,
        "Approved public inventory aggregate",
        "KCCC approved GHG inventory entries",
        "",
      ]);
    });
  });

  return rows.map((row) => row.map(escapeCsvValue).join(",")).join("\n");
}

function ChartMatrixTable({ chart, filters, optionLabels }) {
  const rows = chart?.table?.rows || [];
  const years = chart?.table?.years || chart?.years || [];
  const canDownload = rows.length > 0;

  function handleDownload() {
    const csv = buildChartCsv(chart, filters, optionLabels);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `kccc-ghg-inventory-${chart.breakout}-${getYearSpanLabel(years)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <PublicCard className="min-w-0 overflow-hidden">
      <div className="flex flex-col justify-between gap-4 border-b border-[#E6EAEC] bg-[#F7F9FA] px-5 py-4 md:flex-row md:items-center">
        <div>
          <h2 className="text-xl font-black text-[#030454]">
            Year-by-Year Inventory Matrix
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Aggregated tCO2e values match the chart. A dash means no approved
            public record is available for that row and year.
          </p>
        </div>
        <PublicSecondaryButton
          onClick={handleDownload}
          disabled={!canDownload}
          className="inline-flex w-fit items-center gap-2 disabled:cursor-not-allowed disabled:opacity-45"
        >
          <Download size={15} aria-hidden="true" />
          Download filtered data (CSV)
        </PublicSecondaryButton>
      </div>
      {rows.length === 0 ? (
        <PublicEmptyState
          title="No approved public inventory record is available for this combination of period, sector, category, gas and geography."
          message="Change one or more filters to view available inventory records."
        />
      ) : (
        <div className="w-full max-w-full overflow-x-auto" tabIndex="0">
          <table className="w-full min-w-[720px] text-left text-sm">
            <caption className="sr-only">
              Approved public GHG inventory matrix by selected year and breakout
              series.
            </caption>
            <thead className="bg-white text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">
              <tr>
                <th className="sticky left-0 z-10 min-w-[220px] bg-white px-4 py-3">
                  Series
                </th>
                {years.map((year) => (
                  <th key={year} className="px-4 py-3 text-right">
                    {year}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E6EAEC]">
              {rows.map((row) => (
                <tr
                  key={row.key}
                  className={row.is_total ? "bg-[#F7F9FA] font-black" : "hover:bg-[#F7F9FA]"}
                >
                  <th
                    scope="row"
                    className="sticky left-0 z-10 bg-inherit px-4 py-3 text-[#030454]"
                  >
                    {row.label}
                  </th>
                  {years.map((year) => {
                    const value = (row.values || []).find(
                      (item) => Number(item.year) === Number(year)
                    )?.value;

                    return (
                      <td
                        key={`${row.key}-${year}`}
                        className="px-4 py-3 text-right font-mono text-[#030454]"
                      >
                        {hasNumber(value) ? formatNumber(value, 2) : "-"}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </PublicCard>
  );
}

function ViewSwitch({ activeView, onChange, mapData }) {
  const mapEligible = Boolean(mapData?.eligible);
  const options = [
    { value: "chart", label: "Chart View", disabled: false },
    { value: "map", label: "Map View", disabled: !mapEligible },
  ];

  return (
    <div className="flex flex-col justify-between gap-3 rounded-lg border border-[#D8DDE2] bg-white p-3 md:flex-row md:items-center">
      <div className="inline-flex w-fit rounded-md border border-[#D8DDE2] bg-[#F7F9FA] p-1">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            disabled={option.disabled}
            aria-pressed={activeView === option.value}
            onClick={() => onChange(option.value)}
            className={`rounded px-4 py-2 text-sm font-black transition focus:outline-none focus:ring-2 focus:ring-[#009B35]/25 disabled:cursor-not-allowed disabled:opacity-50 ${
              activeView === option.value
                ? "bg-[#030454] text-white"
                : "text-[#030454] hover:bg-white"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
      <p className="text-xs leading-5 text-slate-600">
        Map year: <strong className="text-[#030454]">{mapData?.year || "N/A"}</strong>
        {" | "}
        LGA coverage:{" "}
        <strong className="text-[#030454]">
          {mapData?.coverage_count || 0}/{mapData?.expected_count || 23}
        </strong>
      </p>
    </div>
  );
}

function MainVisualization({
  chart,
  mapData,
  filters,
  optionLabels,
  visibleKeys,
  onToggleSeries,
  onShowAllSeries,
  activeView,
  onViewChange,
  onFilterChange,
}) {
  const chartTitle = getChartTitle(filters, chart);
  const metadataLine = getChartMetadataLine(chart, filters, optionLabels);
  const seriesCount = visibleKeys.length;

  return (
    <div className="space-y-5">
      <ViewSwitch
        activeView={activeView}
        onChange={onViewChange}
        mapData={mapData}
      />

      {activeView === "map" ? (
        <GhgMapView
          mapData={mapData}
          filters={filters}
          optionLabels={optionLabels}
          onFilterChange={onFilterChange}
        />
      ) : (
        <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,4fr)_minmax(260px,1.15fr)]">
          <PublicCard className="min-w-0 p-5">
            <div className="mb-5 flex flex-col justify-between gap-4 xl:flex-row xl:items-start">
              <div>
                <h2 className="text-2xl font-black text-[#030454]">
                  {chartTitle}
                </h2>
                <p className="mt-2 text-xs font-bold uppercase tracking-[0.08em] text-slate-500">
                  {metadataLine}
                </p>
                <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
                  Only approved public inventory years are displayed. Missing
                  years indicate that no approved public inventory record is
                  available for that year.
                </p>
              </div>
              <div className="rounded-md border border-[#D8DDE2] bg-[#F7F9FA] px-4 py-3 text-xs leading-5 text-slate-600">
                <strong className="text-[#030454]">{seriesCount}</strong>{" "}
                visible series
              </div>
            </div>

            <StackedAreaChart chart={chart} visibleKeys={visibleKeys} />
            <ChartLegend
              chart={chart}
              visibleKeys={visibleKeys}
              onToggleSeries={onToggleSeries}
              onShowAll={onShowAllSeries}
            />
          </PublicCard>

          <ChangePanel chart={chart} visibleKeys={visibleKeys} />
        </div>
      )}

      <ChartMatrixTable
        chart={chart}
        filters={filters}
        optionLabels={optionLabels}
      />
    </div>
  );
}
function StatusNotice({ status, preview }) {
  const isPreview =
    status?.code === "preview_dataset_not_official" || preview?.preview_batch_active;
  const isOfficial = status?.code === "official_inventory_published" && !isPreview;
  const isModelled = status?.code === "modelled_estimates_available" && !isPreview;

  return (
    <div
      className={`rounded-lg border px-5 py-4 ${
        isOfficial
          ? "border-[#009B35]/30 bg-[#009B35]/10"
          : isPreview
            ? "border-orange-300 bg-orange-50"
            : isModelled
              ? "border-[#F3F74B] bg-[#F3F74B]/25"
              : "border-[#D8DDE2] bg-white"
      }`}
    >
      <div className="flex items-start gap-3">
        {isOfficial ? (
          <CheckCircle2
            className="mt-0.5 shrink-0 text-[#009B35]"
            size={20}
            aria-hidden="true"
          />
        ) : (
          <AlertTriangle
            className={`mt-0.5 shrink-0 ${isPreview ? "text-orange-600" : "text-[#9A6B00]"}`}
            size={20}
            aria-hidden="true"
          />
        )}
        <div>
          <p className="text-sm font-black text-[#030454]">
            {status?.label || "No public inventory data available"}
          </p>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            {isPreview
              ? `These figures are an illustrative preview dataset for demonstrating the inventory explorer, not Kaduna State's official GHG inventory.${
                  preview?.genuine_record_count
                    ? ` ${preview.genuine_record_count} genuine approved ${
                        preview.genuine_record_count === 1 ? "entry" : "entries"
                      } exist separately and will be shown once the preview dataset is retired.`
                    : ""
                }`
              : "Public inventory values on this page come from approved GHG entries only. Expected project reductions and modelled references are kept separate."}
          </p>
        </div>
      </div>
    </div>
  );
}

function MetricCard({ label, value, helper }) {
  return (
    <PublicCard className="p-5">
      <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">
        {label}
      </p>
      <p className="mt-3 text-2xl font-black leading-tight text-[#030454]">
        {value}
      </p>
      {helper ? (
        <p className="mt-2 text-xs leading-5 text-slate-600">{helper}</p>
      ) : null}
    </PublicCard>
  );
}

function SummaryMetrics({ summary, selectedYear }) {
  const total = summary?.published_total_emissions_tco2e;
  const largestSector = summary?.largest_contributing_sector;

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
      <MetricCard
        label="Reporting Year"
        value={
          selectedYear && selectedYear !== ALL
            ? selectedYear
            : "All approved years"
        }
        helper="Selected approved reporting period."
      />
      <MetricCard
        label="Total Emissions"
        value={hasNumber(total) ? `${formatNumber(total, 2)} tCO2e` : "Not available"}
        helper="Approved inventory total only."
      />
      <MetricCard
        label="Sectors Represented"
        value={
          hasNumber(summary?.sectors_represented)
            ? formatNumber(summary?.sectors_represented, 0)
            : "Not available"
        }
        helper="Sectors with approved records in the selected period."
      />
      <MetricCard
        label="Leading Sector"
        value={largestSector?.sector_label || "Not available"}
        helper={
          largestSector
            ? `${formatNumber(largestSector.share_pct, 1)}% of selected-year total.`
            : "No approved sector total."
        }
      />
      <MetricCard
        label="Inventory Status"
        value={summary?.inventory_status || "No public inventory data available"}
        helper="Returned by the public GHG endpoint."
      />
    </div>
  );
}

function ExplorerHeader({ data, selectedYear }) {
  return (
    <PublicSection className="border-b border-[#D8DDE2] bg-white">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_420px] lg:items-start">
        <div>
          <PublicBadge active>
            <CheckCircle2 size={14} aria-hidden="true" />
            Public GHG Inventory
          </PublicBadge>

          <h1 className="mt-5 text-balance font-['Playfair_Display'] text-4xl font-black leading-tight text-[#030454] sm:text-5xl">
            Greenhouse Gas Inventory Explorer
          </h1>

          <p className="mt-4 max-w-3xl text-pretty text-base leading-8 text-slate-600">
            Explore approved greenhouse gas inventory information by reporting
            year, sector, emissions source and gas. Public values must reflect
            the publication status returned by the backend.
          </p>
        </div>

        <StatusNotice status={data?.inventory_status} preview={data?.preview} />
      </div>

      <div className="mt-6">
        <SummaryMetrics
          summary={data?.summary || {}}
          selectedYear={selectedYear}
        />
      </div>
    </PublicSection>
  );
}

function FiltersPanel({
  filters,
  onFilterChange,
  onReset,
  options,
  hasActiveFilters,
}) {
  return (
    <PublicCard className="p-5">
      <div className="mb-5 flex flex-col justify-between gap-3 md:flex-row md:items-center">
        <div>
          <h2 className="text-xl font-black text-[#030454]">
            Explorer Filters
          </h2>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            Year filters the displayed records only. Valid sectors, gases,
            breakout dimensions and geographies remain available.
          </p>
        </div>

        <PublicSecondaryButton
          onClick={onReset}
          disabled={!hasActiveFilters}
          className="inline-flex w-fit items-center gap-2 disabled:cursor-not-allowed disabled:opacity-45"
        >
          <FilterX size={15} aria-hidden="true" />
          Clear Filters
        </PublicSecondaryButton>
      </div>

      <div className="grid min-w-0 gap-4 md:grid-cols-3 xl:grid-cols-7">
        <FilterField
          id="ghg-filter-sector"
          label="1. Sector"
          value={filters.sector}
          onChange={(value) => onFilterChange("sector", value)}
          options={options.sectors}
        />
        <FilterField
          id="ghg-filter-category"
          label="2. Category"
          value={filters.category}
          onChange={(value) => onFilterChange("category", value)}
          options={options.categories}
        />
        <FilterField
          id="ghg-filter-gas"
          label="3. Greenhouse gas"
          value={filters.gas}
          onChange={(value) => onFilterChange("gas", value)}
          options={options.gases}
        />
        <FilterField
          id="ghg-filter-geography"
          label="4. Geography"
          value={filters.geography}
          onChange={(value) => onFilterChange("geography", value)}
          options={options.geographies}
        />
        <YearSelectField
          id="ghg-filter-year-from"
          label="5. From year"
          prefix="From"
          value={filters.year_from}
          onChange={(value) => onFilterChange("year_from", value)}
          options={options.years}
        />
        <YearSelectField
          id="ghg-filter-year-to"
          label="6. To year"
          prefix="To"
          value={filters.year_to}
          onChange={(value) => onFilterChange("year_to", value)}
          options={options.years}
        />
        <FilterField
          id="ghg-filter-breakout"
          label="7. Break out by"
          value={filters.breakout}
          onChange={(value) => onFilterChange("breakout", value)}
          options={options.breakoutOptions}
        />
      </div>
    </PublicCard>
  );
}

function InterpretationPanel({ data, projectSummary }) {
  const latestUpdate = data?.inventory_status?.latest_update;
  const projectReduction = projectSummary?.total_expected_ghg_reduction_tco2e;

  return (
    <PublicCard className="p-5">
      <div className="flex items-start gap-3">
        <Info className="mt-1 shrink-0 text-[#009B35]" size={20} aria-hidden="true" />
        <div>
          <h2 className="text-xl font-black text-[#030454]">
            Data Interpretation
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            The explorer reads approved greenhouse gas inventory entries from
            the public API. Values are shown in tCO2e and rounded only for
            display.
          </p>
        </div>
      </div>

      <dl className="mt-5 grid gap-3 text-sm">
        <div className="flex justify-between gap-4 border-t border-[#E6EAEC] pt-3">
          <dt className="text-slate-500">Latest update</dt>
          <dd className="font-bold text-[#030454]">{formatDate(latestUpdate)}</dd>
        </div>
        <div className="flex justify-between gap-4 border-t border-[#E6EAEC] pt-3">
          <dt className="text-slate-500">Official values</dt>
          <dd className="text-right font-bold text-[#030454]">
            Approved inventory entries
          </dd>
        </div>
        <div className="flex justify-between gap-4 border-t border-[#E6EAEC] pt-3">
          <dt className="text-slate-500">Modelled estimates</dt>
          <dd className="text-right font-bold text-[#030454]">
            Not added to inventory totals
          </dd>
        </div>
        <div className="flex justify-between gap-4 border-t border-[#E6EAEC] pt-3">
          <dt className="text-slate-500">Expected project reductions</dt>
          <dd className="text-right font-bold text-[#030454]">
            {hasNumber(projectReduction)
              ? `${formatNumber(projectReduction, 3)} tCO2e`
              : "Not available"}
          </dd>
        </div>
      </dl>

      <div className="mt-5 rounded-lg border border-[#F3F74B] bg-[#F3F74B]/20 px-4 py-3 text-sm leading-6 text-[#030454]">
        Expected project reductions are planning estimates from project records.
        They are not verified achieved reductions, they are not inventory
        emissions, and they are not included in explorer charts, metrics,
        summaries or tables.
      </div>
    </PublicCard>
  );
}

function SourcesReferencesSection() {
  return (
    <section className="bg-white px-4 py-8 sm:px-8 lg:px-10">
      <div className="mx-auto max-w-[1536px]">
        <PublicCard className="p-5">
        <div className="flex items-start gap-3">
          <Info className="mt-1 shrink-0 text-[#009B35]" size={20} aria-hidden="true" />
          <div>
            <h2 className="text-xl font-black text-[#030454]">
              Sources and References
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              The explorer separates inventory records, project planning
              estimates and national reporting context.
            </p>
          </div>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-3">
          <div className="rounded-lg border border-[#D8DDE2] bg-[#F7F9FA] p-4">
            <p className="text-sm font-black text-[#030454]">
              KCCC approved GHG inventory entries
            </p>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Source for explorer charts, metrics and table records.
            </p>
          </div>

          <div className="rounded-lg border border-[#D8DDE2] bg-[#F7F9FA] p-4">
            <p className="text-sm font-black text-[#030454]">
              KCCC project records
            </p>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Source for expected project reductions only.
            </p>
          </div>

          <div className="rounded-lg border border-[#D8DDE2] bg-[#F7F9FA] p-4">
            <p className="text-sm font-black text-[#030454]">
              Nigeria First Biennial Transparency Report
            </p>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              National climate-reporting context only; not a source of
              Kaduna-specific inventory values.
            </p>
            <a
              href="https://unfccc.int/sites/default/files/resource/Nigeria%20BTR1%20.pdf"
              target="_blank"
              rel="noreferrer"
              className="mt-3 inline-flex text-xs font-bold text-[#009B35] hover:text-[#00842e]"
            >
              View official BTR1 document
            </a>
          </div>
        </div>
        </PublicCard>
      </div>
    </section>
  );
}

function GeographyNotice({ geography }) {
  return (
    <PublicCard className="p-5">
      <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">
        Map View
      </p>
      <h2 className="mt-2 text-xl font-black text-[#030454]">
        Geographic inventory view is not available
      </h2>
      <p className="mt-2 text-sm leading-6 text-slate-600">
        {geography?.map_view_reason ||
          "No complete public LGA-level GHG inventory dataset is available."}
      </p>
      <p className="mt-3 text-xs font-bold text-slate-500">
        Approved records with LGA links:{" "}
        {formatNumber(geography?.approved_lga_record_count, 0)}.
      </p>
    </PublicCard>
  );
}

export default function PublicGHGInventoryExplorerPage() {
  const [inventoryData, setInventoryData] = useState(null);
  const [summaryData, setSummaryData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeView, setActiveView] = useState("chart");
  const [filters, setFilters] = useState({
    year_from: ALL,
    year_to: ALL,
    sector: ALL,
    category: ALL,
    gas: "CO2e",
    breakout: "sector",
    geography: ALL,
  });

  useEffect(() => {
    let isMounted = true;

    getPublicGHGInventory()
      .then((inventory) => {
        if (!isMounted) return null;

        setInventoryData(inventory);

        const years = inventory.metadata?.years || inventory.dimensions?.years || [];
        if (years.length > 0) {
          const sortedYears = years.map((year) => Number(year)).sort((a, b) => a - b);
          setFilters((current) => ({
            ...current,
            year_from:
              current.year_from === ALL ? String(sortedYears[0]) : current.year_from,
            year_to:
              current.year_to === ALL
                ? String(sortedYears[sortedYears.length - 1])
                : current.year_to,
          }));
        }

        return getPublicPortalSummary();
      })
      .then((portalSummary) => {
        if (!isMounted || !portalSummary) return;

        setSummaryData(portalSummary.summary || {});
      })
      .catch((err) => {
        if (!isMounted) return;

        console.error(err);
        setError("Could not load public GHG inventory explorer data.");
      })
      .finally(() => {
        if (!isMounted) return;
        setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (isLoading) return undefined;

    let isMounted = true;

    getPublicGHGInventory({
      year_from: filters.year_from,
      year_to: filters.year_to,
      sector: filters.sector,
      category: filters.category,
      gas: filters.gas,
      breakout: filters.breakout,
      geography: filters.geography,
    })
      .then((inventory) => {
        if (!isMounted) return;
        setInventoryData(inventory);
      })
      .catch((err) => {
        if (!isMounted) return;

        console.error(err);
        setError("Could not refresh public GHG inventory records.");
      });

    return () => {
      isMounted = false;
    };
  }, [
    filters.category,
    filters.breakout,
    filters.gas,
    filters.geography,
    filters.sector,
    filters.year_from,
    filters.year_to,
    isLoading,
  ]);

  const records = useMemo(() => inventoryData?.records || [], [inventoryData]);
  const chart = useMemo(() => inventoryData?.chart || {}, [inventoryData]);
  const mapData = inventoryData?.map || {};
  const seriesKeys = useMemo(
    () => (chart?.series || []).map((seriesRow) => seriesRow.key),
    [chart]
  );
  const [hiddenSeriesKeys, setHiddenSeriesKeys] = useState([]);
  const visibleKeys = useMemo(
    () => seriesKeys.filter((key) => !hiddenSeriesKeys.includes(key)),
    [seriesKeys, hiddenSeriesKeys]
  );
  const projectSummary = summaryData?.projects || {};
  const metadata = inventoryData?.metadata || inventoryData?.dimensions || {};
  const metadataYears = (metadata.years || [])
    .map((year) => Number(year))
    .sort((a, b) => a - b);
  const earliestMetadataYear =
    metadataYears.length > 0 ? String(metadataYears[0]) : ALL;
  const latestMetadataYear =
    (metadata.years || []).length > 0
      ? String(Math.max(...metadata.years.map((year) => Number(year))))
      : ALL;
  const selectedPeriodLabel =
    filters.year_from !== ALL && filters.year_to !== ALL
      ? filters.year_from === filters.year_to
        ? filters.year_from
        : `${filters.year_from}-${filters.year_to}`
      : "All approved years";

  const filterOptions = useMemo(() => {
    const optionMetadata = inventoryData?.metadata || inventoryData?.dimensions || {};
    const yearOptions = (optionMetadata.years || [])
      .map((year) => String(year))
      .sort((a, b) => Number(a) - Number(b))
      .map((year) => ({ value: year, label: year }));

    const sectors = optionMetadata.sectors || [];
    const categories = (optionMetadata.categories || [])
      .filter(
        (category) => filters.sector === ALL || category.sector === filters.sector
      )
      .sort((a, b) => a.label.localeCompare(b.label));
    const gases = optionMetadata.gases || [];
    const breakoutOptions = optionMetadata.breakout_options || [];
    const geographies = optionMetadata.geographies || [];

    return {
      years: uniqueOptions(yearOptions),
      sectors: uniqueOptions([{ value: ALL, label: "All sectors" }, ...sectors]),
      categories: uniqueOptions([
        { value: ALL, label: "All categories" },
        ...categories,
      ]),
      gases: uniqueOptions(gases),
      breakoutOptions: uniqueOptions(breakoutOptions),
      geographies: uniqueOptions(geographies),
    };
  }, [filters.sector, inventoryData]);

  function handleToggleSeries(key) {
    setHiddenSeriesKeys((current) => {
      const isHidden = current.includes(key);
      if (isHidden) return current.filter((item) => item !== key);
      if (seriesKeys.length - current.length <= 1) return current;
      return [...current, key];
    });
  }

  function handleShowAllSeries() {
    setHiddenSeriesKeys([]);
  }

  function handleViewChange(view) {
    if (view === "map" && !mapData?.eligible) return;
    setActiveView(view);
  }

  function handleFilterChange(key, value) {
    setFilters((current) => {
      if (key !== "sector") {
        return { ...current, [key]: value };
      }

      const optionMetadata = inventoryData?.metadata || inventoryData?.dimensions || {};
      const categoryStillValid =
        current.category === ALL ||
        value === ALL ||
        (optionMetadata.categories || []).some(
          (category) =>
            category.value === current.category && category.sector === value
        );

      return {
        ...current,
        sector: value,
        category: categoryStillValid ? current.category : ALL,
      };
    });
  }

  function resetFilters() {
    setFilters({
      year_from: earliestMetadataYear,
      year_to: latestMetadataYear,
      sector: ALL,
      category: ALL,
      gas: "CO2e",
      breakout: "sector",
      geography: ALL,
    });
  }

  const hasActiveFilters =
    filters.year_from !== earliestMetadataYear ||
    filters.year_to !== latestMetadataYear ||
    filters.sector !== ALL ||
    filters.category !== ALL ||
    filters.gas !== "CO2e" ||
    filters.breakout !== "sector" ||
    filters.geography !== ALL;

  const optionLabels = {
    year_from: getOptionLabel(filterOptions.years, filters.year_from),
    year_to: getOptionLabel(filterOptions.years, filters.year_to),
    sector: getOptionLabel(filterOptions.sectors, filters.sector),
    category: getOptionLabel(filterOptions.categories, filters.category),
    gas: getOptionLabel(filterOptions.gases, filters.gas),
    breakout: getOptionLabel(filterOptions.breakoutOptions, filters.breakout),
    geography: getOptionLabel(filterOptions.geographies, filters.geography),
  };

  return (
    <main className="min-h-screen bg-[#DFE3E4] font-['DM_Sans'] text-[#030454]">
      <PublicPortalHeader
        activePage="ghg"
        compact
        showHero={false}
        showActions={false}
      />

      <PublicErrorBanner message={error} />

      {isLoading ? (
        <PublicLoadingState message="Loading public GHG inventory explorer..." />
      ) : (
        <>
          <ExplorerHeader
            data={inventoryData}
            selectedYear={selectedPeriodLabel}
          />

          <PublicSection className="bg-[#F7F9FA]">
            <div className="min-w-0 space-y-5">
              <FiltersPanel
                filters={filters}
                onFilterChange={handleFilterChange}
                onReset={resetFilters}
                options={filterOptions}
                hasActiveFilters={hasActiveFilters}
              />

              <PublicCard className="p-5">
                <div className="rounded-md border border-[#D8DDE2] bg-white px-4 py-3 text-xs leading-5 text-slate-600">
                  <strong className="text-[#030454]">{records.length}</strong>{" "}
                  approved record{records.length === 1 ? "" : "s"} selected.
                </div>
              </PublicCard>

              <MainVisualization
                chart={chart}
                mapData={mapData}
                filters={filters}
                optionLabels={optionLabels}
                visibleKeys={visibleKeys}
                onToggleSeries={handleToggleSeries}
                onShowAllSeries={handleShowAllSeries}
                activeView={activeView}
                onViewChange={handleViewChange}
                onFilterChange={handleFilterChange}
              />

              <div className="grid min-w-0 gap-5 xl:grid-cols-2">
                <InterpretationPanel
                  data={inventoryData}
                  projectSummary={projectSummary}
                />
                <div className="min-w-0 space-y-5">
                  <CompositionPanel
                    chart={chart}
                    filters={filters}
                    visibleKeys={visibleKeys}
                  />
                  <GeographyNotice geography={inventoryData?.geography} />
                </div>
              </div>
            </div>
          </PublicSection>

          <SourcesReferencesSection />

          <PublicFaqAccordion items={aboutDataItems} />
        </>
      )}

      <PublicPortalFooter />
    </main>
  );
}
