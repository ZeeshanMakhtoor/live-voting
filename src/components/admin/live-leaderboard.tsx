"use client";

import { cn } from "@/lib/utils";
import type { LeaderboardRow } from "./dashboard";

interface LiveLeaderboardProps {
  leaderboard: LeaderboardRow[];
  eventName: string;
  finished: boolean;
}

const PLACE = ["1st", "2nd", "3rd"];

function formatAverage(value: number | null): string {
  return value != null ? Number(value).toFixed(2) : "—";
}

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function downloadLeaderboardCsv(rows: LeaderboardRow[], eventName: string) {
  const header = [
    "Rank",
    "Participant Name",
    "Batch",
    "Year",
    "Average Rating",
    "Vote Count",
    "Total Points",
    "Status",
  ];
  const lines = [header.join(",")];
  for (const r of rows) {
    lines.push(
      [
        String(r.rank),
        csvEscape(r.name),
        csvEscape(r.batch ?? ""),
        csvEscape(r.year ?? ""),
        r.average_rating != null ? Number(r.average_rating).toFixed(2) : "",
        String(r.vote_count),
        String(r.total_rating_points),
        r.status,
      ]
        .map(csvEscape)
        .join(","),
    );
  }
  const csv = lines.join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${eventName.replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "event"}-results.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function LiveLeaderboard({ leaderboard, eventName, finished }: LiveLeaderboardProps) {
  const top3 = leaderboard.slice(0, 3);

  return (
    <section className="h-fit border-[3px] border-foreground">
      <header className="flex items-center justify-between gap-3 border-b-[3px] border-foreground bg-foreground px-4 py-2.5">
        <h2 className="font-display text-base font-black uppercase tracking-[0.1em] text-background">
          {finished ? "Final results" : "Live leaderboard"}
        </h2>
        <button
          type="button"
          disabled={leaderboard.length === 0}
          onClick={() => downloadLeaderboardCsv(leaderboard, eventName)}
          className="border-2 border-background px-2.5 py-1 text-[0.65rem] font-bold uppercase tracking-[0.12em] text-background hover:bg-background hover:text-foreground disabled:opacity-40"
        >
          Export CSV
        </button>
      </header>

      {finished && top3.length > 0 && (
        <div className="grid gap-3 border-b-[3px] border-foreground p-4 sm:grid-cols-3">
          {top3.map((row, idx) => (
            <div key={row.participant_id} className="border-2 border-accent p-4">
              <div className="flex items-baseline gap-2">
                <span className="numeral text-5xl leading-none text-accent">{idx + 1}</span>
                <span className="eyebrow">{PLACE[idx]}</span>
              </div>
              <p className="font-display mt-3 text-lg font-black uppercase leading-tight">
                {row.name}
              </p>
              <p className="numeral mt-2 text-2xl">{formatAverage(row.average_rating)}</p>
              <p className="text-xs text-muted-foreground">
                {row.vote_count} {row.vote_count === 1 ? "rating" : "ratings"}
              </p>
            </div>
          ))}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] border-collapse text-sm">
          <thead>
            <tr className="border-b-2 border-foreground text-left">
              <th scope="col" className="px-3 py-2 text-[0.65rem] font-bold uppercase tracking-[0.15em] text-muted-foreground">
                Rank
              </th>
              <th scope="col" className="px-3 py-2 text-[0.65rem] font-bold uppercase tracking-[0.15em] text-muted-foreground">
                Participant
              </th>
              <th scope="col" className="px-3 py-2 text-right text-[0.65rem] font-bold uppercase tracking-[0.15em] text-muted-foreground">
                Average
              </th>
              <th scope="col" className="px-3 py-2 text-right text-[0.65rem] font-bold uppercase tracking-[0.15em] text-muted-foreground">
                Votes
              </th>
              <th scope="col" className="px-3 py-2 text-right text-[0.65rem] font-bold uppercase tracking-[0.15em] text-muted-foreground">
                Points
              </th>
            </tr>
          </thead>
          <tbody>
            {leaderboard.map((row) => {
              // A participant nobody has rated yet is not "in the top 3" in
              // any meaningful sense — early in the event most of the field
              // sits at zero, and highlighting them reads as a live ranking
              // that hasn't been earned.
              const isPodium = row.rank <= 3 && row.vote_count > 0;
              return (
              <tr
                key={row.participant_id}
                className={cn("border-b border-foreground/15", isPodium && "bg-accent/[0.07]")}
              >
                <td className="px-3 py-2">
                  <span
                    className={cn(
                      "numeral text-xl",
                      isPodium ? "text-accent" : "text-muted-foreground",
                    )}
                  >
                    {row.rank}
                  </span>
                </td>
                <td className={cn("px-3 py-2", isPodium && "font-bold")}>{row.name}</td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {formatAverage(row.average_rating)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{row.vote_count}</td>
                <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                  {row.total_rating_points}
                </td>
              </tr>
              );
            })}
            {leaderboard.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-10 text-center">
                  <p className="eyebrow">Nothing to rank yet</p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Rankings appear as soon as the first rating lands.
                  </p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
