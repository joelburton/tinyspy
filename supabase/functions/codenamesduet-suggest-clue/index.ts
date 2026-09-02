// cs-unmet

/**
 * suggest-clue — Edge Function called from the BoardScreen's "Need a clue?"
 * button when the active clue-giver is stuck.
 *
 * Architecture:
 *   1. Verify the caller's JWT and pull the board context via the
 *      `get_clue_context` RPC. The RPC enforces "you are the current
 *      clue-giver in an active game" — if it rejects, we forward 403.
 *   2. Ask Claude for a clue with structured outputs (output_config.format),
 *      so the response arrives as schema-valid JSON. Dropping the forced tool
 *      lets us enable native adaptive thinking — the model deliberates in its
 *      own thinking channel, which we log but never send to the player.
 *   3. Answer `ok({ result: 'suggested', suggestion })`, which the FE fills
 *      into the existing clue inputs for the user to review + edit before
 *      submitting.
 *
 * Every answer is an ENVELOPE (docs/envelopes.md). Two are `service-error` —
 * PN319 the model declining, PN320 its reply cut off: it ran, it just produced
 * no clue, and the clue dialog shows the sentence. The rest are faults, so they
 * raise a modal and close the dialog: PN315 no game, PN317 a board with nothing
 * left to clue, PN318 no API key, PN321 and PN322 an answer we could not read.
 *
 * `get_clue_context`'s own refusals — not your turn, not a member, the game is
 * over — are RELAYED untouched. Nothing here knows the board better than the
 * raise that read it. The call goes through `runRpc`, so "the RPC never ran"
 * and "it answered something we cannot read" are its faults to name, not this
 * function's.
 *
 * Secrets:
 *   - ANTHROPIC_API_KEY  required; set via `supabase secrets set` in prod
 *                        or in `supabase/functions/.env` locally.
 *   - SUPABASE_URL       auto-injected by the Edge Runtime.
 *   - SUPABASE_ANON_KEY  auto-injected by the Edge Runtime; older runtime
 *                        builds use this name even after the publishable/
 *                        secret-key rename on the FE side, so we read it
 *                        directly here (no `PUBLISHABLE_KEY` fallback —
 *                        anon has been universal since day one).
 */

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'
import Anthropic from 'npm:@anthropic-ai/sdk@0.109.0'

type ClueContext = {
  /** Names the answer. One `ok` today; asserted here so a second one cannot be
   *  read as this one. */
  result: 'context'
  greens: string[]
  neutrals: string[]
  // ALL still-unrevealed assassins. A Duet key card has THREE, so this is an
  // array of the 0..3 not-yet-revealed ones (empty once all are revealed) —
  // every one of them is an instant-loss word the clue must avoid.
  assassins: string[]
  previous_clues: Array<{
    word: string
    count: number
    by_seat: 'A' | 'B'
    turn_number: number
  }>
}

type Suggestion = {
  clue: string
  count: number
  agents: string[]
  reasoning: string
}

import { edgeInternal, json, preflight } from '../_shared/http.ts'
import { fault, ok, serviceError } from '../_shared/envelope.ts'
import { runRpc } from '../_shared/dbResult.ts'

