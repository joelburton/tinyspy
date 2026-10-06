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
 * Every event-log game's log reaches an open page LIVE — one test per game.
 *
 * A move writes the game's `events` row and rebuilds its `game_data`; the
 * `common.games` trigger sends the room one `changed` Broadcast, and the page
 * re-reads (src/common/realtime/doc.md). A builder that leaves the log out of
 * the blob, or a write that skips the rebuild, fails silently: no error, just a
 * game whose log stops filling. Nothing else in the suite would catch it,
 * because a unit test mocks the Supabase client and pgTAP never opens a
 * browser.
 *
 * **The row is written from OUTSIDE the browser**, through the game's own RPC
 * as the signed-in player. The page did nothing: it never submitted, so no local
 * state and no optimistic update can explain the row appearing.
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
            .rpc('request_hint', { p_game_id: game.id })
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
              p_game_id: game.id,
              p_tiles: ['ALPHA', 'ANGEL', 'APPLE', 'ARROW'],
              p_result: 'correct',
              p_matched_cat_rank: 0,
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
              p_game_id: game.id,
              p_word_shown: 'adgjbehk', // the fixture board's first solution word
              p_kind: 'hint',
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
            .rpc('reveal_next_hint', { p_game_id: game.id })
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
            .rpc('submit_path', { p_game_id: game.id, p_path: themeWord.coords })
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
            .rpc('submit_guess', { p_game_id: game.id, p_word: 'bar' })
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
      // the team rack to hand back.
      setScrabbleRack(game.id, ['a', 'b', 'c', 'd', 'e', 'f', 'g'])
      return {
        ...game,
        write: async (m) => {
          const client = asUser(m.session.access_token)
          // The move counter rides the page blob, as the page reads it.
          const page = await client.schema('common').from('games')
            .select('game_data').eq('id', game.id).single()
          if (page.error) throw new Error(`scrabble version: ${page.error.message}`)
          const res = await client.schema('scrabble').rpc('exchange_tiles', {
            p_game_id: game.id,
            p_base_version: (page.data as { game_data: { version: number } }).game_data.version,
            p_rack_tiles: ['a'],
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
