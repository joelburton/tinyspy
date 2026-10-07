#!/usr/bin/env -S npx tsx
// cs-unmet

/**
 * What one move costs the two players' pages, in loads and bytes, for every
 * coop game (docs/testing.md → What a move costs).
 *
 * Each game's gallery builder is run for its coop `mid` cell with the global
 * `fetch` patched: the first RPC after `create_game` is the move, and it is
 * held until both players' pages are open and settled. Then it is let through,
 * and every HTTP response and Realtime frame both pages receive is recorded
 * until neither page has heard anything for a while.
 *
 * crosswords is measured on `sunday-sample.puz` (21×21) instead of the
 * gallery's all-A grid, whose clue text is filler: the template's size is part
 * of what a move resends.
 *
 * Usage:  npm run _move-bytes -- [game,game,…]   (public entry: `gmake move-bytes`)
 */

import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
import { chromium, type Browser, type CDPSession, type Page } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import {
  asUser,
  createClubWithMembers,
  envelopeData,
  type E2EClub,
} from '../helpers/fixtures'
import { signIn } from '../helpers/session'
import { detectFormat, parsePuzzleBuffer } from '../../src/crosswords/lib/parse/format'
import type { GameGallery } from './types'
import { boggleGallery } from './games/boggle'
import { codenamesduetGallery } from './games/codenamesduet'
import { connectionsGallery } from './games/connections'
import { letterboxedGallery } from './games/letterboxed'
import { psychicnumGallery } from './games/psychicnum'
import { scrabbleGallery } from './games/scrabble'
import { setgameGallery } from './games/setgame'
import { spellingbeeGallery } from './games/spellingbee'
import { stackdownGallery } from './games/stackdown'
import { strandsGallery } from './games/strands'
import { waffleGallery } from './games/waffle'
import { wordiplyGallery } from './games/wordiply'
import { wordleGallery } from './games/wordle'
import { wordleoneGallery } from './games/wordleone'
import { wordwheelGallery } from './games/wordwheel'

const BASE = 'http://localhost:5173'
const SUPABASE_URL = 'http://127.0.0.1:54321'
const ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
const LOCAL_DB = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
const SUNDAY = 'supabase/scripts/crosswords/fixtures/sunday-sample.puz'
/** How long both pages must hear nothing before the move counts as done. */
const QUIET_MS = 2500
const GAME_TIMEOUT_MS = 120_000

/**
 * crosswords on the Sunday fixture, created the way an upload creates it (the
 * parsed board inline in `p_board`), a third of its squares filled before the
 * measured `set_cell` so the grid is a game in progress.
 */
const crosswordsSunday: GameGallery = {
  game: 'crosswords',
  brand: 'CrossPlay',
  members: 2,
  cells: [{ mode: 'coop', phase: 'mid' }],
  async build(club) {
    const bytes = new Uint8Array(readFileSync(SUNDAY))
    const { state, solution } = parsePuzzleBuffer('sunday-sample', bytes, detectFormat(SUNDAY, bytes))
    const viewer = club.members[0]
    const created = await asUser(viewer.session.access_token)
      .schema('crosswords')
      .rpc('create_game', {
        p_club_handle: club.handle,
        p_setup: { timer: { kind: 'none' } },
        p_player_user_ids: club.members.map((m) => m.userId),
        p_mode: 'coop',
        p_board: { meta: { ...state.meta, cells: state.snapshot.cells }, solution },
      })
    const { id } = envelopeData<{ id: string }>(created, 'crosswords.create_game')

    const squares: { row: number; col: number; fill: string }[] = []
    solution.forEach((cells, row) =>
      cells.forEach((answers, col) => {
        if (answers) squares.push({ row, col, fill: answers[0] })
      }),
    )
    const setCell = (client: ReturnType<typeof asUser>, sq: (typeof squares)[number]) =>
      client.schema('crosswords').rpc('set_cell', {
        p_game_id: id,
        p_row: sq.row,
        p_col: sq.col,
        p_fill: sq.fill,
        p_pencil: false,
      })

    // The prefill is the game so far, not the move, so it bypasses the gate.
    const ungated = createClient(SUPABASE_URL, ANON_KEY, {
      global: {
        headers: { Authorization: `Bearer ${viewer.session.access_token}` },
        fetch: realFetch,
      },
      auth: { persistSession: false },
    })
    const third = Math.ceil(squares.length / 3)
    for (const sq of squares.slice(0, third)) {
      envelopeData(await setCell(ungated, sq), `crosswords.set_cell(${sq.row},${sq.col})`)
    }
    envelopeData(await setCell(asUser(viewer.session.access_token), squares[third]), 'crosswords.set_cell')
    return { gametype: 'crosswords_coop', id, viewer }
  },
}

