import { Suspense } from "react";
import Map from "../map";
import { SideNav, BottomNav } from "../NavShell";

export default function MapPage() {
  return (
    // h-screen locks the view height to the browser window, preventing layout collapse
    <div className="flex h-screen w-screen overflow-hidden bg-background text-on-background">
      <SideNav />
      {/* h-full here fills exactly the h-screen container */}
      <main className="flex-1 md:ml-64 relative h-full w-full flex flex-col">
        <Suspense fallback={<div className="p-6 text-on-surface">Loading Map Layout...</div>}>
          <Map />
        </Suspense>
      </main>
      <BottomNav />
    </div>
  );
}