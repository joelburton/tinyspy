/**
 * Render an ISO timestamp as a "friendly" relative date for the
 * club-page game list and other glance-at surfaces.
 *
 *     < 60 sec ago                "Just now"
 *     1–59 min ago                "12 min ago"
 *     same calendar day (≥ 1h)    "Today 2pm" / "Today 2:14pm"
 *     yesterday                   "Yesterday 9pm"
 *     2–6 calendar days           "Wed 9pm"
 *     same year, ≥ 7 days         "Mar 12"
 *     different year              "Mar 12, 2025"
 *
 * Calendar-day-aware (not raw 24-hour windows), so a game started
 * "yesterday 11pm" viewed at "today 1am" reads as "Yesterday 11pm"
 * — not "2 hours ago," which would be technically correct but
 * conceptually disorienting (the user knows they're in a new day).
 *
 * Pure and testable: pass `now` (defaults to current time) so the
 * function has no time-of-day dependency at the call site. Returns
 * a string; no rendering side effects.
 *
 * **Doesn't tick.** Called once per render; "Just now" becomes
 * "5 min ago" only when something else triggers a re-render (a
 * realtime postgres-change, a navigation, etc.). For game cards
 * on ClubPage that's frequent enough — the friends interacting
 * with the club page see freshness updates without a dedicated
 * timer. If a future surface needs ticking, layer a 1Hz interval
 * + setState on top.
 *
 * Future-timestamp safety: clock skew between client and server
 * can produce a `then` slightly in the future. Treated as "Just
 * now" rather than a confusing "in 12 seconds."
 */
export function friendlyDate(iso: string, now: Date = new Date()): string {
  const then = new Date(iso)
  const diffMs = now.getTime() - then.getTime()

  // Future or sub-minute: "Just now" covers clock skew + the
  // "this fired seconds ago" case in one bucket.
  if (diffMs < 60 * 1000) return 'Just now'

  // 1–59 minutes ago.
  if (diffMs < 60 * 60 * 1000) {
    const mins = Math.floor(diffMs / 60_000)
    return `${mins} min ago`
  }

  // Calendar-day buckets. dayDiff = 0 ⟹ same day; 1 ⟹ yesterday; etc.
  const dayDiff = calendarDayDiff(then, now)

  if (dayDiff === 0) return `Today ${formatTime(then)}`
  if (dayDiff === 1) return `Yesterday ${formatTime(then)}`
  if (dayDiff <= 6) {
    const day = then.toLocaleDateString('en-US', { weekday: 'short' })
    return `${day} ${formatTime(then)}`
  }

  // Older than a week: date, with year only if it isn't this year.
  const sameYear = then.getFullYear() === now.getFullYear()
  return then.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
  })
}

/** Number of calendar days between `then` and `now` in local time.
 *  Same day: 0. Yesterday: 1. Returns 0 for future timestamps via
 *  the round (the caller has already handled the < 0 ms case). */
function calendarDayDiff(then: Date, now: Date): number {
  const thenMidnight = new Date(
    then.getFullYear(),
    then.getMonth(),
    then.getDate(),
  ).getTime()
  const nowMidnight = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  ).getTime()
  const dayMs = 24 * 60 * 60 * 1000
  return Math.round((nowMidnight - thenMidnight) / dayMs)
}

/** 12-hour time with lowercase am/pm. Drops the `:00` minutes on
 *  the hour-on-the-dot cases — "9pm" rather than "9:00pm". Why
 *  lowercase: matches the casual register of "min ago" /
 *  "Yesterday" elsewhere in the format ladder; "9:00 PM" would
 *  feel more form-like than glance-at. */
function formatTime(d: Date): string {
  const hours = d.getHours()
  const minutes = d.getMinutes()
  const period = hours >= 12 ? 'pm' : 'am'
  const h12 = hours % 12 || 12
  if (minutes === 0) return `${h12}${period}`
  return `${h12}:${minutes.toString().padStart(2, '0')}${period}`
}
