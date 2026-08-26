import { supabase } from "../lib/supabase";

export type CheckInResult =
  | { ok: true }
  | { ok: false; reason: "not-signed-in" | "no-location" | "error"; message: string };

// Custom SQLSTATE the check_in_to_court RPC raises when the caller is
// outside the 50m geofence -- see migrations/20260826_rpc_checkin.sql.
const GEOFENCE_ERROR_CODE = "SW001";

export async function checkIn(
  courtId: number,
  userLocation: [number, number] | null,
  status: string,
  playerCount?: number
): Promise<CheckInResult> {
  const { data: userData } = await supabase.auth.getUser();

  if (!userData?.user) {
    return {
      ok: false,
      reason: "not-signed-in",
      message: "Sign in to check in.",
    };
  }

  // Prevent check-in if the user hasn't granted location access
  if (!userLocation) {
    return {
      ok: false,
      reason: "no-location",
      message: "Enable location services to verify you are at the court.",
    };
  }

  const [lng, lat] = userLocation;

  const { error } = await supabase.rpc("check_in_to_court", {
    court_id: courtId,
    user_lat: lat,
    user_lng: lng,
    occupancy_status: status,
    player_count: playerCount ?? null,
  });

  if (error) {
    if (error.code === GEOFENCE_ERROR_CODE) {
      return { ok: false, reason: "error", message: "Geofence block: You must be within 50 meters of the court." };
    }
    return { ok: false, reason: "error", message: error.message || "Check-in failed." };
  }

  return { ok: true };
}
