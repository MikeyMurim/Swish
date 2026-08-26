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

  location: {
    coordinates: [number, number]; // [lng, lat]
  } | null;
};

export function statusTone(status: string | null): "full" | "live" | "empty" | "neutral" {
  const s = (status ?? "").toLowerCase();
  if (s.includes("full")) return "full";
  if (s.includes("live")) return "live";
  if (s.includes("empty")) return "empty";
  return "neutral";
}

export function isCourtFull(court: Court): boolean {
  return statusTone(court.status) === "full";
}
