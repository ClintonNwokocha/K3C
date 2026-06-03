import GHGSectorWorkspace from "../components/GHGSectorWorkspace";
import {
  createIPPUEntry,
  getIPPUEntries,
  getIPPUOptions,
  getIPPUReviewQueue,
  reviewIPPUEntry,
  submitIPPUEntry,
  updateIPPUEntry,
} from "../services/api";

const initialForm = {
  year: "2024",
  sub_category: "mineral_products",
  fuel_or_activity: "cement",
  quantity: "",
  lga: "",
  notes: "",
  status: "draft",
};

export default function GHGIPPUPage({ foundation, currentUser }) {
  return (
    <GHGSectorWorkspace
      foundation={foundation}
      currentUser={currentUser}
      sectorName="IPPU"
      title="IPPU Sector Data Entry"
      description="Enter industrial processes and product-use activity data covering mineral products and refrigerant gas leakage."
      initialForm={initialForm}
      activityLabel="Activity / Product"
      activityOptionSource="activities"
      quantityUnitFallback="Quantity"
      quantityPlaceholder="Quantity"
      evidencePlaceholder="Example: construction records, industrial permits, refrigerant servicing records..."
      services={{
        createEntry: createIPPUEntry,
        getEntries: getIPPUEntries,
        getOptions: getIPPUOptions,
        getReviewQueue: getIPPUReviewQueue,
        reviewEntry: reviewIPPUEntry,
        submitEntry: submitIPPUEntry,
        updateEntry: updateIPPUEntry,
      }}
    />
  );
}