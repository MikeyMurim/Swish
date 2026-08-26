"use client";

import { useEffect, useState } from "react";
import { supabase } from "./supabase";
import type { User } from "@supabase/supabase-js";

export function useFavourites(user: User | null) {
  const [favouriteIds, setFavouriteIds] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (!user) return;

    supabase
      .from("favourite_courts")
      .select("court_id")
      .eq("user_id", user.id)
      .then(({ data }) => setFavouriteIds(new Set((data ?? []).map((row) => row.court_id))));
  }, [user]);

  const toggleFavourite = async (courtId: number) => {
    if (!user) return { ok: false as const };

    const isFavourite = favouriteIds.has(courtId);
    const { error } = isFavourite
      ? await supabase.from("favourite_courts").delete().eq("court_id", courtId).eq("user_id", user.id)
      : await supabase.from("favourite_courts").insert({ court_id: courtId, user_id: user.id });

    if (!error) {
      setFavouriteIds((current) => {
        const next = new Set(current);
        if (isFavourite) next.delete(courtId);
        else next.add(courtId);
        return next;
      });
    }

    return { ok: !error };
  };

  return { favouriteIds, toggleFavourite };
}
