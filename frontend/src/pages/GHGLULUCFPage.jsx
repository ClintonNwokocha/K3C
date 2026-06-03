import GHGSectorWorkspace from "../components/GHGSectorWorkspace";
import {
  createLULUCFEntry,
  getLULUCFEntries,
  getLULUCFOptions,
  getLULUCFReviewQueue,
  reviewLULUCFEntry,
  submitLULUCFEntry,
  updateLULUCFEntry,
} from "../services/api";

const initialForm = {
  year: "2024",
  sub_category: "deforestation",
  fuel_or_activity: "forest_to_cropland",
  quantity: "",
  lga: "",
  notes: "",
  status: "draft",
};

export default function GHGLULUCFPage({ foundation, currentUser }) {
  return (
    <GHGSectorWorkspace
      foundation={foundation}
      currentUser={currentUser}
      sectorName="LULUCF"
      title="LULUCF Sector Data Entry"
      description="Enter land use, land-use change and forestry activity data in hectares. Positive values represent emissions from land conversion, while negative values represent removals from afforestation."
      initialForm={initialForm}
      activityLabel="Land-use Activity"
      activityOptionSource="activities"
      quantityUnitFallback="hectares"
      quantityPlaceholder="Hectares"
      evidencePlaceholder="Example: KADGIS land cover analysis, Forestry Commission afforestation records, land-use transition table..."
      removalSector
      services={{
        createEntry: createLULUCFEntry,
        getEntries: getLULUCFEntries,
        getOptions: getLULUCFOptions,
        getReviewQueue: getLULUCFReviewQueue,
        reviewEntry: reviewLULUCFEntry,
        submitEntry: submitLULUCFEntry,
        updateEntry: updateLULUCFEntry,
      }}
    />
  );
}