import GHGSectorWorkspace from "../components/GHGSectorWorkspace";
import {
  createEnergyEntry,
  getEnergyEntries,
  getEnergyOptions,
  getEnergyReviewQueue,
  reviewEnergyEntry,
  submitEnergyEntry,
  updateEnergyEntry,
} from "../services/api";

const initialForm = {
  year: "2024",
  sub_category: "stationary_combustion",
  fuel_or_activity: "diesel",
  quantity: "",
  lga: "",
  notes: "",
  status: "draft",
};

export default function GHGEnergyPage({ foundation, currentUser }) {
  return (
    <GHGSectorWorkspace
      foundation={foundation}
      currentUser={currentUser}
      sectorName="Energy"
      title="Energy Sector Data Entry"
      description="Enter annual fuel consumption in metric tonnes. The system calculates CO₂e automatically using preloaded emission factors. Approved records feed official Energy totals."
      initialForm={initialForm}
      activityLabel="Fuel Type"
      activityOptionSource="fuels"
      quantityUnitFallback="metric tonnes per year"
      quantityPlaceholder="Metric tonnes per year"
      evidencePlaceholder="Example: source file, agency record, survey note..."
      services={{
        createEntry: createEnergyEntry,
        getEntries: getEnergyEntries,
        getOptions: getEnergyOptions,
        getReviewQueue: getEnergyReviewQueue,
        reviewEntry: reviewEnergyEntry,
        submitEntry: submitEnergyEntry,
        updateEntry: updateEnergyEntry,
      }}
    />
  );
}