import ExecutiveGHGInventorySummary from "../components/ExecutiveGHGInventorySummary";

export default function GHGInventorySummaryPage({
  ghgSummary,
  isLoading,
  onOpenSector,
}) {
  if (isLoading && !ghgSummary) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-sm text-slate-500">
          Loading GHG inventory summary...
        </p>
      </section>
    );
  }

  if (!ghgSummary) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-sm text-slate-500">
          GHG inventory dashboard summary is currently unavailable.
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-6">
      <ExecutiveGHGInventorySummary
        ghgSummary={ghgSummary}
        onOpenSector={onOpenSector}
      />
    </section>
  );
}
