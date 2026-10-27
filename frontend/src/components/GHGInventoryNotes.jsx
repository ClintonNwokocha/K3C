import {
  GHG_INVENTORY_OVERVIEW,
  GHG_SECTOR_NOTES,
  GHG_SECTOR_ORDER,
} from "../config/ghgInventoryNotes.js";

function SectorNote({ note }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-xs leading-5 text-slate-700">
      <p className="text-sm font-black text-[#030454]">{note.label}</p>
      <p className="mt-2">
        <span className="font-bold text-[#030454]">Method:</span> {note.method}
      </p>
      <p className="mt-1">
        <span className="font-bold text-[#030454]">Data:</span> {note.sources}
      </p>
      <p className="mt-1">
        <span className="font-bold text-[#030454]">Limitations:</span> {note.limitations}
      </p>
    </div>
  );
}

// Shown with every view of the inventory. sector is a sector code, or
// "all" / "summary" / empty for every sector.
export default function GHGInventoryNotes({ sector }) {
  const sectors = GHG_SECTOR_NOTES[sector] ? [sector] : GHG_SECTOR_ORDER;

  return (
    <section
      className="rounded-xl border border-[#F3F74B]/70 bg-[#F3F74B]/15 p-5"
      aria-label="About this inventory"
    >
      <h3 className="text-base font-black text-[#030454]">About this inventory</h3>
      <p className="mt-2 max-w-4xl text-xs leading-5 text-slate-700">
        {GHG_INVENTORY_OVERVIEW}
      </p>
      <div
        className={`mt-4 grid gap-3 ${
          sectors.length > 1 ? "md:grid-cols-2 xl:grid-cols-5" : ""
        }`}
      >
        {sectors.map((key) => (
          <SectorNote key={key} note={GHG_SECTOR_NOTES[key]} />
        ))}
      </div>
    </section>
  );
}
