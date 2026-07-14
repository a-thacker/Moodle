// Grocery state backed by the authenticated API. Loads on mount; mutations
// update optimistically and call the backend, reloading on success so both
// devices converge. (Realtime push can layer on later; a reload-on-write is
// correct and simple for a two-person list.)

import { useEffect, useState } from "react";

import { api } from "../api/client";
import type { GroceryItem } from "../types";

export interface UseGrocery {
  items: GroceryItem[];
  loaded: boolean;
  add: (name: string, quantity?: string) => void;
  toggle: (id: number) => void;
}

export function useGrocery(): UseGrocery {
  const [items, setItems] = useState<GroceryItem[]>([]);
  const [loaded, setLoaded] = useState(false);

  function refresh(): void {
    api.grocery
      .list()
      .then((rows) => {
        setItems(rows);
        setLoaded(true);
      })
      .catch(() => {});
  }

  useEffect(refresh, []);

  function add(name: string, quantity?: string): void {
    const trimmed = name.trim();
    if (!trimmed) return;
    api.grocery.add(trimmed, quantity).then(refresh).catch(() => {});
  }

  function toggle(id: number): void {
    const target = items.find((it) => it.id === id);
    if (!target) return;
    // Optimistic flip, then persist + reconcile.
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, done: !it.done } : it)));
    api.grocery.setDone(id, !target.done).then(refresh).catch(() => {});
  }

  return { items, loaded, add, toggle };
}
