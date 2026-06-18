"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Flag, LayoutDashboard, MapPin, ShieldCheck, Trophy, User, Users } from "lucide-react";
import { useStore } from "@/lib/store";
import { hasAdminRole } from "@/lib/types";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/dashboard", icon: LayoutDashboard, label: "Dashboard", adminOnly: false },
  { href: "/leagues",   icon: Trophy,          label: "Leagues",   adminOnly: false },
  { href: "/races",     icon: Flag,            label: "Races",     adminOnly: false },
  { href: "/teams",     icon: Users,           label: "Teams",     adminOnly: false },
  { href: "/zones",     icon: MapPin,          label: "Zones",     adminOnly: false },
  { href: "/profile",   icon: User,            label: "Profile",   adminOnly: false },
  { href: "/admin",     icon: ShieldCheck,     label: "Admin",     adminOnly: true  },
];

export default function NavBar() {
  const pathname = usePathname();
  const user = useStore((s) => s.currentUser);

  const links = NAV.filter((n) => {
    if (n.adminOnly) return hasAdminRole(user);
    return true;
  });

  return (
    <>
      <div aria-hidden className="dot-floor fixed bottom-[4.5rem] left-0 right-0 h-24 z-[49]" />
    <nav className="fixed bottom-0 left-0 right-0 z-50 glass-nav pointer-events-none">
      <div className="mx-auto flex max-w-lg md:max-w-3xl justify-around px-1 pt-2.5 pb-safe pointer-events-auto">
        {links.map(({ href, icon: Icon, label }) => {
          const active = pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex min-w-0 flex-col items-center gap-1 rounded-xl px-1.5 py-1 transition-all duration-200 sm:px-3",
                active ? "scale-110" : "opacity-50 hover:opacity-75"
              )}
            >
              <Icon
                size={20}
                strokeWidth={active ? 2.5 : 1.8}
                style={
                  active
                    ? {
                        color: "#ff4b35",
                        filter: "drop-shadow(0 0 7px rgba(255,75,53,0.72))",
                      }
                    : { color: "var(--muted-foreground)" }
                }
              />
              <span
                className="max-w-[4.25rem] truncate text-[8px] font-semibold uppercase sm:text-[9px]"
                style={active ? { color: "var(--foreground)" } : { color: "var(--muted-foreground)" }}
              >
                {label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
    </>
  );
}
