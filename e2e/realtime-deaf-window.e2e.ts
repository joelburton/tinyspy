import { exec, execSync } from 'node:child_process'
import { test, expect, type Browser } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { asUser, createSoloClub, createWordwheelGame, type E2EClub } from './helpers/fixtures'
import { signIn } from './helpers/session'

/**
 * THE DEAF-WINDOW REGRESSION TESTS — two layers guarding the attach-time
 * refetch (lib/supabase/postgresAttached.ts) that closes the lost-event
 * window of docs/realtime-lost-events.md:
 *
 *   1. A DETERMINISTIC wiring guard: plain page load, assert the factory's
 *      cause-tagged `refetch #N (attached)` console line appears after the
 *      data channel's `system ok`. No docker, no timing games — if someone
 *      unwires the attach refetch, this goes red on every run. (The room's
 *      half of the wiring is pinned at the unit level in
 *      useCommonGame.test.ts → "deaf-window closer".)
 *   2. The ENGINEERED end-to-end scenario below — lands a terminal write
 *      inside a real deaf window and asserts the verdict still arrives.
 *      Written first as a `test.fail`-pinned repro that reliably
 *      demonstrated the bug; the fix flipped it green and the marker came
 *      off. It is best-effort by nature (see below) — when the window
 *      can't be hit it SKIPS loudly rather than failing, because an
 *      unhittable window is an environment race, not an app bug.
 *
 * The mechanism: `SUBSCRIBED` is only the join ack. The WAL-poller attachment
 * is confirmed later by the channel's `system` message ("Subscribed to
 * PostgreSQL"), and a postgres_changes event committed between the two is
 * dropped — not delayed, dropped. If nothing else ever writes to the watched
 * table, no later event heals the refetch hooks; without the attach-time
 * refetch the viewer would be stale forever.
 *
 * The window's width tracks how SLOWLY the tenant boots — milliseconds when
 * warm, ~1.3s on an idle-machine boot (too early for a browser page to
 * reach), ~8s with the container capped at --cpus=0.3. So the spec slows the
 * boot ON PURPOSE, and because even that width varies with machine state
 * (repeated restarts warm the boot; a cold vite transform delays the page's
 * join), a missed window escalates: later attempts cap the CPU harder,
 * widening the window further. The cap is always restored afterwards.
 *
 * The engineered timeline (per attempt):
 *   - restart the CPU-capped tenant; wait for the container to actually swap
 *     (the old, throttled tenant is slow to stop, and joining IT would attach
 *     instantly — a guaranteed miss), then for the new tenant to start
 *     ACCEPTING joins — probed with a throwaway broadcast channel, which
 *     acks fast without touching the CDC machinery whose slow spin-up IS the
 *     window. Navigate at that instant: the page's GAME ROOM join
 *     (`game:<id>`, carrying common.games — losing a common.games UPDATE is
 *     the shape of every observed real failure) lands inside the window.
 *   - after the room's SUBSCRIBED (+300ms so its load()'s read provably
 *     completed first — the console `load #N: play_state=playing` line is
 *     the receipt), end the game server-side via the real end_game RPC.
 *   - the honesty check reads the page's own `[rt]` console lines
 *     (realtimeDiag.ts): the room's `system ok` must NOT have arrived yet,
 *     i.e. the terminal write landed inside the deaf window. A miss means
 *     the event was DELIVERED — which would green the assertion without
 *     testing anything — so that attempt burns its game, logs the window
 *     width it measured, and retries fresh at a harder cap.
 *
 * On a hit, the assertion: the verdict pill must appear. The UPDATE event
 * itself is still dropped by the server — what makes the verdict arrive is
 * the room's refetch when its `system ok` lands (the deaf-window closer in
 * every postgres_changes hook). Before that fix, the page kept a live board
 * with an "End game" button for a game that was already over, forever.
 *
 * If every attempt misses, the spec SKIPS (loudly) rather than fails: an
 * unhittable window is an environment race — the tenant booting faster than
 * the harness — and says nothing about the app. The per-attempt window-width
 * lines in the output are the diagnosis trail for why.
 */

