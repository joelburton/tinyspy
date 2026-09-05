// cs-blessed-utils

/**
 * `HH:MM:SS.mmm` wall-clock stamp — **what the three console diagnostic
 * channels share**, so a screenshot of a friend's console interleaves their
 * trails cleanly. One format and one clock; the lines it goes into are three
 * different lines:
 *
 *     [db] 12:00:00.000 | OK | create_game | severity=…    dbLog.ts
 *     [rt 12:00:00.000] game:abc — status SUBSCRIBED       realtimeDiag.ts
 *     [ui 12:00:00.000] playarea slot mounted — …          PlayAreaMountLog.tsx
 *
 * `[rt` and `[ui` hold the stamp inside the bracket, and `[db]` puts it after,
 * so filtering a console on `[db]` and on `[rt ` are two different gestures.
 * The `[db]` line is the one with a reason: its stamp is the first FIELD of a
 * string `dbLog` also RETURNS, which the fault modal and `<ErrorPage>` render
 * under the message — inside the bracket the stamp would be console-only, and
 * a screenshot of the modal would carry no time.
 *
 * This is the one place the three are listed. (`[rpc]` is the edge runtime's
 * line, written in Deno on its own clock, so it is not a fourth here.)
 */
export function logStamp(): string {
  const t = new Date()
  const hh = String(t.getHours()).padStart(2, '0')
  const mm = String(t.getMinutes()).padStart(2, '0')
  const ss = String(t.getSeconds()).padStart(2, '0')
  const ms = String(t.getMilliseconds()).padStart(3, '0')
  return `${hh}:${mm}:${ss}.${ms}`
}
