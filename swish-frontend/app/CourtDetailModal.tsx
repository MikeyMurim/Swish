'use client';

import { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import Icon from './Icon';
import CourtMedia from './CourtMedia';
import { type Court } from './courts';

interface CourtDetailModalProps {
  court: Court;
  playerCount: number;
  isFavourited: boolean;
  isSignedIn: boolean;
  onToggleFavourite: () => void;
  onClose: () => void;
  onConfirmCount: (count: number) => Promise<void>;
  onRequireAuth: () => void;
  statusMessage?: string;
}

export default function CourtDetailModal({
  court,
  playerCount,
  isFavourited,
  isSignedIn,
  onToggleFavourite,
  onClose,
  onConfirmCount,
  onRequireAuth,
  statusMessage,
}: CourtDetailModalProps) {
  const capacity = court.capacity ?? 20;
  const [updating, setUpdating] = useState(false);
  const [count, setCount] = useState(() => Math.min(Math.max(playerCount, 1), capacity));
  const [isSubmitting, setIsSubmitting] = useState(false);

  const mapContainer = useRef<HTMLDivElement | null>(null);
  const map = useRef<maplibregl.Map | null>(null);

  const coords = court.location?.coordinates;

  useEffect(() => {
    if (!mapContainer.current || map.current || !coords) return;

    map.current = new maplibregl.Map({
      container: mapContainer.current,
      style: {
        version: 8,
        sources: {
          'carto-dark': {
            type: 'raster',
            tiles: ['https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png'],
            tileSize: 256,
          },
        },
        layers: [
          {
            id: 'carto-dark-layer',
            type: 'raster',
            source: 'carto-dark',
            minzoom: 0,
            maxzoom: 18,
          },
        ],
      },
      center: coords,
      zoom: 14,
      scrollZoom: false,
    });

    new maplibregl.Marker({ color: '#ff5f1f' }).setLngLat(coords).addTo(map.current);

    return () => {
      map.current?.remove();
      map.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleConfirm = async () => {
    setIsSubmitting(true);
    await onConfirmCount(count);
    setIsSubmitting(false);
    setUpdating(false);
  };

  const priceLabel =
    court.is_free === false
      ? court.price_amount != null
        ? `Paid – ${new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(
            court.price_amount
          )}`
        : 'Paid entry'
      : court.is_free === true
      ? 'Free entry'
      : 'Pricing unknown';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 md:p-8 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-2xl bg-surface-container rounded-xl overflow-hidden shadow-2xl border border-surface-variant/30 flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute top-4 right-4 z-10 bg-surface/50 hover:bg-surface-variant p-2 rounded-full transition-colors"
        >
          <Icon name="close" className="text-on-surface" />
        </button>

        <CourtMedia court={court} className="h-48 md:h-64" />

        <div className="p-6 md:p-8 overflow-y-auto">
          <div className="flex justify-between items-start gap-4 mb-6">
            <div className="min-w-0">
              <h2 className="font-headline text-headline-lg text-on-surface uppercase tracking-tight truncate">
                {court.name}
              </h2>
              {court.address && (
                <p className="font-body text-label-md text-secondary flex items-center gap-1 mt-1">
                  <Icon name="location_on" className="text-sm!" />
                  {court.address}
                </p>
              )}
            </div>
            <div className="text-right shrink-0">
              <span className="block font-headline text-headline-md text-primary">
                {court.capacity != null ? `${playerCount}/${court.capacity}` : playerCount}
              </span>
              <span className="block font-body text-label-sm text-secondary uppercase">Players</span>
            </div>
          </div>

          <button
            onClick={onToggleFavourite}
            className={`mb-6 flex items-center gap-2 font-body text-label-md py-2 px-4 rounded-lg border transition-colors ${
              isFavourited
                ? 'border-primary bg-primary-container text-on-primary-container'
                : 'border-secondary/30 text-secondary hover:text-primary'
            }`}
          >
            <Icon name="favorite" filled={isFavourited} />
            {isFavourited ? 'Favourited' : 'Add to Favourites'}
          </button>

          <div className="mb-6 flex flex-wrap gap-3">
            <div className="flex items-center gap-2 font-body text-label-md py-2 px-4 rounded-lg border border-surface-variant/50 bg-surface-container-high text-on-surface">
              <Icon name="payments" className={court.is_free === false ? 'text-primary' : 'text-secondary'} />
              {priceLabel}
            </div>
            <div className="flex items-center gap-2 font-body text-label-md py-2 px-4 rounded-lg border border-surface-variant/50 bg-surface-container-high text-on-surface">
              <Icon name="water_full" className={court.has_water ? 'text-primary' : 'text-secondary'} />
              {court.has_water ? 'Water available' : 'No water on site'}
            </div>
          </div>

          {coords && (
            <div className="mb-8">
              <h4 className="font-body text-label-md text-secondary uppercase mb-3 tracking-widest">
                Location
              </h4>
              <div
                ref={mapContainer}
                className="w-full h-40 rounded-xl overflow-hidden border border-surface-variant/30 map-dark-filter"
              />
            </div>
          )}

          {!updating ? (
            <button
              onClick={() => {
                if (!isSignedIn) {
                  onRequireAuth();
                  return;
                }
                setUpdating(true);
              }}
              className="w-full bg-primary-container text-on-primary-container font-headline text-headline-md py-4 rounded-xl uppercase font-black hover:brightness-110 active:scale-95 transition-all shadow-lg"
            >
              I&apos;m hooping
            </button>
          ) : (
            <div className="bg-surface-container-low p-6 rounded-xl border border-surface-variant/30 flex flex-col gap-4">
              <div className="flex justify-between items-center">
                <h4 className="font-body text-label-md text-secondary uppercase tracking-widest">
                  Update Status
                </h4>
                <span className="font-headline text-headline-md text-primary">{count} players</span>
              </div>
              <input
                type="range"
                min={1}
                max={capacity}
                value={count}
                onChange={(e) => setCount(Number(e.target.value))}
                className="w-full h-2 bg-surface-variant rounded-lg appearance-none cursor-pointer accent-primary-container"
              />
              <div className="flex gap-2 mt-2">
                <button
                  onClick={handleConfirm}
                  disabled={isSubmitting}
                  className="flex-1 bg-primary-container text-on-primary-container font-body text-label-md py-3 rounded-lg uppercase font-black hover:brightness-110 active:scale-95 transition-all disabled:opacity-60"
                >
                  {isSubmitting ? '...' : 'Confirm Count'}
                </button>
                <button
                  onClick={() => setUpdating(false)}
                  disabled={isSubmitting}
                  className="px-4 border border-surface-variant text-secondary hover:bg-surface-variant rounded-lg transition-colors disabled:opacity-60"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {statusMessage && (
            <p className="font-body text-label-sm text-secondary mt-4">{statusMessage}</p>
          )}
        </div>
      </div>
    </div>
  );
}
