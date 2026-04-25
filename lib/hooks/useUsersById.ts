import { useState, useEffect, useCallback } from "react";
import { useGetSupabase } from "./useSupabase";
import type { UserRow } from "../database.types";

const cache = new Map<string, UserRow>();

export function useUsersById(ids: string[]) {
  const getSupabase = useGetSupabase();
  const [users, setUsers] = useState<Record<string, UserRow>>(() => {
    const seed: Record<string, UserRow> = {};
    for (const id of ids) {
      const hit = cache.get(id);
      if (hit) seed[id] = hit;
    }
    return seed;
  });
  const [loading, setLoading] = useState(false);

  const key = ids.slice().sort().join(",");

  const fetchMissing = useCallback(async () => {
    const missing = ids.filter((id) => !cache.has(id));
    if (missing.length === 0) return;
    setLoading(true);
    try {
      const sb = await getSupabase();
      const { data } = await sb.from("users").select("*").in("id", missing);
      const next: Record<string, UserRow> = { ...users };
      for (const row of data ?? []) {
        cache.set(row.id, row);
        next[row.id] = row;
      }
      setUsers(next);
    } finally {
      setLoading(false);
    }
  }, [key]);

  useEffect(() => { fetchMissing(); }, [fetchMissing]);

  return { users, loading };
}
