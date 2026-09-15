"use client";

import type { LeaderboardRow } from "./dashboard";

interface LiveLeaderboardProps {
  leaderboard: LeaderboardRow[];
  eventName: string;
  finished: boolean;
}

const MEDALS = ["🥇", "🥈", "🥉"];

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
    <section className="border-4 border-foreground">
      <header className="flex items-center justify-between border-b-4 border-foreground bg-foreground px-4 py-2">
        <h2 className="text-sm font-black uppercase tracking-[0.15em] text-background">
          {finished ? "Final Results" : "Live Leaderboard"}
        </h2>
        <button
          type="button"
          disabled={leaderboard.length === 0}
          onClick={() => downloadLeaderboardCsv(leaderboard, eventName)}
          className="border border-background px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-background disabled:opacity-40"
        >
          Export CSV
        </button>
      </header>

      {finished && top3.length > 0 && (
        <div className="grid gap-3 border-b-4 border-foreground p-4 sm:grid-cols-3">
          {top3.map((row, idx) => (
            <div key={row.participant_id} className="border-2 border-accent p-4 text-center">
              <p className="text-3xl">{MEDALS[idx]}</p>
              <p className="mt-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                {idx === 0 ? "1st" : idx === 1 ? "2nd" : "3rd"}
              </p>
              <p className="mt-1 text-lg font-black uppercase">{row.name}</p>
              <p className="mt-1 text-2xl font-black tabular-nums">{formatAverage(row.average_rating)}</p>
              <p className="text-xs text-muted-foreground">{row.vote_count} votes</p>
            </div>
          ))}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] border-collapse text-sm">
          <thead>
            <tr className="border-b-2 border-foreground text-left uppercase tracking-wide text-muted-foreground">
              <th className="px-3 py-2 font-bold">Rank</th>
              <th className="px-3 py-2 font-bold">Participant</th>
              <th className="px-3 py-2 font-bold">Average</th>
              <th className="px-3 py-2 font-bold">Votes</th>
              <th className="px-3 py-2 font-bold">Total Points</th>
            </tr>
          </thead>
          <tbody>
            {leaderboard.map((row) => (
              <tr
                key={row.participant_id}
                className={
                  row.rank <= 3
                    ? "border-b border-foreground/20 bg-accent/10 font-bold"
                    : "border-b border-foreground/20"
                }
              >
                <td className="px-3 py-2 tabular-nums">
                  {row.rank <= 3 ? MEDALS[row.rank - 1] : row.rank}
                </td>
                <td className="px-3 py-2">{row.name}</td>
                <td className="px-3 py-2 tabular-nums">{formatAverage(row.average_rating)}</td>
                <td className="px-3 py-2 tabular-nums">{row.vote_count}</td>
                <td className="px-3 py-2 tabular-nums">{row.total_rating_points}</td>
              </tr>
            ))}
            {leaderboard.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">
                  No participants yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
