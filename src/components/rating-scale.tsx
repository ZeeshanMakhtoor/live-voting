"use client";

import { cn } from "@/lib/utils";
import type { Rating } from "@/types/domain";

const VALUES: Rating[] = [1, 2, 3, 4, 5];

interface RatingScaleProps {
  name: string;
  value: Rating | null;
  onChange: (value: Rating) => void;
  disabled?: boolean;
}

/**
 * Five large numeral tiles backed by real radio inputs.
 *
 * Native radios are doing the accessibility work: one tab stop for the
 * whole scale, arrow keys to move between values, and a screen reader
 * that announces "3, radio button, 3 of 5" without any ARIA of our own.
 * An earlier version paired a range slider with a second row of buttons,
 * which gave the same value two separate tab stops and two conflicting
 * announcements — one honest control beats two.
 *
 * `value` stays null until the voter actually picks something. Defaulting
 * the scale to 3 would let someone submit an opinion they never gave.
 */
export function RatingScale({ name, value, onChange, disabled }: RatingScaleProps) {
  return (
    <fieldset disabled={disabled} className="w-full border-0 p-0">
      <legend className="sr-only">Rate this performance from 1 (poor) to 5 (excellent)</legend>

      <div className="grid grid-cols-5 gap-1.5 sm:gap-2">
        {VALUES.map((n) => {
          const selected = n === value;
          return (
            <label
              key={n}
              className={cn(
                "numeral relative flex h-[4.5rem] cursor-pointer items-center justify-center border-[3px] text-4xl transition-colors sm:h-24 sm:text-5xl",
                selected
                  ? "border-accent bg-accent text-accent-foreground"
                  : "border-foreground bg-transparent text-foreground hover:bg-foreground/5",
                disabled && "cursor-not-allowed opacity-40",
                // Focus lives on the hidden input, so mirror it onto the
                // tile the voter can actually see.
                "has-[:focus-visible]:outline has-[:focus-visible]:outline-[3px] has-[:focus-visible]:outline-offset-[3px] has-[:focus-visible]:outline-accent",
              )}
            >
              <input
                type="radio"
                name={name}
                value={n}
                checked={selected}
                disabled={disabled}
                onChange={() => onChange(n)}
                // The visible numeral is aria-hidden to avoid it being read
                // twice, so the input carries the accessible name itself.
                aria-label={`${n} out of 5`}
                className="sr-only"
              />
              <span aria-hidden>{n}</span>
            </label>
          );
        })}
      </div>

      <div className="mt-2 flex justify-between">
        <span className="eyebrow">Poor</span>
        <span className="eyebrow">Excellent</span>
      </div>
    </fieldset>
  );
}
