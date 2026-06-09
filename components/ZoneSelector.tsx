"use client";
import { useState, useMemo, useEffect } from "react";
import { useStore } from "@/lib/store";
import { Zone, ZoneType } from "@/lib/types";
import { findSimilarZones } from "@/lib/fuzzy";
import { MapPin, Dumbbell, Plus, AlertTriangle, ChevronDown, Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface ZoneSelectorProps {
  region: string;
  value: Zone | null;
  onChange: (zone: Zone) => void;
}

export default function ZoneSelector({ region, value, onChange }: ZoneSelectorProps) {
  const { zones, addZone, currentUser } = useStore();
  const [mode, setMode] = useState<"pick" | "create">("pick");
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<ZoneType>("geographic");
  const [newDesc, setNewDesc] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [debouncedName, setDebouncedName] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedName(newName), 300);
    return () => clearTimeout(timer);
  }, [newName]);

  // Zones for this region + National
  const regionalZones = useMemo(
    () =>
      zones
        .filter((z) => z.region === region || z.region === "National")
        .sort((a, b) => b.usageCount - a.usageCount),
    [zones, region]
  );

  const displayed = showAll ? regionalZones : regionalZones.slice(0, 4);

  // Fuzzy check when typing new zone name — debounced to avoid O(m*n) work on every keystroke
  const similarZones = useMemo(() => {
    if (debouncedName.length < 3) return [];
    const namesInRegion = zones
      .filter((z) => z.region === region || z.region === "National")
      .map((z) => z.name);
    return findSimilarZones(debouncedName, namesInRegion);
  }, [debouncedName, zones, region]);

  const canCreate = newName.trim().length >= 3 && similarZones.length === 0;

  function handleCreate() {
    if (!canCreate || !currentUser) return;
    const created = addZone({
      name: newName.trim(),
      region,
      type: newType,
      description: newDesc.trim(),
      createdBy: currentUser.id,
      createdByName: currentUser.name,
    });
    onChange(created);
    setMode("pick");
    setNewName("");
    setNewDesc("");
  }

  return (
    <div className="space-y-3">
      {/* Mode toggle */}
      <div className="flex rounded-xl overflow-hidden border border-foreground/10">
        <button
          onClick={() => setMode("pick")}
          className={cn(
            "flex-1 py-2 text-xs font-semibold transition-all",
            mode === "pick" ? "bg-foreground/10 text-foreground" : "text-muted-foreground"
          )}
        >
          Select Zone
        </button>
        <button
          onClick={() => setMode("create")}
          className={cn(
            "flex-1 py-2 text-xs font-semibold transition-all flex items-center justify-center gap-1",
            mode === "create" ? "bg-foreground/10 text-foreground" : "text-muted-foreground"
          )}
        >
          <Plus size={11} /> Create New
        </button>
      </div>

      {mode === "pick" && (
        <div className="space-y-2">
          {displayed.map((zone) => (
            <ZoneCard
              key={zone.id}
              zone={zone}
              selected={value?.id === zone.id}
              onSelect={() => onChange(zone)}
            />
          ))}
          {regionalZones.length > 4 && (
            <button
              onClick={() => setShowAll(!showAll)}
              className="w-full text-xs text-muted-foreground flex items-center justify-center gap-1 py-1 hover:text-foreground transition-colors"
            >
              {showAll ? "Show less" : `${regionalZones.length - 4} more zones`}
              <ChevronDown size={12} className={cn("transition-transform", showAll && "rotate-180")} />
            </button>
          )}
          {regionalZones.length === 0 && (
            <p className="text-center text-xs text-muted-foreground py-4">
              No zones in {region} yet — create the first one!
            </p>
          )}
        </div>
      )}

      {mode === "create" && (
        <div className="space-y-3">
          {/* Zone name */}
          <div>
            <label className="text-[10px] font-semibold tracking-widest uppercase text-muted-foreground block mb-1.5">
              Zone Name
            </label>
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. Cradle Morning Loop"
              className="w-full rounded-xl border border-foreground/10 bg-foreground/5 px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/70 focus:outline-none focus:border-orange-500/50 transition-colors"
            />
          </div>

          {/* Fuzzy match warning */}
          {similarZones.length > 0 && (
            <div className="rounded-xl border border-yellow-500/30 bg-yellow-500/10 p-3">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle size={13} className="text-yellow-400 flex-shrink-0" />
                <p className="text-xs font-semibold text-yellow-400">Similar zones already exist</p>
              </div>
              <p className="text-xs text-muted-foreground mb-2">Consider using one of these instead:</p>
              <div className="space-y-1">
                {similarZones.map((m) => {
                  const match = zones.find((z) => z.name === m.name);
                  if (!match) return null;
                  return (
                    <button
                      key={m.name}
                      onClick={() => { onChange(match); setMode("pick"); }}
                      className="w-full flex items-center justify-between rounded-lg border border-foreground/10 bg-foreground/5 px-3 py-2 text-left hover:border-orange-500/30 transition-colors"
                    >
                      <div>
                        <p className="text-xs font-semibold text-foreground">{m.name}</p>
                        <p className="text-[10px] text-muted-foreground">{match.usageCount} uses</p>
                      </div>
                      <span className="text-[10px] text-yellow-400 font-semibold">
                        {Math.round(m.score * 100)}% match
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Zone type */}
          <div>
            <label className="text-[10px] font-semibold tracking-widest uppercase text-muted-foreground block mb-1.5">
              Zone Type
            </label>
            <div className="grid grid-cols-2 gap-2">
              {(["geographic", "training"] as ZoneType[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setNewType(t)}
                  className={cn(
                    "flex items-center gap-2 rounded-xl border p-3 transition-all",
                    newType === t ? "border-orange-500/50 bg-orange-500/10" : "border-foreground/10 bg-foreground/5"
                  )}
                >
                  {t === "geographic" ? (
                    <MapPin size={14} style={{ color: newType === t ? "#FF6500" : "var(--muted-foreground)" }} />
                  ) : (
                    <Dumbbell size={14} style={{ color: newType === t ? "#FF6500" : "var(--muted-foreground)" }} />
                  )}
                  <span className={cn("text-xs font-semibold capitalize", newType === t ? "text-orange-400" : "text-muted-foreground")}>
                    {t}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="text-[10px] font-semibold tracking-widest uppercase text-muted-foreground block mb-1.5">
              Description (optional)
            </label>
            <input
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              placeholder="Describe the route or session..."
              className="w-full rounded-xl border border-foreground/10 bg-foreground/5 px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/70 focus:outline-none focus:border-orange-500/50 transition-colors"
            />
          </div>

          <button
            onClick={handleCreate}
            disabled={!canCreate}
            className={cn(
              "w-full rounded-xl py-3 text-sm font-black tracking-wide transition-all flex items-center justify-center gap-2",
              canCreate
                ? "text-white hover:opacity-90 active:scale-[0.98]"
                : "text-muted-foreground/60 cursor-not-allowed"
            )}
            style={{ background: canCreate ? "#FF6500" : "var(--fill-mid)" }}
          >
            <Plus size={14} /> CREATE ZONE
          </button>
        </div>
      )}

      {/* Selected zone preview */}
      {value && (
        <div className="rounded-xl border border-orange-500/30 bg-orange-500/10 p-3 flex items-center gap-2">
          <Check size={14} style={{ color: "#FF6500" }} />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold text-orange-400 truncate">{value.name}</p>
            <p className="text-[10px] text-muted-foreground">{value.region} · {value.usageCount} sessions</p>
          </div>
        </div>
      )}
    </div>
  );
}

function ZoneCard({
  zone,
  selected,
  onSelect,
}: {
  zone: Zone;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      className={cn(
        "w-full flex items-center gap-3 rounded-xl border p-3 text-left transition-all",
        selected ? "border-orange-500/50 bg-orange-500/10" : "border-foreground/10 bg-foreground/5 hover:border-foreground/20"
      )}
    >
      <div
        className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
        style={{ background: selected ? "#FF650020" : "var(--fill-mid)" }}
      >
        {zone.type === "geographic" ? (
          <MapPin size={14} style={{ color: selected ? "#FF6500" : "var(--muted-foreground)" }} />
        ) : (
          <Dumbbell size={14} style={{ color: selected ? "#FF6500" : "var(--muted-foreground)" }} />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className={cn("text-sm font-semibold truncate", selected ? "text-orange-400" : "text-foreground")}>{zone.name}</p>
        <p className="text-[10px] text-muted-foreground truncate">{zone.region} · {zone.usageCount} sessions</p>
      </div>
      {selected && <Check size={14} style={{ color: "#FF6500" }} />}
    </button>
  );
}
