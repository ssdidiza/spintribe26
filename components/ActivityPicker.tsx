"use client";
import { Activity } from "@/lib/types";
import { Check, Bike, Zap, Activity as ActivityIcon, Ban } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

const TYPE_ICON: Record<string, React.ReactNode> = {
  Ride: <Bike size={14} />,
  VirtualRide: <Zap size={14} />,
  EBikeRide: <Zap size={14} />,
  Run: <ActivityIcon size={14} />,
};

const ELIGIBLE_TYPES = ["Ride", "VirtualRide", "EBikeRide", "Run"];

interface ActivityPickerProps {
  activities: Activity[];
  value: Activity | null;
  onChange: (a: Activity) => void;
  /** Strava activity IDs already linked to existing champion sessions (Rule D) */
  usedActivityIds?: Set<string>;
}

export default function ActivityPicker({
  activities,
  value,
  onChange,
  usedActivityIds = new Set(),
}: ActivityPickerProps) {
  const eligible = activities
    .filter((a) => ELIGIBLE_TYPES.includes(a.type))
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 10);

  if (eligible.length === 0) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-center">
        <p className="text-xs text-white/40">No eligible activities found.</p>
        <p className="text-[10px] text-white/30 mt-1">Sync Strava on the dashboard first.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {eligible.map((a) => {
        const selected = value?.id === a.id;
        const alreadyLogged = usedActivityIds.has(a.stravaId ?? a.id);
        const km = (a.distance / 1000).toFixed(1);

        return (
          <button
            key={a.id}
            onClick={() => !alreadyLogged && onChange(a)}
            disabled={alreadyLogged}
            className={cn(
              "w-full flex items-center gap-3 rounded-xl border p-3 text-left transition-all",
              alreadyLogged
                ? "border-white/5 bg-white/[0.02] cursor-not-allowed opacity-50"
                : selected
                ? "border-orange-500/50 bg-orange-500/10"
                : "border-white/10 bg-white/5 hover:border-white/20"
            )}
          >
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{
                background: alreadyLogged ? "#ffffff05" : selected ? "#FF650020" : "#ffffff10",
                color: alreadyLogged ? "#ffffff20" : selected ? "#FF6500" : "#ffffff40",
              }}
            >
              {alreadyLogged ? <Ban size={14} /> : (TYPE_ICON[a.type] ?? <Bike size={14} />)}
            </div>
            <div className="flex-1 min-w-0">
              <p
                className={cn(
                  "text-sm font-semibold truncate",
                  alreadyLogged ? "text-white/25 line-through" : selected ? "text-orange-400" : "text-white"
                )}
              >
                {a.name}
              </p>
              <p className="text-[10px] text-white/30">
                {format(new Date(a.date), "MMM d")} · {km} km
                {alreadyLogged && (
                  <span className="ml-1.5 text-white/20">· already logged</span>
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
