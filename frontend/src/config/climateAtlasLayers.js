export const CLIMATE_ATLAS_LAYER_ORDER = [
  "rainfall",
  "ndvi",
  "lst",
  "rainfall_anomaly",
  "drought_index",
  "elevation",
  "flood_occurrence",
];

export const CLIMATE_ATLAS_LAYER_CONFIGS = {
  rainfall: {
    key: "rainfall",
    selectorLabel: "Rainfall Total (mm)",
    displayLabel: "Rainfall Total",
    backendLayerKeys: ["rainfall"],
    unit: "mm",
    description: "CHIRPS accumulated rainfall totals.",
    scientificCaution: "Rainfall Total is CHIRPS accumulated rainfall and is not a rainfall anomaly.",
    dataSource: "CHIRPS v2.0 Daily",
    coverageNote: "Coverage: Annual/Wet 1981-2025, Dry 1982-2025",
    statistic: {
      label: "Spatial mean",
      detail: "Spatial mean accumulated rainfall across the selected LGA and period.",
    },
    legend: {
      type: "rainfall",
      colors: ["#eff3ff", "#bdd7e7", "#6baed6", "#2171b5", "#084594"],
      defaultTicks: ["0", "700", "1000", "1300", "1600+"],
      caption: "Accumulated total · mm · CHIRPS v2.0",
    },
    popup: {
      title: "Rainfall Total",
      valueLabel: "Rainfall Total",
      sourceLabel: "Source",
      sourceValue: "CHIRPS v2.0 Daily",
      seasonLabel: "Season",
      yearLabel: "Year",
      noDataMessage: "No Rainfall Total data available for this selection.",
      mapCaption: "Accumulated rainfall total",
    },
    availability: {
      requiredLayerKeys: ["rainfall"],
    },
  },
  ndvi: {
    key: "ndvi",
    selectorLabel: "Vegetation / NDVI",
    displayLabel: "Vegetation / NDVI",
    backendLayerKeys: ["ndvi", "ndvi_landsat"],
    unit: "NDVI",
    description: "Unified NDVI across Landsat and Sentinel-2 archives.",
    scientificCaution: "Unified NDVI uses Landsat before 2018 and Sentinel-2 from 2018 onward. Landsat and Sentinel-2 NDVI remain scientifically distinct.",
    dataSourceNote: "ℹ NDVI source changes from Landsat before 2018 to Sentinel-2 from 2018. Interpret cross-source comparisons with care.",
    dataSource: "Sentinel-2 Surface Reflectance Harmonized",
    coverageNote: "Coverage: 2018-2025",
    archiveCoverageNote: "Archive: 1985-2017, with gaps",
    statistic: {
      label: "Spatial mean",
      detail: "Mean NDVI across the selected LGA and period.",
    },
    legend: {
      type: "ndvi",
      colors: ["#b2d8e8", "#e8d5a3", "#c8e07a", "#8ec541", "#4aad52", "#2d7d32", "#1a5e20"],
      defaultTicks: ["<0", "0.1", "0.35", "0.5", "0.8+"],
      caption: "Vegetation index · NDVI",
    },
    popup: {
      title: "Vegetation / NDVI",
      landsatTitle: "Historical NDVI (Landsat)",
      sentinelTitle: "NDVI",
      valueLabel: "NDVI",
      sourceLabel: "Source",
      sourceValue: "Sentinel-2 Surface Reflectance Harmonized",
      landsatSourceValue: "Landsat Collection 2 Level-2 Surface Reflectance",
      seasonLabel: "Season",
      yearLabel: "Year",
      sensorLabel: "Sensor",
      coverageLabel: "Coverage",
      archiveFallbackMessage: "Archive fallback: primary sensor had no scenes for this window.",
      noDataMessage: "No NDVI data available for this selection.",
      landsatNoDataMessage: "No Landsat archive scene available for this LGA and period.",
      landsatStatusBarNoDataMessage: "No Landsat archive available for this LGA and period. Archive gaps exist – try a different year or season.",
      mapCaption: "Vegetation index · NDVI",
      sourceHelp: "Landsat before 2018 and Sentinel-2 from 2018 onward.",
    },
    availability: {
      requiredLayerKeys: ["ndvi", "ndvi_landsat"],
    },
  },
  lst: {
    key: "lst",
    selectorLabel: "Land Surface Temperature (Daytime)",
    displayLabel: "Land Surface Temperature (Daytime)",
    backendLayerKeys: ["lst"],
    unit: "°C",
    description: "MODIS Terra daily daytime land surface temperature.",
    scientificCaution: "LST is land surface temperature, not air temperature.",
    dataSourceNote: "ℹ Daytime LST from MODIS Terra. Not equivalent to air temperature. QC-filtered daily mean.",
    dataSource: "MODIS Terra Daily Land Surface Temperature",
    coverageNote: "Coverage: 2001-2025",
    statistic: {
      label: "Spatial mean",
      detail: "Daily quality-filtered mean daytime LST (°C) across the selected LGA and period.",
    },
    legend: {
      type: "lst",
      colors: ["#4575b4", "#91bfdb", "#fee090", "#fc8d59", "#d73027"],
      defaultTicks: ["20°C", "25°C", "30°C", "35°C", "40°C+"],
      caption: "Daytime LST · °C · MODIS Terra",
    },
    popup: {
      title: "Daytime LST",
      valueLabel: "Daytime LST",
      sourceLabel: "Source",
      sourceValue: "MODIS Terra MOD11A1",
      bandLabel: "Band",
      bandValue: "LST_Day_1km",
      seasonLabel: "Season",
      yearLabel: "Year",
      coverageLabel: "Coverage",
      scenesLabel: "Scenes",
      noDataMessage: "No LST data available for this selection.",
      mapCaption: "Daytime LST",
    },
    availability: {
      requiredLayerKeys: ["lst"],
    },
  },
  rainfall_anomaly: {
    key: "rainfall_anomaly",
    selectorLabel: "Rainfall Anomaly (%)",
    displayLabel: "Rainfall Anomaly (%)",
    backendLayerKeys: ["rainfall_anomaly"],
    unit: "%",
    description: "Percentage departure from the 1991-2020 local LGA rainfall baseline.",
    scientificCaution: "Rainfall Anomaly is percentage departure from the 1991-2020 local LGA baseline and is not a drought index.",
    dataSourceNote: "ℹ Rainfall anomaly expresses departure from the 1991–2020 local rainfall baseline. It is not a drought index and should be interpreted alongside seasonal rainfall totals.",
    dataSource: "CHIRPS v2.0 Daily, 1991-2020 LGA baseline",
    coverageNote: "Coverage: Annual/Wet 1981-2025, Dry 1982-2025",
    statistic: {
      label: "Percentage departure",
      detail: "Percentage departure of selected rainfall total from the 1991-2020 baseline mean for the same LGA and season.",
    },
    legend: {
      type: "rainfall_anomaly",
      colors: ["#8c510a", "#dfc27d", "#f6e8c3", "#f5f5f5", "#c7eae5", "#80cdc1", "#01665e"],
      defaultTicks: ["-60%", "-20%", "0%", "+20%", "+60%+"],
      caption: "Departure from 1991-2020 baseline · % · CHIRPS",
    },
    popup: {
      title: "Rainfall Anomaly",
      valueLabel: "Rainfall anomaly",
      sourceLabel: "Source",
      sourceValue: "CHIRPS v2.0 Daily",
      seasonLabel: "Season",
      yearLabel: "Year",
      observedLabel: "Observed",
      baselineLabel: "1991-2020 baseline",
      differenceLabel: "Difference",
      baselineYearsLabel: "Baseline years",
      methodLabel: "Method",
      methodValue: "Percentage departure from 1991-2020 LGA seasonal baseline",
      noDataMessage: "No Rainfall Anomaly data available for this selection.",
      mapCaption: "Departure from 1991-2020 baseline",
      directionLabels: {
        above: "Above baseline rainfall",
        below: "Below baseline rainfall",
        near: "Near baseline rainfall",
      },
      description: "Rainfall Anomaly is not a drought index. Negative values indicate drier than the 1991-2020 CHIRPS baseline; positive values indicate wetter. Interpret alongside seasonal rainfall totals.",
    },
    availability: {
      requiredLayerKeys: ["rainfall_anomaly"],
    },
  },
  drought_index: {
    key: "drought_index",
    selectorLabel: "Meteorological Drought Conditions (SPI)",
    displayLabel: "Meteorological Drought Conditions (SPI)",
    backendLayerKeys: ["drought_index"],
    unit: "SPI",
    description: "Precipitation-only meteorological drought/wetness indicator.",
    scientificCaution: "SPI is precipitation-only meteorological drought/wetness and is not agricultural, hydrological, groundwater, soil-moisture, or crop-stress drought.",
    dataSource: "CHIRPS v2.0 Daily rainfall totals",
    coverageNote: "Coverage: Annual/Wet 1981-2025, Dry 1982-2025",
    statistic: {
      label: "Standardized Precipitation Index",
      detail: "Fixed-window precipitation-only SPI calculated separately by LGA and seasonal window against a 1991-2020 baseline.",
    },
    legend: {
      type: "drought_index",
      rows: [
        ["#7f2704", "SPI <= -2.0", "Extreme drought"],
        ["#d94801", "-2.0 < SPI <= -1.5", "Severe drought"],
        ["#fdae6b", "-1.5 < SPI <= -1.0", "Moderate drought"],
        ["#f7f7f7", "-1.0 < SPI < 1.0", "Near normal"],
        ["#9ecae1", "1.0 <= SPI < 1.5", "Moderately wet"],
        ["#3182bd", "1.5 <= SPI < 2.0", "Very wet"],
        ["#08519c", "SPI >= 2.0", "Extremely wet"],
      ],
      caption: "Fixed SPI categories. Only SPI <= -1.0 is classified as drought.",
    },
    popup: {
      title: "SPI",
      valueLabel: "SPI",
      sourceLabel: "Source",
      sourceValue: "CHIRPS v2.0 Daily rainfall totals",
      methodLabel: "Method",
      methodValue: "fixed-window precipitation-only SPI",
      seasonLabel: "Season",
      yearLabel: "Year",
      observedLabel: "Observed rainfall",
      baselineYearsLabel: "1991-2020 baseline years",
      categoryLabel: "Category",
      noDataMessage: "No SPI data available for this selection because the rainfall baseline could not be fit with enough valid observations.",
      mapCaption: "Fixed SPI categories",
      droughtFloor: "SPI <= -1.0",
      description: "This indicator is a fixed-window precipitation-only SPI calculated separately for each LGA and seasonal window against a 1991-2020 baseline. It does not measure soil moisture, crop stress, streamflow, or groundwater drought.",
    },
    availability: {
      requiredLayerKeys: ["drought_index"],
    },
  },
  elevation: {
    key: "elevation",
    selectorLabel: "Elevation LGA Summary — SRTM approximately 2000",
    displayLabel: "Elevation LGA Summary — SRTM approximately 2000",
    backendLayerKeys: ["elevation"],
    unit: "m",
    description: "Mean LGA terrain elevation derived from the USGS SRTMGL1 v003 dataset (approximately 30 m source resolution, SRTM mission ~2000). Static terrain context only.",
    dataSource: "USGS SRTMGL1 v003 (NASA SRTM mission)",
    coverageNote: "Static DEM · approximately 2000 SRTM mission · ~30 m source resolution",
    statistic: {
      label: "Mean elevation",
      detail: "Mean SRTM-derived terrain elevation across the selected LGA (approximately 2000).",
    },
    legend: {
      type: "elevation",
      colors: ["#f7fcf5", "#c7e9c0", "#74c476", "#238b45", "#00441b"],
      defaultTicks: ["<550 m", "550", "650", "750", "≥850 m"],
      caption: "Mean elevation · metres above sea level · SRTM ~30 m",
    },
    popup: {
      title: "Elevation LGA Summary — SRTM approximately 2000",
      valueLabel: "Mean elevation",
      sourceLabel: "Source",
      sourceValue: "USGS SRTMGL1 v003",
      noDataMessage: "No elevation data available for this LGA.",
      mapCaption: "Mean terrain elevation",
    },
    availability: {
      requiredLayerKeys: ["elevation"],
    },
  },
  flood_occurrence: {
    key: "flood_occurrence",
    selectorLabel: "Historical Surface Water Occurrence — 1984–2021 archive",
    displayLabel: "Historical Surface Water Occurrence — 1984–2021 archive",
    backendLayerKeys: ["flood_occurrence"],
    unit: "%",
    description: "Mean LGA surface water occurrence across the 1984–2021 Landsat observation period (JRC Global Surface Water v1.4). Static archive.",
    dataSource: "JRC Global Surface Water v1.4 (Landsat 1984–2021)",
    coverageNote: "Static archive · 1984–2021 · ~30 m Landsat",
    statistic: {
      label: "Mean occurrence",
      detail: "Mean percentage of the 1984–2021 observation period that open surface water was detected across the selected LGA.",
    },
    legend: {
      type: "flood_occurrence",
      colors: ["#f7fbff", "#c6dbef", "#6baed6", "#2171b5", "#084594"],
      defaultTicks: ["0%", "5%", "15%", "30%", "≥60%"],
      caption: "Surface water occurrence · % of 1984–2021 period · JRC GSW v1.4",
    },
    popup: {
      title: "Historical Surface Water Occurrence — 1984–2021 archive",
      valueLabel: "Mean occurrence",
      archivePeriod: "1984–2021 archive",
      sourceLabel: "Source",
      sourceValue: "JRC Global Surface Water v1.4",
      noDataMessage: "No historical surface water data available for this LGA.",
      mapCaption: "Historical surface water occurrence",
    },
    availability: {
      requiredLayerKeys: ["flood_occurrence"],
    },
  },
};

