/**
 * boggle-build-board — Edge Function that rolls a MothCubes board meeting the
 * setup's constraints and creates the game in one round-trip.
 *
 * Why edge (not PL/pgSQL): board generation is a rejection-sampling loop over a
 * trie solver — far cleaner in TypeScript, and it reuses the exact solver the
 * rest of the game uses (`src/boggle/lib/`), kept honest by the C parity oracle
 * in `boggle-c-solver/`. The required dictionary ships bundled (see dict.ts).
 *
 * Flow:
 *   1. Verify inputs + the caller's Authorization header.
 *   2. Build the required trie for the chosen band (bundled, cached per isolate).
 *   3. The board — one of two ways:
 *      a. CUSTOM (`setup.custom_board` set): parse the player's tiles and solve
 *         them once. No rolling, so no constraints and no quality bar; it need
 *         only yield ≥1 required word (see the custom branch for why).
 *      b. ROLLED: generateBoard() — roll + solve + reject until constraints met
 *         (or fail). SYNCHRONOUS — the solver keeps mutable scratch across the
 *         loop, so we must not await between iterations. The trie build (await)
 *         is before it; the DB write (await) is after. Nothing awaits inside.
 *   4. boggle.create_game(...) over PostgREST, as the caller (the RPC is the
 *      authority on club membership + setup validation).
 *   5. Return { id }.
 *
 * Calling shape (FE):
 *   POST /functions/v1/boggle-build-board
 *   { target_club, mode, player_user_ids,
 *     setup: { timer, dice_set, band, legal_band, min_word_length, scoring_ladder,
 *              win_percent, constraints, custom_board? } }
 *   → { id }   ·   → { error: fe-error-key, code?: SQLSTATE } (400/401/422/500)
 *
 * Errors are fe-error-keys (`key|detail|` — docs/supabase.md → Server errors;
 * guarded by src/edgeFnErrorKeys.test.ts): the FE owns every player-facing
 * word. Two are player-reachable and carry ERROR_COPY: `no-board-fits|`
 * (unsatisfiable constraint pickers) and `no-required-words|<band>|` (a custom
 * board with nothing to find — SQL's key reused, as freebee does). The rest
 * (bad-method / bad-band / bad-request / bad-custom-board / edge-internal) are
 * "impossible without an FE bug" — no copy, they render as faults. A create_game
 * raise relays with its SQLSTATE.
 *
 * Secrets / env: SUPABASE_URL + SUPABASE_ANON_KEY (auto-injected). The caller's
 * JWT carries every authorization signal: common.words + the bundled dict are
 * public; boggle.create_game runs security-definer and re-checks membership.
 */

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { generateBoard, listBonusWords, type BoardConstraints } from '../../../src/boggle/lib/generate.ts'
import { DICE_BY_NAME } from '../../../src/boggle/lib/dice.ts'
import {
  LADDERS,
  listWords,
  parseBoard,
  type FoundWord,
  type LadderName,
} from '../../../src/boggle/lib/solver.ts'
import { parseCustomBoard } from '../../../src/boggle/lib/customBoard.ts'
import { requiredTrie, legalTrie } from './dict.ts'
import { edgeInternal, json, preflight } from '../_shared/http.ts'
import { parseBuildBoardRequest, invokeCreateGame } from '../_shared/startGame.ts'

interface BoggleSetup {
  dice_set?: string
  band?: number
  legal_band?: number
  min_word_length?: number
  scoring_ladder?: LadderName
  constraints?: BoardConstraints
  /** Optional custom board — the player's own tiles, written as the recap prints
   *  them ("ABQuD EFGH IJKL MNOP"). Set → we solve exactly this board instead of
   *  rolling one. Re-parsed here rather than trusted: the FE's Start gate runs
   *  the same function, but it's a fail-fast, not the authority. */
  custom_board?: string
  // timer etc. ride through to create_game, which validates them. `legal_band`
  // never affects board *acceptance* (constraints are judged on the required set
  // only) — it's used AFTER acceptance to enumerate the board's bonus words for
  // the FE to validate/score against.
}

