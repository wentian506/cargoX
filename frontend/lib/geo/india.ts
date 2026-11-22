/* India geography reference — 36 states/UTs, 800+ districts, 4,300+ towns.
 *
 * Data: district + town names and coordinates from OpenStreetMap, published via
 * the dr5hn/countries-states-cities-database export (ODbL). Bundled locally so
 * the pickers work offline — no geocoding API, no CDN.
 */
import raw from "./india.json";

export type Town = { name: string; lat: number; lng: number; district: string | null };
export type StateGeo = {
  name: string;
  slug: string;
  type: string;
  lat: number;
  lng: number;
  districts: string[];
  towns: Town[];
};

export const INDIA: StateGeo[] = (raw as any).states as StateGeo[];
export const STATE_NAMES: string[] = INDIA.map((s) => s.name);

export function stateByName(name?: string | null): StateGeo | undefined {
  if (!name) return undefined;
  const n = name.trim().toLowerCase();
  return INDIA.find((s) => s.name.toLowerCase() === n || s.slug === n);
}

export function districtsOf(state?: string | null): string[] {
  return stateByName(state)?.districts ?? [];
}

export function townsOf(state?: string | null): Town[] {
  return stateByName(state)?.towns ?? [];
}

export function townsInDistrict(state: string | null | undefined, district: string | null | undefined): Town[] {
  if (!state || !district) return townsOf(state);
  const t = townsOf(state).filter((x) => x.district === district);
  return t.length ? t : townsOf(state);
}

/** Nearest known town to a coordinate — used to label a picked map point. */
export function nearestTown(lat: number, lng: number, state?: string | null): Town | null {
  const pool = townsOf(state).length ? townsOf(state) : INDIA.flatMap((s) => s.towns);
  let best: Town | null = null;
  let bd = Infinity;
  const cos = Math.cos((lat * Math.PI) / 180);
  for (const t of pool) {
    const d = (t.lat - lat) ** 2 + ((t.lng - lng) * cos) ** 2;
    if (d < bd) {
      bd = d;
      best = t;
    }
  }
  return best;
}

export function nearestDistrict(lat: number, lng: number, state?: string | null): string | null {
  const t = nearestTown(lat, lng, state);
  return t?.district ?? null;
}

/** Great-circle distance in km (coordination value only — routing uses road_km on the server). */
export function haversineKm(a: [number, number], b: [number, number]): number {
  const R = 6371;
  const dLat = ((b[0] - a[0]) * Math.PI) / 180;
  const dLng = ((b[1] - a[1]) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a[0] * Math.PI) / 180) * Math.cos((b[0] * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export type GeoPlace = {
  id: string;
  name: string;
  district: string | null;
  state: string;
  lat: number;
  lng: number;
  kind: "town" | "village" | "hub" | "mandi" | "custom";
  population?: number;
};

/** Flattened searchable index of every town + district + known operating hub/mandi. */
let _index: GeoPlace[] | null = null;

export function placeIndex(): GeoPlace[] {
  if (_index) return _index;
  const out: GeoPlace[] = [];
  for (const s of INDIA) {
    for (const d of s.districts) {
      const t = s.towns.find((x) => x.district === d);
      out.push({
        id: `${s.slug}-${d}`,
        name: `${d} (district)`,
        district: d,
        state: s.name,
        lat: t?.lat ?? s.lat,
        lng: t?.lng ?? s.lng,
        kind: "town",
      });
    }
    for (const t of s.towns) {
      out.push({
        id: `${s.slug}-${t.name}`.replace(/\s+/g, "-").toLowerCase(),
        name: t.name,
        district: t.district,
        state: s.name,
        lat: t.lat,
        lng: t.lng,
        kind: "town",
      });
    }
  }
  _index = out;
  return out;
}

export function searchPlaces(query: string, limit = 12): GeoPlace[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  const all = placeIndex();
  const starts: GeoPlace[] = [];
  const contains: GeoPlace[] = [];
  for (const p of all) {
    const n = p.name.toLowerCase();
    if (n.startsWith(q)) starts.push(p);
    else if (n.includes(q) || (p.district ?? "").toLowerCase().includes(q)) contains.push(p);
    if (starts.length >= limit) break;
  }
  return [...starts, ...contains].slice(0, limit);
}

/** Reverse: which state/district contains a coordinate (nearest town lookup). */
export function locate(lat: number, lng: number): { state: string | null; district: string | null; town: string | null } {
  let bd = Infinity;
  let hit: { state: string; district: string | null; town: string } | null = null;
  const cos = Math.cos((lat * Math.PI) / 180);
  for (const s of INDIA) {
    for (const t of s.towns) {
      const d = (t.lat - lat) ** 2 + ((t.lng - lng) * cos) ** 2;
      if (d < bd) {
        bd = d;
        hit = { state: s.name, district: t.district, town: t.name };
      }
    }
  }
  return hit ?? { state: null, district: null, town: null };
}
