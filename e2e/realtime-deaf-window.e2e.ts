import { exec, execSync } from 'node:child_process'
import { test, expect, type Browser } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { asUser, createSoloClub, createWordwheelGame, type E2EClub } from './helpers/fixtures'
import { signIn } from './helpers/session'

/**
 * THE DEAF-WINDOW REGRESSION TEST — engineers the lost-event scenario of
 * docs/realtime-lost-events.md and asserts the app recovers. Written first
 * as a `test.fail`-pinned repro that reliably demonstrated the bug; the
 * attach-time refetch (lib/supabase/postgresAttached.ts) flipped it green
 * and the marker came off.
 *
 * The mechanism: `SUBSCRIBED` is only the join ack. The WAL-poller attachment
 * is confirmed later by the channel's `system` message ("Subscribed to
 * PostgreSQL"), and a postgres_changes event committed between the two is
 * dropped — not delayed, dropped. The window's width is what makes the bug
 * erratic: measured while building this spec, a join landing at the moment a
 * booting tenant starts accepting gets a ~1.2–1.3s window; a join even half a
 * second later gets single-digit milliseconds. If nothing else ever writes to
 * the watched table, no later event heals the refetch hooks and the viewer is
 * stale forever.
 *
 * The window's width tracks how SLOWLY the tenant boots — which is why the
 * bug bit hardest on a suite-loaded machine and why an idle box shrugs off
 * even a deliberate restart (measured: idle boot ≈ 1.3s window for the first
 * join batch, milliseconds for everyone after; a browser page can't land a
 * join that early). So the spec makes the boot slow ON PURPOSE: capping the
 * container at --cpus=0.3 stretches the first-batch window to ~8 SECONDS
 * (measured), which a browser hits easily. The cap is restored afterwards.
 *
 * The engineered timeline (per attempt):
 *   - restart the CPU-capped tenant WITHOUT waiting and navigate immediately
 *     — the page's first join attempt fails on transport, and its retry
 *     lands in the boot's slow phase, inside the wide window. The target is
 *     the GAME ROOM channel (`game:<id>`, carrying common.games): it is
 *     among the page's first joins. Losing a common.games UPDATE is also the
 *     shape of every observed real failure — the game ends on the server and
 *     the viewer never learns.
 *   - after the room's SUBSCRIBED (+300ms so its load()'s read provably
 *     completed first), end the game server-side via the real end_game RPC.
 *   - the honesty check reads the page's own `[rt]` console lines
 *     (realtimeDiag.ts): the room's `system ok` must NOT have arrived yet,
 *     i.e. the terminal write landed inside the deaf window. A miss means
 *     the event was DELIVERED — which would false-green the assertion — so
 *     that attempt burns its game and retries fresh (the edge is a race
 *     against the boot; ~3 attempts have always sufficed in practice).
 *
 * On a hit, the assertion: the verdict pill must appear. The UPDATE event
 * itself is still dropped by the server — what makes the verdict arrive is
 * the room's refetch when its `system ok` lands (the deaf-window closer in
 * every postgres_changes hook). Before that fix, the page kept a live board
 * with an "End game" button for a game that was already over, forever.
 */
test('a game ended inside the deaf window shows its verdict to the viewer', async ({ browser }) => {
  const club = await createSoloClub('rtwin')

  // Slow the tenant's boot for the duration of the test (see docstring) and
  // ALWAYS restore — a leftover cap would slow every later spec's realtime.
  // Restore = the host's full core count: `--cpus=0` is a silent NO-OP, and
  // `--cpu-quota=-1` clears only the live cgroup while leaving the stored
  // NanoCpus to re-apply on the container's next restart (both verified).
  const ncpu = execSync("docker info -f '{{.NCPU}}'").toString().trim()
  execSync('docker update --cpus=0.3 supabase_realtime_codenames', { stdio: 'ignore' })
  try {
    for (let attempt = 1; attempt <= 5; attempt++) {
      const outcome = await tryOnce(browser, club)
      if (outcome === 'hit') return
      console.log(`deaf-window attempt ${attempt}: window missed (join landed too late), retrying`)
    }
    throw new Error('deaf window never hit in 5 attempts — did the tenant boot get faster?')
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
  const deadline = Date.now() + 60_000
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

/** One engineered pass at the window (see the file docstring for the
 *  timeline). 'miss' = the room attached before the terminal write, so the
 *  event was delivered and the game proves nothing — caller retries fresh. */
async function tryOnce(browser: Browser, club: E2EClub): Promise<'hit' | 'miss'> {
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
  const seen = (needle: string) =>
    rtLines.filter((l) => l.includes(room) && l.includes(needle)).length

  try {
    // Fire the restart WITHOUT waiting for completion (exec, not execSync),
    // wait for the container's StartedAt to change (under the CPU cap the
    // OLD tenant is slow to stop too, and a page that joins the dying tenant
    // gets an instantly-attached channel — a miss), then wait for the NEW
    // tenant to start ACCEPTING joins — probed with a throwaway broadcast
    // channel, which acks fast without touching the CDC machinery. Navigate
    // at that instant: the throttled tenant's slow-attach phase runs ~8s
    // past acceptance, so the page's join (~1s later) lands mid-window.
    // Waiting any longer (for "healthy") is how you MISS the window: by
    // then the tenant attaches new subscriptions in single-digit ms.
    const startedAt = () =>
      execSync(
        "docker inspect -f '{{.State.StartedAt}}' supabase_realtime_codenames",
      ).toString().trim()
    const prevStart = startedAt()
    exec('docker restart supabase_realtime_codenames')
    const restartDeadline = Date.now() + 30_000
    while (startedAt() === prevStart) {
      if (Date.now() > restartDeadline) throw new Error('timed out waiting for the tenant restart')
      await new Promise((r) => setTimeout(r, 250))
    }
    await waitForRealtimeAcceptance()
    await page.goto(`/g/${game.gametype}/${game.id}`)
    const deadline = Date.now() + 30_000
    while (seen('status SUBSCRIBED') < 1) {
      if (Date.now() > deadline) throw new Error('timed out waiting for the room to SUBSCRIBE')
      await page.waitForTimeout(50)
    }

    // Let the on-SUBSCRIBED load()'s read land (a local round-trip, tens of
    // ms) so it provably saw a game still in progress.
    await page.waitForTimeout(300)
    await expect(page.getByRole('button', { name: 'End game' }).first()).toBeVisible()

    // End the game server-side — the same RPC the End-game button calls.
    // This writes common.games (play_state='ended', is_terminal=true): the
    // exact row the room channel watches.
    const res = await asUser(member.session.access_token)
      .schema('wordwheel')
      .rpc('end_game', { target_game: game.id })
    expect(res.error).toBeNull()

    // Honesty check: the room's `system ok` must NOT have arrived yet — the
    // terminal write landed inside the deaf window, not after it.
    if (seen('system ok') > 0) return 'miss'

    // The UPDATE is lost and nothing else writes this game. Today the page
    // stays mid-game forever — no verdict, End-game button still live. This
    // is the assertion the fix flips. (15s: with the fix, the verdict rides
    // the `system ok` refetch, which under the CPU cap can be ~8s out.)
    await expect(page.getByText(/^Ended: .+ \d+\/59 points$/)).toBeVisible({ timeout: 15_000 })
    return 'hit'
  } finally {
    await ctx.close()
  }
}
