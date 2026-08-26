export type Court = {
  id: number;
  name: string;
  status: string | null;
  address?: string | null;
  added_by?: string | null;
  updated_at?: string | null;
  image_url?: string | null;
  court_type?: "indoor" | "outdoor" | null;
  capacity?: number | null;
  is_free?: boolean | null;
  price_amount?: number | null;
  has_water?: boolean | null;
  player_count?: number | null;

  location: {
    coordinates: [number, number]; // [lng, lat]
  } | null;
};

// A self-reported status/headcount is only trusted for this long after
// `updated_at`; past that it's treated as stale rather than left showing
// forever.
const REPORT_TTL_MS = 90 * 60 * 1000;

export function isReportExpired(updatedAt: string | null | undefined): boolean {
  if (!updatedAt) return true;
  const updated = new Date(updatedAt).getTime();
  if (Number.isNaN(updated)) return true;
  return Date.now() - updated > REPORT_TTL_MS;
}

export function statusTone(status: string | null): "full" | "live" | "empty" | "neutral" {
  const s = (status ?? "").toLowerCase();
  if (s.includes("full")) return "full";
  if (s.includes("live")) return "live";
  if (s.includes("empty")) return "empty";
  return "neutral";
}

// Same as statusTone, but treats an expired report as neutral rather than
// showing a stale "Live"/"Full" badge indefinitely.
export function effectiveStatusTone(court: Court): "full" | "live" | "empty" | "neutral" {
  if (isReportExpired(court.updated_at)) return "neutral";
  return statusTone(court.status);
}

// The self-reported headcount, or null once it's expired / was never set.
export function effectivePlayerCount(court: Court): number | null {
  if (court.player_count == null) return null;
  return isReportExpired(court.updated_at) ? null : court.player_count;
}

export function isCourtFull(court: Court): boolean {
  return effectiveStatusTone(court) === "full";
}
