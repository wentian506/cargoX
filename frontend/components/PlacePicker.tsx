"use client";

/* PlacePicker — any state, any district, any town or village in India.
 *
 * Three linked levels (state -> district -> town) plus a type-ahead over all
 * 4,300+ towns and 800 districts, and an optional "pick on the map" panel that
 * reverse-geocodes the clicked coordinate to the nearest known town. Nothing
 * here calls a geocoding API: the reference data is bundled with the app.
 */
import { Check, ChevronRight, LocateFixed, MapPin, Search, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import LiveMap from "@/components/LiveMap";
import {
  STATE_NAMES,
  districtsOf,
  locate,
  searchPlaces,
  townsInDistrict,
  townsOf,
  type GeoPlace,
} from "@/lib/geo/india";

export type PlaceValue = {
  name: string;
  state: string | null;
  district: string | null;
  lat: number | null;
  lng: number | null;
};

const empty = (): PlaceValue => ({ name: "", state: null, district: null, lat: null, lng: null });

export default function PlacePicker({
  label,
  value,
  onChange,
  hint,
  defaultState = "Bihar",
  allowMap = true,
  icon,
  required = false,
}: {
  label: string;
  value: PlaceValue;
  onChange: (v: PlaceValue) => void;
  hint?: string;
  defaultState?: string;
  allowMap?: boolean;
  icon?: React.ReactNode;
  required?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"browse" | "search" | "map">("browse");
  const [state, setState] = useState(value.state || defaultState);
  const [district, setDistrict] = useState(value.district || "");
  const [query, setQuery] = useState("");

  const districts = useMemo(() => districtsOf(state), [state]);
  const towns = useMemo(() => townsInDistrict(state, district), [state, district]);
  const results = useMemo(() => (query.length >= 2 ? searchPlaces(query, 10) : []), [query]);
  const stateTowns = useMemo(() => townsOf(state), [state]);

  useEffect(() => {
    if (districts.length && !districts.includes(district)) setDistrict(districts[0]);
  }, [districts, district]);

  const commit = (p: GeoPlace) => {
    onChange({ name: p.name, state: p.state, district: p.district, lat: p.lat, lng: p.lng });
    setOpen(false);
  };

  const commitTyped = () => {
    if (!value.name.trim() && !state) return;
  };

  const pickOnMap = (lat: number, lng: number) => {
    const near = locate(lat, lng);
    onChange({
      name: near.town || "Pinned location",
      state: near.state || state,
      district: near.district || district || null,
      lat,
      lng,
    });
  };

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-[12px] font-semibold text-ink">
          {icon}
          {label} {required && <span className="text-red-500">*</span>}
        </div>
        {value.name && (
          <button type="button" onClick={() => onChange(empty())} className="text-[10.5px] text-ink-muted hover:text-ink">
            clear
          </button>
        )}
      </div>

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`flex w-full items-center gap-2.5 rounded-xl2 border px-3 py-2.5 text-left transition-colors ${
          open ? "border-ink bg-white" : "border-line bg-white hover:border-ink/30"
        }`}
      >
        <MapPin size={14} className={value.name ? "text-ink" : "text-ink-faint"} />
        <span className="min-w-0 flex-1">
          {value.name ? (
            <>
              <span className="block truncate text-[13px] font-medium text-ink">{value.name}</span>
              <span className="block truncate text-[10.5px] text-ink-muted">
                {[value.district, value.state].filter(Boolean).join(", ")}
                {value.lat !== null && value.lng !== null && (
                  <span className="ml-1.5 font-mono text-[9.5px] text-ink-faint">
                    {value.lat.toFixed(3)}, {value.lng.toFixed(3)}
                  </span>
                )}
              </span>
            </>
          ) : (
            <span className="text-[12.5px] text-ink-faint">{hint || "Choose state → district → town / village"}</span>
          )}
        </span>
        <ChevronRight size={14} className={`shrink-0 text-ink-faint transition-transform ${open ? "rotate-90" : ""}`} />
      </button>

      {open && (
        <div className="mt-2 rounded-xl2 border border-line bg-white p-3 shadow-lift">
          <div className="mb-2.5 flex gap-1">
            {(
              [
                ["browse", "Browse"],
                ["search", "Search"],
                ...(allowMap ? ([["map", "Pick on map"]] as [string, string][]) : []),
              ] as [string, string][]
            ).map(([k, l]) => (
              <button
                key={k}
                type="button"
                onClick={() => setTab(k as any)}
                className={`rounded-pill px-2.5 py-1 text-[11px] font-medium transition-colors ${
                  tab === k ? "bg-ink text-white" : "bg-soft text-ink-muted hover:text-ink"
                }`}
              >
                {l}
              </button>
            ))}
            <button type="button" onClick={() => setOpen(false)} className="ml-auto text-ink-faint hover:text-ink">
              <X size={13} />
            </button>
          </div>

          {tab === "browse" && (
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <label className="block">
                  <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-ink-muted">
                    State / UT ({STATE_NAMES.length})
                  </div>
                  <select className="select" value={state} onChange={(e) => { setState(e.target.value); setDistrict(""); }}>
                    {STATE_NAMES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </label>
                <label className="block">
                  <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-ink-muted">
                    District ({districts.length})
                  </div>
                  <select className="select" value={district} onChange={(e) => setDistrict(e.target.value)}>
                    {districts.map((d) => <option key={d} value={d}>{d}</option>)}
                  </select>
                </label>
              </div>
              <div>
                <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-ink-muted">
                  Town / village ({towns.length} in {district || state})
                </div>
                <div className="max-h-40 overflow-auto rounded-xl2 border border-line">
                  {towns.map((t) => (
                    <button
                      key={`${t.name}-${t.lat}`}
                      type="button"
                      onClick={() => commit({ ...t, state, district: t.district, kind: "town" } as GeoPlace)}
                      className="flex w-full items-center justify-between gap-2 border-b border-line/60 px-2.5 py-1.5 text-left text-[12px] last:border-0 hover:bg-accent-50"
                    >
                      <span className="truncate font-medium text-ink">{t.name}</span>
                      <span className="shrink-0 font-mono text-[9.5px] text-ink-faint">{t.lat.toFixed(2)}, {t.lng.toFixed(2)}</span>
                    </button>
                  ))}
                </div>
                <div className="mt-1.5 flex items-center justify-between gap-2">
                  <span className="text-[10px] text-ink-faint">{stateTowns.length} towns mapped in {state}</span>
                  <button
                    type="button"
                    onClick={() => onChange({ name: district || state, state, district: district || null, lat: null, lng: null })}
                    className="text-[10.5px] font-medium text-ink hover:underline"
                  >
                    Use district centre
                  </button>
                </div>
              </div>
            </div>
          )}

          {tab === "search" && (
            <div>
              <div className="relative">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" />
                <input
                  autoFocus
                  className="input pl-8"
                  placeholder="Search any town, village or district in India…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>
              <div className="mt-2 max-h-52 overflow-auto">
                {results.length === 0 && (
                  <div className="px-2 py-3 text-center text-[11.5px] text-ink-muted">
                    Type at least 2 letters — 4,300+ towns and 800+ districts are indexed.
                  </div>
                )}
                {results.map((p) => (
                  <button
                    key={`${p.id}-${p.lat}`}
                    type="button"
                    onClick={() => commit(p)}
                    className="flex w-full items-center gap-2 border-b border-line/60 px-2 py-1.5 text-left last:border-0 hover:bg-accent-50"
                  >
                    <MapPin size={12} className="shrink-0 text-ink-faint" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12px] font-medium text-ink">{p.name}</span>
                      <span className="block truncate text-[10px] text-ink-muted">
                        {[p.district, p.state].filter(Boolean).join(", ")}
                      </span>
                    </span>
                    <Check size={12} className="shrink-0 text-transparent group-hover:text-accent" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {tab === "map" && (
            <div>
              <div className="mb-1.5 flex items-center gap-1.5 text-[10.5px] text-ink-muted">
                <LocateFixed size={11} /> Pan, zoom and click the map — the nearest mapped town is filled in.
              </div>
              <LiveMap
                height={260}
                points={
                  value.lat !== null && value.lng !== null
                    ? [{ id: "pin", name: value.name || "Pinned", lat: value.lat, lng: value.lng, kind: "pickup", selected: true }]
                    : []
                }
                onMapClick={pickOnMap}
                legend={false}
                emptyLabel="Click anywhere to drop a pin"
                footerNote="India district basemap · 4,300+ towns"
              />
              {value.lat !== null && value.lng !== null && (
                <div className="mt-1.5 flex items-center justify-between text-[11px]">
                  <span className="text-ink-muted">
                    Pinned near <b className="text-ink">{value.name}</b>, {value.district}
                  </span>
                  <button type="button" onClick={() => setOpen(false)} className="font-semibold text-ink hover:underline">
                    Use this
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
