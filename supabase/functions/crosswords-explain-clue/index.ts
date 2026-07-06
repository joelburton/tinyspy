/**
 * crosswords-explain-clue — Edge Function behind the "Explain cryptic clue"
 * game-menu item. Asks Claude to EXPLAIN (not solve) how a cryptic clue yields
 * its answer. Ported from crossplay's explain-clue endpoint + Anthropic prompt.
 *
 * The answer is the puzzle's shielded solution, so we never trust the FE for
 * it: the FE sends the active clue's cell coordinates (+ its text + the
 * enumeration it already knows), and the `reveal_solved_word` RPC hands back
 * the canonical answer ONLY IF the caller has already filled those cells in
 * correctly. So the feature can only explain a word you've already solved — the
 * answer is never a spoiler, and it's leak-safe in compete too. If the word
 * isn't solved yet, the RPC reports `solved = false` and we return 409.
 *
 * Modernized from crossplay's approach: instead of the `<scratchpad>` text
 * protocol, we use NATIVE adaptive thinking (like codenamesduet-suggest-clue) —
 * the model deliberates in its own thinking channel (logged, never shown), and
 * returns just the clean explanation.
 *
 * Secrets:
 *   - ANTHROPIC_API_KEY  required; `supabase secrets set` in prod or
 *                        `supabase/functions/.env` locally.
 *   - SUPABASE_URL / SUPABASE_ANON_KEY  auto-injected by the Edge Runtime.
 */

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'
import Anthropic from 'npm:@anthropic-ai/sdk@0.109.0'
import { json, preflight } from '../_shared/http.ts'

type Cell = { row: number; col: number }

serve(async (req) => {
  const pre = preflight(req)
  if (pre) return pre

  try {
    const body = await req.json().catch(() => ({}))
    const gameId = body.gameId
    const cells = body.cells as Cell[] | undefined
    const clueText = typeof body.clueText === 'string' ? body.clueText.trim() : ''
    const enumeration = typeof body.enumeration === 'string' ? body.enumeration : ''
    if (!gameId || typeof gameId !== 'string') {
      return json({ error: 'gameId (uuid string) required' }, 400)
    }
    if (!Array.isArray(cells) || cells.length === 0 || !clueText) {
      return json({ error: 'cells + clueText required' }, 400)
    }

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'authorization required' }, 401)

    // Pull the canonical answer + note as the caller. The RPC only returns the
    // answer if the caller has already solved these cells (else solved=false).
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    )
    const { data, error } = await supabase
      .schema('crosswords')
      .rpc('reveal_solved_word', { target_game: gameId, p_cells: cells })
      .single()
    if (error) return json({ error: error.message }, 403)

    const ctx = data as { answer: string | null; solved: boolean; note: string | null }
    if (!ctx.solved || !ctx.answer) {
      // The player hasn't correctly filled this word yet — nothing to explain
      // without spoiling it.
      return json({ reason: 'unsolved' }, 409)
    }

    const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!apiKey) {
      return json({ error: 'ANTHROPIC_API_KEY not configured for this Edge Function' }, 500)
    }
    const anthropic = new Anthropic({ apiKey })

    const result = await anthropic.messages.create({
      model: 'claude-sonnet-5',
      // Native thinking tokens count against max_tokens, so leave generous
      // headroom (8192, like codenamesduet-suggest-clue) — otherwise the
      // deliberation eats the whole budget and the final explanation never
      // gets emitted (stop_reason: max_tokens with a thinking block but no
      // text). Explaining a GIVEN answer is a lighter task than generating a
      // clue, so we cap effort at `medium` rather than the default `high`,
      // which was over-deliberating (and spiralling on hard cross-reference
      // clues whose referenced entry we don't send).
      max_tokens: 8192,
      thinking: { type: 'adaptive', display: 'summarized' },
      output_config: { effort: 'medium' },
      system: SYSTEM_PROMPT,
      messages: [
        { role: 'user', content: buildUserMessage(clueText, enumeration, ctx.answer, ctx.note) },
      ],
    })

    // KEEP — Joel's keep-logs prior (mirrors codenamesduet-suggest-clue). Logs
    // exactly what Anthropic returned to the `supabase functions serve` terminal.
    console.log('[explain-clue] anthropic response:', JSON.stringify(result, null, 2))

    if (result.stop_reason === 'refusal') {
      return json({ error: 'the model declined to explain this clue' }, 502)
    }
    if (result.stop_reason === 'max_tokens') {
      return json({ error: 'the model response was truncated; try again' }, 502)
    }

    // Native thinking arrives as its own blocks (summarized) — log it for
    // inspectability; it never leaves the server.
    const thinking = result.content
      .filter((b) => b.type === 'thinking')
      .map((b) => (b as { thinking: string }).thinking)
      .join('\n')
    if (thinking) console.log('[explain-clue] model thinking:', thinking)

    const textBlock = result.content.find((b) => b.type === 'text')
    if (!textBlock || textBlock.type !== 'text' || !textBlock.text.trim()) {
      return json({ error: 'the model returned no explanation' }, 502)
    }

    return json({ explanation: textBlock.text.trim() })
  } catch (e) {
    console.error('explain-clue failed', e)
    return json({ error: String(e instanceof Error ? e.message : e) }, 500)
  }
})