// Internal-preview Elevation config.  NOT in CLIMATE_ATLAS_LAYER_ORDER.
// Gated via ?internal_elevation_preview=1.
export const ELEVATION_INTERNAL_CONFIG = {
  key: "elevation",
  selectorLabel: "Elevation (m) [PREVIEW]",
  displayLabel: "Elevation",
  source: "elevation_preview",
  unit: "m",
  dataSource: "USGS SRTMGL1 v003",
  coverageNote: "Static DEM · ~2000 SRTM mission · 30 m",
  scientificCaution:
    "Static topographic layer, not a climate variable or forecast. " +
    "SRTM elevation reflects terrain as of ~2000 and does not capture subsequent land-surface changes.",
};

// Internal-preview Flood Occurrence config.  NOT in CLIMATE_ATLAS_LAYER_ORDER.
// Gated via ?internal_flood_preview=1.
export const FLOOD_OCCURRENCE_INTERNAL_CONFIG = {
  key: "flood_occurrence",
  selectorLabel: "Historical Surface Water Occurrence [PREVIEW]",
  displayLabel: "Surface Water Occurrence (1984–2021)",
  source: "flood_occurrence_preview",
  unit: "%",
  dataSource: "JRC Global Surface Water v1.4 (Landsat 1984–2021)",
  coverageNote: "Static archive · 1984–2021 · 30 m Landsat",
  scientificCaution:
    "Historical surface-water occurrence indicator (1984–2021). " +
    "Not a real-time alert and not a flood forecast. " +
    "Consult official sources for current flood conditions.",
};

