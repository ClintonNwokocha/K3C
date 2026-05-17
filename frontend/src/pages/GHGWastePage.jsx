import { useEffect, useMemo, useState } from "react";
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

function formatNumber(value) {
  return Number(value || 0).toLocaleString(undefined, {
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

export default function GHGWastePage({ foundation, currentUser }) { 
  const [activeTab, setActiveTab] = useState("entry");
  const [options, setOptions] = useState(null);
  const [entries, setEntries] = useState([]);
  const [reviewEntries, setReviewEntries] = useState([]);
  const [summary, setSummary] = useState([]);
  const [form, setForm] = useState(initialForm);
  const [editingEntryId, setEditingEntryId] = useState(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const lgas = foundation?.lgas || [];
  const role = currentUser?.profile?.role;
  const canReview =
    role === "admin" || role === "analyst" || currentUser?.is_superuser;

  const editingEntry = entries.find((entry) => entry.id === editingEntryId);

  const activityOptions = useMemo(() => {
    return (options?.activities || []).filter(
      (item) => item.sub_category === form.sub_category
    );
  }, [options, form.sub_category]);

  const selectedSubCategory = useMemo(() => {
    return (options?.sub_categories || []).find(
      (item) => item.value === form.sub_category
    );
  }, [options, form.sub_category]);

  const selectedEmissionFactor = useMemo(() => {
    return (options?.emission_factors || []).find(
      (factor) =>
        factor.sub_category === form.sub_category &&
        factor.fuel_or_species === form.fuel_or_activity
    );
  }, [options, form.sub_category, form.fuel_or_activity]);

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

  async function loadWasteData() {
    setIsLoading(true);
    setError("");

    try {
      const [optionsData, entriesData] = await Promise.all([
        getWasteOptions(),
        getWasteEntries(),
      ]);

      setOptions(optionsData);
      setEntries(entriesData.results || []);
      setSummary(entriesData.summary || []);

      if (canReview) {
        const reviewData = await getWasteReviewQueue();
        setReviewEntries(reviewData.results || []);
      }
    } catch (err) {
      console.error(err);
      setError("Could not load Waste GHG data.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadWasteData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canReview]);

  function updateForm(field, value) {
    setForm((current) => {
      const next = { ...current, [field]: value };

      if (field === "sub_category") {
        const firstActivity = (options?.activities || []).find(
          (item) => item.sub_category === value
        );

        next.fuel_or_activity = firstActivity?.value || "";
      }

      return next;
    });
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
        await updateWasteEntry(editingEntryId, payload);
        setMessage("Waste entry updated successfully.");
      } else {
        await createWasteEntry(payload);
        setMessage("Waste entry saved successfully.");
      }

      resetForm();
      await loadWasteData();
    } catch (err) {
      console.error(err);
      setError(
        err?.response?.data
          ? JSON.stringify(err.response.data)
          : "Could not save Waste entry."
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleSubmitForReview(entryId) {
    setMessage("");
    setError("");

    try {
      await submitWasteEntry(entryId);
      setMessage("Waste entry submitted for review.");
      await loadWasteData();
    } catch (err) {
      console.error(err);
      setError(
        err?.response?.data
          ? JSON.stringify(err.response.data)
          : "Could not submit Waste entry."
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
      const response = await reviewWasteEntry(entry.id, {
        action,
        reviewer_comment: reviewerComment,
      });

      setMessage(response.message || "Review action completed.");
      await loadWasteData();
    } catch (err) {
      console.error(err);
      setError(
        err?.response?.data
          ? JSON.stringify(err.response.data)
          : "Could not complete review action."
      );
    }
  }

  return (
    <div className="space-y-8">
      <section>
        <p className="text-sm font-medium text-emerald-700">
          GHG Inventory
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">
          Waste Sector Data Entry
        </h1>
        <p className="mt-2 max-w-3xl text-slate-600">
          Enter Waste activity data. This phase covers municipal solid waste, 
          and population-based wastewater emission.
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

      {activeTab === "entry" ? (
        <section className="grid gap-6 xl:grid-cols-3">
          <form
            onSubmit={handleSubmit}
            className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm xl:col-span-1"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold">
                  {editingEntryId ? "Edit Waste Entry" : "New Waste Entry"}
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Save as draft first, then submit for review.
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
                  Activity / Species / Crop
                </label>
                <select
                  className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                  value={form.fuel_or_activity}
                  onChange={(event) =>
                    updateForm("fuel_or_activity", event.target.value)
                  }
                >
                  {activityOptions.map((item) => (
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
                  Quantity
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
                  placeholder={selectedSubCategory?.unit_label || "Quantity"}
                  required
                />
                <p className="mt-1 text-xs text-slate-500">
                  Unit: {selectedSubCategory?.unit_label || "Quantity"}
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
                  placeholder="Example: REMASAB collection record, weighbridge log, NBS population projection..."
                />
              </div>

              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="text-sm font-semibold text-slate-900">
                  Calculation Preview
                </p>

                <div className="mt-3 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-500">CO₂ EF</span>
                    <span className="font-semibold">
                      {selectedEmissionFactor?.co2_ef || 0}
                    </span>
                  </div>

                  <div className="flex justify-between">
                    <span className="text-slate-500">CH₄ EF</span>
                    <span className="font-semibold">
                      {selectedEmissionFactor?.ch4_ef || 0}
                    </span>
                  </div>

                  <div className="flex justify-between">
                    <span className="text-slate-500">N₂O EF</span>
                    <span className="font-semibold">
                      {selectedEmissionFactor?.n2o_ef || 0}
                    </span>
                  </div>

                  <div className="flex justify-between border-t border-slate-200 pt-2">
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
                  ? "Update Waste Entry"
                  : "Save Waste Entry"}
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

            <WasteEntriesTable
              entries={entries}
              isLoading={isLoading}
              onEditEntry={startEditEntry}
              onSubmitForReview={handleSubmitForReview}
            />
          </div>
        </section>
      ) : (
        <ReviewQueueTable
          reviewEntries={reviewEntries}
          canReview={canReview}
          onReviewAction={handleReviewAction}
        />
      )}
    </div>
  );
}

function WasteEntriesTable({
  entries,
  isLoading,
  onEditEntry,
  onSubmitForReview,
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-bold">Waste Entries</h2>
      <p className="text-sm text-slate-500">
        Waste emissions calculated by the backend.
      </p>

      {isLoading ? (
        <p className="mt-5 text-slate-500">Loading Waste GHG data...</p>
      ) : (
        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[1000px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="px-3 py-3 font-medium">Year</th>
                <th className="px-3 py-3 font-medium">Sub-category</th>
                <th className="px-3 py-3 font-medium">Activity</th>
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
                  <td className="px-3 py-4">
                    {formatNumber(entry.quantity)} {entry.unit}
                  </td>
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
                          className="rounded-full border border-blue-200 px-3 py-1 text-xs font-medium text-blue-700 hover:bg-blue-50"
                        >
                          Edit
                        </button>
                      )}

                      {canEditEntry(entry) && (
                        <button
                          onClick={() => onSubmitForReview(entry.id)}
                          className="rounded-full border border-emerald-200 px-3 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-50"
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
                    No Waste GHG entries yet.
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

function ReviewQueueTable({ reviewEntries, canReview, onReviewAction }) {
  if (!canReview) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700">
        Your role cannot access the Waste review queue.
      </div>
    );
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-bold">Waste Review Queue</h2>
      <p className="text-sm text-slate-500">
        Review submitted Waste entries and approve, reject, or request
        correction.
      </p>

      <div className="mt-5 overflow-x-auto">
        <table className="w-full min-w-[1000px] text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-slate-500">
              <th className="px-3 py-3 font-medium">Year</th>
              <th className="px-3 py-3 font-medium">Activity</th>
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
                <td className="px-3 py-4">
                  {formatNumber(entry.quantity)} {entry.unit}
                </td>
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
                          onReviewAction(entry, "mark_under_review")
                        }
                        className="rounded-full border border-blue-200 px-3 py-1 text-xs font-medium text-blue-700 hover:bg-blue-50"
                      >
                        Mark under review
                      </button>
                    )}

                    {["pending_review", "under_review"].includes(entry.status) && (
                      <>
                        <button
                          onClick={() => onReviewAction(entry, "approve")}
                          className="rounded-full border border-emerald-200 px-3 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-50"
                        >
                          Approve
                        </button>

                        <button
                          onClick={() =>
                            onReviewAction(entry, "request_revision")
                          }
                          className="rounded-full border border-purple-200 px-3 py-1 text-xs font-medium text-purple-700 hover:bg-purple-50"
                        >
                          Request revision
                        </button>

                        <button
                          onClick={() => onReviewAction(entry, "reject")}
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
                  No Waste review records yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}