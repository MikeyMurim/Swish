import { supabase } from "../lib/supabase";

export type CheckInResult =
  | { ok: true }
  | { ok: false; reason: "not-signed-in" | "no-location" | "error"; message: string };

// We added userLocation to enforce the geofence
export async function checkIn(courtId: number, userLocation: [number, number] | null): Promise<CheckInResult> {
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
  
  // Pointing to your local FastAPI server
  const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

  try {
    const response = await fetch(`${API_URL}/checkin`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        court_id: courtId,
        user_id: userData.user.id,
        user_lat: lat,
        user_lng: lng,
        occupancy_status: "live"
      }),
    });

    if (!response.ok) {
      // 403 Forbidden means our PostGIS ST_DWithin query blocked them!
      if (response.status === 403) {
        return { ok: false, reason: "error", message: "Geofence block: You must be within 50 meters of the court." };
      }
      
      const errorData = await response.json().catch(() => ({}));
      return { ok: false, reason: "error", message: errorData.detail || "Validation server error." };
    }

    return { ok: true };
  } catch (err) {
    return { ok: false, reason: "error", message: "Failed to connect to the validation server." };
  }
}