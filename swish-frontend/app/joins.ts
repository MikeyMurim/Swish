import { supabase } from "../lib/supabase";

export async function toggleCourtJoin(courtId: number, userId: string, isJoined: boolean) {
  return isJoined
    ? await supabase.from("court_joins").delete().eq("court_id", courtId).eq("user_id", userId)
    : await supabase.from("court_joins").insert({ court_id: courtId, user_id: userId });
}
