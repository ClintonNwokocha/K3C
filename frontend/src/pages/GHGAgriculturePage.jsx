import GHGSectorWorkspace from "../components/GHGSectorWorkspace";
import {
  createAgricultureEntry,
  getAgricultureEntries,
  getAgricultureOptions,
  getAgricultureReviewQueue,
  reviewAgricultureEntry,
  submitAgricultureEntry,
  updateAgricultureEntry,
} from "../services/api";

const initialForm = {
  year: "2024",
  sub_category: "enteric_fermentation",
  fuel_or_activity: "dairy_cattle",
  quantity: "",
  lga: "",
  notes: "",
  status: "draft",
};

export default function GHGAgriculturePage({ foundation, currentUser }) {
  return (
    <GHGSectorWorkspace
      foundation={foundation}
      currentUser={currentUser}
      sectorName="Agriculture"
      title="Agriculture Sector Data Entry"
      description="Enter agriculture activity data covering enteric fermentation, rice cultivation, and synthetic fertiliser N₂O."
      initialForm={initialForm}
      activityLabel="Activity / Species / Crop"
      activityOptionSource="activities"
      quantityUnitFallback="Quantity"
      quantityPlaceholder="Quantity"
      evidencePlaceholder="Example: livestock census, rice cultivated area record, fertiliser record..."
      services={{
        createEntry: createAgricultureEntry,
        getEntries: getAgricultureEntries,
        getOptions: getAgricultureOptions,
        getReviewQueue: getAgricultureReviewQueue,
        reviewEntry: reviewAgricultureEntry,
        submitEntry: submitAgricultureEntry,
        updateEntry: updateAgricultureEntry,
      }}
    />
  );
}