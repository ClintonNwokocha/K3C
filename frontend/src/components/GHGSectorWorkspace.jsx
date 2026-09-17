import { useEffect, useMemo, useRef, useState } from "react";
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

function escapeCsvValue(value) {
  const text = String(value ?? "");

  if (text.includes(",") || text.includes('"') || text.includes("\n")) {
    return `"${text.replace(/"/g, '""')}"`;
  }

  return text;
}

function downloadCsv(filename, rows) {
  const csvContent = rows
    .map((row) => row.map((cell) => escapeCsvValue(cell)).join(","))
    .join("\n");

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  URL.revokeObjectURL(url);
}

function buildApprovedEntryRows(entries, sectorName) {
  return [
    [
      "Sector",
      "Reporting Year",
      "LGA",
      "Sub-category",
      "Activity",
      "Quantity",
      "Unit",
      "CO2 (kg)",
      "CH4 (kg)",
      "N2O (kg)",
      "CO2e (tonnes)",
      "Emission Factor Source",
      "Submitted By",
      "Approved By",
      "Approved At",
    ],
    ...entries.map((entry) => [
      sectorName,
      entry.year,
      entry.lga_name || "State-wide",
      entry.sub_category_display || entry.sub_category,
      entry.fuel_or_activity,
      entry.quantity,
      getEntryUnit(entry),
      entry.co2_kg,
      entry.ch4_kg,
      entry.n2o_kg,
      entry.co2e_tonnes,
      entry.emission_factor_detail?.ipcc_source || "",
      entry.submitted_by_username || "",
      entry.approved_by_username || "",
      entry.approved_at ? entry.approved_at.slice(0, 10) : "",
    ]),
  ];
}

function getExportTimestamp() {
  return new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
}

function formatNumber(value, maximumFractionDigits = 3) {
  return Number(value || 0).toLocaleString(undefined, {
    maximumFractionDigits,
  });
}

function formatDate(value) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
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

const invalidInputClass =
  "w-full rounded-xl border border-red-400 bg-red-50/40 px-4 py-3 text-sm text-[#030454] outline-none transition placeholder:text-slate-400 focus:border-red-500 focus:ring-2 focus:ring-red-500/10";

function getEntryUnit(entry, fallback = "") {
  return entry.unit || fallback || "";
}

function buildAllActivities(options, activityOptionSource) {
  if (activityOptionSource === "fuels") {
    return options?.fuels || [];
  }

  return options?.activities || [];
}

function parseFieldErrors(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) return {};

  const errors = {};

  for (const [field, value] of Object.entries(data)) {
    if (field === "detail") continue;
    errors[field] = Array.isArray(value) ? value.join(" ") : String(value);
  }

  return errors;
}

function getNonFieldError(data, fallback) {
  if (!data) return fallback;
  if (typeof data === "string") return data;
  if (data.detail) return data.detail;

  const fieldErrors = parseFieldErrors(data);
  return Object.keys(fieldErrors).length > 0 ? "" : fallback;
}

