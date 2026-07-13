// Grocery state with a live-API seam and a graceful fallback. On mount it
// tries the backend; until those routes exist (or if offline) it falls back
// to sample data so the UI is always interactive. Mutations update optimistically
// and attempt the matching API call, ignoring failures while the backend is WIP.

import { useEffect, useState } from "react";

import { api } from "../api/client";
import { sampleGrocery } from "../data/sample";
import type { GroceryItem } from "../types";

export interface UseGrocery {
  items: GroceryItem[];
  live: boolean; // true once data came from the backend
  add: (name: string, quantity?: string) => void;
  toggle: (id: number) => void;
}

export function useGrocery(): UseGrocery {
  const [items, setItems] = useState<GroceryItem[]>(sampleGrocery);
  const [live, setLive] = useState(false);

  useEffect(() => {
    let active = true;
    api.grocery
      .list()
      .then((rows) => {
        if (active) {
          setItems(rows);
          setLive(true);
        }
      })
      .catch(() => {
        /* backend not ready — keep sample data */
      });
    return () => {
      active = false;
    };
  }, []);

  function add(name: string, quantity?: string): void {
    const trimmed = name.trim();
    if (!trimmed) return;
    const optimistic: GroceryItem = {
      id: Date.now(),
      name: trimmed,
      quantity,
      done: false,
      addedByInitial: "A",
      addedByOwner: true,
    };
    setItems((prev) => [...prev, optimistic]);
    api.grocery.add(trimmed, quantity).catch(() => {});
  }

  function toggle(id: number): void {
    setItems((prev) =>
      prev.map((it) => (it.id === id ? { ...it, done: !it.done } : it)),
    );
    const target = items.find((it) => it.id === id);
    if (target) api.grocery.setDone(id, !target.done).catch(() => {});
  }

  return { items, live, add, toggle };
}
