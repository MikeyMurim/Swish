import Icon from "./Icon";
import { effectiveStatusTone, type Court } from "./courts";

export default function CourtMedia({
  court,
  className = "h-72",
}: {
  court: Court;
  className?: string;
}) {
  const tone = effectiveStatusTone(court);
  const isIndoor = court.court_type === "indoor";

  return (
    <div className={`relative w-full overflow-hidden ${className}`}>
      {court.image_url ? (
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url('${court.image_url}')` }}
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center bg-surface-container-highest">
          <Icon name="sports_basketball" className="text-6xl! text-surface-variant" />
        </div>
      )}
      <div className="absolute inset-0 court-card-gradient" />
      <div className="absolute top-4 left-4 flex gap-2">
        <span className="bg-surface-container-highest/80 backdrop-blur-sm text-primary font-body text-label-sm px-3 py-1 rounded-full uppercase font-bold border border-primary/20">
          {isIndoor ? "Indoor" : "Outdoor"}
        </span>
        {tone === "live" && (
          <span className="bg-primary-container text-on-primary-container font-body text-label-sm px-3 py-1 rounded-full uppercase font-bold animate-pulse">
            Live Now
          </span>
        )}
      </div>
    </div>
  );
}
