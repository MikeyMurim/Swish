'use client';

import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { supabase } from '../lib/supabase';

export default function Map() {
  const mapContainer = useRef(null);

  useEffect(() => {
    // 1. Initialize MapLibre
    const map = new maplibregl.Map({
      container: mapContainer.current!,
      style: 'https://demotiles.maplibre.org/style.json', // Basic style for now
      center: [151.2093, -33.8688], // Coordinates for Sydney
      zoom: 12,
    });

    // 2. Fetch courts from Supabase (placeholder for now)
    const fetchCourts = async () => {
      const { data, error } = await supabase.from('courts').select('*');
      if (data) {
        console.log("Courts loaded:", data);
        // We will add logic to plot these as markers next!
      }
    };

    fetchCourts();

    return () => map.remove(); // Clean up on unmount
  }, []);

  return <div ref={mapContainer} style={{ width: '100%', height: '100vh' }} />;
}