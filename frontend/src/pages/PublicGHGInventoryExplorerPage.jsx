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
  PublicLoadingState,
  PublicPortalFooter,
  PublicPortalHeader,
  PublicSecondaryButton,
  PublicSection,
} from "../components/PublicPortalChrome";
import { getPublicGHGInventory } from "../services/api";
import { useScrollReveal, revealClasses } from "../hooks/useScrollReveal";
import GHGSectorTransitionDashboard from "../components/GHGSectorTransitionDashboard";
import GHGInventoryNotes from "../components/GHGInventoryNotes";
import { GHG_CSV_NOTE as CSV_NOTE } from "../config/ghgInventoryNotes.js";
import { transitionFromPublicInventory } from "../utils/ghgTransition.js";

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
      "This explorer shows approved K3C greenhouse gas inventory entries returned by the public backend. It is a public summary view of approved records, not a replacement for a formal inventory report.",
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
      <span className="mb-1 block text-[9px] font-black uppercase tracking-[0.1em] text-slate-500">
        {label}
      </span>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        className="h-9 w-full rounded-md border border-[#D8DDE2] bg-white px-2.5 text-xs font-bold text-[#030454] outline-none transition disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400 focus:border-[#009B35] focus:ring-2 focus:ring-[#009B35]/15"
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
      <span className="mb-1 block text-[9px] font-black uppercase tracking-[0.1em] text-slate-500">
        {label}
      </span>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-9 w-full rounded-md border border-[#D8DDE2] bg-white px-2.5 text-xs font-bold text-[#030454] outline-none transition focus:border-[#009B35] focus:ring-2 focus:ring-[#009B35]/15"
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
    <div className="mt-4 flex min-w-0 flex-wrap items-center gap-3 text-sm">
      <ul
        className="flex min-w-0 flex-wrap gap-x-3 gap-y-2"
        aria-label="Toggle visible chart series"
      >
        {series.map((seriesRow, index) => {
          const isVisible = visibleSet.has(seriesRow.key);
          const isOnlyVisible = isVisible && visibleKeys.length <= 1;

          return (
            <li key={seriesRow.key} className="inline-flex min-w-0 max-w-full">
              <button
                type="button"
                onClick={() => onToggleSeries(seriesRow.key)}
                disabled={isOnlyVisible}
                aria-pressed={isVisible}
                className={`inline-flex max-w-[78vw] items-center gap-2 rounded-md border px-2.5 py-1.5 text-left font-bold transition focus:outline-none focus:ring-2 focus:ring-[#009B35]/25 motion-reduce:transition-none sm:max-w-full ${
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

function changeToneClass(percent) {
  if (!hasNumber(percent) || Math.abs(Number(percent)) < 0.05) {
    return "bg-[#F7F9FA] text-[#030454]";
  }
  return Number(percent) > 0
    ? "bg-[#fff0f3] text-[#a32d4f]"
    : "bg-[#e6f6ec] text-[#087444]";
}

function calcSimplePercentChange(startValue, endValue) {
  if (!hasNumber(startValue) || !hasNumber(endValue) || Number(startValue) <= 0) {
    return null;
  }

  return ((Number(endValue) - Number(startValue)) / Number(startValue)) * 100;
}

function ChangePanel({ chart, visibleKeys }) {
  const change = useMemo(
    () => calculateChangeRows(chart, visibleKeys),
    [chart, visibleKeys]
  );
  const isSingleYear = (chart?.years || []).length <= 1;

  return (
    <div className="h-full rounded-2xl border border-[#e5ebf4] bg-gradient-to-br from-white to-[#f7f9fd] p-5 shadow-[0_8px_24px_rgba(16,25,77,0.05)]">
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
      ) : change.rows.length > 0 ? (
        <div className="mt-4 space-y-2.5">
          {change.rows.map((row) => (
            <div
              key={row.key}
              className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-[#edf0f4] pb-2.5 text-sm last:border-b-0"
            >
              <span className="min-w-0 truncate font-bold" style={{ color: row.color }}>
                {row.label}
              </span>
              <span
                className={`rounded-md px-2 py-1 font-mono text-xs font-black ${changeToneClass(row.percent)}`}
              >
                {formatChangeSymbol(row.percent)}
              </span>
            </div>
          ))}
          <div className="border-t border-[#D8DDE2] pt-3">
            <p className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 text-sm">
              <span className="font-black text-[#030454]">Gross total</span>
              <span
                className={`rounded-md px-2 py-1 font-mono text-xs font-black ${changeToneClass(change.gross)}`}
              >
                {formatChangeSymbol(change.gross)}
              </span>
            </p>
          </div>
        </div>
      ) : (
        <p className="mt-4 rounded-md border border-[#E6EAEC] bg-[#F7F9FA] p-3 text-sm leading-6 text-slate-600">
          N/A
        </p>
      )}
    </div>
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
      <PublicEmptyState
        title="Map View is unavailable because complete LGA-level inventory coverage is not available for the selected year and filters."
        message={`${hasNumber(mapData?.coverage_count) ? formatNumber(mapData.coverage_count, 0) : "Not available"} of ${hasNumber(mapData?.expected_count) ? formatNumber(mapData.expected_count, 0) : 23} LGAs available for map year ${mapData?.year || "selected year"}.`}
      />
    );
  }

  return (
    <div className="min-w-0 overflow-hidden">
      {selectedLga ? (
        <div className="mb-2 flex justify-end">
          <PublicSecondaryButton onClick={() => onFilterChange("geography", ALL)}>
            View all LGAs
          </PublicSecondaryButton>
        </div>
      ) : null}

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
    </div>
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
        "note",
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
        CSV_NOTE,
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
      "note",
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
        "K3C approved GHG inventory entries",
        "",
        CSV_NOTE,
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
    <div className="min-w-0 overflow-hidden rounded-2xl border border-[#e2e8f1] bg-white shadow-[0_8px_24px_rgba(16,25,77,0.05)]">
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
        <button
          type="button"
          onClick={handleDownload}
          disabled={!canDownload}
          className="inline-flex w-fit shrink-0 items-center gap-2 rounded-md border border-[#D8DDE2] bg-gradient-to-br from-white to-[#f7fbf8] px-3 py-2 text-xs font-black text-[#030454] transition hover:border-[#009B35] hover:text-[#009B35] disabled:cursor-not-allowed disabled:opacity-45"
        >
          <Download size={15} aria-hidden="true" />
          Download filtered data (CSV)
        </button>
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
            <thead className="bg-[#f1f4f9] text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">
              <tr>
                <th className="sticky left-0 z-10 min-w-[220px] bg-[#f1f4f9] px-4 py-2.5">
                  Series
                </th>
                {years.map((year) => (
                  <th key={year} className="px-4 py-2.5 text-right">
                    {year}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E6EAEC]">
              {rows.map((row) => (
                <tr
                  key={row.key}
                  className={
                    row.is_total
                      ? "bg-[#edf8f1] font-black text-[#075d35]"
                      : "hover:bg-[#F7F9FA]"
                  }
                >
                  <th
                    scope="row"
                    className="sticky left-0 z-10 bg-inherit px-4 py-2.5 text-[#030454]"
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
                        className="px-4 py-2.5 text-right font-mono text-[#030454]"
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
    </div>
  );
}

function ViewSwitch({ activeView, onChange, mapData }) {
  const mapEligible = Boolean(mapData?.eligible);
  const options = [
    { value: "chart", label: "Chart View", disabled: false },
    { value: "map", label: "Map View", disabled: !mapEligible },
  ];

  return (
    <div className="inline-flex w-fit shrink-0 rounded-md border border-[#D8DDE2] bg-[#F7F9FA] p-1">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          disabled={option.disabled}
          aria-pressed={activeView === option.value}
          onClick={() => onChange(option.value)}
          className={`rounded px-3 py-1.5 text-xs font-black transition focus:outline-none focus:ring-2 focus:ring-[#009B35]/25 disabled:cursor-not-allowed disabled:opacity-50 ${
            activeView === option.value
              ? "bg-[#030454] text-white"
              : "text-[#030454] hover:bg-white"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function MapCoverageLine({ mapData }) {
  return (
    <>
      Map year: <strong className="text-[#030454]">{mapData?.year || "N/A"}</strong>
      {" | "}
      LGA coverage:{" "}
      <strong className="text-[#030454]">
        {hasNumber(mapData?.coverage_count) ? formatNumber(mapData.coverage_count, 0) : "Not available"}/
        {hasNumber(mapData?.expected_count) ? formatNumber(mapData.expected_count, 0) : 23}
      </strong>
    </>
  );
}

function MainVisualization({
  data,
  chart,
  change,
  mapData,
  filters,
  optionLabels,
  visibleKeys,
  onToggleSeries,
  onShowAllSeries,
  activeView,
  onViewChange,
  onFilterChange,
  onReset,
  hasActiveFilters,
  recordCount,
  filterOptions,
}) {
  const chartTitle = getChartTitle(filters, chart);
  const metadataLine = getChartMetadataLine(chart, filters, optionLabels);
  const seriesCount = visibleKeys.length;
  const workspaceTitle = activeView === "map" ? "GHG Emissions Map" : chartTitle;

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-[22px] border border-[#dbe5f0] bg-[radial-gradient(circle_at_95%_0%,#e5f8ef_0,transparent_28%),linear-gradient(135deg,#f5f7ff_0%,#fff_55%,#f0fbf6_100%)] p-5 shadow-[0_14px_38px_rgba(16,32,74,0.05)] sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <span className="text-[10px] font-black uppercase tracking-[0.14em] text-[#078b4b]">
              Interactive Data Explorer
            </span>
            <h2 className="mt-1 text-xl font-black leading-tight text-[#08094e] sm:text-2xl">
              Explore emissions by sector
            </h2>
            <p className="mt-1 max-w-xl text-xs leading-5 text-slate-500">
              Filter approved records by sector, category, gas, geography and
              reporting year, then inspect each sector&rsquo;s contribution below.
            </p>
          </div>
          <span
            aria-hidden="true"
            className="hidden h-[54px] w-[54px] shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-[#08094e] to-[#078b4b] text-2xl text-[#e9ff35] shadow-[0_8px_18px_rgba(8,9,78,0.2)] sm:grid"
          >
            ⌁
          </span>
        </div>

        <div className="mt-5 rounded-2xl border border-[#dce6f1] bg-gradient-to-br from-[#edf2ff] to-[#eaf8f0] p-5 shadow-sm sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <span
                aria-hidden="true"
                className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-[#dce5ff] to-[#d9f5e5] text-lg font-black text-[#173e88]"
              >
                ☰
              </span>
              <div>
                <h3 className="text-sm font-black text-[#08094e]">Filter your view</h3>
                <p className="mt-0.5 text-xs text-slate-500">
                  Narrow the inventory by sector, category, gas, geography or
                  reporting period.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onReset}
              disabled={!hasActiveFilters}
              className="inline-flex w-fit shrink-0 items-center gap-2 rounded-full border border-[#D8DDE2] bg-white px-4 py-2 text-[10px] font-black uppercase tracking-[0.08em] text-[#08094e] shadow-sm transition hover:border-[#009B35] hover:text-[#009B35] disabled:cursor-not-allowed disabled:opacity-45"
            >
              <FilterX size={13} aria-hidden="true" />
              Clear Filters
            </button>
          </div>

          <div className="mt-5">
            <FiltersPanel filters={filters} onFilterChange={onFilterChange} options={filterOptions} />
          </div>
        </div>

        <div className="mt-3">
          <FilterStateSummary
            data={data}
            filters={filters}
            optionLabels={optionLabels}
            hasActiveFilters={hasActiveFilters}
            recordCount={recordCount}
          />
        </div>

        <SectorExplorerBlock
          data={data}
          filters={filters}
          filterOptions={filterOptions}
          onFilterChange={onFilterChange}
        />

        <div className="mt-6 border-t border-[#dbe5f0] pt-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <ViewSwitch activeView={activeView} onChange={onViewChange} mapData={mapData} />
            <p className="text-xs leading-5 text-slate-500">
              {metadataLine}
              {activeView === "map" && (
                <>
                  {" | "}
                  <MapCoverageLine mapData={mapData} />
                </>
              )}
            </p>
          </div>

          <h2 className="mt-4 text-xl font-black leading-tight text-[#030454] sm:text-2xl">
            {workspaceTitle}
          </h2>

          {activeView === "map" ? (
            <div className="mt-3">
              <GhgMapView
                mapData={mapData}
                filters={filters}
                optionLabels={optionLabels}
                onFilterChange={onFilterChange}
              />
            </div>
          ) : (
            <div className="mt-3 grid min-w-0 gap-5 xl:grid-cols-[minmax(0,4fr)_minmax(260px,1.15fr)]">
              <div className="min-w-0 rounded-2xl border border-[#e5ebf4] bg-white p-4">
                <div className="mb-2 flex items-center justify-end">
                  <span className="rounded-md border border-[#D8DDE2] bg-[#F7F9FA] px-3 py-1.5 text-xs leading-5 text-slate-600">
                    <strong className="text-[#030454]">{seriesCount}</strong> visible series
                  </span>
                </div>

                <StackedAreaChart chart={chart} visibleKeys={visibleKeys} />
                <ChartLegend
                  chart={chart}
                  visibleKeys={visibleKeys}
                  onToggleSeries={onToggleSeries}
                  onShowAll={onShowAllSeries}
                />
              </div>

              <ChangePanel chart={chart} visibleKeys={visibleKeys} />
            </div>
          )}
        </div>
      </section>

      <ChartMatrixTable
        chart={chart}
        filters={filters}
        optionLabels={optionLabels}
      />

      <AutomatedObservationsPanel data={data} change={change} />
    </div>
  );
}
function StatusNotice({ status, preview }) {
  const isPreview =
    status?.code === "preview_dataset_not_official" ||
    Boolean(preview?.preview_batch_active);

  const isOfficial =
    status?.code === "official_inventory_published" && !isPreview;

  const isProvisional =
    status?.code === "provisional_tier1_estimate" && !isPreview;

  const badgeLabel = isPreview ? "PREVIEW DATASET" : !isOfficial ? "DATA NOTE" : null;

  const titleText = status?.label || "No public inventory data available";

  const bodyText = isPreview
    ? `These figures are an illustrative preview dataset for demonstrating the inventory explorer, not Kaduna State's official GHG inventory.${
        preview?.genuine_record_count
          ? ` ${preview.genuine_record_count} genuine approved ${
              preview.genuine_record_count === 1 ? "entry" : "entries"
            } exist separately and will be shown once the preview dataset is retired.`
          : ""
      }`
    : isProvisional
      ? "Estimated with IPCC 2006 Tier 1 default factors from satellite data (Google Earth Engine) and open statistics (FAOSTAT). Land use and forestry is held back until its maps are validated, and fossil fuel use is not yet estimated. Not an official submission."
      : "Public inventory values on this page come from approved GHG entries only. Expected project reductions and modelled references are kept separate.";

  if (isOfficial) {
    return (
      <div className="rounded-2xl border border-[#009B35]/30 bg-[#009B35]/10 px-5 py-4">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="mt-0.5 shrink-0 text-[#009B35]" size={20} aria-hidden="true" />
          <div>
            <p className="text-sm font-black text-[#030454]">{titleText}</p>
            <p className="mt-1 text-sm leading-6 text-slate-600">{bodyText}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative rounded-2xl border border-[#ffe3a1] bg-gradient-to-br from-[#fffdf7] to-[#fff2ce] px-5 py-5 shadow-[0_12px_35px_rgba(2,6,45,0.13)]">
      {badgeLabel ? (
        <span className="absolute -top-2.5 right-4 rounded-md bg-[#ffc857] px-2 py-1 text-[8px] font-black uppercase tracking-[0.12em] text-[#5a3900] shadow-sm">
          {badgeLabel}
        </span>
      ) : null}
      <div className="flex items-start gap-3">
        <span className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-[10px] bg-[#fff0c9] text-[#9A6B00]">
          <AlertTriangle size={18} aria-hidden="true" />
        </span>
        <div>
          <p className="text-sm font-black text-[#614914]">{titleText}</p>
          <p className="mt-1 text-sm leading-6 text-[#74613b]">{bodyText}</p>
        </div>
      </div>
    </div>
  );
}

const METRIC_TONE_CLASSES = [
  "border-[#d9dcff] bg-[#eef0ff] text-[#28266f]",
  "border-[#c9eed8] bg-[#e8f8ef] text-[#075f37]",
  "border-[#ffd6dc] bg-[#fff0f1] text-[#982b43]",
  "border-[#f5e6ad] bg-[#fff7df] text-[#805500]",
  "border-[#cfe0ff] bg-[#eef4ff] text-[#1d3f8f]",
];

function MetricCard({ label, value, helper, tone = 0 }) {
  const toneClass = METRIC_TONE_CLASSES[tone % METRIC_TONE_CLASSES.length];
  const [cardRef, cardVisible] = useScrollReveal();

  return (
    <div
      ref={cardRef}
      className={revealClasses(
        cardVisible,
        `group relative overflow-hidden rounded-xl border p-5 duration-200 motion-safe:hover:-translate-y-1 hover:shadow-[0_10px_24px_rgba(8,12,65,0.1)] ${toneClass}`
      )}
      style={{ transitionDelay: cardVisible ? `${tone * 90}ms` : "0ms" }}
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -right-10 -top-10 h-24 w-24 rounded-full bg-current opacity-[0.07] transition-transform duration-500 motion-safe:group-hover:scale-125"
      />
      <p className="relative z-[1] flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.14em] opacity-80">
        <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
        {label}
      </p>
      <p className="relative z-[1] mt-3 text-2xl font-black leading-tight">
        {value}
      </p>
      {helper ? (
        <p className="relative z-[1] mt-2 text-xs leading-5 opacity-80">{helper}</p>
      ) : null}
    </div>
  );
}

function SummaryMetrics({ summary }) {
  const total = summary?.published_total_emissions_tco2e;
  const largestSector = summary?.largest_contributing_sector;

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      <MetricCard
        tone={1}
        label="Total Emissions"
        value={hasNumber(total) ? `${formatNumber(total, 2)} tCO2e` : "Not available"}
        helper="Approved inventory total only."
      />
      <MetricCard
        tone={2}
        label="Sectors Represented"
        value={
          hasNumber(summary?.sectors_represented)
            ? formatNumber(summary?.sectors_represented, 0)
            : "Not available"
        }
        helper="Sectors with approved records in the selected period."
      />
      <MetricCard
        tone={3}
        label="Leading Sector"
        value={largestSector?.sector_label || "Not available"}
        helper={
          largestSector
            ? `${formatNumber(largestSector.share_pct, 1)}% of selected-year total.`
            : "No approved sector total."
        }
      />
    </div>
  );
}

function ExplorerHeader({ data }) {
  const [badgeRef, badgeVisible] = useScrollReveal();
  const [titleRef, titleVisible] = useScrollReveal();
  const [introRef, introVisible] = useScrollReveal();

  return (
    <>
      <section className="relative overflow-hidden bg-gradient-to-br from-[#030454] via-[#0b1455] to-[#063b35] px-4 py-10 text-white sm:px-8 lg:px-10 lg:py-12">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-40 -top-56 h-[34rem] w-[34rem] animate-[spin_38s_linear_infinite] rounded-full border border-[#009B35]/25 motion-reduce:animate-none"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-16 -top-24 h-72 w-72 rounded-full border border-[#F3F74B]/18"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute right-[18%] -bottom-56 h-80 w-80 animate-pulse rounded-full bg-[#009B35] opacity-20 blur-[90px] motion-reduce:animate-none"
        />

        <div className="relative mx-auto grid max-w-[1536px] gap-6 lg:grid-cols-[minmax(0,1fr)_420px] lg:items-start">
          <div>
            <div ref={badgeRef} className={revealClasses(badgeVisible, "inline-block")}>
              <PublicBadge
                active
                className="border-[#F3F74B]/40 bg-white/10 text-[#F3F74B]"
              >
                <CheckCircle2 size={14} aria-hidden="true" />
                Public GHG Inventory
              </PublicBadge>
            </div>

            <h1
              ref={titleRef}
              className={revealClasses(
                titleVisible,
                "mt-5 text-balance font-['Playfair_Display'] text-4xl font-black leading-tight text-white sm:text-5xl"
              )}
              style={{ transitionDelay: titleVisible ? "80ms" : "0ms" }}
            >
              Greenhouse Gas Inventory Explorer
            </h1>

            <p
              ref={introRef}
              className={revealClasses(
                introVisible,
                "mt-4 max-w-3xl text-pretty text-base leading-8 text-white/78"
              )}
              style={{ transitionDelay: introVisible ? "160ms" : "0ms" }}
            >
              Explore approved greenhouse gas inventory information by
              reporting year, sector, emissions source and gas. Public values
              reflect the publication status returned by the backend.
            </p>
          </div>

          <StatusNotice status={data?.inventory_status} preview={data?.preview} />
        </div>
      </section>

      <section className="border-b border-[#D8DDE2] bg-[#F7F9FA] px-4 py-7 sm:px-8 lg:px-10">
        <div className="mx-auto max-w-[1536px]">
          <SummaryMetrics summary={data?.summary || {}} />

          {data?.method ? <Tier1MethodPanel method={data.method} /> : null}
        </div>
      </section>
    </>
  );
}

function Tier1MethodPanel({ method }) {
  const missing = [...(method.not_estimated || []), ...(method.not_occurring || [])];

  return (
    <div className="mt-6">
      <h2 className="text-sm font-black uppercase tracking-[0.12em] text-slate-500">
        Inventory scope
      </h2>
      <div className="mt-3 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="relative overflow-hidden rounded-2xl border border-[#c9ead7] bg-gradient-to-br from-white via-[#f5fcf8] to-[#eaf8f0] p-5 shadow-[0_10px_28px_rgba(16,25,77,0.06)]">
          <span
            aria-hidden="true"
            className="absolute inset-x-0 top-0 h-[5px] bg-gradient-to-r from-[#009B35] to-[#9de2bb]"
          />
          <p className="flex items-center gap-2 text-sm font-black text-[#030454]">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[10px] bg-[#d9f4e4] text-[#087444]">
              ↗
            </span>
            Reported separately ({method.year})
          </p>
          <dl className="mt-4 grid gap-2.5 text-sm">
            <div className="flex items-baseline justify-between gap-4 rounded-lg border border-[#d5ede1] bg-white/75 px-3 py-2.5 transition hover:translate-x-0.5 hover:border-[#009B35]/45">
              <dt className="text-slate-600">
                Land use and forestry (provisional, not in total)
              </dt>
              <dd className="font-black text-[#075f37]">
                {formatNumber(method.lulucf_provisional_tco2e, 0)} tCO2e
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-4 rounded-lg border border-[#d5ede1] bg-white/75 px-3 py-2.5 transition hover:translate-x-0.5 hover:border-[#009B35]/45">
              <dt className="text-slate-600">
                CO2 from firewood and charcoal (memo item, not in total)
              </dt>
              <dd className="font-black text-[#075f37]">
                {formatNumber(method.biogenic_co2_memo_tco2, 0)} tCO2
              </dd>
            </div>
          </dl>
          <p className="mt-3 rounded-lg bg-[#eaf8f0] p-3 text-xs leading-5 text-[#2d4f3f]">
            {method.guideline}. {method.estimated?.length || 0} IPCC categories estimated.
          </p>
          {(method.included_elsewhere || []).map((category) => (
            <p key={category.ipcc_code} className="mt-1 text-xs leading-5 text-slate-600">
              <span className="font-bold text-[#030454]">{category.ipcc_code}</span>{" "}
              {category.name}: {category.reason}
            </p>
          ))}
        </div>

        <div className="relative overflow-hidden rounded-2xl border border-[#f2d9e0] bg-gradient-to-br from-white via-[#fff8fa] to-[#fdf0f3] p-5 shadow-[0_10px_28px_rgba(16,25,77,0.06)]">
          <span
            aria-hidden="true"
            className="absolute inset-x-0 top-0 h-[5px] bg-gradient-to-r from-[#df6680] to-[#ffb4c4]"
          />
          <p className="flex items-center gap-2 text-sm font-black text-[#030454]">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[10px] bg-[#ffe2e9] text-[#a92d4b]">
              +
            </span>
            Not in this estimate
          </p>
          <ul className="mt-4 grid gap-2 sm:grid-cols-2">
            {missing.map((category) => (
              <li
                key={category.ipcc_code}
                title={category.reason}
                className="rounded-lg border border-[#f2dfe4] bg-white/75 px-3 py-2.5 text-xs leading-5 text-slate-700 transition hover:-translate-y-0.5 hover:border-[#e7a9b9]"
              >
                <span className="block font-black text-[#a52d4b]">{category.ipcc_code}</span>
                {category.name}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

function FiltersPanel({
  filters,
  onFilterChange,
  options,
}) {
  return (
    <div className="min-w-0 grow">
      <div className="grid min-w-0 gap-3 grid-cols-2 sm:grid-cols-4">
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
    </div>
  );
}

function FilterStateSummary({ data, filters, optionLabels, hasActiveFilters, recordCount }) {
  const countLabel =
    recordCount !== undefined
      ? `${recordCount} approved record${recordCount === 1 ? "" : "s"} selected.`
      : null;

  const isPreview = Boolean(data?.preview?.preview_batch_active);

  const chips = [
    isPreview && "Preview dataset",
    filters.sector !== ALL && `Sector: ${optionLabels.sector}`,
    filters.category !== ALL && `Category: ${optionLabels.category}`,
    filters.gas !== "CO2e" && `Gas: ${optionLabels.gas}`,
    filters.geography !== ALL && `Geography: ${optionLabels.geography}`,
  ].filter(Boolean);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#D8DDE2] bg-white/85 px-4 py-3">
      <div>
        {countLabel ? (
          <strong className="block text-xs text-[#030454]">{countLabel}</strong>
        ) : null}
        {chips.length > 0 ? (
          <ul className="mt-1.5 flex flex-wrap gap-1.5" aria-label="Active filter summary">
            {chips.map((chip) => (
              <li
                key={chip}
                className="rounded-full border border-[#cdebd8] bg-[#e6f6ec] px-2.5 py-1 text-[11px] font-bold text-[#126e40]"
              >
                {chip}
              </li>
            ))}
          </ul>
        ) : !hasActiveFilters ? (
          <span className="mt-1 block text-[11px] text-slate-500">
            No filters applied — showing the full approved dataset.
          </span>
        ) : null}
      </div>
      <span className="shrink-0 text-xs text-slate-500">
        Reporting period: {optionLabels.year_from}–{optionLabels.year_to}
      </span>
    </div>
  );
}

const SECTOR_SYMBOLS = {
  energy: "ϟ",
  agriculture: "❋",
  waste: "♻",
  ippu: "⚙",
  lulucf: "♧",
};

function SectorTile({ sector, isSelected, onSelect, index = 0 }) {
  const [tileRef, tileVisible] = useScrollReveal();

  return (
    <button
      ref={tileRef}
      type="button"
      onClick={onSelect}
      aria-pressed={isSelected}
      style={{ transitionDelay: tileVisible ? `${index * 60}ms` : "0ms" }}
      className={revealClasses(
        tileVisible,
        `flex min-w-0 flex-col items-start gap-1.5 rounded-2xl border p-4 text-left focus:outline-none focus:ring-2 focus:ring-[#009B35]/25 motion-safe:hover:-translate-y-0.5 ${
          isSelected
            ? "border-2 border-[#009B35] bg-gradient-to-br from-[#e7f8ee] to-white shadow-[0_10px_24px_rgba(7,139,75,0.16)]"
            : "border-[#e0e7f1] bg-white hover:border-[#009B35]/45 hover:shadow-[0_8px_18px_rgba(16,25,77,0.08)]"
        }`
      )}
    >
      <span
        className={`grid h-9 w-9 place-items-center rounded-xl text-lg font-black ${
          isSelected ? "bg-[#078B4B] text-white" : "bg-[#e8edff] text-[#263c9a]"
        }`}
        aria-hidden="true"
      >
        {SECTOR_SYMBOLS[sector.sector] || "◉"}
      </span>
      <p className="text-[11px] font-black leading-tight text-[#030454]">{sector.label}</p>
      <p className="font-mono text-lg font-black leading-tight text-[#030454]">
        {hasNumber(sector.value) ? formatNumber(sector.value, 0) : "—"}
      </p>
      <p className="text-[9px] font-bold uppercase tracking-[0.08em] text-slate-500">
        {hasNumber(sector.value) ? "tCO2e" : "No approved record for this year"}
      </p>
    </button>
  );
}

function SectorDetailStrip({ sector, selectedYear, baselineYear, endValue, changePct, sharePct, isImplied }) {
  if (!sector) return null;

  return (
    <div className="mt-4 grid gap-4 rounded-2xl bg-gradient-to-br from-[#08094e] via-[#10296d] to-[#087448] p-5 text-white sm:grid-cols-[minmax(0,1.6fr)_repeat(3,minmax(0,1fr))] sm:items-center">
      <div>
        <p className="text-[9px] font-black uppercase tracking-[0.14em] text-[#e9ff35]">
          Selected sector
        </p>
        <h3 className="mt-1 text-xl font-black">{sector.label}</h3>
        <p className="mt-1 text-xs leading-5 text-white/75">
          {isImplied
            ? "Leading sector for the current filters. Select a tile above to inspect a different sector."
            : "Selected from the sector tiles above."}
        </p>
      </div>
      <div className="border-t border-white/20 pt-3 sm:border-l sm:border-t-0 sm:pl-4 sm:pt-0">
        <p className="text-[10px] text-white/70">Selected-year value ({selectedYear})</p>
        <p className="mt-1.5 font-mono text-xl font-black text-[#e9ff35]">
          {hasNumber(endValue) ? formatNumber(endValue, 0) : "Not available"}
          {hasNumber(endValue) ? <span className="ml-1 text-xs font-bold text-white"> tCO2e</span> : null}
        </p>
      </div>
      <div className="border-t border-white/20 pt-3 sm:border-l sm:border-t-0 sm:pl-4 sm:pt-0">
        <p className="text-[10px] text-white/70">Change from {baselineYear}</p>
        <p className="mt-1.5 font-mono text-xl font-black text-[#e9ff35]">
          {formatChangeSymbol(changePct)}
        </p>
      </div>
      <div className="border-t border-white/20 pt-3 sm:border-l sm:border-t-0 sm:pl-4 sm:pt-0">
        <p className="text-[10px] text-white/70">Share of displayed subtotal</p>
        <p className="mt-1.5 font-mono text-xl font-black text-[#e9ff35]">
          {hasNumber(sharePct) ? `${formatNumber(sharePct, 1)}%` : "Not available"}
        </p>
      </div>
    </div>
  );
}

function SectorExplorerBlock({ data, filters, filterOptions, onFilterChange }) {
  const sectorYearTotals = data?.totals?.by_sector_year || [];
  const availableYears = [
    ...new Set((data?.metadata?.years || data?.dimensions?.years || []).map(String)),
  ].sort((a, b) => Number(a) - Number(b));
  const latestYear = availableYears[availableYears.length - 1] || filters.year_to;
  const earliestYear = availableYears[0] || filters.year_from;
  const [explorerYear, setExplorerYear] = useState(undefined);
  const effectiveYear = explorerYear || latestYear;
  const sectorOptions = (filterOptions.sectors || []).filter((option) => option.value !== ALL);

  function valueFor(sectorValue, year) {
    const row = sectorYearTotals.find(
      (item) => item.sector === sectorValue && String(item.reporting_year) === String(year)
    );
    return row ? row.emissions_tco2e : null;
  }

  const tiles = sectorOptions.map((option) => ({
    sector: option.value,
    label: option.label,
    value: valueFor(option.value, effectiveYear),
  }));
  const displayedSubtotal = tiles
    .map((tile) => tile.value)
    .filter(hasNumber)
    .reduce((sum, value) => sum + Number(value), 0);
  const hasSubtotal = tiles.some((tile) => hasNumber(tile.value));

  const largestSectorFallback = data?.summary?.largest_contributing_sector?.sector;
  const detailSector = filters.sector !== ALL ? filters.sector : largestSectorFallback || tiles[0]?.sector;
  const detailTile = tiles.find((tile) => tile.sector === detailSector);
  const detailStartValue = detailSector ? valueFor(detailSector, earliestYear) : null;
  const detailEndValue = detailTile?.value;
  const detailChangePct = calcSimplePercentChange(detailStartValue, detailEndValue);
  const detailShare =
    hasSubtotal && hasNumber(detailEndValue) && displayedSubtotal > 0
      ? (Number(detailEndValue) / displayedSubtotal) * 100
      : null;

  if (tiles.length === 0) return null;

  return (
    <div className="mt-5 border-t border-[#dce6f1] pt-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="w-full sm:w-56">
          <YearSelectField
            id="ghg-explorer-year"
            label="Reporting year"
            prefix=""
            value={effectiveYear}
            onChange={setExplorerYear}
            options={availableYears.map((year) => ({ value: year, label: year }))}
          />
        </div>
        <p className="text-xs font-bold text-slate-500">
          Sector totals for {effectiveYear} · select a tile to inspect it
        </p>
      </div>

      <div className="mt-3 grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
        {tiles.map((tile, index) => (
          <SectorTile
            key={tile.sector}
            sector={tile}
            index={index}
            isSelected={filters.sector === tile.sector}
            onSelect={() =>
              onFilterChange("sector", filters.sector === tile.sector ? ALL : tile.sector)
            }
          />
        ))}
      </div>

      <SectorDetailStrip
        sector={detailTile}
        selectedYear={effectiveYear}
        baselineYear={earliestYear}
        endValue={detailEndValue}
        changePct={detailChangePct}
        sharePct={detailShare}
        isImplied={filters.sector === ALL}
      />

      <p className="mt-3 text-[11px] leading-5 text-slate-500">
        Share and change are calculated from the approved sector totals shown above and
        may not reconcile with the filtered chart below, which uses the From/To year
        filters instead of the reporting year selector.
      </p>
    </div>
  );
}

function ObservationCard({ label, value, detail, accent = "green", index = 0 }) {
  const accents = {
    green: { bar: "bg-[#078b4b]", icon: "bg-[#dff7e9] text-[#087446]" },
    violet: { bar: "bg-[#6b5bd2]", icon: "bg-[#eee9ff] text-[#5b48b8]" },
    gold: { bar: "bg-[#d99718]", icon: "bg-[#fff0cf] text-[#925800]" },
  };
  const tone = accents[accent] || accents.green;
  const [cardRef, cardVisible] = useScrollReveal();

  return (
    <div
      ref={cardRef}
      style={{ transitionDelay: cardVisible ? `${index * 90}ms` : "0ms" }}
      className={revealClasses(
        cardVisible,
        "relative overflow-hidden rounded-2xl border border-[#e2e8f0] bg-white p-4 shadow-[0_6px_18px_rgba(12,23,74,0.05)] motion-safe:hover:-translate-y-0.5"
      )}
    >
      <span aria-hidden="true" className={`absolute inset-y-0 left-0 w-1 ${tone.bar}`} />
      <p className="text-[9px] font-black uppercase tracking-[0.12em] text-slate-500">
        {label}
      </p>
      <p className="mt-2 text-lg font-black leading-tight text-[#08094e]">{value}</p>
      {detail ? <p className="mt-1.5 text-xs leading-5 text-slate-600">{detail}</p> : null}
    </div>
  );
}

function AutomatedObservationsPanel({ data, change }) {
  const leadingSector = data?.summary?.largest_contributing_sector;
  const largestIncrease = (change?.rows || [])
    .filter((row) => hasNumber(row.percent) && row.percent > 0)
    .reduce((best, row) => (!best || row.percent > best.percent ? row : best), null);
  const isSingleYear = !change || (change.rows.length === 0 && change.gross === null && (data?.chart?.years || []).length <= 1);
  const isPreview = Boolean(data?.preview?.preview_batch_active);
  const isOfficial = data?.inventory_status?.code === "official_inventory_published";

  return (
    <section className="relative overflow-hidden rounded-[22px] border border-[#d9e5ef] bg-gradient-to-br from-[#f4f6ff] via-white to-[#f0fbf6] p-5 shadow-[0_14px_34px_rgba(16,32,74,0.06)] sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <span className="text-[10px] font-black uppercase tracking-[0.14em] text-[#078b4b]">
            Automated Observations
          </span>
          <h2 className="mt-1 text-xl font-black leading-tight text-[#08094e] sm:text-2xl">
            What the inventory shows
          </h2>
          <p className="mt-1 max-w-xl text-xs leading-5 text-slate-500">
            Deterministic observations calculated from the approved records currently
            displayed. No causal interpretation is implied.
          </p>
        </div>
        {isPreview || isOfficial ? (
          <span
            className={`whitespace-nowrap rounded-full border px-2.5 py-1.5 text-[9px] font-black tracking-[0.08em] ${
              isPreview
                ? "border-[#f3df9d] bg-[#fff1c9] text-[#815500]"
                : "border-[#009B35]/30 bg-[#009B35]/10 text-[#007a29]"
            }`}
          >
            {isPreview ? "PREVIEW · NOT OFFICIAL" : "OFFICIAL INVENTORY"}
          </span>
        ) : null}
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <ObservationCard
          index={0}
          accent="green"
          label="Largest sector, displayed period"
          value={leadingSector?.sector_label || "Not enough data"}
          detail={
            leadingSector
              ? `${formatNumber(leadingSector.share_pct, 1)}% of the displayed total (${formatNumber(leadingSector.emissions_tco2e, 2)} tCO2e).`
              : "No approved records match the current filters."
          }
        />
        <ObservationCard
          index={1}
          accent="violet"
          label="Largest increase among displayed series"
          value={largestIncrease ? largestIncrease.label : "No increasing series"}
          detail={
            largestIncrease
              ? `${formatChangeSymbol(largestIncrease.percent)} over ${change.periodLabel}.`
              : isSingleYear
                ? "Percent change is not available for a single reporting year."
                : "No displayed series increased over the selected period."
          }
        />
        <ObservationCard
          index={2}
          accent="gold"
          label="Displayed subtotal trend"
          value={change ? formatChangeSymbol(change.gross) : "Not available"}
          detail={
            change?.periodLabel
              ? `Gross total across visible series, ${change.periodLabel}.`
              : "Not available for a single reporting year."
          }
        />
      </div>

      <p className="mt-3 text-[11px] leading-5 text-slate-500">
        <strong className="text-[#27365b]">How to read this:</strong> these are arithmetic
        observations from the records currently displayed by your filters, not verified
        findings, and may not reconcile with totals shown elsewhere on this page.
      </p>
    </section>
  );
}

const ABOUT_DATA_ICON_TONES = [
  { bg: "bg-[#eaff5c]", text: "text-[#4d5b00]", glyph: "☰" },
  { bg: "bg-[#8fe0f7]", text: "text-[#0b4a63]", glyph: "↗" },
  { bg: "bg-[#c9b8f7]", text: "text-[#3c2a78]", glyph: "⌘" },
  { bg: "bg-[#7fe0bb]", text: "text-[#0a5c3d]", glyph: "✓" },
  { bg: "bg-[#ffcf6b]", text: "text-[#6b4700]", glyph: "↔" },
  { bg: "bg-[#ffa8bd]", text: "text-[#7a1030]", glyph: "!" },
];

function AboutDataGrid({ items }) {
  return (
    <section className="bg-gradient-to-r from-[#fbf8d6] via-[#eaf7ea] to-[#fdf5e3] px-4 py-12 sm:px-8 lg:px-10">
      <div className="mx-auto max-w-5xl rounded-[28px] border border-[#e7e9c9] bg-white/40 p-6 shadow-[0_14px_38px_rgba(16,32,74,0.05)] sm:p-10">
        <div className="text-center">
          <h2 className="font-['Playfair_Display'] text-3xl font-bold text-[#030454]">
            About the data
          </h2>
          <p className="mx-auto mt-2 max-w-xl text-sm font-semibold leading-6 text-[#3c4a63]">
            Understand the numbers before drawing conclusions.
          </p>
          <p className="mx-auto mt-1 max-w-2xl text-xs leading-6 text-slate-500">
            Key guidance for interpreting the inventory, its units, methodology
            and limitations.
          </p>
        </div>

        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item, index) => {
            const tone = ABOUT_DATA_ICON_TONES[index % ABOUT_DATA_ICON_TONES.length];

            return (
              <AboutDataCard key={item.title} item={item} tone={tone} index={index} />
            );
          })}
        </div>
      </div>
    </section>
  );
}

function AboutDataCard({ item, tone, index }) {
  const [cardRef, cardVisible] = useScrollReveal();

  return (
              <article
                ref={cardRef}
                style={{ transitionDelay: cardVisible ? `${index * 70}ms` : "0ms" }}
                className={revealClasses(
                  cardVisible,
                  "rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-[0_6px_18px_rgba(16,25,77,0.05)] transition motion-safe:hover:-translate-y-0.5 hover:shadow-[0_12px_28px_rgba(16,25,77,0.1)]"
                )}
              >
                <span
                  className={`grid h-9 w-9 place-items-center rounded-lg text-base font-black ${tone.bg} ${tone.text}`}
                  aria-hidden="true"
                >
                  {tone.glyph}
                </span>
                <h3 className="mt-3 text-sm font-black leading-5 text-[#030454]">
                  {item.title}
                </h3>
                <p className="mt-2 text-sm leading-6 text-slate-500">{item.body}</p>
              </article>
  );
}

const SOURCE_CARD_TONES = [
  "border-[#c8ead6] bg-gradient-to-br from-[#e7f8ee] to-white",
  "border-[#f4dfad] bg-gradient-to-br from-[#fff3d8] to-white",
  "border-[#d1e5f8] bg-gradient-to-br from-[#e9f4ff] to-white",
];
const SOURCE_ICON_TONES = [
  "bg-[#d9f4e4] text-[#087444]",
  "bg-[#ffecc4] text-[#8a5900]",
  "bg-[#d9ecff] text-[#1d4ed8]",
];

function SourcesReferencesSection() {
  const sources = [
    {
      title: "K3C approved GHG inventory entries",
      body: "Source for explorer charts, metrics and table records.",
    },
    {
      title: "K3C project records",
      body: "Source for expected project reductions only.",
    },
    {
      title: "Nigeria First Biennial Transparency Report",
      body: "National climate-reporting context only; not a source of Kaduna-specific inventory values.",
      href: "https://unfccc.int/sites/default/files/resource/Nigeria%20BTR1%20.pdf",
      linkLabel: "View official BTR1 document",
    },
  ];

  return (
    <section className="bg-white px-4 py-8 sm:px-8 lg:px-10">
      <div className="mx-auto max-w-[1536px]">
        <PublicCard className="p-5">
        <div className="flex items-start gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#e5deff] text-[#6247bd]">
            <Info size={18} aria-hidden="true" />
          </span>
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
          {sources.map((source, index) => (
            <SourceCard key={source.title} source={source} index={index} />
          ))}
        </div>
        </PublicCard>
      </div>
    </section>
  );
}

function SourceCard({ source, index }) {
  const [cardRef, cardVisible] = useScrollReveal();

  return (
    <div
      ref={cardRef}
      style={{ transitionDelay: cardVisible ? `${index * 90}ms` : "0ms" }}
      className={revealClasses(
        cardVisible,
        `rounded-xl border p-4 motion-safe:hover:-translate-y-1 hover:shadow-[0_9px_20px_rgba(8,13,82,0.06)] ${SOURCE_CARD_TONES[index]}`
      )}
    >
      <span
        className={`mb-2 inline-grid h-8 w-8 place-items-center rounded-[10px] text-sm font-black ${SOURCE_ICON_TONES[index]}`}
      >
        {index + 1}
      </span>
      <p className="text-sm font-black text-[#030454]">{source.title}</p>
      <p className="mt-2 text-sm leading-6 text-slate-600">{source.body}</p>
      {source.href ? (
        <a
          href={source.href}
          target="_blank"
          rel="noreferrer"
          className="mt-3 inline-flex text-xs font-bold text-[#009B35] hover:text-[#00842e]"
        >
          {source.linkLabel}
        </a>
      ) : null}
    </div>
  );
}

// Matches ClimateProject.Sector / GHGInventoryEntry.Sector shared sector
// codes (backend/projects/models.py, backend/ghg/models.py). Only these are
// accepted from ?sector= — anything else falls back to ALL rather than being
// passed through unvalidated.
const VALID_SECTOR_PARAMS = new Set(["energy", "agriculture", "waste", "ippu", "lulucf"]);

function ScrollProgressBar() {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    let frame = null;

    function handleScroll() {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = null;
        const scrollTop = window.scrollY;
        const scrollable = document.documentElement.scrollHeight - window.innerHeight;
        setProgress(scrollable > 0 ? Math.min(1, Math.max(0, scrollTop / scrollable)) : 0);
      });
    }

    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();

    return () => {
      window.removeEventListener("scroll", handleScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div
      aria-hidden="true"
      className="fixed left-0 top-0 z-[60] h-1 w-full bg-transparent"
    >
      <div
        className="h-full bg-[#009B35] transition-[width] duration-150 ease-out motion-reduce:transition-none"
        style={{ width: `${progress * 100}%` }}
      />
    </div>
  );
}

export default function PublicGHGInventoryExplorerPage() {
  // Full page load from e.g. /public/ghg-inventory?sector=agriculture&from_lga=Zaria
  // — read once, stable for the lifetime of this page instance (no client-side router).
  const navParams = new URLSearchParams(window.location.search);
  const sectorParam = navParams.get("sector") || "";
  const fromLgaParam = navParams.get("from_lga") || "";
  const initialSector = VALID_SECTOR_PARAMS.has(sectorParam) ? sectorParam : ALL;

  const [inventoryData, setInventoryData] = useState(null);
  const [statewideInventory, setStatewideInventory] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeView, setActiveView] = useState("chart");
  const [filters, setFilters] = useState({
    year_from: ALL,
    year_to: ALL,
    sector: initialSector,
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
        setStatewideInventory(inventory);

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
  const change = useMemo(
    () => calculateChangeRows(chart, visibleKeys),
    [chart, visibleKeys]
  );
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
      <ScrollProgressBar />

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
          />

          <PublicSection className="bg-[#F7F9FA]">
            <div className="min-w-0 space-y-5">
              {fromLgaParam && (
                <PublicCard className="border-[#173B91]/30 bg-[#EEF1FD] p-4">
                  <p className="text-xs leading-5 text-[#030454]">
                    <strong>Kaduna State GHG context relevant to this project sector.</strong> You followed a
                    suggested project opportunity from {fromLgaParam}. The data below is the existing Kaduna
                    State-wide GHG inventory — it is not an LGA-level emissions figure for {fromLgaParam}.
                  </p>
                </PublicCard>
              )}

              <MainVisualization
                data={inventoryData}
                chart={chart}
                change={change}
                mapData={mapData}
                filters={filters}
                optionLabels={optionLabels}
                visibleKeys={visibleKeys}
                onToggleSeries={handleToggleSeries}
                onShowAllSeries={handleShowAllSeries}
                activeView={activeView}
                onViewChange={handleViewChange}
                onFilterChange={handleFilterChange}
                onReset={resetFilters}
                hasActiveFilters={hasActiveFilters}
                recordCount={records.length}
                filterOptions={filterOptions}
              />

              <GHGInventoryNotes sector={filters.sector} />

              <GHGSectorTransitionDashboard ghg={transitionFromPublicInventory(statewideInventory)} highlightSector={filters.sector} />
            </div>
          </PublicSection>

          <SourcesReferencesSection />

          <AboutDataGrid items={aboutDataItems} />
        </>
      )}

      <PublicPortalFooter />
    </main>
  );
}
