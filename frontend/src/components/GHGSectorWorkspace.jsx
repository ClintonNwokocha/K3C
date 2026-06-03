import { useEffect, useMemo, useState } from "react";
import {
  CommandButton,
  CommandNotice,
  CommandSection,
  CommandStatCard,
  CommandTabs,
} from "./CommandUI";

const defaultFilters = {
  year: "all",
  status: "all",
  activity: "all",
  subCategory: "all",
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
  if (status === "approved") return "bg-[#009B35]/10 text-[#009B35]";
  if (status === "pending_review") return "bg-[#F3F74B]/45 text-[#030454]";
  if (status === "under_review") return "bg-[#030454]/10 text-[#030454]";
  if (status === "revision_requested") return "bg-purple-50 text-purple-700";
  if (status === "rejected") return "bg-red-50 text-red-700";
  return "bg-slate-100 text-slate-700";
}

function canEditEntry(entry) {
  return ["draft", "revision_requested"].includes(entry.status);
}

const inputClass =
  "w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-[#030454] outline-none transition placeholder:text-slate-400 focus:border-[#009B35] focus:ring-2 focus:ring-[#009B35]/10";

function getEntryUnit(entry, fallback = "") {
  return entry.unit || fallback || "";
}

function buildAllActivities(options, activityOptionSource) {
  if (activityOptionSource === "fuels") {
    return options?.fuels || [];
  }

  return options?.activities || [];
}