const ALL: GameGallery[] = [
  boggleGallery,
  codenamesduetGallery,
  connectionsGallery,
  crosswordsSunday,
  letterboxedGallery,
  psychicnumGallery,
  scrabbleGallery,
  setgameGallery,
  spellingbeeGallery,
  stackdownGallery,
  strandsGallery,
  waffleGallery,
  wordiplyGallery,
  wordleGallery,
  wordleoneGallery,
  wordwheelGallery,
]

/**
 * The hold on the move. Installed for one game's build and cleared on every
 * exit: a gate left behind holds the next game's own setup RPCs forever.
 */
type Gate = {
  sawCreate: boolean
  move: string | null
  moverId: string
  answer: string
  reached: () => void
  release: Promise<void>
  answered: () => void
  /** Every RPC the build makes after the move waits for the measurement. */
  after: Promise<void>
}
let gate: Gate | null = null

const realFetch = globalThis.fetch
globalThis.fetch = async function gatedFetch(input: RequestInfo | URL, init?: RequestInit) {
  const url = String(input instanceof Request ? input.url : input)
  const rpc = url.match(/\/rest\/v1\/rpc\/([a-z_0-9]+)/)?.[1]
  const g = gate
  if (!rpc || !g) return realFetch(input, init)
  if (rpc === 'create_game') {
    g.sawCreate = true
    return realFetch(input, init)
  }
  if (!g.sawCreate) return realFetch(input, init)
  if (g.move !== null) {
    await g.after
    return realFetch(input, init)
  }

  g.move = rpc
  const jwt = (new Headers(init?.headers).get('Authorization') ?? '').split('.')[1]
  g.moverId = jwt ? JSON.parse(Buffer.from(jwt, 'base64url').toString()).sub : ''
  g.reached()
  await g.release
  const res = await realFetch(input, init)
  g.answer = await res.clone().text()
  g.answered()
  return res
}

type Load = { path: string; bytes: number; gzBytes: number }
type Frame = { kind: string; bytes: number }
/** What one page received while `on`, and when it last heard anything. */
type Recording = { loads: Load[]; frames: Frame[]; lastHeard: number; on: boolean }