serve(async (req: Request): Promise<Response> => {
  const pre = preflight(req)
  if (pre) return pre
  if (req.method !== 'POST') return json({ error: 'bad-method|' }, 405)

  try {
    const parsed = await parseBuildBoardRequest(req, 'boggle-build-board')
    if (parsed instanceof Response) return parsed
    const { targetClub, mode, playerUserIds, supabase } = parsed
    const setup = parsed.setup as BoggleSetup

    const set = DICE_BY_NAME[setup.dice_set ?? '4']
    if (!set) {
      console.log(`boggle-build-board reject: unknown dice_set ${setup.dice_set}`)
      return json({ error: 'bad-request|dice_set|' }, 400)
    }
    const band = setup.band ?? 3
    if (band < 1 || band > 6) return json({ error: `bad-band|${band}|` }, 400)
    // The bonus (legal) band — the difficulty ceiling for the extra words a player
    // may discover beyond the required set. Must be at least `band` (required
    // words are legal too) and at most 6. create_game re-validates.
    const legalBand = setup.legal_band ?? band
    if (legalBand < band || legalBand > 6) {
      return json({ error: `bad-band|${legalBand}|` }, 400)
    }
    // Validate the ladder here (the trust boundary): it comes from untyped JSON
    // and flows straight into the solver's scoring, which would crash on an
    // unknown key. create_game re-validates, but generation runs first.
    const ladder = setup.scoring_ladder ?? 'basic'
    if (!(ladder in LADDERS)) {
      console.log(`boggle-build-board reject: unknown scoring_ladder ${ladder}`)
      return json({ error: 'bad-request|scoring_ladder|' }, 400)
    }

    // ─── Generate the board (cached band trie + synchronous solve loop) ─────
    const trie = await requiredTrie(band)
    const constraints: BoardConstraints = {
      ...setup.constraints,
      minWordLength: setup.min_word_length ?? 3,
      ladder: ladder as LadderName,
    }
    // The board, one of two ways — both ending in the same shape: the raw face
    // string, its side length, and its solved required-word list.
    const customText = (setup.custom_board ?? '').trim()
    let board: { board: string; n: number; requiredWords: FoundWord[]; score: number }

    if (customText !== '') {
      // ─── Custom board: solve exactly the player's tiles ──────────────────
      // No rolling, so no constraints (nothing is being rejection-sampled) and
      // no quality bar — the player chose these tiles, so we build whatever
      // board they make. Re-parsed here rather than trusted: the dialog runs the
      // same function to gate Start, but that's a fail-fast, not the authority.
      const parsed = parseCustomBoard(customText, set.n)
      if (!parsed.ok) {
        // Impossible without an FE bug — the dialog blocks Start on this exact
        // check — so it's a fault, no copy. `parsed.error` is a player-facing
        // sentence, deliberately NOT relayed: the FE owns the wording, and the
        // detail slot exists for diagnostics.
        console.log(`boggle-build-board reject: custom board unreadable — ${parsed.error}`)
        return json({ error: 'bad-custom-board|' }, 400)
      }
      const requiredWords = listWords(trie, parseBoard(parsed.board), {
        minWordLength: constraints.minWordLength,
        ladder: constraints.ladder,
      })
      // The one custom-board rejection a player can actually reach, so it
      // reuses the key that carries ERROR_COPY ("No words for those letters" —
      // freebee's, for the same situation). It matters beyond emptiness: a
      // `win_percent` target is a share of the required-words SCORE, so a board
      // with none makes the threshold 0 and the first bonus word wins.
      if (requiredWords.length < 1) {
        console.log(`boggle-build-board reject: custom board has no words at band ${band}`)
        return json({ error: `no-required-words|${band}|` }, 422)
      }
      board = {
        board: parsed.board,
        n: set.n,
        requiredWords,
        score: requiredWords.reduce((total, w) => total + w.points, 0),
      }
      console.log(`custom board: ${parsed.board} → ${requiredWords.length} required words`)
    } else {
      // ─── Rolled board: reject-sample until the constraints are met ────────
      const seed = (Math.random() * 0x1_0000_0000) >>> 0 // server-chosen → reproducible, fresh each game
      // maxMs bounds the busy loop under the edge worker's CPU ceiling; an
      // unsatisfiable constraint returns null → 422 instead of killing the worker.
      const rolled = generateBoard(trie, set, constraints, seed, 200_000, 1000)
      // Player-reachable: the constraint pickers are the form's own input and
      // an unsatisfiable combination is a real answer. Carries ERROR_COPY
      // ("No board met those constraints — please relax them.").
      if (!rolled) return json({ error: 'no-board-fits|' }, 422)
      board = rolled
    }

    // ─── Enumerate the bonus set (post-acceptance, does NOT affect the board) ──
    // The full legal list = required ∪ bonus; the FE validates + scores guesses
    // against it locally. bonus = LEGAL-trie traceable words (difficulty-only, so
    // crude/slur/slang/non-american count) minus the required set. Note this is
    // usually non-empty EVEN WHEN legal_band == band: the required set is
    // clean-only, so the band's non-clean words are all bonus.
    const bonusWords = listBonusWords(await legalTrie(legalBand), board.board, board.requiredWords, {
      minWordLength: constraints.minWordLength,
      ladder: constraints.ladder,
    })

    // ─── Create the game as the caller ────────────────────────────────────
    return await invokeCreateGame(
      supabase,
      'boggle',
      {
        target_club: targetClub,
        setup,
        player_user_ids: playerUserIds,
        mode,
        board: {
          board: board.board,
          n: board.n,
          required_words: board.requiredWords,
          required_words_count: board.requiredWords.length,
          required_words_score: board.score,
          bonus_words: bonusWords,
        },
      },
      'boggle-build-board',
    )
  } catch (e) {
    console.error('boggle-build-board threw:', e)
    return edgeInternal(e)
  }
})
