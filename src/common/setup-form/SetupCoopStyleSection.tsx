// cs-blessed-setup-form

import { useEffect, type ReactNode } from 'react'
import { RadioRow } from '../fields/RadioRow'
import type { FormErrors } from '../forms/formState'
import { SelectField } from '../fields/SelectField'
import { SetupSection } from './SetupSection'
import type { Member } from '../members/member'

/**
 * The two ways a coop game can be paced: `'free-for-all'` (the default, anyone
 * acts whenever) or `'turns'` (one player at a time, in a rotation seeded at
 * create-time). Compete games never carry it — they either have their own turns
 * (scrabble) or are simultaneous by nature.
 */
export type CoopStyle = 'turns' | 'free-for-all'

/**
 * The two reserved setup keys the turn-order feature adds. A game's own Setup
 * type spreads these in (both optional — a setup blob that omits them reads as
 * free-for-all). Declared here, beside the field that writes them, so every
 * opting-in game shares one definition rather than re-declaring the pair.
 *
 * What each key means, and which survives into a club's saved default:
 * [docs/common-schema.md →
 * Turn-order](../../../docs/common-schema.md#turn-order--opt-in-turn-by-turn-for-coop-games).
 */
export type CoopTurnSetup = {
  coop_style?: CoopStyle
  first_turn_user_id?: string
}

type Props = {
  // What this section is about, under the summary.
  help?: ReactNode
  // The manifest mode of the sibling being set up. The field is coop-only — it
  // renders nothing for compete (which has no shared budget to collide on, and
  // where scrabble owns its own turns).
  mode: 'coop' | 'compete'
  // The SELECTED players, NOT the whole club roster — each game's setup form
  // filters `members` by the form's `player_user_ids`. The first-player picker
  // may only offer people who'll actually play, and re-seeds when the current
  // pick is unchecked.
  players: Member[]
  coopStyle: CoopStyle
  firstTurnUserId: string
  // Emits BOTH keys together so the parent can merge them into its setup in one
  // call. The props are camelCase (React) while the setup keys they map to are
  // snake_case (the DB vocabulary — see docs/naming.md), so each parent spells
  // the mapping out: `{ ...s, coop_style: coopStyle, … }`.
  onChange: (next: { coopStyle: CoopStyle; firstTurnUserId: string }) => void
  // The form's errors. This section draws TWO fields and reads the key for
  // each — they are separate setup keys, so a raise names one or the other.
  errors: FormErrors
}

/**
 * Shared coop-pacing setup field — the "Co-op" disclosure that lets
 * the creator switch a coop game from free-for-all to turn-by-turn
 * and pick who goes first. Dropped into every coop game that offers turns; the
 * component self-gates, so those forms render it unconditionally:
 *
 *   - **compete** → renders nothing (turns are a coop-only concept here).
 *   - **solo (1 selected player)** → renders nothing (a rotation of one
 *     is a no-op; the server's _require_turn always passes anyway).
 *
 * Follows SetupTimerSection's shape: a collapsed `<SetupSection>` whose
 * summary carries the live value ("Co-op: free-for-all",
 * "Co-op: turns (ada first)"), so the setting reads at a glance
 * without expanding. Inside, a "Co-op style" radio row and — only
 * when turns is chosen — a "First player" dropdown.
 *
 * First-player seeding is an effect that writes back to the parent — picking
 * players[0] whenever turns is on and the current choice isn't among the
 * selected players (initial empty, or the chosen player got unchecked).
 * codenamesduet's own SetupForm seeds its first clue-giver the same way. See
 * the comment on the effect for why a render-then-write is safe here.
 */
export function SetupCoopStyleSection({
  mode,
  players,
  coopStyle,
  firstTurnUserId,
  onChange,
  help,
  errors,
}: Props) {
  const isTurns = coopStyle === 'turns'
  // Coop-only, and pointless for a lone player — a one-person rotation.
  const active = mode === 'coop' && players.length > 1

  // Re-seed the first player to players[0] when turns is on and the current
  // pick isn't a selected player: the initial empty string, or a
  // previously-chosen player who's since been unchecked in the picker.
  //
  // This IS a render-then-write — a child computing a value for its parent
  // after render — and calling the parent's setter rather than a local one
  // does not change that. It is safe because it converges: the write makes
  // `stillSelected` true, so the next pass takes the early return and every
  // pass after it does nothing.
  //
  // The deps do not gate it. Every caller builds `players` inline
  // (`members.filter(…)`) and passes an inline `onChange`, so both identities
  // are new each render and the effect runs each render — cheaply, since it
  // no-ops. Memoizing both in the forms that mount this is what would change
  // that.
  useEffect(
    function seedFirstTurn() {
      if (!active || !isTurns) return
      const stillSelected = players.some((p) => p.user_id === firstTurnUserId)
      if (!stillSelected) {
        onChange({ coopStyle, firstTurnUserId: players[0].user_id })
      }
    },
    [active, isTurns, players, firstTurnUserId, coopStyle, onChange],
  )

  if (!active) return null

  const firstName = players.find((p) => p.user_id === firstTurnUserId)?.username
  const summaryValue = isTurns
    ? `turns${firstName ? ` (${firstName} first)` : ''}`
    : 'free-for-all'

  return (
    // Collapsed by default; the summary carries the current setting so
    // it's readable without opening (matches SetupTimerSection's disclosure).
    <SetupSection label={`Co-op: ${summaryValue}`} help={help}>
      <RadioRow
        // Named for the setup key, so a raise can reach it.
        name="coop_style"
        error={errors.coop_style}
        prefix="Co-op style"
        options={[
          { value: 'free-for-all', label: 'free-for-all' },
          { value: 'turns', label: 'turns' },
        ]}
        value={coopStyle}
        onChange={(next) => onChange({ coopStyle: next, firstTurnUserId })}
      />
      {isTurns && (
        // A dropdown (not a radio row): a game can have many players, and a
        // long radio row would sprawl — the count axis in <RadioRow>'s "which
        // control" note. The section's own column gaps it from the style
        // choice above; this component draws no layout of its own.
        <SelectField
          label="First player"
          name="first_turn_user_id"
          error={errors.first_turn_user_id}
          value={firstTurnUserId}
          onChange={(id) => onChange({ coopStyle, firstTurnUserId: id })}
        >
          {players.map((p) => (
            <option key={p.user_id} value={p.user_id}>
              {p.username}
            </option>
          ))}
        </SelectField>
      )}
    </SetupSection>
  )
}
