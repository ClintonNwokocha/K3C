export default function PlaceholderPage({ title, description }) {
  return (
    <div className="space-y-6">
      <section>
        <p className="text-sm font-medium text-emerald-700">
          Module Workspace
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">{title}</h1>
        <p className="mt-2 max-w-3xl text-slate-600">{description}</p>
      </section>

      <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 shadow-sm">
        <h2 className="text-lg font-bold text-slate-900">
          Module not built yet
        </h2>
        <p className="mt-2 text-slate-600">
          This page is reserved for the {title} module. We will build its
          database models, API endpoints, and frontend screens in later stages.
        </p>
      </div>
    </div>
  );
}