function FieldError({ message }) {
  if (!message) return null;

  return (
    <p role="alert" className="mt-1.5 text-xs font-bold text-red-600">
      {message}
    </p>
  );
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
  const [activeTab, setActiveTab] = useState("overview");
  const [options, setOptions] = useState(null);
  const [entries, setEntries] = useState([]);
  const [reviewEntries, setReviewEntries] = useState([]);
  const [summary, setSummary] = useState([]);
  const [form, setForm] = useState(initialForm);
  const [editingEntryId, setEditingEntryId] = useState(null);
  const [filters, setFilters] = useState(defaultFilters);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [confirmAction, setConfirmAction] = useState(null);

  const lgas = foundation?.lgas || [];
  const role = currentUser?.profile?.role;
  const canReview =
    role === "admin" || role === "analyst" || currentUser?.is_superuser;
  // Backend can_final_approve() restricts approve/reject to admin (or
  // superuser) only — analysts can mark-under-review and request-revision,
  // but not give or refuse final approval.
  const canFinalApprove = role === "admin" || currentUser?.is_superuser;

  const editingEntry = entries.find((entry) => entry.id === editingEntryId);

  const workspaceTabs = [
    { key: "overview", label: "Overview" },
    { key: "entries", label: "Entries" },
    { key: "add-entry", label: editingEntryId ? "Edit Entry" : "Add Entry" },
    ...(canReview ? [{ key: "review", label: "Review Queue" }] : []),
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

  const kpis = useMemo(() => {
    const total = entries.length;
    const drafts = entries.filter((entry) => entry.status === "draft").length;
    const pendingReview = entries.filter((entry) =>
      ["pending_review", "under_review"].includes(entry.status)
    ).length;
    const approved = entries.filter(
      (entry) => entry.status === "approved"
    ).length;

    return {
      total,
      drafts,
      pendingReview,
      approved,
      latestApprovedYear: summary[0]?.year ?? "—",
      latestApprovedTotal: summary[0] ? summary[0].total_co2e : null,
    };
  }, [entries, summary]);

  const activeReportingYear =
    options?.years?.[options.years.length - 1] ?? new Date().getFullYear();

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

    setFieldErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
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
    setFieldErrors({});
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
    setFieldErrors({});
    setActiveTab("add-entry");
  }

  function startNewEntry() {
    resetForm();
    setActiveTab("add-entry");
  }

  async function handleSubmit(event) {
    event.preventDefault();

    setIsSubmitting(true);
    setMessage("");
    setError("");
    setFieldErrors({});

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
      setActiveTab("entries");
    } catch (err) {
      console.error(err);
      const data = err?.response?.data;
      setFieldErrors(parseFieldErrors(data));
      setError(
        getNonFieldError(data, `Could not save ${sectorName} entry.`)
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
        getNonFieldError(
          err?.response?.data,
          `Could not submit ${sectorName} entry.`
        )
      );
    }
  }

  function requestReviewAction(entry, action) {
    setConfirmAction({ entry, action });
  }

  async function runReviewAction(entry, action, reviewerComment) {
    setMessage("");
    setError("");

    try {
      const response = await services.reviewEntry(entry.id, {
        action,
        reviewer_comment: reviewerComment || "",
      });

      setMessage(response.message || "Review action completed.");
      await loadData();
    } catch (err) {
      console.error(err);
      setError(
        getNonFieldError(
          err?.response?.data,
          "Could not complete review action."
        )
      );
    } finally {
      setConfirmAction(null);
    }
  }

  return (
    <div className="space-y-6">
      <WorkspaceHeader
        title={title}
        description={description}
        activeReportingYear={activeReportingYear}
        kpis={kpis}
        canReview={canReview}
        onPrimaryAction={() =>
          canReview && kpis.pendingReview > 0
            ? setActiveTab("review")
            : startNewEntry()
        }
        primaryActionLabel={
          canReview && kpis.pendingReview > 0
            ? `Review Queue (${kpis.pendingReview})`
            : `Add ${sectorName} Entry`
        }
        onRefresh={loadData}
      />

      <KpiRow kpis={kpis} />

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

      <CommandTabs
        tabs={workspaceTabs}
        activeTab={activeTab}
        onChange={setActiveTab}
      />

      {activeTab === "overview" && (
        <OverviewTab
          sectorName={sectorName}
          entries={entries}
          kpis={kpis}
          onAddEntry={startNewEntry}
          onViewEntries={() => setActiveTab("entries")}
          canReview={canReview}
          onViewReviewQueue={() => setActiveTab("review")}
        />
      )}

      {activeTab === "entries" && (
        <div className="space-y-6">
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
            onAddEntry={startNewEntry}
            removalSector={removalSector}
          />
        </div>
      )}

      {activeTab === "add-entry" && (
        <EntryForm
          sectorName={sectorName}
          form={form}
          updateForm={updateForm}
          options={options}
          activityLabel={activityLabel}
          activityOptions={activityOptions}
          lgas={lgas}
          removalSector={removalSector}
          quantityPlaceholder={quantityPlaceholder}
          quantityUnitFallback={quantityUnitFallback}
          selectedSubCategory={selectedSubCategory}
          selectedEmissionFactor={selectedEmissionFactor}
          calculatedPreview={calculatedPreview}
          evidencePlaceholder={evidencePlaceholder}
          editingEntryId={editingEntryId}
          editingEntry={editingEntry}
          fieldErrors={fieldErrors}
          isSubmitting={isSubmitting}
          onSubmit={handleSubmit}
          onCancel={() => {
            resetForm();
            setActiveTab("entries");
          }}
        />
      )}

      {activeTab === "review" && (
        <ReviewQueueSection
          sectorName={sectorName}
          reviewEntries={reviewEntries}
          canReview={canReview}
          canFinalApprove={canFinalApprove}
          onReviewAction={requestReviewAction}
        />
      )}

      <ReviewConfirmDialog
        confirmAction={confirmAction}
        sectorName={sectorName}
        onCancel={() => setConfirmAction(null)}
        onConfirm={runReviewAction}
      />
    </div>
  );
}