test('every data channel refetches once its postgres_changes attach is confirmed', async ({
  browser,
}) => {
  const club = await createSoloClub('rtattach')
  const game = await createWordwheelGame(club, 'coop')
  const ctx = await browser.newContext()
  await signIn(ctx, club.members[0].session)
  const page = await ctx.newPage()

  const rtLines: string[] = []
  page.on('console', (msg) => {
    const text = msg.text()
    if (text.startsWith('[rt ')) rtLines.push(text)
  })

  await page.goto(`/g/${game.gametype}/${game.id}`)

  // The factory logs each refetch with its cause; `(attached)` is the one
  // fired by onPostgresAttached when the server's `system ok` confirms the
  // WAL-poller attachment. On a warm tenant that's milliseconds after
  // subscribe — 15s is pure safety margin, not an expected wait.
  const dataChannel = `wordwheel:${game.id}`
  const attached = () =>
    rtLines.some((l) => l.includes(dataChannel) && l.includes('(attached)'))
  const deadline = Date.now() + 15_000
  while (!attached() && Date.now() < deadline) await page.waitForTimeout(100)
  expect(
    attached(),
    `no "(attached)" refetch for ${dataChannel} — is the onPostgresAttached wiring gone?\n` +
      rtLines.join('\n'),
  ).toBe(true)

  await ctx.close()
})

/** Per-attempt CPU caps — escalating: a missed window means the boot was
 *  too fast for the harness, so later attempts throttle harder. Below ~0.15
 *  the boot takes so long that the waits' deadlines start to bind. */
const ATTEMPT_CPUS = [0.3, 0.3, 0.2, 0.15]

test('a game ended inside the deaf window shows its verdict to the viewer', async ({ browser }) => {
  const club = await createSoloClub('rtwin')

  // Slow the tenant's boot for the duration of the test (see docstring) and
  // ALWAYS restore — a leftover cap would slow every later spec's realtime.
  // Restore = the host's full core count: `--cpus=0` is a silent NO-OP, and
  // `--cpu-quota=-1` clears only the live cgroup while leaving the stored
  // NanoCpus to re-apply on the container's next restart (both verified).
  const ncpu = execSync("docker info -f '{{.NCPU}}'").toString().trim()
  try {
    for (let i = 0; i < ATTEMPT_CPUS.length; i++) {
      const cpus = ATTEMPT_CPUS[i]
      execSync(`docker update --cpus=${cpus} supabase_realtime_codenames`, { stdio: 'ignore' })
      const outcome = await tryOnce(browser, club)
      if (outcome === 'hit') return
      console.log(`deaf-window attempt ${i + 1} (cpus=${cpus}): ${outcome}`)
    }
    // Environment race, not an app failure — the window exists (the probes
    // and the original red runs measured it) but this boot was too fast for
    // the harness to land a commit inside it. Skip loudly; the per-attempt
    // lines above carry the measured widths for diagnosis.
    test.skip(
      true,
      'deaf window never hit — the tenant attached before every commit ' +
        '(boot too fast on this machine right now); see the attempt lines for measured widths',
    )
  } finally {
    execSync(`docker update --cpus=${ncpu} supabase_realtime_codenames`, { stdio: 'ignore' })
  }
})

/**
 * Poll until the (rebooting) tenant accepts channel joins. Each probe is a
 * fresh client + a broadcast-only channel — no postgres_changes binding, so
 * the join acks as soon as the socket layer is up, independent of the CDC
 * machinery whose slow spin-up IS the window under test.
 */
async function waitForRealtimeAcceptance(): Promise<void> {
  const deadline = Date.now() + 90_000
  for (;;) {
    if (Date.now() > deadline) throw new Error('timed out waiting for realtime acceptance')
    const client = createClient(
      'http://127.0.0.1:54321',
      // The well-known LOCAL anon key (same as helpers/fixtures.ts).
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0',
      { auth: { persistSession: false } },
    )
    const accepted = await new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => resolve(false), 1500)
      client.channel('deafwindow:acceptance-probe').subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          clearTimeout(timer)
          resolve(true)
        }
      })
    })
    await client.removeAllChannels()
    client.realtime.disconnect()
    if (accepted) return
    await new Promise((r) => setTimeout(r, 200))
  }
}

/** Millisecond-of-day from an `[rt HH:MM:SS.mmm]` console stamp, or null. */
function rtStamp(line: string): number | null {
  const m = line.match(/^\[rt (\d\d):(\d\d):(\d\d)\.(\d\d\d)\]/)
  if (!m) return null
  return ((Number(m[1]) * 60 + Number(m[2])) * 60 + Number(m[3])) * 1000 + Number(m[4])
}