serve(async (req) => {
  const pre = preflight(req)
  if (pre) return pre

  try {
    const body = await req.json().catch(() => ({}))
    const gameId = body.gameId
    if (!gameId || typeof gameId !== 'string') {
      // The caller is a button on a live board, so it always has the id.
      return fault('PN315', 'BUG: a clue request with no game', `codenamesduet-suggest-clue: gameId=${JSON.stringify(gameId)}`)
    }

    const authHeader = req.headers.get('Authorization') ?? ''

    // Step 1: pull the board context as the calling user. The RPC enforces
    // membership + turn + status; if any fails we forward the message.
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    )
    // `.schema('codenamesduet')` is required — the RPC lives in that schema, and
    // supabase-js defaults to `public` (where it doesn't exist → a "function not
    // found" error that this handler would forward as a misleading 403). Matches
    // every sibling build-board function.
    const res = await runRpc<ClueContext>(
      supabase.schema('codenamesduet').rpc('get_clue_context', { target_game: gameId }),
      'get_clue_context',
    )
    // **The RPC's own refusals, relayed untouched** — not your turn, not a
    // member, the game is over. Forwarding beats re-wording: nothing here knows
    // the board better than the raise that read it. `runRpc` puts the two
    // failures that are not the RPC's own — it never ran, it answered something
    // unreadable — into this same branch, so one line covers all three.
    if (res.type === 'not-ok') return json(res)

    // The `ok` is UNWRAPPED rather than relayed, because the board it carries is
    // the first step of this function's work, not its answer.
    const ctx = res.data
    if (!ctx.greens || ctx.greens.length === 0) {
      // The FE grays the suggest button once every agent is revealed, so
      // reaching this means the button was live when it should not have been.
      return fault('PN317', 'BUG: a clue request for a board with every agent revealed', 'codenamesduet-suggest-clue: greens is empty')
    }

    // Step 2: ask Claude. Structured outputs (`output_config.format`) constrains
    // the reply to our JSON schema — the same typed-JSON guarantee the old
    // forced-tool call gave us, but without a tool. Dropping the forced tool is
    // what lets us turn on NATIVE adaptive thinking: the model deliberates in
    // real `thinking` blocks (logged below, never sent to the player) instead of
    // the discarded scratchpad field the tool schema used to carry.
    const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!apiKey) {
      // An operator's missing env var is still OUR bug — the same reading as
      // the unseeded-dictionary raises. Nothing a player did reaches this.
      return fault('PN318', 'BUG: the AI clue suggester is not configured', 'codenamesduet-suggest-clue: ANTHROPIC_API_KEY absent')
    }
    const anthropic = new Anthropic({ apiKey })

    const result = await anthropic.messages.create({
      model: 'claude-sonnet-5',
      // Headroom for native thinking + the short structured answer. Thinking
      // tokens count against this budget, and at `effort: 'high'` the
      // deliberation can run long — leave plenty so the final JSON is never
      // truncated (a max_tokens cut mid-JSON would break the schema). The answer
      // itself is tiny: a word, a count, a few agents, one or two sentences.
      max_tokens: 8192,
      // `summarized` keeps reasoning readable so we can still log it (see below);
      // the raw chain-of-thought is never returned by the model regardless.
      thinking: { type: 'adaptive', display: 'summarized' },
      output_config: {
        // Codenames clue-giving is a hard little reasoning task (connect agents,
        // dodge the assassin + neutrals, calibrate the count). It fires rarely
        // and a stuck player will happily wait a beat, so we spend on depth.
        effort: 'high',
        // Structured outputs: the model must emit JSON matching this schema —
        // the same typed-JSON guarantee the forced tool gave us, minus the tool.
        // `additionalProperties: false` is required on every object.
        format: {
          type: 'json_schema',
          schema: {
            type: 'object',
            properties: {
              clue: {
                type: 'string',
                description:
                  'A single word (preferred) or short phrase that hints at one or more agents. Must not contain or share a root with any of the 25 board words.',
              },
              count: {
                type: 'integer',
                description:
                  'How many agents this clue is meant to cover. Match the length of the agents array.',
              },
              agents: {
                type: 'array',
                items: { type: 'string' },
                description:
                  'The specific board words from the greens list that this clue targets.',
              },
              reasoning: {
                type: 'string',
                description:
                  'The FINAL, player-facing explanation ONLY — one or two clean sentences on how the chosen clue connects to the listed agents. Do NOT include alternatives you considered or any "wait/actually/let me reconsider" deliberation; that belongs in your private thinking. Write it as if the clue were obvious from the start.',
              },
            },
            required: ['clue', 'count', 'agents', 'reasoning'],
            additionalProperties: false,
          },
        },
      },
      messages: [{ role: 'user', content: buildPrompt(ctx) }],
    })

    // KEEP — never ask to delete this; Joel wanted it. Logs exactly what
    // Anthropic returned (full response — content blocks, stop_reason, usage) to
    // the `supabase functions serve` terminal, so the model's behavior is always
    // inspectable.
    console.log(
      '[suggest-clue] anthropic response:',
      JSON.stringify(result, null, 2),
    )

    // A safety decline (unlikely for a word game, but Sonnet 5 can return one)
    // or a truncated reply won't carry valid schema JSON — check stop_reason
    // before touching the content, and fail loudly rather than parse garbage.
    // Neither is our bug or the player's — a dependency behaving badly, which
    // is what `service-error` is for. Distinct codes and distinct sentences: a
    // decline and a truncation are different things to go and look at.
    if (result.stop_reason === 'refusal') {
      return serviceError('PN319', 'Claude declined to suggest a clue. Please try again.', 'codenamesduet-suggest-clue: stop_reason=refusal')
    }
    if (result.stop_reason === 'max_tokens') {
      return serviceError('PN320', "Claude's answer was cut off. Please try again.", 'codenamesduet-suggest-clue: stop_reason=max_tokens')
    }

    // Native thinking arrives as its own content blocks (summarized text). Log
    // the deliberation for inspectability — but it never leaves the server; the
    // player only ever sees the clean `reasoning` field.
    const thinking = result.content
      .filter((b) => b.type === 'thinking')
      .map((b) => (b as { thinking: string }).thinking)
      .join('\n')
    if (thinking) console.log('[suggest-clue] model thinking:', thinking)

    // Structured outputs deliver the schema-valid JSON as a text block — there's
    // no tool_use block to dig out anymore.
    // Two codes, one sentence — the same shape as PN319/PN320 above. A player
    // cannot act differently on "no text block" and "text that would not
    // parse", but they are different things to go and look at, and a code names
    // one raise.
    const textBlock = result.content.find((b) => b.type === 'text')
    if (!textBlock || textBlock.type !== 'text') {
      return fault('PN321', 'BUG: the AI answered in a shape we could not read', 'codenamesduet-suggest-clue: no text block')
    }
    let suggestion: Suggestion
    try {
      suggestion = JSON.parse(textBlock.text) as Suggestion
    } catch {
      return fault('PN322', 'BUG: the AI answered in a shape we could not read', `codenamesduet-suggest-clue: unparseable text block — ${textBlock.text.slice(0, 120)}`)
    }

    // Append the exact target agents as their own paragraph, so the player sees
    // which board words the clue is for (e.g. "Agents: BRAZIL, MARACAS"). Built
    // here rather than asked of the model: `agents` is already the ground truth,
    // so formatting it deterministically guarantees uppercase labels that always
    // match the clue. The blank line renders as a separate paragraph — CluePanel's
    // reasoning <p> uses `white-space: pre-line`.
    if (suggestion.agents?.length) {
      const agentsLine = `Agents: ${suggestion.agents
        .map((a) => a.toUpperCase())
        .join(', ')}`
      suggestion.reasoning = `${suggestion.reasoning}\n\n${agentsLine}`
    }

    console.log('[suggest-clue] parsed suggestion:', JSON.stringify(suggestion))
    return ok({ result: 'suggested', suggestion })
  } catch (e) {
    console.error('suggest-clue failed', e)
    return edgeInternal(e)
  }
})

