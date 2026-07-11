"use client";

import { useMemo, useState } from "react";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import { CalendarDays, ChevronLeft, ChevronRight, MapPin } from "lucide-react";

type LessonCalendarSession = {
  id: string;
  startsAt: string;
  durationMinutes: number;
  location: string | null;
  rider: { name: string };
};

function johannesburgDateKey(iso: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Johannesburg",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

function johannesburgTime(iso: string) {
  return new Intl.DateTimeFormat("en-ZA", {
    timeZone: "Africa/Johannesburg",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

export default function AdminLessonCalendar({ sessions }: { sessions: LessonCalendarSession[] }) {
  const [visibleMonth, setVisibleMonth] = useState(startOfMonth(new Date()));
  const days = useMemo(
    () => eachDayOfInterval({
      start: startOfWeek(startOfMonth(visibleMonth), { weekStartsOn: 1 }),
      end: endOfWeek(endOfMonth(visibleMonth), { weekStartsOn: 1 }),
    }),
    [visibleMonth]
  );
  const byDate = useMemo(() => {
    const map = new Map<string, LessonCalendarSession[]>();
    for (const session of sessions) {
      const date = johannesburgDateKey(session.startsAt);
      map.set(date, [...(map.get(date) ?? []), session]);
    }
    for (const values of map.values()) {
      values.sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());
    }
    return map;
  }, [sessions]);

  return (
    <div className="glass-card overflow-hidden">
      <div className="flex items-center justify-between border-b border-foreground/10 px-4 py-3">
        <div className="flex items-center gap-2">
          <CalendarDays size={16} className="text-accent-foreground" />
          <div>
            <p className="text-sm font-black text-foreground">Lesson calendar</p>
            <p className="text-[9px] text-muted-foreground">{format(visibleMonth, "MMMM yyyy")} · SAST</p>
          </div>
        </div>
        <div className="flex gap-1">
          <button type="button" aria-label="Previous month" onClick={() => setVisibleMonth((month) => subMonths(month, 1))}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-foreground/10 text-muted-foreground">
            <ChevronLeft size={15} />
          </button>
          <button type="button" onClick={() => setVisibleMonth(startOfMonth(new Date()))}
            className="rounded-lg border border-foreground/10 px-2.5 text-[9px] font-black text-muted-foreground">Today</button>
          <button type="button" aria-label="Next month" onClick={() => setVisibleMonth((month) => addMonths(month, 1))}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-foreground/10 text-muted-foreground">
            <ChevronRight size={15} />
          </button>
        </div>
      </div>
      <div className="overflow-x-auto p-3">
        <div className="min-w-[720px]">
          <div className="grid grid-cols-7 gap-1">
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => (
              <div key={day} className="px-1 pb-1 text-[8px] font-black uppercase tracking-wider text-muted-foreground">{day}</div>
            ))}
            {days.map((day) => {
              const dateKey = format(day, "yyyy-MM-dd");
              const daySessions = byDate.get(dateKey) ?? [];
              return (
                <div key={dateKey} className={`min-h-28 rounded-xl border p-2 ${
                  isSameMonth(day, visibleMonth)
                    ? "border-foreground/10 bg-foreground/[0.025]"
                    : "border-transparent text-muted-foreground/25"
                }`}>
                  <p className="mb-1 text-[10px] font-black">{format(day, "d")}</p>
                  <div className="space-y-1">
                    {daySessions.slice(0, 3).map((session) => (
                      <div key={session.id} className="rounded-lg border border-[#ff4b35]/20 bg-[#ff4b35]/10 px-2 py-1.5">
                        <p className="truncate text-[9px] font-black text-foreground">
                          {johannesburgTime(session.startsAt)} · {session.rider.name}
                        </p>
                        <p className="mt-0.5 flex items-center gap-1 truncate text-[8px] text-muted-foreground">
                          {session.location && <MapPin size={8} />} {session.location || `${session.durationMinutes} min`}
                        </p>
                      </div>
                    ))}
                    {daySessions.length > 3 && (
                      <p className="px-1 text-[8px] font-bold text-accent-foreground">+{daySessions.length - 3} more</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
