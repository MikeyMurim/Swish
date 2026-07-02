'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import Link from 'next/link';

export default function HomeFeed() {
  const [courts, setCourts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 1. Fetch initial courts
    const fetchCourts = async () => {
      const { data, error } = await supabase.from('courts').select('*');
      if (data) setCourts(data);
      setLoading(false);
    };
    fetchCourts();

    // 2. Real-time subscription
    const channel = supabase
      .channel('realtime-courts-feed')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'courts' }, (payload) => {
        setCourts((currentCourts) => 
          currentCourts.map((court) => 
            court.id === payload.new.id ? payload.new : court
          )
        );
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return (
    <main className="min-h-screen bg-gray-50 text-gray-900 font-sans pb-20">
      {/* Top Navigation Bar */}
      <header className="sticky top-0 z-50 bg-white border-b border-gray-200 px-4 py-4 flex justify-between items-center shadow-sm">
        <h1 className="text-2xl font-extrabold tracking-tight">Swish</h1>
        <Link 
          href="/map-view" 
          className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-sm font-semibold rounded-full hover:bg-gray-200 transition"
        >
          {/* Simple Map Icon SVG */}
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" /></svg>
          Map
        </Link>
      </header>

      {/* Feed Container */}
      <div className="max-w-xl mx-auto mt-6 px-4 space-y-6">
        {loading ? (
          <div className="text-center text-gray-500 py-10 animate-pulse">Loading courts near you...</div>
        ) : courts.length === 0 ? (
          <div className="text-center text-gray-500 py-10">No courts found.</div>
        ) : (
          courts.map((court) => (
            /* Court Feed Card */
            <article key={court.id} className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="p-5">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h2 className="text-lg font-bold">{court.name}</h2>
                    <p className="text-sm text-gray-500">Sydney, NSW</p>
                  </div>
                  {/* Status Badge */}
                  <span className={`px-3 py-1 text-xs font-bold uppercase tracking-wider rounded-full ${
                    court.status === 'Full' 
                      ? 'bg-red-100 text-red-700' 
                      : 'bg-green-100 text-green-700'
                  }`}>
                    {court.status || 'Empty'}
                  </span>
                </div>

                {/* Action Bar */}
                <div className="mt-6 flex gap-3">
                  <button className="flex-1 bg-black text-white py-3 rounded-xl font-semibold text-sm hover:bg-gray-800 transition active:scale-95">
                    Check In
                  </button>
                  <button className="px-4 py-3 bg-gray-100 text-gray-700 rounded-xl font-semibold text-sm hover:bg-gray-200 transition active:scale-95">
                    Details
                  </button>
                </div>
              </div>
            </article>
          ))
        )}
      </div>
    </main>
  );
}