/** The live user message — mirrors crossplay's `buildUserMessage`. */
function buildUserMessage(
  clueText: string,
  enumeration: string,
  answer: string,
  note: string | null,
): string {
  const head = enumeration ? `Clue: ${clueText} ${enumeration}` : `Clue: ${clueText}`
  const noteLine = note && note.trim() ? `\nSetter's note: ${note.trim()}` : ''
  return `${head}\nAnswer: ${answer}${noteLine}\n\nExplain how this clue yields the answer.`
}

/**
 * The system prompt — ported from crossplay's, minus its `<scratchpad>` output
 * protocol (native adaptive thinking replaces it, so the model deliberates
 * privately and we ask only for the clean explanation).
 */
const SYSTEM_PROMPT = `You are a patient, expert cryptic crossword tutor. Your job is to EXPLAIN how a clue yields its answer — NOT to solve it. The correct answer is always given to you and is authoritative. Never dispute it, never re-derive a different answer; your task is to show, clearly and correctly, how the clue produces THAT answer.

## How cryptic clues work

Almost every cryptic clue has two parts that each independently point to the answer:
  1. DEFINITION — a straight (if sometimes whimsical) synonym or description of the answer. Almost always at the very start OR the very end of the clue, never the middle.
  2. WORDPLAY — a second, mechanical route to the same answer using letters/sounds/etc.

A good explanation identifies BOTH parts, names the wordplay MECHANISM, and points out the INDICATOR words that signal that mechanism. The two parts meeting at the same answer is the built-in proof you've parsed it correctly.

## Common wordplay mechanisms and their typical indicators

- ANAGRAM — letters rearranged. Indicators: "confused", "broken", "strange", "wild", "drunk", "cooked", "out", "mixed", "novel", etc. The letters to anagram (the "fodder") must be present literally in the clue and must match the answer's length exactly.
- HIDDEN — answer sits inside consecutive letters of the clue. Indicators: "in", "within", "part of", "some", "held by", "hiding".
- REVERSAL — letters read backward. Indicators: "back", "returning", "up" (in a down clue), "reflected", "recalled".
- HOMOPHONE — sounds like another word. Indicators: "we hear", "reportedly", "said", "on the radio", "aloud".
- CHARADE — answer built from pieces joined in sequence (e.g. abbreviation + word). Often no explicit indicator; signalled by juxtaposition.
- CONTAINER / INSERTION — one string placed inside/around another. Indicators: "in", "around", "holding", "swallowing", "without", "outside".
- DELETION — letters removed. Indicators: "headless", "endless", "almost", "curtailed", "heartless", "shortly".
- DOUBLE DEFINITION — two straight definitions side by side, no mechanical wordplay.
- &LIT ("and literally so") — the ENTIRE clue is simultaneously the definition AND the wordplay. Rare and elegant; flag it when you see it.

Cryptic clues also lean on conventions: common abbreviations (N/S/E/W, L/R, C=100, "sailor"=AB/TAR, "about"=RE/CA), Roman numerals, chemical symbols, and assorted general knowledge. Name the convention explicitly when the wordplay uses one — readers learn from that.

## Reading setter's notes

You may be given the setter's own note for the puzzle. Notes are strong evidence — explain CONSISTENTLY with it where it applies to this clue. But notes can be terse, cover other clues, or occasionally be wrong. If a note plainly contradicts the given answer or the clue, trust the answer and the clue, and explain the most coherent parse you can. Never just parrot the note; expand it into clear prose.

## Deliberate carefully, then present cleanly

Work the parse out properly in your thinking: identify which end of the clue is the definition, test candidate wordplay mechanisms, and — crucially — VERIFY that the pieces actually build the given answer letter-for-letter. It is fine to try a parse, reject it, and try another. Do not rush. Your final answer must be clean and self-contained — no visible backtracking or "wait, no".

## Output format

Respond in exactly this structure, in plain prose (no preamble, and NOT as JSON):

  **Definition:** quote the word(s) that define the answer, and give the plain meaning.
  **Wordplay:** name the mechanism, then walk through how the clue's words build the answer, step by step. Show the actual letters/pieces.
  **Indicators:** quote the word(s) signalling the mechanism (omit this line for double definitions, which have no indicator).

Keep it tight — a few sentences per part. Use **bold** only for those three labels. If, after working it through, a clue is genuinely ambiguous or you're not certain of the exact parse, say so plainly ("The likely parse is…") rather than asserting a shaky derivation with false confidence. A tentative, honest reading is better than a confident wrong one.`
