// cs-unmet

import { exec, execSync } from 'node:child_process'
import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { asUser, createSoloClub, createWordwheelGame } from './helpers/fixtures'
import { signIn } from './helpers/session'

/**
 * THE DEAF-WINDOW REGRESSION TESTS (src/common/realtime/doc.md → the deaf
 * window).
 *
 *   1. The attach re-read, for the hooks that still subscribe to row changes.
 *      `SUBSCRIBED` is only the join ack; a postgres_changes event committed
 *      before the server's `system ok` confirms the WAL attach is dropped, and
 *      `onPostgresAttached` re-reads at that confirmation. A deterministic
 *      wiring guard: load the home page and assert its `useRealtimeRefetch`
 *      channel logs the cause-tagged `refetch #N (attached)`.
 *   2. The game page, which hears a move as a `changed` Broadcast sent from
 *      the database (`common._nudge_game_page`, src/common/realtime/doc.md) and
 *      has no attach re-read. A game stopped right after the page's room
 *      joins, on a Realtime tenant that is CPU-capped and just restarted —
 *      where a postgres_changes event would be dropped — must still show its
 *      verdict. If broadcast from the database ever grows a deaf window of its
 *      own, this goes red.
 */

test('a row-change channel re-reads once its postgres_changes attach is confirmed', async ({
  browser,
}) => {
  const club = await createSoloClub('rtattach')
  const ctx = await browser.newContext()
  await signIn(ctx, club.members[0].session)
  const page = await ctx.newPage()

  const rtLines: string[] = []
  page.on('console', (msg) => {
    const text = msg.text()
    if (text.startsWith('[rt ')) rtLines.push(text)
  })

  await page.goto('/')

  // The home page's club list is a `useRealtimeRefetch` channel, which logs
  // each refetch with its cause; `(attached)` is the one `onPostgresAttached`
  // fires at `system ok`. On a warm tenant that's milliseconds after
  // subscribe — 15s is pure safety margin, not an expected wait.
  const channel = `home-clubs:${club.members[0].userId}`
  const attached = () =>
    rtLines.some((l) => l.includes(channel) && l.includes('(attached)'))
  const deadline = Date.now() + 15_000
  while (!attached() && Date.now() < deadline) await page.waitForTimeout(100)
  expect(
    attached(),
    `no "(attached)" refetch for ${channel} — is the onPostgresAttached wiring gone?\n` +
      rtLines.join('\n'),
  ).toBe(true)

  await ctx.close()
})

test('a game stopped right after the room joins a slow-booting tenant shows its verdict', async ({
  browser,
}) => {
  // The restart under the cap, the boot and the 45s verdict wait outrun the
  // suite's 45s budget; a missing verdict should fail on its own assertion.
  test.setTimeout(120_000)
  const club = await createSoloClub('rtnudge')
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

  // Slow the tenant's boot for the duration of the test and ALWAYS restore —
  // a leftover cap would slow every later spec's realtime. Restore = the
  // host's full core count: `--cpus=0` is a silent NO-OP, and
  // `--cpu-quota=-1` clears only the live cgroup while leaving the stored
  // NanoCpus to re-apply on the container's next restart (both verified).
  const ncpu = execSync("docker info -f '{{.NCPU}}'").toString().trim()
  try {
    execSync('docker update --cpus=0.3 supabase_realtime_codenames', { stdio: 'ignore' })

    // Fire the restart WITHOUT waiting for completion, wait for the
    // container's StartedAt to change (under the cap the OLD tenant is slow to
    // stop too), then for the NEW tenant to start ACCEPTING joins. Navigate at
    // that instant, so the page joins a tenant still booting.
    const startedAt = () =>
      execSync("docker inspect -f '{{.State.StartedAt}}' supabase_realtime_codenames")
        .toString()
        .trim()
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

    // Let the on-SUBSCRIBED read land (a local round-trip, tens of ms), and
    // confirm from its own console receipt that it saw a game still in
    // progress — so the verdict below can only come from the nudge.
    await page.waitForTimeout(300)
    expect(roomLines('ended=false').length).toBeGreaterThan(0)

    // Stop the game server-side — the same RPC the Stop-game button calls.
    const res = await asUser(member.session.access_token)
      .schema('wordwheel')
      .rpc('stop_game', { p_game_id: game.id })
    expect(res.error).toBeNull()

    await expect(page.getByText(/^Ended: .+ \d+\/59 points$/)).toBeVisible({ timeout: 45_000 })
  } finally {
    execSync(`docker update --cpus=${ncpu} supabase_realtime_codenames`, { stdio: 'ignore' })
    await ctx.close()
  }
})

/**
 * Poll until the (rebooting) tenant accepts channel joins. Each probe is a
 * fresh client + a broadcast-only channel, so the join acks as soon as the
 * socket layer is up.
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
