// cs-unmet

import { test, expect } from '@playwright/test'
import {
  asUser,
  createConnectionsGame,
  createGame,
  createLetterboxedGame,
  createScrabbleGame,
  createSetgameGame,
  createSoloClub,
  createStackdownGame,
  createStrandsGame,
  createWaffleGame,
  createWordiplyGame,
  createWordleGame,
  envelopeData,
  seedWaffleSwap,
  seedWordleGuesses,
  setScrabbleRack,
  type E2EClub,
  type E2EMember,
} from './helpers/fixtures'
import { boardOf, claim, findSetOn } from './helpers/setgame'
import { signIn } from './helpers/session'

/**
 * Every game's `events` subscription is LIVE — one test per table.
 *
 * The frontend subscribes with `{ schema, table, filter }` STRINGS
 * (`common/realtime/useRealtimeRefetch.ts`), so a wrong table name fails
 * silently: no error, no warning, just a game whose log stops filling. Nothing
 * else in the suite would catch it, because a unit test mocks the Supabase
 * client and pgTAP never opens a browser — and the ten tables were all renamed
 * at once, which is exactly when a typo gets made.
 *
 * **The row is written from OUTSIDE the browser**, through the game's own RPC
 * as the signed-in player. The page did nothing: it never submitted, so no local
 * state and no optimistic update can explain the row appearing. (None of the ten
 * `PlayArea`s calls `load()` after a move either — every one of them waits for
 * the event.)
 *
 * **What that proves is a live binding on the named table**, which is the bug
 * being hunted — not that a postgres-changes event specifically delivered the
 * row. `useRealtimeRefetch` also refetches when the server confirms the attach,
 * so a write that lands before that confirmation is picked up by the refetch.
 * Either way a wrong table name fails the channel join, and then NOTHING
 * arrives: no attach, no event, no row.
 *
 * The assertion is the same everywhere: the log's `#N` handle
 * (`[data-history-handle]`) goes from absent to present. It is the one marker
 * every event-log game renders, whatever its rows say.
 *
 * Each case picks the CHEAPEST legal way to land one row — a hint where the
 * game has one, a tile exchange for scrabble, a real move where that is
 * simplest. What the row says doesn't matter here; that it arrives does.
 */

/** One game's "open it, then write a row behind its back" recipe. */
type Case = {
  /** The schema whose `events` table is under test. */
  game: string
  /** Create the game, and hand back how to land one row in it from Node. */
  start: (
    club: E2EClub,
  ) => Promise<{ id: string; gametype: string; write: (m: E2EMember) => Promise<void> }>
}