/** Record a page's API responses and Realtime frames through CDP. */
async function record(page: Page): Promise<Recording> {
  const rec: Recording = { loads: [], frames: [], lastHeard: Date.now(), on: false }
  const cdp: CDPSession = await page.context().newCDPSession(page)
  await cdp.send('Network.enable')
  const requests = new Map<string, { url: string; method: string }>()
  const isApi = (url: string) => url.startsWith(SUPABASE_URL)

  cdp.on('Network.requestWillBeSent', (e) => {
    requests.set(e.requestId, { url: e.request.url, method: e.request.method })
    if (rec.on && isApi(e.request.url)) rec.lastHeard = Date.now()
  })
  cdp.on('Network.loadingFinished', async (e) => {
    const req = requests.get(e.requestId)
    if (!rec.on || !req || !isApi(req.url) || req.method === 'OPTIONS') return
    rec.lastHeard = Date.now()
    const got = await cdp.send('Network.getResponseBody', { requestId: e.requestId })
    const body = got.base64Encoded ? Buffer.from(got.body, 'base64').toString() : got.body
    const u = new URL(req.url)
    rec.loads.push({
      path: `${req.method} ${u.pathname}`,
      bytes: Buffer.byteLength(body),
      gzBytes: gzipSync(body).byteLength,
    })
  })
  cdp.on('Network.webSocketFrameReceived', (e) => {
    if (!rec.on) return
    const { opcode, payloadData } = e.response
    const bytes = opcode === 2 ? Buffer.from(payloadData, 'base64').byteLength : Buffer.byteLength(payloadData)
    let kind = 'binary'
    if (opcode === 2) {
      // realtime-js's binary user broadcast (its serializer.js): byte 0 is the
      // kind, 4; bytes 1 and 2 the topic's and the event's lengths; the topic
      // starts at byte 5 and the event follows it.
      const buf = Buffer.from(payloadData, 'base64')
      if (buf[0] === 4) {
        const event = buf.subarray(5 + buf[1], 5 + buf[1] + buf[2]).toString()
        kind = `broadcast:${event}`
      }
    }
    if (opcode === 1) {
      // realtime-js speaks either the object or the array shape of a Phoenix message.
      const msg = JSON.parse(payloadData)
      const topic = Array.isArray(msg) ? msg[2] : msg.topic
      const event = Array.isArray(msg) ? msg[3] : msg.event
      const payload = Array.isArray(msg) ? msg[4] : msg.payload
      if (topic === 'phoenix') return // the heartbeat
      kind = event
      if (event === 'postgres_changes') kind = `${payload.data.schema}.${payload.data.table}`
      if (event === 'broadcast') kind = `broadcast:${payload.event}`
    }
    rec.lastHeard = Date.now()
    rec.frames.push({ kind, bytes })
  })
  return rec
}

async function waitForQuiet(recs: Recording[], maxMs = 20_000): Promise<void> {
  const start = Date.now()
  while (Date.now() - start < maxMs) {
    await new Promise((r) => setTimeout(r, 200))
    if (Date.now() - Math.max(...recs.map((r) => r.lastHeard)) > QUIET_MS) return
  }
}

type Result = {
  gametype: string
  move: string
  /** The move's own answer, which only the mover receives. */
  answerBytes: number
  pages: { mover: boolean; loads: Load[]; frames: Frame[] }[]
}

/** The game the build is making: the newest in its throwaway club. */
function newestGame(club: E2EClub): { id: string; gametype: string } {
  const [id, gametype] = execFileSync(
    'psql',
    [LOCAL_DB, '-X', '-tA', '-F', ' ', '-c',
     `select id, gametype from common.games where club_handle = '${club.handle}'
       order by started_at desc limit 1;`],
    { encoding: 'utf8' },
  ).trim().split(' ')
  return { id, gametype }
}

