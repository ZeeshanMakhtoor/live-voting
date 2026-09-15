"use client";

import { cn } from "@/lib/utils";
import type { Rating } from "@/types/domain";

const VALUES: Rating[] = [1, 2, 3, 4, 5];

interface RatingSliderProps {
  value: Rating;
  onChange: (value: Rating) => void;
  disabled?: boolean;
}

/**
 * A native range input (drag + keyboard, fully accessible for free) laid
 * under a row of large, independently tappable number buttons for exact
 * one-tap selection on mobile. Both control the same value.
 */
export function RatingSlider({ value, onChange, disabled }: RatingSliderProps) {
  return (
    <div className="w-full">
      <input
        type="range"
        min={1}
        max={5}
        step={1}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value) as Rating)}
        aria-label="Rating"
        aria-valuetext={`${value} out of 5`}
        className={cn(
          "lcv-range w-full",
          disabled && "opacity-40",
        )}
        style={
          {
            "--fill": `${((value - 1) / 4) * 100}%`,
          } as React.CSSProperties
        }
      />

      <div className="mt-4 grid grid-cols-5 gap-2" role="group" aria-label="Select a rating from 1 to 5">
        {VALUES.map((n) => {
          const selected = n === value;
          return (
            <button
              key={n}
              type="button"
              disabled={disabled}
              aria-pressed={selected}
              onClick={() => onChange(n)}
              className={cn(
                "flex h-16 items-center justify-center border-2 text-2xl font-bold tabular-nums transition-colors sm:h-20 sm:text-3xl",
                selected
                  ? "border-accent bg-accent text-accent-foreground"
                  : "border-foreground bg-transparent text-foreground hover:bg-foreground/5",
                disabled && "pointer-events-none opacity-40",
              )}
            >
              {n}
            </button>
          );
        })}
      </div>

      <p className="mt-3 text-center text-sm font-medium uppercase tracking-wide text-muted-foreground">
        Selected rating: <span className="text-foreground">{value}</span>
      </p>
    </div>
  );
}
