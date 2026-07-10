import {
  Activity,
  ArrowRight,
  BarChart3,
  CloudSun,
  Database,
  FileText,
  FolderKanban,
  Globe2,
  Leaf,
  ShieldCheck,
} from "lucide-react";
import ExecutiveClimateRiskSummary from "../components/ExecutiveClimateRiskSummary";
import ExecutiveProjectPortfolioSummary from "../components/ExecutiveProjectPortfolioSummary";
import ExecutiveReportsSummary from "../components/ExecutiveReportsSummary";

function formatRole(role) {
  const labels = {
    admin: "Administrator",
    analyst: "Analyst",
    sector_focal_point: "Sector Focal Point",
    reviewer: "Reviewer",
    viewer: "Viewer",
  };

  return labels[role] || "User";
}

function formatDate() {
  return new Date().toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function CommandMetric({ label, value, helper, tone = "blue" }) {
  const toneClasses = {
    blue: "border-[#030454]/15 bg-[#030454]/5",
    green: "border-[#009B35]/20 bg-[#009B35]/8",
    yellow: "border-[#F3F74B]/70 bg-[#F3F74B]/18",
    white: "border-slate-200 bg-white",
  };

  return (
    <div
      className={`rounded-xl border p-5 shadow-sm ${
        toneClasses[tone] || toneClasses.blue
      }`}
    >
      <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">
        {label}
      </p>

      <p className="mt-3 text-2xl font-black text-[#030454]">{value}</p>

      <p className="mt-2 text-sm leading-6 text-slate-600">{helper}</p>
    </div>
  );
}

function ModuleCard({
  icon: Icon,
  title,
  description,
  actionLabel,
  onClick,
  tone = "blue",
}) {
  const iconClasses = {
    blue: "bg-[#030454] text-white",
    green: "bg-[#009B35] text-white",
    yellow: "bg-[#F3F74B] text-[#030454]",
    white: "bg-white text-[#030454] border border-slate-200",
  };

  return (
    <button
      type="button"
      onClick={onClick}
      className="group rounded-xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-[#009B35]/60 hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-4">
        <div
          className={`flex h-11 w-11 items-center justify-center rounded-xl ${
            iconClasses[tone] || iconClasses.blue
          }`}
        >
          <Icon size={20} />
        </div>

        <ArrowRight
          size={18}
          className="text-slate-300 transition group-hover:translate-x-1 group-hover:text-[#009B35]"
        />
      </div>

      <h3 className="mt-5 text-base font-black text-[#030454]">{title}</h3>

      <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>

      <p className="mt-4 text-xs font-black uppercase tracking-[0.1em] text-[#009B35]">
        {actionLabel}
      </p>
    </button>
  );
}

function SectionHeader({ title, description }) {
  return (
    <div className="mb-5">
      <h2 className="text-2xl font-black tracking-tight text-[#030454]">
        {title}
      </h2>

      {description && (
        <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-600">
          {description}
        </p>
      )}
    </div>
  );
}

function FocusItem({ icon: Icon, title, description, tone = "blue" }) {
  const iconClasses = {
    blue: "bg-[#030454]/10 text-[#030454]",
    green: "bg-[#009B35]/10 text-[#009B35]",
    yellow: "bg-[#F3F74B]/35 text-[#030454]",
    white: "bg-white text-[#030454] border border-slate-200",
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="flex gap-4">
        <div
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${
            iconClasses[tone] || iconClasses.blue
          }`}
        >
          <Icon size={20} />
        </div>

        <div>
          <p className="font-black text-[#030454]">{title}</p>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            {description}
          </p>
        </div>
      </div>
    </div>
  );
}

export default function Dashboard({ foundation, currentUser, onPageChange }) {
  const role = currentUser?.profile?.role || "viewer";

  function navigateTo(pageKey) {
    if (typeof onPageChange === "function") {
      onPageChange(pageKey);
    }
  }

  return (
    <div className="space-y-8">
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="grid gap-6 xl:grid-cols-[1.25fr_0.75fr] xl:items-center">
          <div>
            <div className="flex flex-wrap gap-3">
              <span className="rounded-md bg-[#030454] px-4 py-2 text-xs font-black uppercase tracking-[0.12em] text-white">
                Executive Command View
              </span>

              <span className="rounded-md border border-slate-200 bg-slate-50 px-4 py-2 text-xs font-bold uppercase tracking-[0.12em] text-[#030454]">
                {formatDate()}
              </span>
            </div>

            <h1 className="mt-5 text-3xl font-black tracking-tight text-[#030454] sm:text-4xl">
              Kaduna Climate Command Centre
            </h1>

            <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600">
              Monitor Climate Intelligence, greenhouse gas inventory, climate action
              projects, reports, public transparency outputs and audit-ready
              governance workflows from one internal command dashboard.
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-5">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">
              Signed in as
            </p>

            <p className="mt-2 text-xl font-black text-[#030454]">
              {formatRole(role)}
            </p>

            <p className="mt-1 text-sm text-slate-500">
              {currentUser?.username || "Current user"}
            </p>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => {
                  window.location.href = "/public";
                }}
                className="rounded-md border border-[#030454] px-4 py-3 text-xs font-black uppercase tracking-[0.08em] text-[#030454] transition hover:bg-[#030454] hover:text-white"
              >
                Public Portal
              </button>

              <button
                type="button"
                onClick={() => navigateTo("reports")}
                className="rounded-md bg-[#009B35] px-4 py-3 text-xs font-black uppercase tracking-[0.08em] text-white transition hover:bg-[#00842e]"
              >
                Reports Centre
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <CommandMetric
          label="Climate Intelligence"
          value="Risk"
          helper="LGA risk scores, maps, parameters and scoring evidence."
          tone="green"
        />

        <CommandMetric
          label="Mitigation Tracking"
          value="GHG"
          helper="Greenhouse gas inventory workflows and sector records."
          tone="blue"
        />

        <CommandMetric
          label="Climate Action"
          value="Projects"
          helper="Adaptation, mitigation and cross-cutting project tracking."
          tone="yellow"
        />

        <CommandMetric
          label="Accountability"
          value="Reports"
          helper="Official reports, public documents and audit-ready records."
          tone="white"
        />
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <SectionHeader
          title="Move quickly into the active work areas"
          description="Use these module cards to move from overview to operational work."
        />

        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          <ModuleCard
            icon={CloudSun}
            title="Climate Intelligence"
            description="Review LGA Climate Intelligence scores, maps, raw parameter records and scoring outputs."
            actionLabel="Open risk module"
            tone="green"
            onClick={() => navigateTo("risk")}
          />

          <ModuleCard
            icon={Leaf}
            title="GHG Inventory"
            description="Manage emissions activity data and sector inventory workflows for reporting."
            actionLabel="Open GHG module"
            tone="blue"
            onClick={() => navigateTo("ghg")}
          />

          <ModuleCard
            icon={FolderKanban}
            title="Project Portfolio"
            description="Track climate projects, budgets, beneficiaries, GHG reduction and status."
            actionLabel="Open projects"
            tone="yellow"
            onClick={() => navigateTo("projects")}
          />

          <ModuleCard
            icon={FileText}
            title="Reports Centre"
            description="Store, review, publish and export climate reports and public-facing documents."
            actionLabel="Open reports"
            tone="blue"
            onClick={() => navigateTo("reports")}
          />
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <SectionHeader
            title="What leadership should answer quickly"
            description="A command dashboard should immediately connect risk, action, evidence and accountability."
          />

          <div className="space-y-4">
            <FocusItem
              icon={Globe2}
              title="Where are the highest Climate Intelligences?"
              description="Use LGA risk maps and scores to identify priority locations and risk drivers."
              tone="green"
            />

            <FocusItem
              icon={Activity}
              title="What actions are responding to those risks?"
              description="Track climate projects by LGA, sector, budget, beneficiaries and mitigation outcome."
              tone="yellow"
            />

            <FocusItem
              icon={Database}
              title="What evidence supports decisions?"
              description="Maintain reports, imports, audit logs and data provenance for accountability."
              tone="blue"
            />
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <SectionHeader
            title="Current platform readiness"
            description="Use this section as a quick internal reminder of what needs attention before deployment."
          />

          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-5">
              <div className="flex items-center gap-3">
                <ShieldCheck size={20} className="text-[#030454]" />
                <p className="font-black text-[#030454]">Permissions</p>
              </div>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Role-based access has been centralized across modules.
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-5">
              <div className="flex items-center gap-3">
                <BarChart3 size={20} className="text-[#009B35]" />
                <p className="font-black text-[#030454]">Validation</p>
              </div>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Forms, uploads and data limits are being tightened.
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-5">
              <div className="flex items-center gap-3">
                <FileText size={20} className="text-[#030454]" />
                <p className="font-black text-[#030454]">Reports</p>
              </div>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Public reports and internal documents are separated.
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-5">
              <div className="flex items-center gap-3">
                <CloudSun size={20} className="text-[#009B35]" />
                <p className="font-black text-[#030454]">Public Portal</p>
              </div>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Public-facing Climate Intelligence and action summaries are available.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <SectionHeader
          title="Executive Climate Intelligence summary"
          description="Leadership-level view of LGA Climate Intelligence scores, highest-risk LGAs and adaptation signals."
        />

        <ExecutiveClimateRiskSummary />
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <SectionHeader
          title="Climate action and investment summary"
          description="Track project counts, budgets, expected beneficiaries, mitigation outcomes and implementation gaps."
        />

        <ExecutiveProjectPortfolioSummary />
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <SectionHeader
          title="Reports centre executive summary"
          description="Review publication status, report queue and recent documents from the Reports Centre."
        />

        <ExecutiveReportsSummary />
      </section>
    </div>
  );
}