/** One engineered pass at the window (see the file docstring for the
 *  timeline). A miss reports the window width it measured — the room
 *  attached before the terminal write, so the event was delivered and the
 *  game proves nothing; the caller retries fresh at a harder CPU cap. */
async function tryOnce(browser: Browser, club: E2EClub): Promise<'hit' | string> {
  const member = club.members[0]
  const game = await createWordwheelGame(club, 'coop')

  const ctx = await browser.newContext()
  await signIn(ctx, member.session)
  const page = await ctx.newPage()

  // The game room's topic is exactly `game:<gameId>` (stable name, no dedup
  // suffix — every peer must share it). No other channel's topic contains it.
  const room = `game:${game.id}`
  const rtLines: string[] = []
  page.on('console', (msg) => {
    const text = msg.text()
    if (text.startsWith('[rt ')) rtLines.push(text)
  })
  const roomLines = (needle: string) =>
    rtLines.filter((l) => l.includes(room) && l.includes(needle))

  try {
    // Fire the restart WITHOUT waiting for completion (exec, not execSync),
    // wait for the container's StartedAt to change (under the CPU cap the
    // OLD tenant is slow to stop too, and a page that joins the dying tenant
    // gets an instantly-attached channel — a miss), then wait for the NEW
    // tenant to start ACCEPTING joins. Navigate at that instant: the
    // throttled tenant's slow-attach phase runs seconds past acceptance, so
    // the page's join (~1s later) lands mid-window. Waiting any longer (for
    // "healthy") is how you MISS the window: by then the tenant attaches
    // new subscriptions in single-digit ms.
    const startedAt = () =>
      execSync(
        "docker inspect -f '{{.State.StartedAt}}' supabase_realtime_codenames",
      ).toString().trim()
    const prevStart = startedAt()
    exec('docker restart supabase_realtime_codenames')
    const restartDeadline = Date.now() + 60_000
    while (startedAt() === prevStart) {
      if (Date.now() > restartDeadline) throw new Error('timed out waiting for the tenant restart')
      await new Promise((r) => setTimeout(r, 250))
    }
    await waitForRealtimeAcceptance()
    await page.goto(`/g/${game.gametype}/${game.id}`)
    const deadline = Date.now() + 90_000
    while (roomLines('status SUBSCRIBED').length < 1) {
      if (Date.now() > deadline) throw new Error('timed out waiting for the room to SUBSCRIBE')
      await page.waitForTimeout(50)
    }

    // Let the on-SUBSCRIBED load()'s read land (a local round-trip, tens of
    // ms) — then confirm via its own console receipt that it saw a game
    // still in progress. Console over a UI wait on purpose: every ms spent
    // here before the commit eats into the window.
    await page.waitForTimeout(300)
    expect(roomLines('play_state=playing').length).toBeGreaterThan(0)

    // End the game server-side — the same RPC the End-game button calls.
    // This writes common.games (play_state='ended', is_terminal=true): the
    // exact row the room channel watches.
    const res = await asUser(member.session.access_token)
      .schema('wordwheel')
      .rpc('end_game', { target_game: game.id })
    expect(res.error).toBeNull()

    // Honesty check: the room's `system ok` must NOT have arrived yet — the
    // terminal write landed inside the deaf window, not after it. On a miss,
    // report the width this boot actually produced (subscribed → system-ok,
    // from the lines' own timestamps) so a skipped run is diagnosable.
    if (roomLines('system ok').length > 0) {
      const sub = rtStamp(roomLines('status SUBSCRIBED')[0] ?? '')
      const ok = rtStamp(roomLines('system ok')[0] ?? '')
      const width = sub != null && ok != null ? `${ok - sub}ms` : 'unknown'
      return `miss — window was ${width}, commit landed after it`
    }

    // The UPDATE is dropped by the server; what must save the viewer is the
    // attach-time refetch when `system ok` lands. Under the harder CPU caps
    // that can be tens of seconds out — hence the generous timeout.
    await expect(page.getByText(/^Ended: .+ \d+\/59 points$/)).toBeVisible({ timeout: 45_000 })
    return 'hit'
  } finally {
    await ctx.close()
  }
}