// Internal-preview LULC config.  NOT in CLIMATE_ATLAS_LAYER_ORDER — never shown
// in the public selector.  Accessed only via the ?internal_lulc_preview=1 gate.
export const ANNUAL_LULC_INTERNAL_CONFIG = {
  key: "annual_lulc",
  selectorLabel: "Annual Land Use / Land Cover [PREVIEW]",
  displayLabel: "Annual LULC (internal preview)",
  source: "lulc_preview",
  unit: "dominant class",
  dataSource: "Dynamic World v1 (Google)",
  coverageNote: "Sep–Oct composite · 2018–present · 2024 validated only",
  scientificCaution:
    "This is an internal QA preview. Data is not published and not yet validated. " +
    "Shows annual land-use / land-cover classification for a selected year only. " +
    "Do not use for change analysis, trend claims, or public communications.",
};

export function getAtlasLayerConfig(key) {
  return CLIMATE_ATLAS_LAYER_CONFIGS[key] || null;
}

export function getAtlasAvailableLayerConfigs(publicLayerKeys) {
  const keySet = publicLayerKeys instanceof Set ? publicLayerKeys : new Set(publicLayerKeys || []);

  return CLIMATE_ATLAS_LAYER_ORDER
    .map((key) => CLIMATE_ATLAS_LAYER_CONFIGS[key])
    .filter((config) => config.availability.requiredLayerKeys.every((layerKey) => keySet.has(layerKey)));
}