const CASES: Case[] = [
  {
    game: 'psychicnum',
    start: async (club) => {
      const game = await createGame(club) // psychicnum_coop
      return {
        ...game,
        write: async (m) => {
          const res = await asUser(m.session.access_token)
            .schema('psychicnum')
            .rpc('request_hint', { target_game: game.id })
          envelopeData(res, 'psychicnum.request_hint')
        },
      }
    },
  },
  {
    game: 'wordle',
    start: async (club) => {
      const game = await createWordleGame(club)
      return { ...game, write: (m) => seedWordleGuesses(m, game.id, 1).then(() => undefined) }
    },
  },
  {
    game: 'connections',
    start: async (club) => {
      const game = await createConnectionsGame(club, 'coop')
      return {
        ...game,
        // The fixture puzzle's rank-0 category, matched. connections is the
        // FE-knows game: the caller reports the verdict, the server records it.
        write: async (m) => {
          const res = await asUser(m.session.access_token)
            .schema('connections')
            .rpc('submit_guess', {
              target_game: game.id,
              tiles: ['ALPHA', 'ANGEL', 'APPLE', 'ARROW'],
              result: 'correct',
              matched_category_rank: 0,
            })
          envelopeData(res, 'connections.submit_guess')
        },
      }
    },
  },
  {
    game: 'letterboxed',
    start: async (club) => {
      const game = await createLetterboxedGame(club)
      return {
        ...game,
        write: async (m) => {
          const res = await asUser(m.session.access_token)
            .schema('letterboxed')
            .rpc('log_hint_or_spoiler', {
              target_game: game.id,
              word_shown: 'adgjbehk', // the fixture board's first solution word
              kind: 'hint',
            })
          envelopeData(res, 'letterboxed.log_hint_or_spoiler')
        },
      }
    },
  },
  {
    game: 'waffle',
    start: async (club) => {
      const game = await createWaffleGame(club)
      return { ...game, write: (m) => seedWaffleSwap(m, game.id) }
    },
  },
  {
    game: 'stackdown',
    start: async (club) => {
      const game = await createStackdownGame(club)
      return {
        ...game,
        write: async (m) => {
          const res = await asUser(m.session.access_token)
            .schema('stackdown')
            .rpc('reveal_next_hint', { target_game: game.id })
          envelopeData(res, 'stackdown.reveal_next_hint')
        },
      }
    },
  },
  {
    game: 'strands',
    start: async (club) => {
      const game = await createStrandsGame(club)
      const themeWord = game.words.find((w) => !w.isSpangram) ?? game.words[0]
      return {
        ...game,
        write: async (m) => {
          const res = await asUser(m.session.access_token)
            .schema('strands')
            .rpc('submit_path', { target_game: game.id, path: themeWord.coords })
          envelopeData(res, `strands.submit_path(${themeWord.word})`)
        },
      }
    },
  },
  {
    game: 'setgame',
    start: async (club) => {
      const game = await createSetgameGame(club)
      return {
        ...game,
        // setgame deals a shuffle, so the set has to be found on the board the
        // game actually dealt — the deal-three rule guarantees there is one.
        write: async (m) => {
          const board = await boardOf(m, game.id)
          const set = findSetOn(board)
          if (!set) throw new Error('setgame: the dealt board holds no set')
          await claim(m, game.id, set)
        },
      }
    },
  },
  {
    game: 'wordiply',
    start: async (club) => {
      const game = await createWordiplyGame(club)
      return {
        ...game,
        // 'bar' extends the fixture's base 'ar' and is on its shipped legal list.
        write: async (m) => {
          const res = await asUser(m.session.access_token)
            .schema('wordiply')
            .rpc('submit_guess', { target_game: game.id, word: 'bar' })
          envelopeData(res, 'wordiply.submit_guess(bar)')
        },
      }
    },
  },
  {
    game: 'scrabble',
    start: async (club) => {
      const game = await createScrabbleGame(club)
      // An EXCHANGE, not a pass: a pass is compete-only (PN454), and this is a
      // coop game. It needs no board and no dictionary — just a known tile on
      // the shared rack to hand back.
      setScrabbleRack(game.id, ['A', 'B', 'C', 'D', 'E', 'F', 'G'])
      return {
        ...game,
        write: async (m) => {
          const db = asUser(m.session.access_token).schema('scrabble')
          const state = await db.from('games_state').select('version').eq('id', game.id).single()
          if (state.error) throw new Error(`scrabble version: ${state.error.message}`)
          const res = await db.rpc('exchange_tiles', {
            target_game: game.id,
            base_version: (state.data as { version: number }).version,
            rack_tiles: ['A'],
          })
          envelopeData(res, 'scrabble.exchange_tiles')
        },
      }
    },
  },
]

test.describe('events subscriptions are live', () => {
  for (const { game, start } of CASES) {
    test(`${game}: a row written outside the browser reaches the open page`, async ({
      browser,
    }) => {
      const club = await createSoloClub(`rt${game}`.slice(0, 12))
      const [member] = club.members
      const { id, gametype, write } = await start(club)

      const ctx = await browser.newContext()
      await signIn(ctx, member.session)
      const page = await ctx.newPage()
      await page.goto(`/g/${gametype}/${id}`)

      // The log panel itself is the ready signal — it is what the assertion
      // reads, and every event-log game renders it.
      const log = page.locator('[class*="eventLogBox"]').first()
      await expect(log).toBeVisible({ timeout: 25000 })
      const handles = page.locator('[data-history-handle]')
      await expect(handles).toHaveCount(0)

      await write(member)

      // Nothing in the browser asked for this row. If the subscription names the
      // wrong table, the handle never appears and the page sits there stale.
      await expect(handles).toHaveCount(1, { timeout: 15000 })

      await ctx.close()
    })
  }
})
