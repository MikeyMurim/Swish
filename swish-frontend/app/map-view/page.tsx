import Map from '../map';
import Link from 'next/link';

export default function MapPage() {
  return (
    <main style={{ width: '100%', height: '100vh', margin: 0, padding: 0 }}>
      {/* A simple back button to go to the feed */}
      <div style={{ position: 'absolute', top: 10, left: 10, zIndex: 100, backgroundColor: 'white', padding: '10px', borderRadius: '8px' }}>
        <Link href="/" style={{ color: 'black', textDecoration: 'none', fontWeight: 'bold' }}>
          ← Back to Feed
        </Link>
      </div>
      <Map />
    </main>
  );
}