/**
 * Builds the prompt sent to Claude. Kept here (not the RPC) because prompt
 * engineering iteration belongs in TypeScript, not plpgsql.
 */
function buildPrompt(ctx: ClueContext): string {
  const greens = ctx.greens.join(', ')
  const neutrals = ctx.neutrals.length > 0 ? ctx.neutrals.join(', ') : '(none)'
  // A Duet key card has THREE assassins; list every one that's still hidden.
  // Any of them, if guessed, loses the game instantly — so the clue must dodge
  // all of them, not just one.
  const assassins =
    ctx.assassins.length > 0 ? ctx.assassins.join(', ') : '(none still hidden)'

  const prevClues =
    ctx.previous_clues.length > 0
      ? ctx.previous_clues
          .map((c) => `  ${c.by_seat} (turn ${c.turn_number}): ${c.word} · ${c.count}`)
          .join('\n')
      : '  (none yet)'

  return `You are helping a player of Codenames Duet who is stuck. They are the clue-giver 
and need a single-word clue that points at one or more of their remaining agents.

YOUR PARTNER WILL GUESS BASED ON YOUR CLUE. Their job is to find agents you point at.

Your unrevealed AGENTS (you want them to find these): ${greens}
Your unrevealed NEUTRALS (do not hint at these — guessing one ends the turn): ${neutrals}
Your ASSASSINS (there are up to THREE — NEVER suggest a clue that could point at ANY of these; guessing even one loses the game instantly): ${assassins}

Clues already given this game (avoid repeating themes):
${prevClues}

Constraints on your clue:
- Pick a single word that connects 1–3 of your remaining agents.
- Higher counts are riskier; only go for 3 if the connection is very strong.
- The clue must not share a root with any of the 25 board words.
- Avoid clues that have ANY plausible connection to a neutral or to ANY of the assassins listed above.

Provide your suggested clue.`
}
