"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Icon from "./Icon";

// Only Feed and Map exist as real pages right now, so that's all that's here.
// Add Bookings/Profile back once those pages actually exist.
const NAV_ITEMS = [
  { href: "/", label: "Feed", icon: "dynamic_feed" },
  { href: "/map-view", label: "Map", icon: "map" },
];

export function SideNav() {
  const pathname = usePathname();

  return (
    <aside className="hidden md:flex flex-col h-full w-64 fixed left-0 top-0 bg-surface-container border-r border-surface-variant shadow-lg p-stack-md z-40 overflow-y-auto">
      <div className="mb-stack-lg">
        <h1 className="font-headline text-headline-lg italic font-black text-primary tracking-tighter">
          SWISH
        </h1>
        <p className="font-body text-label-sm text-secondary-fixed-dim uppercase tracking-widest mt-1">
          The Home Court
        </p>
      </div>

      <nav className="flex flex-col gap-2 flex-grow">
        {NAV_ITEMS.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-stack-md rounded-lg px-4 py-3 transition-all font-body text-label-md ${
                active
                  ? "bg-primary-container text-on-primary-container translate-x-1 shadow-md"
                  : "text-secondary-fixed-dim hover:bg-surface-variant"
              }`}
            >
              <Icon name={item.icon} className="text-2xl" filled={active} />
              <span className="uppercase">{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      className="fixed bottom-0 left-0 w-full z-50 flex justify-around items-center h-16 px-2 md:hidden bg-surface-container-low shadow-2xl rounded-t-xl"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {NAV_ITEMS.map((item) => {
        const active = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex flex-col items-center justify-center gap-0.5 transition-colors ${
              active ? "text-primary scale-90 font-bold" : "text-secondary-container hover:text-primary"
            }`}
          >
            <Icon name={item.icon} filled={active} />
            <span className="font-body text-[10px] uppercase">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
