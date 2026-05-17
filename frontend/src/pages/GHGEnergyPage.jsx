import { useEffect, useMemo, useState } from "react";
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

const initialFilters = {
  year: "all",
  status: "all",
  fuel: "all",
  subCategory: "all",
};

function formatNumber(value) {
  const number = Number(value || 0);
  return number.toLocaleString(undefined, {
    maximumFractionDigits: 3,
  });
}

function formatStatus(status) {
  const labels = {
    draft: "Draft",
    pending_review: "Pending Review",
    under_review: "Under Review",
    revision_requested: "Revision Requested",
    rejected: "Rejected",
    approved: "Approved",
  };

  return labels[status] || status;
}

function getStatusClass(status) {
  if (status === "approved") return "bg-emerald-50 text-emerald-700";
  if (status === "pending_review") return "bg-amber-50 text-amber-700";
  if (status === "under_review") return "bg-blue-50 text-blue-700";
  if (status === "revision_requested") return "bg-purple-50 text-purple-700";
  if (status === "rejected") return "bg-red-50 text-red-700";
  return "bg-slate-100 text-slate-700";
}

function canEditEntry(entry) {
  return ["draft", "revision_requested"].includes(entry.status);
}

export default function GHGEnergyPage({ foundation, currentUser }) {
  const [activeTab, setActiveTab] = useState("entry");
  const [options, setOptions] = useState(null);
  const [entries, setEntries] = useState([]);
  const [reviewEntries, setReviewEntries] = useState([]);
  const [summary, setSummary] = useState([]);
  const [form, setForm] = useState(initialForm);
  const [editingEntryId, setEditingEntryId] = useState(null);
  const [filters, setFilters] = useState(initialFilters);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const lgas = foundation?.lgas || [];
  const role = currentUser?.profile?.role;
  const canReview =
    role === "admin" || role === "analyst" || currentUser?.is_superuser;

  const editingEntry = entries.find((entry) => entry.id === editingEntryId);

  async function loadEnergyData() {
    setIsLoading(true);
    setError("");

    try {
      const [optionsData, entriesData] = await Promise.all([
        getEnergyOptions(),
        getEnergyEntries(),
      ]);

      setOptions(optionsData);
      setEntries(entriesData.results || []);
      setSummary(entriesData.summary || []);

      if (canReview) {
        try {
          const reviewData = await getEnergyReviewQueue();
          setReviewEntries(reviewData.results || []);
        } catch (reviewError) {
          console.error(reviewError);
          setReviewEntries([]);
        }
      }
    } catch (err) {
      console.error(err);
      setError("Could not load Energy GHG data.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadEnergyData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canReview]);

  const selectedEmissionFactor = useMemo(() => {
    if (!options) return null;

    return options.emission_factors.find(
      (factor) =>
        factor.fuel_or_species === form.fuel_or_activity &&
        factor.sub_category === form.sub_category
    );
  }, [options, form.fuel_or_activity, form.sub_category]);

  const calculatedPreview = useMemo(() => {
    const quantity = Number(form.quantity || 0);
    const co2Ef = Number(selectedEmissionFactor?.co2_ef || 0);
    const ch4Ef = Number(selectedEmissionFactor?.ch4_ef || 0);
    const n2oEf = Number(selectedEmissionFactor?.n2o_ef || 0);

    const co2Kg = quantity * co2Ef;
    const ch4Kg = quantity * ch4Ef;
    const n2oKg = quantity * n2oEf;
    const co2eTonnes = (co2Kg + ch4Kg * 28 + n2oKg * 265) / 1000;

    return {
      co2Kg,
      ch4Kg,
      n2oKg,
      co2eTonnes,
    };
  }, [form.quantity, selectedEmissionFactor]);

  const filteredEntries = useMemo(() => {
    return entries.filter((entry) => {
      const yearMatches =
        filters.year === "all" || String(entry.year) === filters.year;
      const statusMatches =
        filters.status === "all" || entry.status === filters.status;
      const fuelMatches =
        filters.fuel === "all" || entry.fuel_or_activity === filters.fuel;
      const subCategoryMatches =
        filters.subCategory === "all" ||
        entry.sub_category === filters.subCategory;

      return yearMatches && statusMatches && fuelMatches && subCategoryMatches;
    });
  }, [entries, filters]);

  function updateForm(field, value) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function updateFilter(field, value) {
    setFilters((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function resetForm() {
    setForm(initialForm);
    setEditingEntryId(null);
  }

  function startEditEntry(entry) {
    setEditingEntryId(entry.id);
    setForm({
      year: String(entry.year),
      sub_category: entry.sub_category,
      fuel_or_activity: entry.fuel_or_activity,
      quantity: String(entry.quantity),
      lga: entry.lga ? String(entry.lga) : "",
      notes: entry.notes || "",
      status: entry.status,
    });

    setActiveTab("entry");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setIsSubmitting(true);
    setMessage("");
    setError("");

    const payload = {
      year: Number(form.year),
      sub_category: form.sub_category,
      fuel_or_activity: form.fuel_or_activity,
      quantity: Number(form.quantity),
      lga: form.lga ? Number(form.lga) : null,
      notes: form.notes,
      status: "draft",
    };

    try {
      if (editingEntryId) {
        await updateEnergyEntry(editingEntryId, payload);
        setMessage("Energy GHG entry updated successfully.");
      } else {
        await createEnergyEntry(payload);
        setMessage("Energy GHG entry saved successfully.");
      }

      resetForm();
      await loadEnergyData();
    } catch (err) {
      console.error(err);
      setError(
        err?.response?.data
          ? JSON.stringify(err.response.data)
          : "Could not save Energy GHG entry."
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleSubmitForReview(entryId) {
    setMessage("");
    setError("");

    try {
      await submitEnergyEntry(entryId);
      setMessage("Entry submitted for review.");
      await loadEnergyData();

      if (editingEntryId === entryId) {
        resetForm();
      }
    } catch (err) {
      console.error(err);
      setError(
        err?.response?.data
          ? JSON.stringify(err.response.data)
          : "Could not submit entry for review."
      );
    }
  }

  async function handleReviewAction(entry, action) {
    setMessage("");
    setError("");

    let reviewerComment = "";

    if (action === "request_revision" || action === "reject") {
      reviewerComment = window.prompt("Enter reviewer comment:");

      if (!reviewerComment) {
        setError("Reviewer comment is required for this action.");
        return;
      }
    }

    if (action === "approve") {
      reviewerComment =
        window.prompt(
          "Optional approval comment. Leave blank and press OK to approve:"
        ) || "";
    }

    try {
      const response = await reviewEnergyEntry(entry.id, {
        action,
        reviewer_comment: reviewerComment,
      });

      setMessage(response.message || "Review action completed.");
      await loadEnergyData();
    } catch (err) {
      console.error(err);
      setError(
        err?.response?.data
          ? JSON.stringify(err.response.data)
          : "Could not complete review action."
      );
    }
  }

  function renderEntryForm() {
    return (
      <section className="grid gap-6 xl:grid-cols-3">
        <form
          onSubmit={handleSubmit}
          className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm xl:col-span-1"
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold">
                {editingEntryId ? "Edit Energy Entry" : "New Energy Entry"}
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                {editingEntryId
                  ? "Only Draft or Revision Requested entries can be edited."
                  : "Save as draft first, then submit for review."}
              </p>
            </div>

            {editingEntryId && (
              <button
                type="button"
                onClick={resetForm}
                className="rounded-full border border-slate-200 px-3 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
            )}
          </div>

          {editingEntry?.reviewer_comment && (
            <div className="mt-5 rounded-2xl border border-purple-200 bg-purple-50 p-4 text-sm text-purple-800">
              <p className="font-semibold">Reviewer comment</p>
              <p className="mt-1">{editingEntry.reviewer_comment}</p>
            </div>
          )}

          <div className="mt-6 space-y-4">
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                Inventory Year
              </label>
              <select
                className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                value={form.year}
                onChange={(event) => updateForm("year", event.target.value)}
              >
                {(options?.years || [2024]).map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                Sub-category
              </label>
              <select
                className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                value={form.sub_category}
                onChange={(event) =>
                  updateForm("sub_category", event.target.value)
                }
              >
                {(options?.sub_categories || []).map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                Fuel Type
              </label>
              <select
                className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                value={form.fuel_or_activity}
                onChange={(event) =>
                  updateForm("fuel_or_activity", event.target.value)
                }
              >
                {(options?.fuels || []).map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                LGA
              </label>
              <select
                className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                value={form.lga}
                onChange={(event) => updateForm("lga", event.target.value)}
              >
                <option value="">State-wide / Not LGA-specific</option>
                {lgas.map((lga) => (
                  <option key={lga.lga_id} value={lga.lga_id}>
                    {lga.lga_name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                Quantity consumed
              </label>
              <input
                type="number"
                min="0"
                step="0.001"
                className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                value={form.quantity}
                onChange={(event) =>
                  updateForm("quantity", event.target.value)
                }
                placeholder="Metric tonnes per year"
                required
              />
              <p className="mt-1 text-xs text-slate-500">
                Unit: metric tonnes per year.
              </p>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                Notes / Evidence reference
              </label>
              <textarea
                rows="3"
                className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                value={form.notes}
                onChange={(event) => updateForm("notes", event.target.value)}
                placeholder="Example: source file, agency record, survey note..."
              />
            </div>

            <div className="rounded-2xl bg-slate-50 p-4">
              <p className="text-sm font-semibold text-slate-900">
                Calculation Preview
              </p>
              <div className="mt-3 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-500">Emission factor</span>
                  <span className="font-semibold">
                    {selectedEmissionFactor
                      ? `${selectedEmissionFactor.co2_ef} kg/t`
                      : "—"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">CO₂e result</span>
                  <span className="font-semibold">
                    {formatNumber(calculatedPreview.co2eTonnes)} tCO₂e
                  </span>
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full rounded-xl bg-emerald-600 px-4 py-3 font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-400"
            >
              {isSubmitting
                ? "Saving..."
                : editingEntryId
                ? "Update Energy Entry"
                : "Save Energy Entry"}
            </button>
          </div>
        </form>

        <div className="space-y-6 xl:col-span-2">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-sm text-slate-500">Total Entries</p>
              <p className="mt-2 text-2xl font-bold">{entries.length}</p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-sm text-slate-500">Latest Approved Year</p>
              <p className="mt-2 text-2xl font-bold">
                {summary[0]?.year || "—"}
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-sm text-slate-500">Latest Approved Total</p>
              <p className="mt-2 text-2xl font-bold">
                {summary[0]
                  ? `${formatNumber(summary[0].total_co2e)} tCO₂e`
                  : "—"}
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold">Filters</h2>
                <p className="text-sm text-slate-500">
                  Filter Energy entries by year, status, fuel, and sub-category.
                </p>
              </div>

              <button
                onClick={() => setFilters(initialFilters)}
                className="rounded-full border border-slate-200 px-3 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
              >
                Reset filters
              </button>
            </div>

            <div className="grid gap-4 md:grid-cols-4">
              <select
                className="rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                value={filters.year}
                onChange={(event) => updateFilter("year", event.target.value)}
              >
                <option value="all">All years</option>
                {(options?.years || []).map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>

              <select
                className="rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                value={filters.status}
                onChange={(event) => updateFilter("status", event.target.value)}
              >
                <option value="all">All statuses</option>
                <option value="draft">Draft</option>
                <option value="pending_review">Pending Review</option>
                <option value="under_review">Under Review</option>
                <option value="revision_requested">Revision Requested</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
              </select>

              <select
                className="rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                value={filters.fuel}
                onChange={(event) => updateFilter("fuel", event.target.value)}
              >
                <option value="all">All fuels</option>
                {(options?.fuels || []).map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>

              <select
                className="rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                value={filters.subCategory}
                onChange={(event) =>
                  updateFilter("subCategory", event.target.value)
                }
              >
                <option value="all">All sub-categories</option>
                {(options?.sub_categories || []).map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <EnergyEntriesTable
            entries={filteredEntries}
            isLoading={isLoading}
            onSubmitForReview={handleSubmitForReview}
            onEditEntry={startEditEntry}
          />
        </div>
      </section>
    );
  }

  function renderReviewQueue() {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold">Energy Review Queue</h2>
            <p className="text-sm text-slate-500">
              Review submitted Energy entries and approve, reject, or request correction.
            </p>
          </div>

          <span className="rounded-full bg-emerald-50 px-3 py-1 text-sm font-medium text-emerald-700">
            {reviewEntries.length} records
          </span>
        </div>

        {!canReview ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700">
            Your role cannot access the review queue.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1000px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="px-3 py-3 font-medium">Year</th>
                  <th className="px-3 py-3 font-medium">Fuel</th>
                  <th className="px-3 py-3 font-medium">Sub-category</th>
                  <th className="px-3 py-3 font-medium">Quantity</th>
                  <th className="px-3 py-3 font-medium">CO₂e</th>
                  <th className="px-3 py-3 font-medium">Submitted By</th>
                  <th className="px-3 py-3 font-medium">Status</th>
                  <th className="px-3 py-3 font-medium">Actions</th>
                </tr>
              </thead>

              <tbody>
                {reviewEntries.map((entry) => (
                  <tr
                    key={entry.id}
                    className="border-b border-slate-100 last:border-0"
                  >
                    <td className="px-3 py-4 font-semibold">{entry.year}</td>
                    <td className="px-3 py-4">{entry.fuel_or_activity}</td>
                    <td className="px-3 py-4">{entry.sub_category_display}</td>
                    <td className="px-3 py-4">{formatNumber(entry.quantity)} t</td>
                    <td className="px-3 py-4 font-semibold">
                      {formatNumber(entry.co2e_tonnes)} tCO₂e
                    </td>
                    <td className="px-3 py-4">
                      {entry.submitted_by_username || "—"}
                    </td>
                    <td className="px-3 py-4">
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-medium ${getStatusClass(
                          entry.status
                        )}`}
                      >
                        {formatStatus(entry.status)}
                      </span>
                    </td>
                    <td className="px-3 py-4">
                      <div className="flex flex-wrap gap-2">
                        {entry.status === "pending_review" && (
                          <button
                            onClick={() =>
                              handleReviewAction(entry, "mark_under_review")
                            }
                            className="rounded-full border border-blue-200 px-3 py-1 text-xs font-medium text-blue-700 hover:bg-blue-50"
                          >
                            Mark under review
                          </button>
                        )}

                        {["pending_review", "under_review"].includes(entry.status) && (
                          <>
                            <button
                              onClick={() => handleReviewAction(entry, "approve")}
                              className="rounded-full border border-emerald-200 px-3 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-50"
                            >
                              Approve
                            </button>

                            <button
                              onClick={() =>
                                handleReviewAction(entry, "request_revision")
                              }
                              className="rounded-full border border-purple-200 px-3 py-1 text-xs font-medium text-purple-700 hover:bg-purple-50"
                            >
                              Request revision
                            </button>

                            <button
                              onClick={() => handleReviewAction(entry, "reject")}
                              className="rounded-full border border-red-200 px-3 py-1 text-xs font-medium text-red-700 hover:bg-red-50"
                            >
                              Reject
                            </button>
                          </>
                        )}

                        {!["pending_review", "under_review"].includes(entry.status) && (
                          <span className="text-xs text-slate-400">No action</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}

                {reviewEntries.length === 0 && (
                  <tr>
                    <td
                      colSpan="8"
                      className="px-3 py-8 text-center text-slate-500"
                    >
                      No review records yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>
    );
  }

  return (
    <div className="space-y-8">
      <section>
        <p className="text-sm font-medium text-emerald-700">
          GHG Inventory
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">
          Energy Sector Data Entry
        </h1>
        <p className="mt-2 max-w-3xl text-slate-600">
          Enter annual fuel consumption in metric tonnes. The system calculates
          CO₂e automatically using preloaded emission factors. Approved records
          feed official Energy totals.
        </p>
      </section>

      {(message || error) && (
        <div
          className={`rounded-2xl border p-4 text-sm ${
            error
              ? "border-red-200 bg-red-50 text-red-700"
              : "border-emerald-200 bg-emerald-50 text-emerald-700"
          }`}
        >
          {error || message}
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        <button
          onClick={() => setActiveTab("entry")}
          className={`rounded-full px-5 py-2 text-sm font-medium transition ${
            activeTab === "entry"
              ? "bg-emerald-600 text-white"
              : "bg-white text-slate-600 hover:bg-slate-50"
          }`}
        >
          Data Entry
        </button>

        <button
          onClick={() => setActiveTab("review")}
          className={`rounded-full px-5 py-2 text-sm font-medium transition ${
            activeTab === "review"
              ? "bg-emerald-600 text-white"
              : "bg-white text-slate-600 hover:bg-slate-50"
          }`}
        >
          Review Queue
        </button>
      </div>

      {activeTab === "entry" ? renderEntryForm() : renderReviewQueue()}
    </div>
  );
}

function EnergyEntriesTable({
  entries,
  isLoading,
  onSubmitForReview,
  onEditEntry,
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold">Energy Entries</h2>
          <p className="text-sm text-slate-500">
            Fuel-level emissions calculated by the backend.
          </p>
        </div>
      </div>

      {isLoading ? (
        <p className="text-slate-500">Loading Energy GHG data...</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1000px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="px-3 py-3 font-medium">Year</th>
                <th className="px-3 py-3 font-medium">Sub-category</th>
                <th className="px-3 py-3 font-medium">Fuel</th>
                <th className="px-3 py-3 font-medium">Quantity</th>
                <th className="px-3 py-3 font-medium">CO₂e</th>
                <th className="px-3 py-3 font-medium">Status</th>
                <th className="px-3 py-3 font-medium">Reviewer Comment</th>
                <th className="px-3 py-3 font-medium">Action</th>
              </tr>
            </thead>

            <tbody>
              {entries.map((entry) => (
                <tr
                  key={entry.id}
                  className="border-b border-slate-100 last:border-0"
                >
                  <td className="px-3 py-4 font-semibold">{entry.year}</td>
                  <td className="px-3 py-4">{entry.sub_category_display}</td>
                  <td className="px-3 py-4">{entry.fuel_or_activity}</td>
                  <td className="px-3 py-4">{formatNumber(entry.quantity)} t</td>
                  <td className="px-3 py-4 font-semibold">
                    {formatNumber(entry.co2e_tonnes)} tCO₂e
                  </td>
                  <td className="px-3 py-4">
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-medium ${getStatusClass(
                        entry.status
                      )}`}
                    >
                      {formatStatus(entry.status)}
                    </span>
                  </td>
                  <td className="max-w-xs px-3 py-4 text-xs text-slate-500">
                    {entry.reviewer_comment || "—"}
                  </td>
                  <td className="px-3 py-4">
                    <div className="flex flex-wrap gap-2">
                      {canEditEntry(entry) && (
                        <button
                          onClick={() => onEditEntry(entry)}
                          className="rounded-full border border-blue-200 px-3 py-1 text-xs font-medium text-blue-700 transition hover:bg-blue-50"
                        >
                          Edit
                        </button>
                      )}

                      {canEditEntry(entry) && (
                        <button
                          onClick={() => onSubmitForReview(entry.id)}
                          className="rounded-full border border-emerald-200 px-3 py-1 text-xs font-medium text-emerald-700 transition hover:bg-emerald-50"
                        >
                          Submit for review
                        </button>
                      )}

                      {!canEditEntry(entry) && (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}

              {entries.length === 0 && (
                <tr>
                  <td
                    colSpan="8"
                    className="px-3 py-8 text-center text-slate-500"
                  >
                    No Energy GHG entries found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}