# Live Event Operations Guide

For whoever is running the event from the admin laptop. Keep this open.

**The one loop you'll repeat all night:**

> Start performer → **Open voting** → watch the count → **Close voting** → next performer

The dashboard always shows one big red button with the next thing to press. If you're
unsure what to do, press that.

---

## Before the event

**The day before**

1. Sign in at `admin.yourdomain.com`.
2. Create the event and add every participant — name is required, batch and year are
   optional. They appear in the audience view under the performer's name.
3. **Verify the running order.** Use the ↑ / ↓ buttons in *Running order*. Getting this
   right now saves you fumbling on stage later.
4. **Do a real test.** Open `yourdomain.com` on your own phone, start performer 1, open
   voting, cast a rating, close voting. Confirm the count moved.
5. **Undo the test.** Ratings cannot be deleted, so test on a *throwaway* event, then
   create the real one fresh. Never test on the real event.

**One hour before**

- Laptop charged and plugged in. Phone hotspot ready as a WiFi backup.
- Sign in to the admin app and leave it open. Confirm the header says **Live**, not
  *Reconnecting*.
- Put `yourdomain.com` on a slide or a QR code the room can see.
- Confirm the audience site shows **"Voting hasn't started yet."** — that's correct
  before you start performer 1.

## During the event

For each performer:

| # | Action | What the audience sees |
| --- | --- | --- |
| 1 | Press **Start next performer** | Their name appears, with "Voting opens shortly" |
| 2 | They perform | unchanged |
| 3 | Press **Open voting** when they finish | The 1–5 scale appears |
| 4 | Watch **Ratings this performer** climb | they rate, then "Rating submitted" |
| 5 | Press **Close voting** when it plateaus | "Voting has closed" |
| 6 | Back to step 1 | |

**How long to leave voting open.** Until the count stops climbing — usually 30–60
seconds. It never reaches 100% of the room; people arrive late and phones die. Close
when it flattens, not when it hits a number.

**Closing voting is final for that performer.** It cannot be reopened. That's what
stops late votes trickling in during the next performance. Don't close early.

**Pause voting** is for interruptions — a technical problem, an announcement. It
suspends rating without ending it. Resume when you're ready.

## Absent participant

Their name is called and nobody comes up:

- If they're **currently on stage** in the app: press **Skip current**.
- If you know in advance: find them in *Running order* and press **Skip**.

Skipped performers are removed from the rankings and receive no ratings. You can skip
someone who is upcoming without disturbing whoever is performing.

**Skip, don't Remove.** *Remove* is for someone added by mistake, and it refuses to
work once they have ratings — deliberately, because removing them would discard real
votes.

## Out-of-order changes

- **Wrong performer started?** Press **← Previous** to step back, or press **Start**
  next to the right person in *Running order*.
- **Someone turns up late?** Use the ↑ / ↓ buttons to move them up the order, then
  **Start** them when ready.
- **Someone needs adding mid-event?** Add them at the bottom of *Running order*, then
  move them into position.

## End of the event

1. Close voting for the final performer.
2. Press **Finish event** in the red *End of event* box at the bottom. Confirm the
   prompt. **This is irreversible** — voting ends for everyone.
3. The audience screen changes to **Event complete** with the top 3.
4. The dashboard switches to **Final results**.
5. Press **Export CSV** and save the file before closing the laptop. It contains rank,
   name, batch, year, average, vote count and total points — no voter identities.
6. Announce the winners from the dashboard, not from memory.

## Starting another event

After you finish an event, the dashboard stays on its final results — they don't
disappear. To run another one, press **Start a new event** in the *End of event*
box. The previous event keeps its results; you can't get back to them from the
dashboard once a newer event exists, but they remain in the database and in any
CSV you exported.

**Clearing out rehearsal events.** Open the event you want gone, then use
**Delete this event** in the *End of event* box. It asks you to type the event
name — a single tap can't do it — and then removes the event with every
participant and every rating on it. This cannot be undone.

A **live event has no delete control at all**, and the database refuses the
request even if something else asks for it. Finish the event first if you
genuinely mean to remove it. In practice: delete rehearsals *before* the real
event starts, never during.

## If something goes wrong

| What you see | What to do |
| --- | --- |
| **Reconnecting** in the header | It's recovering by itself. Your last action either applied or didn't — check the dashboard state before repeating it. |
| A red error banner | The action **did not** apply. Read which one, then retry it. |
| Audience says the screen is stuck | Ask them to pull-to-refresh. Their vote is safe — ratings are recorded server-side the moment they submit. |
| Audience says "already rated" but they didn't | Someone else used that phone, or they voted and forgot. One rating per device per performer; this is working as intended. |
| Count is stuck at 0 with voting open | Check the audience site yourself on a phone. If it shows the right performer, people simply haven't voted yet. |
| Dashboard won't load | Reload the page. If it still fails, sign in again. The event state lives in the database, not in the browser — nothing is lost. |
| Venue WiFi collapses | Switch the laptop to your phone hotspot. The audience needs their own connections; nothing you can do from the dashboard. |
| You pressed Finish by mistake | It cannot be undone. Results are already final and correct — announce them. Don't create a second event to "redo" it. |

**Nothing you press can corrupt the ratings.** Every rating is written once, tied to the
performer who was live at that moment, and nobody — not even you — can edit or delete
one afterwards. If in doubt, the numbers on the dashboard are the truth.
