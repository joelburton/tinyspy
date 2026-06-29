/**
 * suggest-clue — Edge Function called from the BoardScreen's "Need a clue?"
 * button when the active clue-giver is stuck.
 *
 * Architecture:
 *   1. Verify the caller's JWT and pull the board context via the
 *      `get_clue_context` RPC. The RPC enforces "you are the current
 *      clue-giver in an active game" — if it rejects, we forward 403.
 *   2. Ask Claude for a clue using a tool-use schema, so the response
 *      arrives as structured JSON instead of having to parse text.
 *   3. Return `{ suggestion: { clue, count, agents, reasoning } }` to
 *      the FE, which fills it into the existing clue inputs for the
 *      user to review + edit before submitting.
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
import Anthropic from 'npm:@anthropic-ai/sdk@0.65.0'

type ClueContext = {
  greens: string[]
  neutrals: string[]
  assassin: string | null
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

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, x-client-info, apikey',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const body = await req.json().catch(() => ({}))
    const gameId = body.gameId
    if (!gameId || typeof gameId !== 'string') {
      return json({ error: 'gameId (uuid string) required' }, 400)
    }

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'authorization required' }, 401)

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
    const { data, error } = await supabase
      .schema('codenamesduet')
      .rpc('get_clue_context', { target_game: gameId })
    if (error) return json({ error: error.message }, 403)

    const ctx = data as ClueContext
    if (!ctx.greens || ctx.greens.length === 0) {
      return json({ error: 'no unrevealed agents to suggest a clue for' }, 400)
    }

    // Step 2: ask Claude. Tool use forces a typed JSON response — no need
    // to parse code-fenced markdown out of a plain text reply.
    const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!apiKey) {
      return json(
        { error: 'ANTHROPIC_API_KEY not configured for this Edge Function' },
        500,
      )
    }
    const anthropic = new Anthropic({ apiKey })

    const result = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      // Generous: the `thinking` scratchpad below lets the model deliberate at
      // length, and that output counts against this budget — 512 truncated the
      // tool call mid-JSON (stop_reason: max_tokens → empty input). The final
      // clue + reasoning are short; the headroom is for the thinking.
      max_tokens: 4096,
      tools: [
        {
          name: 'submit_suggestion',
          description:
            'Return your suggested clue for the stuck Codenames Duet player.',
          input_schema: {
            type: 'object',
            properties: {
              // First on purpose: the model fills fields roughly in order, so a
              // scratchpad up front lets it deliberate BEFORE committing to a
              // clue (with tool_choice forcing the call, it otherwise crams its
              // chain-of-thought into `reasoning`). This field is discarded.
              thinking: {
                type: 'string',
                description:
                  'Your private scratchpad. Reason through candidate clues here — weigh options, reconsider, change your mind freely. This is DISCARDED and never shown to the player, so put ALL of your deliberation here, not in `reasoning`.',
              },
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
                  'The FINAL, player-facing explanation ONLY — one or two clean sentences on how the chosen clue connects to the listed agents. Do NOT include alternatives you considered, "wait/actually/let me reconsider", or any deliberation; that all goes in `thinking`. Write it as if the clue were obvious from the start.',
              },
            },
            required: ['thinking', 'clue', 'count', 'agents', 'reasoning'],
          },
        },
      ],
      tool_choice: { type: 'tool', name: 'submit_suggestion' },
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

    const block = result.content.find((b) => b.type === 'tool_use')
    if (!block || block.type !== 'tool_use') {
      return json({ error: 'model did not return a structured suggestion' }, 502)
    }
    // The tool input carries the `thinking` scratchpad too — log it (so the
    // deliberation is visible in the terminal) but DROP it from what we send the
    // client; the player only gets the clean `reasoning`.
    const raw = block.input as Suggestion & { thinking?: string }
    console.log('[suggest-clue] model thinking:', raw.thinking)
    const suggestion: Suggestion = {
      clue: raw.clue,
      count: raw.count,
      agents: raw.agents,
      reasoning: raw.reasoning,
    }
    console.log('[suggest-clue] parsed suggestion:', JSON.stringify(suggestion))
    return json({ suggestion })
  } catch (e) {
    console.error('suggest-clue failed', e)
    return json({ error: String(e instanceof Error ? e.message : e) }, 500)
  }
})

/**
 * Builds the prompt sent to Claude. Kept here (not the RPC) because prompt
 * engineering iteration belongs in TypeScript, not plpgsql.
 */
function buildPrompt(ctx: ClueContext): string {
  const greens = ctx.greens.join(', ')
  const neutrals = ctx.neutrals.length > 0 ? ctx.neutrals.join(', ') : '(none)'
  const assassin = ctx.assassin ?? '(already revealed)'

  const prevClues =
    ctx.previous_clues.length > 0
      ? ctx.previous_clues
          .map((c) => `  ${c.by_seat} (turn ${c.turn_number}): ${c.word} · ${c.count}`)
          .join('\n')
      : '  (none yet)'

  return `You are helping a player of Codenames Duet who is stuck. They are the clue-giver and need a single-word clue that points at one or more of their remaining agents.

YOUR PARTNER WILL GUESS BASED ON YOUR CLUE. Their job is to find agents you point at.

Your unrevealed AGENTS (you want them to find these): ${greens}
Your unrevealed NEUTRALS (do not hint at these — guessing one ends the turn): ${neutrals}
Your ASSASSIN (NEVER suggest a clue that could point here — they'll lose): ${assassin}

Clues already given this game (avoid repeating themes):
${prevClues}

Constraints on your clue:
- Pick a single word that connects 1–3 of your remaining agents.
- Higher counts are riskier; only go for 3 if the connection is very strong.
- The clue must not share a root with any of the 25 board words.
- Avoid clues that have ANY plausible connection to a neutral or the assassin.

Call the submit_suggestion tool with your answer.`
}
