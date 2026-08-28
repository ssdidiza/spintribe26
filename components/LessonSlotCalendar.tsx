"use client";

import { useMemo, useState } from "react";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  parseISO,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import { CalendarDays, ChevronLeft, ChevronRight, Clock3, Loader2 } from "lucide-react";

export type LessonAvailabilityDay = {
  date: string;
  slots: string[];
};

type Props = {
  availability: LessonAvailabilityDay[];
  selectedSlot: string;
  onSelect: (slot: string) => void;
  loading?: boolean;
};

function johannesburgTime(iso: string) {
  return new Intl.DateTimeFormat("en-ZA", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Africa/Johannesburg",
  }).format(new Date(iso));
}

export default function LessonSlotCalendar({ availability, selectedSlot, onSelect, loading = false }: Props) {
  const firstAvailable = availability.find((day) => day.slots.length > 0)?.date ?? availability[0]?.date;
  const lastAvailable = [...availability].reverse().find((day) => day.slots.length > 0)?.date ?? availability.at(-1)?.date;
  const selectedDateKey = selectedSlot
    ? new Intl.DateTimeFormat("en-CA", {
        timeZone: "Africa/Johannesburg",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date(selectedSlot))
    : "";
  const [chosenDate, setChosenDate] = useState("");
  const [requestedMonth, setRequestedMonth] = useState(() => startOfMonth(new Date()));

  const daysByDate = useMemo(
    () => new Map(availability.map((day) => [day.date, day])),
    [availability]
  );
  const firstMonth = firstAvailable ? startOfMonth(parseISO(firstAvailable)) : requestedMonth;
  const lastMonth = lastAvailable ? startOfMonth(parseISO(lastAvailable)) : requestedMonth;
  const visibleMonth = requestedMonth.getTime() < firstMonth.getTime() || requestedMonth.getTime() > lastMonth.getTime()
    ? firstMonth
    : requestedMonth;
  const activeDate = selectedDateKey || (chosenDate && daysByDate.get(chosenDate)?.slots.length ? chosenDate : firstAvailable || "");
  const monthDays = useMemo(
    () => eachDayOfInterval({
      start: startOfWeek(startOfMonth(visibleMonth), { weekStartsOn: 1 }),
      end: endOfWeek(endOfMonth(visibleMonth), { weekStartsOn: 1 }),
    }),
    [visibleMonth]
  );
  const activeSlots = daysByDate.get(activeDate)?.slots ?? [];
  const canGoBack = visibleMonth.getTime() > firstMonth.getTime();
  const canGoForward = visibleMonth.getTime() < lastMonth.getTime();

  if (loading) {
    return (
      <div className="glass-card flex min-h-64 items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2 size={16} className="animate-spin" /> Finding available times…
      </div>
    );
  }

  return (
    <div className="glass-card overflow-hidden">
      <div className="flex items-center justify-between border-b border-foreground/10 px-4 py-3">
        <div className="flex items-center gap-2">
          <CalendarDays size={16} className="text-accent-foreground" />
          <div>
            <p className="text-sm font-black text-foreground">{format(visibleMonth, "MMMM yyyy")}</p>
            <p className="text-[9px] text-muted-foreground">Available times shown in SAST</p>
          </div>
        </div>
        <div className="flex gap-1">
          <button type="button" aria-label="Previous month" disabled={!canGoBack}
            onClick={() => setRequestedMonth((month) => subMonths(month, 1))}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-foreground/10 text-muted-foreground disabled:opacity-30">
            <ChevronLeft size={15} />
          </button>
          <button type="button" aria-label="Next month" disabled={!canGoForward}
            onClick={() => setRequestedMonth((month) => addMonths(month, 1))}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-foreground/10 text-muted-foreground disabled:opacity-30">
            <ChevronRight size={15} />
          </button>
        </div>
      </div>

      <div className="p-4">
        <div className="grid grid-cols-7 gap-1 text-center">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => (
            <span key={day} className="pb-1 text-[8px] font-black uppercase tracking-wider text-muted-foreground">{day}</span>
          ))}
          {monthDays.map((day) => {
            const dateKey = format(day, "yyyy-MM-dd");
            const slotCount = daysByDate.get(dateKey)?.slots.length ?? 0;
            const inMonth = isSameMonth(day, visibleMonth);
            const selected = dateKey === activeDate;

            if (!slotCount || !inMonth) {
              return <span key={dateKey} aria-hidden="true" className="h-10 sm:h-11" />;
            }

            return (
              <button
                type="button"
                key={dateKey}
                onClick={() => {
                  setChosenDate(dateKey);
                  if (dateKey !== selectedDateKey) onSelect("");
                }}
                aria-label={`${format(day, "d MMMM")}, ${slotCount} available times`}
                className={`relative flex h-10 items-center justify-center rounded-xl text-xs font-bold transition-colors sm:h-11 ${
                  selected
                    ? "bg-[#ff4b35] text-white"
                    : "bg-foreground/[0.05] text-foreground hover:bg-[#ff4b35]/15"
                }`}
              >
                {format(day, "d")}
                <span className={`absolute bottom-1 h-1 w-1 rounded-full ${selected ? "bg-white" : "bg-[#ff4b35]"}`} />
              </button>
            );
          })}
        </div>

        <div className="mt-4 border-t border-foreground/10 pt-4">
          <div className="mb-2 flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.12em] text-muted-foreground">
            <Clock3 size={12} /> {activeDate ? format(parseISO(activeDate), "EEEE, d MMMM") : "Choose a date"}
          </div>
          {activeSlots.length ? (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {activeSlots.map((slot) => (
                <button
                  type="button"
                  key={slot}
                  onClick={() => onSelect(slot)}
                  className={`rounded-xl border px-3 py-2.5 text-xs font-black transition-colors ${
                    selectedSlot === slot
                      ? "border-[#ff4b35] bg-[#ff4b35] text-white"
                      : "border-foreground/10 bg-card text-foreground hover:border-[#ff4b35]/50"
                  }`}
                >
                  {johannesburgTime(slot)}
                </button>
              ))}
            </div>
          ) : (
            <p className="rounded-xl bg-foreground/[0.04] px-3 py-4 text-center text-xs text-muted-foreground">
              No times available yet.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
