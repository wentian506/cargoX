"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError } from "./api";

/** Tiny fetch-on-mount hook with loading / error / refresh. */
export function useApi<T>(path: string | null, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(!!path);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);

  const load = useCallback(async () => {
    if (!path) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<T>(path);
      if (mounted.current) setData(res);
    } catch (e) {
      if (mounted.current) setError(e instanceof ApiError ? e.message : "Request failed");
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [path]);

  useEffect(() => {
    mounted.current = true;
    load();
    return () => {
      mounted.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, ...deps]);

  return { data, loading, error, reload: load, setData };
}

/** Debounced value for search inputs. */
export function useDebounced<T>(value: T, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export const COMMODITIES = [
  { key: "wheat", label: "Wheat", emoji: "🌾" },
  { key: "paddy", label: "Paddy", emoji: "🌾" },
  { key: "maize", label: "Maize", emoji: "🌽" },
  { key: "potato", label: "Potato", emoji: "🥔" },
  { key: "onion", label: "Onion", emoji: "🧅" },
  { key: "mustard", label: "Mustard", emoji: "🌻" },
  { key: "cotton", label: "Cotton", emoji: "☁️" },
  { key: "tomato", label: "Tomato", emoji: "🍅" },
];

export const VEHICLE_CLASSES = [
  { key: "tractor_trolley", label: "Tractor trolley", capacity: 2500 },
  { key: "pickup", label: "Pickup", capacity: 1200 },
  { key: "tempo", label: "Tempo", capacity: 3500 },
  { key: "lcv", label: "LCV", capacity: 7500 },
  { key: "truck", label: "Truck", capacity: 16000 },
];

export const STATUS_FLOW = [
  "draft", "pending_admin_review", "planning", "matched", "awaiting_sender_approval",
  "confirmed", "ready_for_pickup", "in_transit", "at_transfer_hub", "out_for_delivery", "delivered",
];
