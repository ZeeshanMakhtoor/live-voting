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
 * Native radios do the accessibility work: one tab stop for the whole
 * scale, arrow keys to move between values, and a screen reader that
 * announces "3 out of 5, radio button, 3 of 5" without any ARIA of our
 * own. An earlier version paired a range slider with a second row of
 * buttons, which gave one value two tab stops and two conflicting
 * announcements — one honest control beats two.
 *
 * The visible tile is a sibling of the hidden input rather than its
 * parent, so focus styling rides on `peer-focus-visible` (a plain sibling
 * combinator, supported everywhere) instead of `:has()`, which Firefox
 * only shipped in late 2023. On a browser without it the focus ring would
 * simply vanish, and the input itself is visually hidden — so a keyboard
 * voter would have had nothing at all to look at.
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
            <label key={n} className={cn("block", disabled && "cursor-not-allowed")}>
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
                className="peer sr-only"
              />
              <span
                aria-hidden
                className={cn(
                  "numeral flex h-[4.5rem] cursor-pointer items-center justify-center border-[3px] text-4xl transition-colors sm:h-24 sm:text-5xl",
                  "peer-focus-visible:outline peer-focus-visible:outline-[3px] peer-focus-visible:outline-offset-[3px] peer-focus-visible:outline-accent",
                  selected
                    ? "border-accent bg-accent text-accent-foreground"
                    : "border-foreground bg-transparent text-foreground hover:bg-foreground/5",
                  disabled && "cursor-not-allowed opacity-40",
                )}
              >
                {n}
              </span>
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