function WorkspaceHeader({
  title,
  description,
  activeReportingYear,
  kpis,
  canReview,
  onPrimaryAction,
  primaryActionLabel,
  onRefresh,
}) {
  const statusLine =
    kpis.pendingReview > 0
      ? `${kpis.pendingReview} entr${kpis.pendingReview === 1 ? "y" : "ies"} awaiting review`
      : kpis.total > 0
        ? "No entries currently awaiting review"
        : "No entries recorded yet";

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
        <div>
          <h1 className="text-2xl font-black text-[#030454]">{title}</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            {description}
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-2 text-xs font-bold">
            <span className="rounded-full bg-[#030454]/5 px-3 py-1.5 text-[#030454]">
              Active reporting year: {activeReportingYear}
            </span>
            <span className="rounded-full bg-slate-100 px-3 py-1.5 text-slate-600">
              {statusLine}
            </span>
          </div>
        </div>

        <div className="flex shrink-0 flex-col gap-2 sm:flex-row lg:flex-col">
          <CommandButton onClick={onPrimaryAction}>
            {primaryActionLabel}
          </CommandButton>

          <CommandButton variant="outline" onClick={onRefresh}>
            Refresh
          </CommandButton>
        </div>
      </div>

      {!canReview && (
        <p className="mt-4 text-xs text-slate-400">
          You can create and submit entries for review. Approval decisions
          are made by Admin and Analyst reviewers.
        </p>
      )}
    </section>
  );
}

function KpiRow({ kpis }) {
  return (
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
      <CommandStatCard label="Total Entries" value={kpis.total} tone="blue" />
      <CommandStatCard label="Drafts" value={kpis.drafts} tone="white" />
      <CommandStatCard
        label="Pending Review"
        value={kpis.pendingReview}
        tone="yellow"
      />
      <CommandStatCard
        label="Approved Entries"
        value={kpis.approved}
        tone="green"
      />
      <CommandStatCard
        label="Approved Emissions"
        value={
          kpis.latestApprovedTotal !== null
            ? `${formatNumber(kpis.latestApprovedTotal, 3)} tCO₂e`
            : "—"
        }
        tone="blue"
      />
      <CommandStatCard
        label="Latest Approved Year"
        value={kpis.latestApprovedYear}
        tone="white"
      />
    </section>
  );
}

