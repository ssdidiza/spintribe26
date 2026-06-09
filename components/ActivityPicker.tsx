"use client";

import { Activity } from "@/lib/types";
import { Check, Bike, MapPin, Ban } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

const TYPE_ICON: Record<string, React.ReactNode> = {
  Ride: <Bike size={14} />,
  EBikeRide: <Bike size={14} />,
  Velomobile: <Bike size={14} />,
};

const ELIGIBLE_TYPES = ["Ride", "EBikeRide", "Velomobile"];

interface ActivityPickerProps {
  activities: Activity[];
  value: Activity | null;
  onChange: (a: Activity) => void;
  /** Strava activity IDs already linked to existing champion sessions (Rule D) */
  usedActivityIds?: Set<string>;
  preferredZoneId?: string;
  preferredZoneName?: string;
}

export default function ActivityPicker({
  activities,
  value,
  onChange,
  usedActivityIds = new Set(),
  preferredZoneId,
  preferredZoneName,
}: ActivityPickerProps) {
  const currentYear = new Date().getFullYear();
  const eligible = activities
    .filter((a) => {
      const activityYear = new Date(a.date).getFullYear();
      return activityYear === currentYear && ELIGIBLE_TYPES.includes(a.type);
    })
    .sort((a, b) => {
      const aZoneMatch = preferredZoneId && a.detectedZoneId === preferredZoneId ? 1 : 0;
      const bZoneMatch = preferredZoneId && b.detectedZoneId === preferredZoneId ? 1 : 0;
      if (aZoneMatch !== bZoneMatch) return bZoneMatch - aZoneMatch;
      return new Date(b.date).getTime() - new Date(a.date).getTime();
    })
    .slice(0, 40);

  if (eligible.length === 0) {
    return (
      <div className="rounded-xl border border-foreground/10 bg-foreground/5 p-4 text-center">
        <p className="text-xs text-muted-foreground">No year-to-date rides found.</p>
        <p className="text-[10px] text-muted-foreground/70 mt-1">Import year rides or sync Strava first.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {eligible.map((a) => {
        const selected = value?.id === a.id;
        const alreadyLogged = usedActivityIds.has(a.stravaId ?? a.id);
        const zoneMatch = preferredZoneId && a.detectedZoneId === preferredZoneId;
        const detectedZone = a.detectedZoneId?.replace(/^[a-z]+-/, "").replace(/-/g, " ");
        const km = (a.distance / 1000).toFixed(1);

        return (
          <button
            key={a.id}
            onClick={() => !alreadyLogged && onChange(a)}
            disabled={alreadyLogged}
            className={cn(
              "w-full flex items-center gap-3 rounded-xl border p-3 text-left transition-all",
              alreadyLogged
                ? "border-foreground/5 bg-foreground/[0.02] cursor-not-allowed opacity-50"
                : selected
                ? "border-orange-500/50 bg-orange-500/10"
                : zoneMatch
                ? "border-[#ff4b35]/40 bg-[#ff4b35]/10 hover:border-[#ff4b35]/60"
                : "border-foreground/10 bg-foreground/5 hover:border-foreground/20"
            )}
          >
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{
                background: alreadyLogged ? "var(--fill-soft)" : selected || zoneMatch ? "#FF650020" : "var(--fill-mid)",
                color: alreadyLogged ? "var(--muted-foreground)" : selected || zoneMatch ? "#FF6500" : "var(--muted-foreground)",
              }}
            >
              {alreadyLogged ? <Ban size={14} /> : (TYPE_ICON[a.type] ?? <Bike size={14} />)}
            </div>
            <div className="flex-1 min-w-0">
              <p
                className={cn(
                  "text-sm font-semibold truncate",
                  alreadyLogged ? "text-muted-foreground/60 line-through" : selected ? "text-orange-400" : "text-foreground"
                )}
              >
                {a.name}
              </p>
              <p className="text-[10px] text-muted-foreground/70 flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                <span>{format(new Date(a.date), "MMM d")} - {km} km</span>
                {zoneMatch && (
                  <span className="text-accent-foreground inline-flex items-center gap-1">
                    <MapPin size={9} /> {preferredZoneName ?? "zone match"}
                  </span>
                )}
                {!zoneMatch && detectedZone && (
                  <span className="text-muted-foreground/70">- {detectedZone}</span>
                )}
                {alreadyLogged && (
                  <span className="text-muted-foreground/60">- already logged</span>
                )}
              </p>
            </div>
            {selected && !alreadyLogged && <Check size={14} style={{ color: "#FF6500" }} />}
          </button>
        );
      })}
    </div>
  );
}
