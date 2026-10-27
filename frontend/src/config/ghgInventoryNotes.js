// Plain-language method, data and limitations of the open-data Tier 1
// inventory (backend/ghg/tier1, method_version tier1_open_v1), shown with
// every view of it. Dataset details: backend/ghg/data/open_activity_v1/README.md.

export const GHG_INVENTORY_OVERVIEW =
  "This is a provisional greenhouse gas inventory for Kaduna State (2018–2025), prepared with the IPCC 2006 Guidelines (Tier 1). " +
  "It is built from remote sensing (satellite) data and open-source datasets. National statistics are shared out to LGAs " +
  "using maps of population, land use, roads and livestock, so LGA values are estimates, not measurements. Figures should " +
  "be treated as indicative until they are verified with state data and independently reviewed.";

export const GHG_SHORT_NOTE = "Provisional estimate from remote sensing and open-source data.";

export const GHG_CSV_NOTE =
  "Provisional estimate from remote sensing and open-source datasets (IPCC 2006 Tier 1); see the inventory page for method and limitations.";

export const GHG_SECTOR_NOTES = {
  energy: {
    label: "Energy",
    method: "Fuel use for transport, households and industry is estimated from national energy statistics and shared out to LGAs.",
    sources: "Open-source energy statistics, road and rail maps, population and wealth maps.",
    limitations: "Fuel use is not based on Kaduna sales data. Generators and the refinery are not yet included.",
  },
  agriculture: {
    label: "Agriculture",
    method: "Livestock numbers, crop areas and fertiliser use are estimated from national statistics and shared out to LGAs. Fires are mapped from satellite imagery.",
    sources: "Remote sensing (burned area, land cover, climate) and open-source livestock and crop maps.",
    limitations: "The maps don't change from year to year. Some values, such as rice, need checking against state records.",
  },
  waste: {
    label: "Waste",
    method: "Waste and wastewater emissions are estimated from population, using standard IPCC values.",
    sources: "Satellite-derived population data and IPCC default values.",
    limitations: "Waste collection and sanitation levels are assumed. Industrial wastewater is not yet included.",
  },
  ippu: {
    label: "Industry (IPPU)",
    method: "Industrial sites were screened using open-source maps.",
    sources: "Open-source facility maps.",
    limitations: "No cement or lime plants were found. Refrigerants and other industrial gases are not yet included.",
  },
  lulucf: {
    label: "Land use and forestry (LULUCF)",
    method: "Land-cover change and forest biomass are mapped from satellite imagery.",
    sources: "Remote sensing land-cover and biomass datasets.",
    limitations: "Shown separately and not included in totals until the map accuracy is confirmed.",
  },
};

export const GHG_SECTOR_ORDER = ["energy", "agriculture", "waste", "ippu", "lulucf"];
