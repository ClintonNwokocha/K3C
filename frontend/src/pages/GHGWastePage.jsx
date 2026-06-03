import GHGSectorWorkspace from "../components/GHGSectorWorkspace";
import {
  createWasteEntry,
  getWasteEntries,
  getWasteOptions,
  getWasteReviewQueue,
  reviewWasteEntry,
  submitWasteEntry,
  updateWasteEntry,
} from "../services/api";

const initialForm = {
  year: "2024",
  sub_category: "solid_waste",
  fuel_or_activity: "open_dump",
  quantity: "",
  lga: "",
  notes: "",
  status: "draft",
};

export default function GHGWastePage({ foundation, currentUser }) {
  return (
    <GHGSectorWorkspace
      foundation={foundation}
      currentUser={currentUser}
      sectorName="Waste"
      title="Waste Sector Data Entry"
      description="Enter waste activity data covering municipal solid waste and population-based wastewater emissions."
      initialForm={initialForm}
      activityLabel="Activity / Waste Stream"
      activityOptionSource="activities"
      quantityUnitFallback="Quantity"
      quantityPlaceholder="Quantity"
      evidencePlaceholder="Example: REMASAB collection record, weighbridge log, NBS population projection..."
      services={{
        createEntry: createWasteEntry,
        getEntries: getWasteEntries,
        getOptions: getWasteOptions,
        getReviewQueue: getWasteReviewQueue,
        reviewEntry: reviewWasteEntry,
        submitEntry: submitWasteEntry,
        updateEntry: updateWasteEntry,
      }}
    />
  );
}