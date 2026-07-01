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
      center: [151.2093, -33.8688], // Sydney
      zoom: 12,
    });

    // 2. Fetch initial courts
    const fetchCourts = async () => {
      const { data } = await supabase.from('courts').select('*');
      if (data) console.log("Initial courts loaded:", data);
    };

    fetchCourts();

    // 3. DAY 4: Set up Real-time subscription
    // This listens for any UPDATE event on the 'courts' table
    const channel = supabase
      .channel('realtime-courts')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'courts' },
        (payload) => {
          console.log('Change received!', payload);
          // In Day 5, we will add logic here to update pin colors!
        }
      )
      .subscribe();

    // Cleanup: remove map and channel when component unmounts
    return () => {
      map.current?.remove();
      supabase.removeChannel(channel);
    };
  }, []);

  return <div ref={mapContainer} style={{ width: '100%', height: '100vh' }} />;
}