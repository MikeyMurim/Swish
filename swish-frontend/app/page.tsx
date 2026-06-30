import Map from './map';

export default function Home() {
  return (
    <main style={{ width: '100%', height: '100vh', margin: 0, padding: 0 }}>
      {/* The Map component handles its own client-side logic via the 'use client' directive. */}
      <Map />
    </main>
  );
}