export function getAtlasSelectorOptions(publicLayerKeys) {
  return getAtlasAvailableLayerConfigs(publicLayerKeys).map((config) => ({
    key: config.key,
    label: config.selectorLabel,
    unit: config.unit,
  }));
}

export function getAtlasRuntimeCopy(key, year) {
  const config = getAtlasLayerConfig(key);
  if (!config) return null;

  if (key === "ndvi") {
    return {
      dataSource: year <= 2017 ? "Landsat Collection 2 Level-2 Surface Reflectance" : "Sentinel-2 Surface Reflectance Harmonized",
      coverageNote: year <= 2017 ? config.popup.archiveCoverageNote || config.archiveCoverageNote : config.coverageNote,
    };
  }

  return {
    dataSource: config.dataSource,
    coverageNote: config.coverageNote || "",
  };
}

export function getAtlasVariableStatistic(key) {
  return getAtlasLayerConfig(key)?.statistic || null;
}

export function getAtlasLegendState(key, { rainfallBreaks = null, anomalyBreaks = null } = {}) {
  const config = getAtlasLayerConfig(key);
  if (!config) return null;

  if (key === "rainfall") {
    return {
      type: "rainfall",
      colors: config.legend.colors,
      labels: rainfallBreaks
        ? [
            "0",
            Math.round(rainfallBreaks[0]).toString(),
            Math.round(rainfallBreaks[1]).toString(),
            Math.round(rainfallBreaks[2]).toString(),
            `${Math.round(rainfallBreaks[3])}+`,
          ]
        : config.legend.defaultTicks,
      caption: config.legend.caption,
    };
  }

  if (key === "rainfall_anomaly") {
    return {
      type: "rainfall_anomaly",
      colors: config.legend.colors,
      labels: anomalyBreaks
        ? [
            `${Math.round(anomalyBreaks[0])}%`,
            `${Math.round(anomalyBreaks[1])}%`,
            "0%",
            `+${Math.round(anomalyBreaks[2])}%`,
            `+${Math.round(anomalyBreaks[3])}%+`,
          ]
        : config.legend.defaultTicks,
      caption: config.legend.caption,
    };
  }

  return {
    type: config.legend.type,
    colors: config.legend.colors,
    labels: config.legend.defaultTicks,
    caption: config.legend.caption,
    rows: config.legend.rows || [],
  };
}

export function getAtlasNoDataMessage(key, { isNdviLandsat = false } = {}) {
  const config = getAtlasLayerConfig(key);
  if (!config) return "No data available for this selection.";

  if (key === "ndvi") {
    return isNdviLandsat ? config.popup.landsatNoDataMessage : config.popup.noDataMessage;
  }

  return config.popup.noDataMessage || "No data available for this selection.";
}

export function getAtlasStatusBarNoDataMessage(key, { isNdviLandsat = false } = {}) {
  if (key === "ndvi" && isNdviLandsat) {
    return getAtlasLayerConfig("ndvi")?.popup?.landsatStatusBarNoDataMessage
      || "No Landsat archive available for this LGA and period.";
  }
  return getAtlasNoDataMessage(key);
}

