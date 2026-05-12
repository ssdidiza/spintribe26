"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Trophy, Star, User, ShieldCheck } from "lucide-react";
import { useStore } from "@/lib/store";
import { canAccessChampionFeatures, hasAdminRole } from "@/lib/types";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/dashboard",   icon: LayoutDashboard, label: "Home",     championOnly: false, adminOnly: false },
  { href: "/leaderboard", icon: Trophy,           label: "Board",    championOnly: false, adminOnly: false },
  { href: "/champion",    icon: Star,             label: "Sessions", championOnly: true,  adminOnly: false },
  { href: "/profile",     icon: User,             label: "Profile",  championOnly: false, adminOnly: false },
  { href: "/admin",       icon: ShieldCheck,      label: "Admin",    championOnly: false, adminOnly: true  },
];

export default function NavBar() {
  const pathname = usePathname();
  const user = useStore((s) => s.currentUser);

  const links = NAV.filter((n) => {
    if (n.adminOnly) return hasAdminRole(user);
    if (n.championOnly) return canAccessChampionFeatures(user);
    return true;
  });

  return (
    <>
      {/* Dot floor — Gemini-style atmospheric effect rising from the nav */}
      <div aria-hidden className="dot-floor fixed bottom-[4.5rem] left-0 right-0 h-24 z-[49]" />
    <nav className="fixed bottom-0 left-0 right-0 z-50 glass-nav pointer-events-none">
      <div className="mx-auto flex max-w-lg md:max-w-3xl justify-around px-2 pt-2.5 pb-safe pointer-events-auto">
        {links.map(({ href, icon: Icon, label }) => {
          const active = pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex flex-col items-center gap-1 px-3 py-1 rounded-xl transition-all duration-200",
                active ? "scale-110" : "opacity-50 hover:opacity-75"
              )}
            >
              <Icon
                size={20}
                strokeWidth={active ? 2.5 : 1.8}
                style={
                  active
                    ? {
                        color: "#00e3fd",
                        filter: "drop-shadow(0 0 6px rgba(0,227,253,0.7))",
                      }
                    : { color: "#cac3d8" }
                }
              />
              <span
                className="text-[9px] font-semibold tracking-widest uppercase"
                style={active ? { color: "#cdbdff" } : { color: "#cac3d8" }}
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