function OverviewTab({
  sectorName,
  entries,
  kpis,
  onAddEntry,
  onViewEntries,
  canReview,
  onViewReviewQueue,
}) {
  const recentEntries = [...entries]
    .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))
    .slice(0, 5);

  return (
    <div className="grid gap-6 xl:grid-cols-3">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm xl:col-span-2">
        <h2 className="text-xl font-black text-[#030454]">Recent Activity</h2>
        <p className="mt-1 text-sm leading-6 text-slate-500">
          Most recently updated {sectorName} entries.
        </p>

        <div className="mt-5 space-y-3">
          {recentEntries.map((entry) => (
            <div
              key={entry.id}
              className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 px-4 py-3"
            >
              <div>
                <p className="font-black text-[#030454]">
                  {entry.year} · {entry.fuel_or_activity}
                </p>
                <p className="text-xs text-slate-500">
                  Updated {formatDate(entry.updated_at)}
                </p>
              </div>

              <span
                className={`rounded-md px-3 py-1 text-xs font-bold ${getStatusClass(
                  entry.status
                )}`}
              >
                {formatStatus(entry.status)}
              </span>
            </div>
          ))}

          {recentEntries.length === 0 && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-500">
              No {sectorName} entries recorded yet.
            </div>
          )}
        </div>
      </div>

      <div className="space-y-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-black text-[#030454]">
            How this workflow works
          </h2>

          <ol className="mt-4 space-y-3 text-sm text-slate-600">
            <li>
              <strong className="text-[#030454]">1. Save as draft.</strong>{" "}
              Enter activity data; CO₂e is calculated automatically.
            </li>
            <li>
              <strong className="text-[#030454]">2. Submit for review.</strong>{" "}
              Sends the entry to Admin and Analyst reviewers.
            </li>
            <li>
              <strong className="text-[#030454]">3. Review.</strong> A
              reviewer marks it under review and may request revision.
            </li>
            <li>
              <strong className="text-[#030454]">4. Approve.</strong> Admin
              gives final approval; the entry feeds the official total.
            </li>
          </ol>
        </div>

        <div className="flex flex-col items-stretch gap-2">
          <CommandButton onClick={onAddEntry}>
            Add {sectorName} Entry
          </CommandButton>
          <CommandButton variant="outline" onClick={onViewEntries}>
            View All Entries
          </CommandButton>
          {canReview && (
            <CommandButton variant="outline" onClick={onViewReviewQueue}>
              Open Review Queue ({kpis.pendingReview})
            </CommandButton>
          )}
        </div>
      </div>
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
        <label className="block">
          <span className="sr-only">Filter by year</span>
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
        </label>

        <label className="block">
          <span className="sr-only">Filter by status</span>
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
        </label>

        <label className="block">
          <span className="sr-only">Filter by sub-category</span>
          <select
            className={inputClass}
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
        </label>

        <label className="block">
          <span className="sr-only">Filter by {activityLabel}</span>
          <select
            className={inputClass}
            value={filters.activity}
            onChange={(event) => updateFilter("activity", event.target.value)}
          >
            <option value="all">All {activityLabel.toLowerCase()}</option>
            {allActivityOptions.map((item) => (
              <option
                key={`${item.sub_category || "all"}-${item.value}`}
                value={item.value}
              >
                {item.label}
              </option>
            ))}
          </select>
        </label>
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
  onAddEntry,
  removalSector,
}) {
  const approvedEntries = entries.filter((entry) => entry.status === "approved");

  function exportApprovedCsv() {
    downloadCsv(
      `kccc-${sectorName.toLowerCase()}-approved-entries_${getExportTimestamp()}.csv`,
      buildApprovedEntryRows(approvedEntries, sectorName)
    );
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-black text-[#030454]">
            {sectorName} Entries
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Emissions are calculated by the backend using stored emission
            factors.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <CommandButton
            variant="outline"
            onClick={exportApprovedCsv}
            disabled={approvedEntries.length === 0}
          >
            Export Approved ({approvedEntries.length})
          </CommandButton>
          <CommandButton onClick={onAddEntry}>Add Entry</CommandButton>
        </div>
      </div>

      {isLoading ? (
        <p className="mt-5 text-sm text-slate-500" role="status">
          Loading {sectorName} GHG data...
        </p>
      ) : entries.length === 0 ? (
        <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-500">
          No {sectorName} GHG entries found. Use "Add Entry" to record the
          first one.
        </div>
      ) : (
        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[1100px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th scope="col" className="px-3 py-3 font-bold">Year</th>
                <th scope="col" className="px-3 py-3 font-bold">LGA</th>
                <th scope="col" className="px-3 py-3 font-bold">Activity</th>
                <th scope="col" className="px-3 py-3 font-bold">Quantity</th>
                <th scope="col" className="px-3 py-3 font-bold">CO₂e</th>
                <th scope="col" className="px-3 py-3 font-bold">Status</th>
                <th scope="col" className="px-3 py-3 font-bold">Submitted By</th>
                <th scope="col" className="px-3 py-3 font-bold">Updated</th>
                <th scope="col" className="px-3 py-3 font-bold">Action</th>
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

                  <td className="px-3 py-4 text-slate-600">
                    {entry.lga_name || "State-wide"}
                  </td>

                  <td className="px-3 py-4">
                    <p>{entry.fuel_or_activity}</p>
                    <p className="text-xs text-slate-400">
                      {entry.sub_category_display}
                    </p>
                  </td>

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

                  <td className="px-3 py-4 text-slate-600">
                    {entry.submitted_by_username || "—"}
                  </td>

                  <td className="px-3 py-4 text-slate-600">
                    {formatDate(entry.updated_at)}
                  </td>

                  <td className="px-3 py-4">
                    <div className="flex flex-wrap gap-2">
                      {canEditEntry(entry) ? (
                        <>
                          <button
                            type="button"
                            onClick={() => onEditEntry(entry)}
                            className="rounded-md border border-slate-200 px-3 py-1 text-xs font-bold text-[#030454] hover:border-[#009B35] hover:text-[#009B35]"
                          >
                            Edit
                          </button>

                          <button
                            type="button"
                            onClick={() => onSubmitForReview(entry.id)}
                            className="rounded-md bg-[#009B35] px-3 py-1 text-xs font-bold text-white hover:bg-[#00842e]"
                          >
                            Submit
                          </button>
                        </>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function EntryForm({
  sectorName,
  form,
  updateForm,
  options,
  activityLabel,
  activityOptions,
  lgas,
  removalSector,
  quantityPlaceholder,
  quantityUnitFallback,
  selectedSubCategory,
  selectedEmissionFactor,
  calculatedPreview,
  evidencePlaceholder,
  editingEntryId,
  editingEntry,
  fieldErrors,
  isSubmitting,
  onSubmit,
  onCancel,
}) {
  const unitLabel = selectedSubCategory?.unit_label || quantityUnitFallback;

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-black text-[#030454]">
            {editingEntryId ? `Edit ${sectorName} Entry` : `New ${sectorName} Entry`}
          </h2>
          <p className="mt-1 text-sm leading-6 text-slate-500">
            Save as draft first, then submit for review from the Entries tab.
          </p>
        </div>

        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-slate-200 px-3 py-2 text-xs font-bold text-[#030454] hover:border-[#009B35] hover:text-[#009B35]"
        >
          Cancel
        </button>
      </div>

      {editingEntry?.reviewer_comment && (
        <CommandNotice title="Reviewer comment" tone="yellow">
          {editingEntry.reviewer_comment}
        </CommandNotice>
      )}

      <div className="grid gap-6 xl:grid-cols-3">
        <fieldset className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <legend className="px-1 text-sm font-black uppercase tracking-[0.08em] text-[#009B35]">
            Activity Details
          </legend>

          <div className="mt-4 space-y-4">
            <div>
              <label
                htmlFor="ghg-field-year"
                className="mb-2 block text-sm font-bold text-[#030454]"
              >
                Reporting Year
              </label>
              <select
                id="ghg-field-year"
                className={fieldErrors.year ? invalidInputClass : inputClass}
                value={form.year}
                onChange={(event) => updateForm("year", event.target.value)}
                aria-invalid={Boolean(fieldErrors.year)}
                aria-describedby={fieldErrors.year ? "ghg-field-year-error" : undefined}
              >
                {(options?.years || [2024]).map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
              {fieldErrors.year && (
                <span id="ghg-field-year-error">
                  <FieldError message={fieldErrors.year} />
                </span>
              )}
            </div>

            <div>
              <label
                htmlFor="ghg-field-lga"
                className="mb-2 block text-sm font-bold text-[#030454]"
              >
                LGA
              </label>
              <select
                id="ghg-field-lga"
                className={fieldErrors.lga ? invalidInputClass : inputClass}
                value={form.lga}
                onChange={(event) => updateForm("lga", event.target.value)}
                aria-invalid={Boolean(fieldErrors.lga)}
              >
                <option value="">State-wide / Not LGA-specific</option>
                {lgas.map((lga) => (
                  <option key={lga.lga_id} value={lga.lga_id}>
                    {lga.lga_name}
                  </option>
                ))}
              </select>
              <FieldError message={fieldErrors.lga} />
            </div>

            <div>
              <label
                htmlFor="ghg-field-subcategory"
                className="mb-2 block text-sm font-bold text-[#030454]"
              >
                Sub-category
              </label>
              <select
                id="ghg-field-subcategory"
                className={
                  fieldErrors.sub_category ? invalidInputClass : inputClass
                }
                value={form.sub_category}
                onChange={(event) =>
                  updateForm("sub_category", event.target.value)
                }
                aria-invalid={Boolean(fieldErrors.sub_category)}
              >
                {(options?.sub_categories || []).map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
              <FieldError message={fieldErrors.sub_category} />
            </div>

            <div>
              <label
                htmlFor="ghg-field-activity"
                className="mb-2 block text-sm font-bold text-[#030454]"
              >
                {activityLabel}
              </label>
              <select
                id="ghg-field-activity"
                className={
                  fieldErrors.fuel_or_activity ? invalidInputClass : inputClass
                }
                value={form.fuel_or_activity}
                onChange={(event) =>
                  updateForm("fuel_or_activity", event.target.value)
                }
                aria-invalid={Boolean(fieldErrors.fuel_or_activity)}
              >
                {activityOptions.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
              <FieldError message={fieldErrors.fuel_or_activity} />
            </div>

            <div>
              <label
                htmlFor="ghg-field-quantity"
                className="mb-2 block text-sm font-bold text-[#030454]"
              >
                Quantity
              </label>
              <input
                id="ghg-field-quantity"
                type="number"
                min={removalSector ? undefined : "0"}
                step="0.001"
                className={
                  fieldErrors.quantity ? invalidInputClass : inputClass
                }
                value={form.quantity}
                onChange={(event) =>
                  updateForm("quantity", event.target.value)
                }
                placeholder={quantityPlaceholder || "Quantity"}
                aria-invalid={Boolean(fieldErrors.quantity)}
                required
              />
              <p className="mt-1 text-xs text-slate-500">Unit: {unitLabel}</p>
              <FieldError message={fieldErrors.quantity} />
            </div>

            <div>
              <label
                htmlFor="ghg-field-notes"
                className="mb-2 block text-sm font-bold text-[#030454]"
              >
                Notes / Evidence reference
              </label>
              <textarea
                id="ghg-field-notes"
                rows="3"
                className={inputClass}
                value={form.notes}
                onChange={(event) => updateForm("notes", event.target.value)}
                placeholder={evidencePlaceholder}
              />
            </div>
          </div>
        </fieldset>

        <fieldset className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <legend className="px-1 text-sm font-black uppercase tracking-[0.08em] text-[#009B35]">
            Emission Factor
          </legend>

          <p className="mt-4 text-xs leading-5 text-slate-500">
            Preloaded from the KCCC emission factor library. Ordinary users
            cannot enter or override these values.
          </p>

          <dl className="mt-4 space-y-3 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-slate-500">Source</dt>
              <dd className="max-w-[60%] text-right font-bold text-[#030454]">
                {selectedEmissionFactor?.ipcc_source || "Preloaded factor library"}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-slate-500">Tier</dt>
              <dd className="text-right font-bold text-[#030454]">
                {selectedEmissionFactor?.tier === "tier_2"
                  ? "Tier 2"
                  : selectedEmissionFactor
                    ? "Tier 1"
                    : "—"}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-slate-500">Unit</dt>
              <dd className="text-right font-bold text-[#030454]">
                {selectedEmissionFactor?.unit || "—"}
              </dd>
            </div>
            <div className="flex justify-between gap-3 border-t border-slate-200 pt-3">
              <dt className="text-slate-500">CO₂ factor</dt>
              <dd className="font-mono font-bold text-[#030454]">
                {formatNumber(selectedEmissionFactor?.co2_ef, 6)}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-slate-500">CH₄ factor</dt>
              <dd className="font-mono font-bold text-[#030454]">
                {formatNumber(selectedEmissionFactor?.ch4_ef, 6)}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-slate-500">N₂O factor</dt>
              <dd className="font-mono font-bold text-[#030454]">
                {formatNumber(selectedEmissionFactor?.n2o_ef, 6)}
              </dd>
            </div>
          </dl>

          {!selectedEmissionFactor && (
            <p className="mt-4 text-xs font-bold text-red-600" role="alert">
              No active emission factor found for this sub-category and{" "}
              {activityLabel.toLowerCase()}. Saving will be rejected until an
              emission factor is available.
            </p>
          )}
        </fieldset>

        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6">
          <p className="px-1 text-sm font-black uppercase tracking-[0.08em] text-[#009B35]">
            Calculation Preview
          </p>

          <dl className="mt-4 space-y-3 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-slate-500">Activity quantity</dt>
              <dd className="font-bold text-[#030454]">
                {formatNumber(form.quantity || 0)} {unitLabel}
              </dd>
            </div>

            <div className="flex justify-between gap-3 border-t border-slate-200 pt-3">
              <dt className="text-slate-500">CO₂ result</dt>
              <dd className="font-mono font-bold text-[#030454]" aria-readonly="true">
                {formatNumber(calculatedPreview.co2Kg)} kg
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-slate-500">CH₄ result</dt>
              <dd className="font-mono font-bold text-[#030454]" aria-readonly="true">
                {formatNumber(calculatedPreview.ch4Kg)} kg
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-slate-500">N₂O result</dt>
              <dd className="font-mono font-bold text-[#030454]" aria-readonly="true">
                {formatNumber(calculatedPreview.n2oKg)} kg
              </dd>
            </div>

            <div className="flex justify-between gap-3 border-t border-slate-200 pt-3">
              <dt className="font-bold text-[#030454]">Final CO₂e</dt>
              <dd
                className="text-lg font-black text-[#030454]"
                aria-readonly="true"
              >
                {formatNumber(calculatedPreview.co2eTonnes)} tCO₂e
              </dd>
            </div>
          </dl>

          <p className="mt-4 text-xs leading-5 text-slate-400">
            Calculated values are read-only and recomputed by the backend on
            save using the current emission factor.
          </p>

          <button
            type="submit"
            disabled={isSubmitting}
            className="mt-6 w-full rounded-md bg-[#009B35] px-4 py-3 text-sm font-black uppercase tracking-[0.08em] text-white transition hover:bg-[#00842e] disabled:cursor-not-allowed disabled:bg-slate-400"
          >
            {isSubmitting
              ? "Saving..."
              : editingEntryId
                ? `Update ${sectorName} Entry`
                : `Save ${sectorName} Entry`}
          </button>
        </div>
      </div>
    </form>
  );
}

function ReviewQueueSection({
  sectorName,
  reviewEntries,
  canReview,
  canFinalApprove,
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
      {reviewEntries.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-500">
          No {sectorName} review records yet.
        </div>
      ) : (
        <div className="space-y-4">
          {reviewEntries.map((entry) => (
            <ReviewEntryCard
              key={entry.id}
              sectorName={sectorName}
              entry={entry}
              canFinalApprove={canFinalApprove}
              onReviewAction={onReviewAction}
            />
          ))}
        </div>
      )}
    </CommandSection>
  );
}

function ReviewEntryCard({ entry, canFinalApprove, onReviewAction }) {
  const actionable = ["pending_review", "under_review"].includes(
    entry.status
  );

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-black text-[#030454]">
              {entry.year} · {entry.fuel_or_activity}
            </p>
            <span
              className={`rounded-md px-2.5 py-1 text-xs font-bold ${getStatusClass(
                entry.status
              )}`}
            >
              {formatStatus(entry.status)}
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            {entry.sub_category_display} · {entry.lga_name || "State-wide"}
          </p>
        </div>

        <p className="text-lg font-black text-[#030454]">
          {formatNumber(entry.co2e_tonnes)}
          <span className="ml-1 text-xs font-semibold text-slate-400">
            tCO₂e
          </span>
        </p>
      </div>

      <dl className="mt-4 grid gap-3 border-t border-slate-100 pt-4 text-xs sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <dt className="font-bold uppercase tracking-wide text-slate-400">
            Submitted by
          </dt>
          <dd className="mt-1 text-[#030454]">
            {entry.submitted_by_username || "—"}
          </dd>
        </div>
        <div>
          <dt className="font-bold uppercase tracking-wide text-slate-400">
            Quantity
          </dt>
          <dd className="mt-1 text-[#030454]">
            {formatNumber(entry.quantity)} {getEntryUnit(entry)}
          </dd>
        </div>
        <div>
          <dt className="font-bold uppercase tracking-wide text-slate-400">
            Factor tier
          </dt>
          <dd className="mt-1 text-[#030454]">
            {entry.emission_factor_detail?.tier === "tier_2"
              ? "Tier 2"
              : "Tier 1"}
          </dd>
        </div>
        <div>
          <dt className="font-bold uppercase tracking-wide text-slate-400">
            Last updated
          </dt>
          <dd className="mt-1 text-[#030454]">{formatDate(entry.updated_at)}</dd>
        </div>
        <div className="sm:col-span-2 lg:col-span-4">
          <dt className="font-bold uppercase tracking-wide text-slate-400">
            Emission factor source
          </dt>
          <dd className="mt-1 text-[#030454]">
            {entry.emission_factor_detail?.ipcc_source || "Preloaded factor library"}
          </dd>
        </div>
      </dl>

      {entry.reviewer_comment && (
        <p className="mt-4 rounded-lg bg-slate-50 p-3 text-xs leading-5 text-slate-600">
          <strong className="text-[#030454]">Reviewer comment: </strong>
          {entry.reviewer_comment}
        </p>
      )}

      <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
        {entry.status === "pending_review" && (
          <button
            type="button"
            onClick={() => onReviewAction(entry, "mark_under_review")}
            className="rounded-md border border-[#030454]/20 px-3 py-1.5 text-xs font-bold text-[#030454] hover:bg-[#030454]/5"
          >
            Mark under review
          </button>
        )}

        {actionable && (
          <>
            {canFinalApprove && (
              <button
                type="button"
                onClick={() => onReviewAction(entry, "approve")}
                className="rounded-md border border-[#009B35]/30 px-3 py-1.5 text-xs font-bold text-[#009B35] hover:bg-[#009B35]/10"
              >
                Approve
              </button>
            )}

            <button
              type="button"
              onClick={() => onReviewAction(entry, "request_revision")}
              className="rounded-md border border-purple-200 px-3 py-1.5 text-xs font-bold text-purple-700 hover:bg-purple-50"
            >
              Request revision
            </button>

            {canFinalApprove && (
              <button
                type="button"
                onClick={() => onReviewAction(entry, "reject")}
                className="rounded-md border border-red-200 px-3 py-1.5 text-xs font-bold text-red-700 hover:bg-red-50"
              >
                Reject
              </button>
            )}

            {!canFinalApprove && (
              <span className="self-center text-xs text-slate-400">
                Awaiting admin decision
              </span>
            )}
          </>
        )}

        {!actionable && (
          <span className="text-xs text-slate-400">No action available</span>
        )}
      </div>
    </div>
  );
}

const REVIEW_ACTION_META = {
  mark_under_review: {
    title: "Mark entry under review",
    confirmLabel: "Mark under review",
    tone: "border-[#030454] bg-[#030454] hover:bg-[#02033d]",
    requireComment: false,
    description: "This starts formal review. It does not require a comment.",
  },
  request_revision: {
    title: "Request revision",
    confirmLabel: "Request revision",
    tone: "border-purple-600 bg-purple-600 hover:bg-purple-700",
    requireComment: true,
    description:
      "The submitter will see this comment and can resubmit after correcting the entry.",
  },
  reject: {
    title: "Reject entry",
    confirmLabel: "Reject entry",
    tone: "border-red-600 bg-red-600 hover:bg-red-700",
    requireComment: true,
    description:
      "This is a final decision. The entry will not be included in the official total.",
  },
  approve: {
    title: "Approve entry",
    confirmLabel: "Approve entry",
    tone: "border-[#009B35] bg-[#009B35] hover:bg-[#00842e]",
    requireComment: false,
    description:
      "This is a final decision. The entry will be included in the official approved total for its sector and year.",
  },
};

function ReviewConfirmDialog({ confirmAction, sectorName, onCancel, onConfirm }) {
  const dialogRef = useRef(null);
  const meta = confirmAction ? REVIEW_ACTION_META[confirmAction.action] : null;

  useEffect(() => {
    const dialogEl = dialogRef.current;
    if (!dialogEl) return;

    if (confirmAction) {
      if (!dialogEl.open) dialogEl.showModal();
    } else if (dialogEl.open) {
      dialogEl.close();
    }
  }, [confirmAction]);

  if (!confirmAction || !meta) {
    return (
      <dialog
        ref={dialogRef}
        className="fixed top-1/2 left-1/2 m-0 -translate-x-1/2 -translate-y-1/2 rounded-2xl p-0 backdrop:bg-[#030454]/40"
        onClose={onCancel}
      />
    );
  }

  return (
    <dialog
      ref={dialogRef}
      className="fixed top-1/2 left-1/2 m-0 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-slate-200 p-0 shadow-xl backdrop:bg-[#030454]/40"
      onClose={onCancel}
      aria-labelledby="ghg-review-dialog-title"
    >
      <ReviewConfirmDialogBody
        key={`${confirmAction.entry.id}-${confirmAction.action}`}
        confirmAction={confirmAction}
        meta={meta}
        sectorName={sectorName}
        onCancel={onCancel}
        onConfirm={onConfirm}
      />
    </dialog>
  );
}

function ReviewConfirmDialogBody({
  confirmAction,
  meta,
  sectorName,
  onCancel,
  onConfirm,
}) {
  const [comment, setComment] = useState("");
  const [commentError, setCommentError] = useState("");

  function handleConfirm() {
    if (meta.requireComment && !comment.trim()) {
      setCommentError("A reviewer comment is required for this action.");
      return;
    }

    onConfirm(confirmAction.entry, confirmAction.action, comment.trim());
  }

  return (
    <div className="p-6">
      <h2
        id="ghg-review-dialog-title"
        className="text-lg font-black text-[#030454]"
      >
        {meta.title}
      </h2>

      <p className="mt-2 text-sm leading-6 text-slate-600">
        {meta.description}
      </p>

      <div className="mt-4 rounded-xl bg-slate-50 p-3 text-xs text-slate-600">
        <strong className="text-[#030454]">{sectorName} entry:</strong>{" "}
        {confirmAction.entry.year} · {confirmAction.entry.fuel_or_activity} ·{" "}
        {formatNumber(confirmAction.entry.co2e_tonnes)} tCO₂e
      </div>

      <div className="mt-4">
        <label
          htmlFor="ghg-review-comment"
          className="mb-2 block text-sm font-bold text-[#030454]"
        >
          Reviewer comment
          {meta.requireComment ? "" : " (optional)"}
        </label>
        <textarea
          id="ghg-review-comment"
          rows="3"
          className={commentError ? invalidInputClass : inputClass}
          value={comment}
          onChange={(event) => {
            setComment(event.target.value);
            if (commentError) setCommentError("");
          }}
          aria-invalid={Boolean(commentError)}
          aria-describedby={
            commentError ? "ghg-review-comment-error" : undefined
          }
        />
        {commentError && (
          <span id="ghg-review-comment-error">
            <FieldError message={commentError} />
          </span>
        )}
      </div>

      <div className="mt-6 flex justify-end gap-3">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-slate-200 px-4 py-2 text-xs font-black uppercase tracking-[0.08em] text-[#030454] hover:border-slate-300"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleConfirm}
          className={`rounded-md border px-4 py-2 text-xs font-black uppercase tracking-[0.08em] text-white transition ${meta.tone}`}
        >
          {meta.confirmLabel}
        </button>
      </div>
    </div>
  );
}