async function measure(browser: Browser, g: GameGallery): Promise<Result> {
  const club = await createClubWithMembers(['mba', 'mbb'])
  let reached!: () => void
  let release!: () => void
  let answered!: () => void
  let after!: () => void
  const reachedP = new Promise<void>((r) => (reached = r))
  const answeredP = new Promise<void>((r) => (answered = r))
  const g0: Gate = {
    sawCreate: false,
    move: null,
    moverId: '',
    answer: '',
    reached,
    release: new Promise<void>((r) => (release = r)),
    answered,
    after: new Promise<void>((r) => (after = r)),
  }
  gate = g0

  const contexts = []
  const recs: Recording[] = []
  const built = g.build(club, { mode: 'coop', phase: 'mid' })
  // Raced against a deadline inside the try, so a stuck game still runs the
  // finally that clears its gate. The finally clears the timer too: a pending
  // one keeps the process alive until it fires.
  let deadlineTimer: ReturnType<typeof setTimeout> | undefined
  const deadline = new Promise<never>((_, reject) => {
    deadlineTimer = setTimeout(
      () => reject(new Error(`no answer in ${GAME_TIMEOUT_MS / 1000}s`)),
      GAME_TIMEOUT_MS,
    )
  })
  const run = async (): Promise<Result> => {
    await Promise.race([
      reachedP,
      built.then(() => {
        throw new Error('the build made no move after create_game')
      }),
    ])
    const { id, gametype } = newestGame(club)

    for (const member of club.members) {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
      contexts.push(ctx)
      await signIn(ctx, member.session)
      const page = await ctx.newPage()
      recs.push(await record(page))
      await page.goto(`${BASE}/g/${gametype}/${id}`)
      await page.waitForSelector('button[aria-label="Game menu"]', { timeout: 20_000 })
      await page.waitForSelector('text=Loading…', { state: 'detached', timeout: 8000 }).catch(() => {})
    }
    // Both pages' joins, attach confirmations and first reads land before the move.
    await new Promise((r) => setTimeout(r, 4000))
    for (const r of recs) {
      r.on = true
      r.lastHeard = Date.now()
    }
    release()
    await answeredP
    for (const r of recs) r.lastHeard = Date.now()
    await waitForQuiet(recs)
    for (const r of recs) r.on = false

    const env = JSON.parse(g0.answer) as { type?: string; message?: string }
    if (env.type !== 'ok') throw new Error(`the move ${g0.move} was refused: ${g0.answer}`)
    return {
      gametype,
      move: g0.move!,
      answerBytes: Buffer.byteLength(g0.answer),
      pages: recs.map((r, i) => ({
        mover: club.members[i].userId === g0.moverId,
        loads: r.loads,
        frames: r.frames,
      })),
    }
  }
  try {
    return await Promise.race([run(), deadline])
  } finally {
    clearTimeout(deadlineTimer)
    gate = null
    release()
    after()
    await built.catch(() => {})
    for (const c of contexts) await c.close()
  }
}

function printTable(results: Result[]): void {
  const rows = results.map((r) => {
    const loads = r.pages.flatMap((p) => p.loads)
    const frames = r.pages.flatMap((p) => p.frames)
    const sum = (xs: { bytes: number }[]) => xs.reduce((n, x) => n + x.bytes, 0)
    // The frames that tell a page its game changed: a postgres_changes frame
    // (its kind is its `schema.table`) or the `changed` nudge.
    const isNews = (f: Frame) => f.kind.includes('.') || f.kind === 'broadcast:changed'
    const moverMessages = r.pages.find((p) => p.mover)?.frames.filter(isNews).length
    return [
      r.gametype,
      r.move,
      String(moverMessages ?? '?'),
      String(loads.length),
      String(sum(frames.filter(isNews))),
      String(sum(loads)),
      String(loads.reduce((n, l) => n + l.gzBytes, 0)),
      String(sum(loads) + sum(frames) + r.answerBytes),
    ]
  })
  const head = ['gametype', 'move', 'messages', 'loads', 'message bytes', 'refetch bytes', 'refetch gz', 'total bytes']
  const widths = head.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)))
  const line = (cells: string[]) =>
    cells.map((c, i) => (i < 2 ? c.padEnd(widths[i]) : c.padStart(widths[i]))).join('  ')
  console.log(line(head))
  for (const r of rows) console.log(line(r))
}

async function main() {
  const wanted = process.argv[2]?.split(',').filter(Boolean)
  const games = wanted?.length ? ALL.filter((g) => wanted.includes(g.game)) : ALL
  if (!games.length) throw new Error(`no such game: ${wanted} (have: ${ALL.map((g) => g.game).join(', ')})`)

  const browser = await chromium.launch()
  const results: Result[] = []
  try {
    for (const g of games) {
      try {
        results.push(await measure(browser, g))
        console.error(`  ✓ ${g.game}`)
      } catch (err) {
        console.error(`  ✗ ${g.game}: ${err instanceof Error ? err.message : String(err)}`)
      }
    }
  } finally {
    await browser.close()
  }
  console.log('')
  printTable(results)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