export default function GHGSectorWorkspace({
  foundation,
  currentUser,
  sectorName,
  title,
  description,
  initialForm,
  activityLabel,
  activityOptionSource = "activities",
  quantityUnitFallback = "Quantity",
  quantityPlaceholder = "Quantity",
  evidencePlaceholder,
  removalSector = false,
  services,
}) {
  const [activeTab, setActiveTab] = useState("entry");
  const [options, setOptions] = useState(null);
  const [entries, setEntries] = useState([]);
  const [reviewEntries, setReviewEntries] = useState([]);
  const [summary, setSummary] = useState([]);
  const [form, setForm] = useState(initialForm);
  const [editingEntryId, setEditingEntryId] = useState(null);
  const [filters, setFilters] = useState(defaultFilters);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const lgas = foundation?.lgas || [];
  const role = currentUser?.profile?.role;
  const canReview =
    role === "admin" || role === "analyst" || currentUser?.is_superuser;

  const editingEntry = entries.find((entry) => entry.id === editingEntryId);

  const sectorTabs = [
    { key: "entry", label: "Data Entry" },
    { key: "review", label: "Review Queue" },
  ];

  const activityOptions = useMemo(() => {
    if (activityOptionSource === "fuels") {
      return options?.fuels || [];
    }

    return (options?.activities || []).filter(
      (item) => item.sub_category === form.sub_category
    );
  }, [options, form.sub_category, activityOptionSource]);

  const allActivityOptions = useMemo(
    () => buildAllActivities(options, activityOptionSource),
    [options, activityOptionSource]
  );

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

  const filteredEntries = useMemo(() => {
    return entries.filter((entry) => {
      const yearMatches =
        filters.year === "all" || String(entry.year) === filters.year;

      const statusMatches =
        filters.status === "all" || entry.status === filters.status;

      const activityMatches =
        filters.activity === "all" ||
        entry.fuel_or_activity === filters.activity;

      const subCategoryMatches =
        filters.subCategory === "all" ||
        entry.sub_category === filters.subCategory;

      return (
        yearMatches && statusMatches && activityMatches && subCategoryMatches
      );
    });
  }, [entries, filters]);

  async function loadData() {
    setIsLoading(true);
    setError("");

    try {
      const [optionsData, entriesData] = await Promise.all([
        services.getOptions(),
        services.getEntries(),
      ]);

      setOptions(optionsData);
      setEntries(entriesData.results || []);
      setSummary(entriesData.summary || []);

      if (canReview) {
        try {
          const reviewData = await services.getReviewQueue();
          setReviewEntries(reviewData.results || []);
        } catch (reviewError) {
          console.error(reviewError);
          setReviewEntries([]);
        }
      }
    } catch (err) {
      console.error(err);
      setError(`Could not load ${sectorName} GHG data.`);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canReview]);

  function updateForm(field, value) {
    setForm((current) => {
      const next = { ...current, [field]: value };

      if (field === "sub_category" && activityOptionSource !== "fuels") {
        const firstActivity = (options?.activities || []).find(
          (item) => item.sub_category === value
        );

        next.fuel_or_activity = firstActivity?.value || "";
      }

      return next;
    });
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
        await services.updateEntry(editingEntryId, payload);
        setMessage(`${sectorName} entry updated successfully.`);
      } else {
        await services.createEntry(payload);
        setMessage(`${sectorName} entry saved successfully.`);
      }

      resetForm();
      await loadData();
    } catch (err) {
      console.error(err);
      setError(
        err?.response?.data
          ? JSON.stringify(err.response.data)
          : `Could not save ${sectorName} entry.`
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleSubmitForReview(entryId) {
    setMessage("");
    setError("");

    try {
      await services.submitEntry(entryId);
      setMessage(`${sectorName} entry submitted for review.`);
      await loadData();

      if (editingEntryId === entryId) {
        resetForm();
      }
    } catch (err) {
      console.error(err);
      setError(
        err?.response?.data
          ? JSON.stringify(err.response.data)
          : `Could not submit ${sectorName} entry.`
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
      const response = await services.reviewEntry(entry.id, {
        action,
        reviewer_comment: reviewerComment,
      });

      setMessage(response.message || "Review action completed.");
      await loadData();
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
    <div className="space-y-6">
      <CommandSection
        title={title}
        description={description}
        actions={
          <CommandButton variant="outline" onClick={loadData}>
            Refresh {sectorName}
          </CommandButton>
        }
      >
        <CommandTabs
          tabs={sectorTabs}
          activeTab={activeTab}
          onChange={setActiveTab}
        />
      </CommandSection>

      {error && (
        <CommandNotice title={`${sectorName} error`} tone="red">
          {error}
        </CommandNotice>
      )}

      {message && (
        <CommandNotice title={`${sectorName} update`} tone="green">
          {message}
        </CommandNotice>
      )}

      {activeTab === "entry" ? (
        <section className="grid gap-6 xl:grid-cols-3">
          <form
            onSubmit={handleSubmit}
            className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm xl:col-span-1"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-black text-[#030454]">
                  {editingEntryId
                    ? `Edit ${sectorName} Entry`
                    : `New ${sectorName} Entry`}
                </h2>

                <p className="mt-1 text-sm leading-6 text-slate-500">
                  Save as draft first, then submit for review.
                </p>
              </div>

              {editingEntryId && (
                <button
                  type="button"
                  onClick={resetForm}
                  className="rounded-md border border-slate-200 px-3 py-2 text-xs font-bold text-[#030454] hover:border-[#009B35] hover:text-[#009B35]"
                >
                  Cancel
                </button>
              )}
            </div>

            {editingEntry?.reviewer_comment && (
              <CommandNotice title="Reviewer comment" tone="yellow">
                {editingEntry.reviewer_comment}
              </CommandNotice>
            )}

            <div className="mt-6 space-y-4">
              <div>
                <label className="mb-2 block text-sm font-bold text-[#030454]">
                  Inventory Year
                </label>

                <select
                  className={inputClass}
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
                <label className="mb-2 block text-sm font-bold text-[#030454]">
                  Sub-category
                </label>

                <select
                  className={inputClass}
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
                <label className="mb-2 block text-sm font-bold text-[#030454]">
                  {activityLabel}
                </label>

                <select
                  className={inputClass}
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
                <label className="mb-2 block text-sm font-bold text-[#030454]">
                  LGA
                </label>

                <select
                  className={inputClass}
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
                <label className="mb-2 block text-sm font-bold text-[#030454]">
                  Quantity
                </label>

                <input
                  type="number"
                  min={removalSector ? undefined : "0"}
                  step="0.001"
                  className={inputClass}
                  value={form.quantity}
                  onChange={(event) =>
                    updateForm("quantity", event.target.value)
                  }
                  placeholder={
                    selectedSubCategory?.unit_label ||
                    quantityPlaceholder ||
                    "Quantity"
                  }
                  required
                />

                <p className="mt-1 text-xs text-slate-500">
                  Unit: {selectedSubCategory?.unit_label || quantityUnitFallback}
                </p>
              </div>

              <div>
                <label className="mb-2 block text-sm font-bold text-[#030454]">
                  Notes / Evidence reference
                </label>

                <textarea
                  rows="3"
                  className={inputClass}
                  value={form.notes}
                  onChange={(event) => updateForm("notes", event.target.value)}
                  placeholder={evidencePlaceholder}
                />
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm font-black text-[#030454]">
                  Calculation Preview
                </p>

                <div className="mt-3 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-500">CO₂ EF</span>
                    <span className="font-bold text-[#030454]">
                      {selectedEmissionFactor?.co2_ef || 0}
                    </span>
                  </div>

                  <div className="flex justify-between">
                    <span className="text-slate-500">CH₄ EF</span>
                    <span className="font-bold text-[#030454]">
                      {selectedEmissionFactor?.ch4_ef || 0}
                    </span>
                  </div>

                  <div className="flex justify-between">
                    <span className="text-slate-500">N₂O EF</span>
                    <span className="font-bold text-[#030454]">
                      {selectedEmissionFactor?.n2o_ef || 0}
                    </span>
                  </div>

                  <div className="flex justify-between border-t border-slate-200 pt-2">
                    <span className="text-slate-500">CO₂e result</span>
                    <span className="font-black text-[#030454]">
                      {formatNumber(calculatedPreview.co2eTonnes)} tCO₂e
                    </span>
                  </div>
                </div>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full rounded-md bg-[#009B35] px-4 py-3 text-sm font-black uppercase tracking-[0.08em] text-white transition hover:bg-[#00842e] disabled:cursor-not-allowed disabled:bg-slate-400"
              >
                {isSubmitting
                  ? "Saving..."
                  : editingEntryId
                    ? `Update ${sectorName} Entry`
                    : `Save ${sectorName} Entry`}
              </button>
            </div>
          </form>

          <div className="space-y-6 xl:col-span-2">
            <section className="grid gap-4 md:grid-cols-3">
              <CommandStatCard
                label="Total Entries"
                value={entries.length}
                helper={`${sectorName} records in the workspace.`}
                tone="blue"
              />

              <CommandStatCard
                label="Latest Approved Year"
                value={summary[0]?.year || "—"}
                helper="Latest year with approved data."
                tone="green"
              />

              <CommandStatCard
                label="Latest Approved Total"
                value={
                  summary[0]
                    ? `${formatNumber(summary[0].total_co2e)} tCO₂e`
                    : "—"
                }
                helper="Latest approved sector total."
                tone="yellow"
              />
            </section>

            <EntryFilters
              filters={filters}
              updateFilter={updateFilter}
              setFilters={setFilters}
              options={options}
              allActivityOptions={allActivityOptions}
              activityLabel={activityLabel}
            />

            <EntriesTable
              sectorName={sectorName}
              entries={filteredEntries}
              isLoading={isLoading}
              onEditEntry={startEditEntry}
              onSubmitForReview={handleSubmitForReview}
              removalSector={removalSector}
            />
          </div>
        </section>
      ) : (
        <ReviewQueueTable
          sectorName={sectorName}
          reviewEntries={reviewEntries}
          canReview={canReview}
          onReviewAction={handleReviewAction}
        />
      )}
    </div>
  );
}

function EntryFilters({
  filters,
  updateFilter,
  setFilters,
  options,
  allActivityOptions,
  activityLabel,
}) {
  return (
    <CommandSection
      title="Filters"
      description="Filter records by year, status, sub-category and activity."
      actions={
        <CommandButton variant="outline" onClick={() => setFilters(defaultFilters)}>
          Reset Filters
        </CommandButton>
      }
    >
      <div className="grid gap-4 md:grid-cols-4">
        <select
          className={inputClass}
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
          className={inputClass}
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
          className={inputClass}
          value={filters.subCategory}
          onChange={(event) => updateFilter("subCategory", event.target.value)}
        >
          <option value="all">All sub-categories</option>
          {(options?.sub_categories || []).map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>

        <select
          className={inputClass}
          value={filters.activity}
          onChange={(event) => updateFilter("activity", event.target.value)}
        >
          <option value="all">All {activityLabel.toLowerCase()}</option>
          {allActivityOptions.map((item) => (
            <option key={`${item.sub_category || "all"}-${item.value}`} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
      </div>
    </CommandSection>
  );
}

function EntriesTable({
  sectorName,
  entries,
  isLoading,
  onEditEntry,
  onSubmitForReview,
  removalSector,
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-xl font-black text-[#030454]">
        {sectorName} Entries
      </h2>

      <p className="mt-1 text-sm text-slate-500">
        Emissions are calculated by the backend using stored emission factors.
      </p>

      {isLoading ? (
        <p className="mt-5 text-sm text-slate-500">
          Loading {sectorName} GHG data...
        </p>
      ) : (
        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[1000px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="px-3 py-3 font-bold">Year</th>
                <th className="px-3 py-3 font-bold">Sub-category</th>
                <th className="px-3 py-3 font-bold">Activity</th>
                <th className="px-3 py-3 font-bold">Quantity</th>
                <th className="px-3 py-3 font-bold">CO₂e</th>
                <th className="px-3 py-3 font-bold">Status</th>
                <th className="px-3 py-3 font-bold">Reviewer Comment</th>
                <th className="px-3 py-3 font-bold">Action</th>
              </tr>
            </thead>

            <tbody>
              {entries.map((entry) => (
                <tr
                  key={entry.id}
                  className="border-b border-slate-100 last:border-0 hover:bg-[#009B35]/5"
                >
                  <td className="px-3 py-4 font-bold text-[#030454]">
                    {entry.year}
                  </td>

                  <td className="px-3 py-4">{entry.sub_category_display}</td>

                  <td className="px-3 py-4">{entry.fuel_or_activity}</td>

                  <td className="px-3 py-4">
                    {formatNumber(entry.quantity)} {getEntryUnit(entry)}
                  </td>

                  <td
                    className={`px-3 py-4 font-black ${
                      removalSector && Number(entry.co2e_tonnes) < 0
                        ? "text-[#009B35]"
                        : "text-[#030454]"
                    }`}
                  >
                    {formatNumber(entry.co2e_tonnes)} tCO₂e
                  </td>

                  <td className="px-3 py-4">
                    <span
                      className={`rounded-md px-3 py-1 text-xs font-bold ${getStatusClass(
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
                          type="button"
                          onClick={() => onEditEntry(entry)}
                          className="rounded-md border border-slate-200 px-3 py-1 text-xs font-bold text-[#030454] hover:border-[#009B35] hover:text-[#009B35]"
                        >
                          Edit
                        </button>
                      )}

                      {canEditEntry(entry) && (
                        <button
                          type="button"
                          onClick={() => onSubmitForReview(entry.id)}
                          className="rounded-md bg-[#009B35] px-3 py-1 text-xs font-bold text-white hover:bg-[#00842e]"
                        >
                          Submit
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
                    No {sectorName} GHG entries found.
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

function ReviewQueueTable({
  sectorName,
  reviewEntries,
  canReview,
  onReviewAction,
}) {
  if (!canReview) {
    return (
      <CommandNotice title="Access restricted" tone="yellow">
        Your role cannot access the {sectorName} review queue.
      </CommandNotice>
    );
  }

  return (
    <CommandSection
      title={`${sectorName} Review Queue`}
      description={`Review submitted ${sectorName} entries and approve, reject, or request correction.`}
      actions={
        <span className="rounded-md bg-[#030454]/10 px-3 py-2 text-xs font-black uppercase tracking-[0.08em] text-[#030454]">
          {reviewEntries.length} records
        </span>
      }
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1000px] text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-slate-500">
              <th className="px-3 py-3 font-bold">Year</th>
              <th className="px-3 py-3 font-bold">Activity</th>
              <th className="px-3 py-3 font-bold">Sub-category</th>
              <th className="px-3 py-3 font-bold">Quantity</th>
              <th className="px-3 py-3 font-bold">CO₂e</th>
              <th className="px-3 py-3 font-bold">Submitted By</th>
              <th className="px-3 py-3 font-bold">Status</th>
              <th className="px-3 py-3 font-bold">Actions</th>
            </tr>
          </thead>

          <tbody>
            {reviewEntries.map((entry) => (
              <tr
                key={entry.id}
                className="border-b border-slate-100 last:border-0 hover:bg-[#009B35]/5"
              >
                <td className="px-3 py-4 font-bold text-[#030454]">
                  {entry.year}
                </td>

                <td className="px-3 py-4">{entry.fuel_or_activity}</td>

                <td className="px-3 py-4">{entry.sub_category_display}</td>

                <td className="px-3 py-4">
                  {formatNumber(entry.quantity)} {getEntryUnit(entry)}
                </td>

                <td className="px-3 py-4 font-black text-[#030454]">
                  {formatNumber(entry.co2e_tonnes)} tCO₂e
                </td>

                <td className="px-3 py-4">
                  {entry.submitted_by_username || "—"}
                </td>

                <td className="px-3 py-4">
                  <span
                    className={`rounded-md px-3 py-1 text-xs font-bold ${getStatusClass(
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
                        type="button"
                        onClick={() =>
                          onReviewAction(entry, "mark_under_review")
                        }
                        className="rounded-md border border-[#030454]/20 px-3 py-1 text-xs font-bold text-[#030454] hover:bg-[#030454]/5"
                      >
                        Mark under review
                      </button>
                    )}

                    {["pending_review", "under_review"].includes(
                      entry.status
                    ) && (
                      <>
                        <button
                          type="button"
                          onClick={() => onReviewAction(entry, "approve")}
                          className="rounded-md border border-[#009B35]/30 px-3 py-1 text-xs font-bold text-[#009B35] hover:bg-[#009B35]/10"
                        >
                          Approve
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            onReviewAction(entry, "request_revision")
                          }
                          className="rounded-md border border-purple-200 px-3 py-1 text-xs font-bold text-purple-700 hover:bg-purple-50"
                        >
                          Request revision
                        </button>

                        <button
                          type="button"
                          onClick={() => onReviewAction(entry, "reject")}
                          className="rounded-md border border-red-200 px-3 py-1 text-xs font-bold text-red-700 hover:bg-red-50"
                        >
                          Reject
                        </button>
                      </>
                    )}

                    {!["pending_review", "under_review"].includes(
                      entry.status
                    ) && <span className="text-xs text-slate-400">No action</span>}
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
                  No {sectorName} review records yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </CommandSection>
  );
}