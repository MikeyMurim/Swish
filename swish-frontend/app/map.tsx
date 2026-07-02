'use client';

import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { supabase } from '../lib/supabase';

export default function Map() {
  const mapContainer = useRef(null);
  const map = useRef<maplibregl.Map | null>(null);

  useEffect(() => {
    // 1. Initialize MapLibre
    map.current = new maplibregl.Map({
      container: mapContainer.current!,
      style: 'https://demotiles.maplibre.org/style.json',
      center: [151.15, -33.8], // Centered on Sydney area
      zoom: 11,
    });

    // 2. Fetch courts and render pins
    const fetchAndRenderCourts = async () => {
      const { data: courts, error } = await supabase.from('courts').select('*');
      
      if (error) {
        console.error("Error fetching courts:", error);
        return;
      }

      if (courts) {
        // Defensive loop to handle location data
        courts.forEach((court) => {
          // Safely access coordinates (assuming court.location is a PostGIS GeoJSON object)
          const lng = court.location?.coordinates?.[0];
          const lat = court.location?.coordinates?.[1];

          // Only render if we have valid coordinates
          if (lng !== undefined && lat !== undefined) {
            new maplibregl.Marker()
              .setLngLat([lng, lat])
              .setPopup(new maplibregl.Popup().setHTML(`
                <h3>${court.name}</h3>
                <p>Status: ${court.status}</p>
              `))
              .addTo(map.current!);
          } else {
            console.warn(`Court "${court.name}" has invalid or missing location data:`, court.location);
          }
        });
      }
    };

    fetchAndRenderCourts();

    // 3. Real-time subscription
    const channel = supabase
      .channel('realtime-courts')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'courts' }, (payload) => {
        console.log('Update received:', payload);
        // UI refresh logic would go here
      })
      .subscribe();

    // Cleanup on unmount
    return () => {
      map.current?.remove();
      supabase.removeChannel(channel);
    };
  }, []);

  return <div ref={mapContainer} style={{ width: '100%', height: '100vh' }} />;
}