"use client";

/* CargoItems — the load, line by line.
 *
 * The catalogue is a convenience, not a limit: the sender can type any item name
 * ("bamboo baskets", "sugarcane tops", "second-hand tractor parts"), attach a
 * free-text note per line, and write a requirement in their own words. Those
 * custom names flow through to the shipment record, the admin review queue and
 * the AgroCompat gate — no enum anywhere in the path.
 */
import { Plus, Trash2, Wand2 } from "lucide-react";
import { useMemo } from "react";
import { titleCase } from "@/lib/api";
import { COMMODITIES } from "@/lib/hooks";

export type CargoLine = {
  commodity: string;
  quantity: number;
  unit: "quintal" | "tonne" | "kg";
  packaging?: string;
  handling?: string;
  note?: string;
};

const PACKAGING = ["jute_bags", "plastic_crates", "mesh_bags", "bales", "loose_bulk", "cartons"];
const HANDLING = ["dry_cover", "ventilated", "no_stack", "fragile", "temperature_controlled"];

const toKg = (l: { quantity: number; unit: string }) =>
  l.unit === "tonne" ? l.quantity * 1000 : l.unit === "quintal" ? l.quantity * 100 : l.quantity;

export function lineKg(lines: CargoLine[]) {
  return lines.reduce((s, l) => s + toKg(l), 0);
}

export function CargoLines({
  lines,
  onChange,
  primary,
  onPrimary,
}: {
  lines: CargoLine[];
  onChange: (next: CargoLine[]) => void;
  primary?: CargoLine | null;
  onPrimary?: (l: CargoLine) => void;
}) {
  const totalKg = useMemo(() => lineKg(lines), [lines]);

  const patch = (i: number, patchObj: Partial<CargoLine>) =>
    onChange(lines.map((l, j) => (j === i ? { ...l, ...patchObj } : l)));

  return (
    <div className="space-y-2.5">
      {primary && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl2 border border-accent-100 bg-accent-50 px-3 py-2">
          <Wand2 size={12} className="text-ink" />
          <span className="text-[11px] font-semibold text-ink">Main cargo</span>
          <span className="text-[11.5px] text-ink-muted">
            {titleCase(primary.commodity)} · {primary.quantity} {primary.unit}
          </span>
          <button
            type="button"
            onClick={() => onPrimary?.(primary)}
            className="ml-auto text-[10.5px] font-semibold text-ink hover:underline"
          >
            copy as a line
          </button>
        </div>
      )}

      {lines.length === 0 && (
        <div className="rounded-xl2 border border-dashed border-line px-3 py-3 text-center text-[11.5px] text-ink-muted">
          One item is enough. Add another line when the load mixes things — e.g. wheat bags plus a crate of
          tools, or hay with a fragile item.
        </div>
      )}

      {lines.map((line, i) => (
        <div key={i} className="rounded-xl2 border border-line bg-white p-2.5">
          <div className="grid gap-2 sm:grid-cols-[1.6fr_0.7fr_0.9fr_auto]">
            <label className="block">
              <div className="mb-1 text-[9.5px] font-semibold uppercase tracking-wider text-ink-muted">Item name (any)</div>
              <input
                className="input"
                list="cargox-commodity-list"
                placeholder="e.g. bamboo baskets, kinnow, scrap iron"
                value={line.commodity}
                onChange={(e) => patch(i, { commodity: e.target.value })}
              />
            </label>
            <label className="block">
              <div className="mb-1 text-[9.5px] font-semibold uppercase tracking-wider text-ink-muted">Qty</div>
              <input
                className="input"
                type="number"
                min={0}
                step="0.5"
                value={line.quantity}
                onChange={(e) => patch(i, { quantity: Number(e.target.value) })}
              />
            </label>
            <label className="block">
              <div className="mb-1 text-[9.5px] font-semibold uppercase tracking-wider text-ink-muted">Unit</div>
              <select className="select" value={line.unit} onChange={(e) => patch(i, { unit: e.target.value as any })}>
                <option value="quintal">Quintal</option>
                <option value="tonne">Tonne</option>
                <option value="kg">Kg</option>
              </select>
            </label>
            <button
              type="button"
              aria-label="Remove line"
              onClick={() => onChange(lines.filter((_, j) => j !== i))}
              className="mt-4 grid h-8 w-8 place-items-center rounded-lg border border-line text-ink-muted hover:border-red-200 hover:bg-red-50 hover:text-red-600"
            >
              <Trash2 size={13} />
            </button>
          </div>
          <div className="mt-2 grid gap-2 sm:grid-cols-[0.8fr_0.9fr_1.6fr]">
            <label className="block">
              <div className="mb-1 text-[9.5px] font-semibold uppercase tracking-wider text-ink-muted">Packaging</div>
              <select className="select" value={line.packaging || "jute_bags"} onChange={(e) => patch(i, { packaging: e.target.value })}>
                {PACKAGING.map((p) => <option key={p} value={p}>{titleCase(p)}</option>)}
              </select>
            </label>
            <label className="block">
              <div className="mb-1 text-[9.5px] font-semibold uppercase tracking-wider text-ink-muted">Handling</div>
              <select className="select" value={line.handling || "dry_cover"} onChange={(e) => patch(i, { handling: e.target.value })}>
                {HANDLING.map((p) => <option key={p} value={p}>{titleCase(p)}</option>)}
              </select>
            </label>
            <label className="block">
              <div className="mb-1 text-[9.5px] font-semibold uppercase tracking-wider text-ink-muted">Note (optional)</div>
              <input
                className="input"
                placeholder="e.g. 3rd-grade, keep upright"
                value={line.note || ""}
                onChange={(e) => patch(i, { note: e.target.value })}
              />
            </label>
          </div>
        </div>
      ))}

      <datalist id="cargox-commodity-list">
        {COMMODITIES.map((c) => (
          <option key={c.key} value={c.key}>{c.label}</option>
        ))}
      </datalist>

      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => onChange([...lines, { commodity: "", quantity: 1, unit: "quintal", packaging: "jute_bags", handling: "dry_cover" }])}
          className="btn-outline btn-sm"
        >
          <Plus size={12} /> Add another item
        </button>
        {lines.length > 0 && (
          <span className="text-[11px] text-ink-muted">
            {lines.length} line{lines.length > 1 ? "s" : ""} ·{" "}
            <b className="text-ink">{(totalKg / 1000).toFixed(2)} t</b> total
          </span>
        )}
      </div>
    </div>
  );
}

export default CargoLines;
