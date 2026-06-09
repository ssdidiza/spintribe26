"use client";
import { Sun, Moon, Monitor } from "lucide-react";
import { useTheme, type ThemeChoice } from "@/lib/theme";
import { cn } from "@/lib/utils";

const OPTIONS: { value: ThemeChoice; label: string; Icon: typeof Sun }[] = [
  { value: "light", label: "Light", Icon: Sun },
  { value: "system", label: "Auto", Icon: Monitor },
  { value: "dark", label: "Dark", Icon: Moon },
];

/** Segmented Light / Auto / Dark control. "Auto" follows the OS preference. */
export default function ThemeToggle({ className }: { className?: string }) {
  const choice = useTheme((s) => s.choice);
  const ready = useTheme((s) => s.ready);
  const setChoice = useTheme((s) => s.setChoice);

  return (
    <div
      className={cn(
        "glass inline-flex items-center gap-1 rounded-full p-1",
        className
      )}
      role="radiogroup"
      aria-label="Color theme"
    >
      {OPTIONS.map(({ value, label, Icon }) => {
        // Until the store has synced from localStorage, highlight nothing to
        // avoid a hydration mismatch / flash of the wrong selection.
        const active = ready && choice === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={label}
            onClick={() => setChoice(value)}
            className={cn(
              "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-all",
              active
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Icon size={14} strokeWidth={2.2} />
            {label}
          </button>
        );
      })}
    </div>
  );
}
