import { useEffect } from 'react'
import { RadioRow } from './RadioRow'
import { SetupSection } from '../setup/SetupSection'
import type { Member } from '../../lib/games'

/**
 * The two ways a coop game can be paced. `'free-for-all'` (the
 * default) is the historical behaviour — anyone acts whenever.
 * `'turns'` opts into the common turn-order primitive (one player
 * at a time, in a rotation seeded at create-time). Stored on
 * `common.games.setup.coopStyle`, so the value doubles as the
 * server-side opt-in flag (see each game's create_game). Compete
 * games never carry it — they either have their own turns
 * (scrabble) or are simultaneous by nature.
 */
export type CoopStyle = 'turns' | 'free-for-all'

/**
 * The two reserved setup keys the turn-order feature adds. A game's
 * own Setup type spreads these in (both optional — an older/other
 * setup blob simply omits them, reading as free-for-all). Kept here,
 * next to the field that writes them, so all six opting-in games
 * share one definition rather than re-declaring the pair.
 */
export type CoopTurnSetup = {
  coopStyle?: CoopStyle
  firstTurnUserId?: string
}

type Props = {
  /** The manifest mode of the sibling being set up. The field is
   *  coop-only — it renders nothing for compete (which has no shared
   *  budget to collide on, and where scrabble owns its own turns). */
  mode: 'coop' | 'compete'
  /** The SELECTED players (SetupBodyProps.players), NOT the whole club
   *  roster — the first-player picker may only offer people who'll
   *  actually play, and re-seeds when the current pick is unchecked. */
  players: Member[]
  coopStyle: CoopStyle
  firstTurnUserId: string
  /** Emits BOTH keys together so the parent can merge them into its
   *  setup in one `onChange({ ...s, coopStyle, firstTurnUserId })`. */
  onChange: (next: { coopStyle: CoopStyle; firstTurnUserId: string }) => void
}

/**
 * Shared coop-pacing setup field — the "Co-op" disclosure that lets
 * the creator switch a coop game from free-for-all to turn-by-turn
 * and pick who goes first. Dropped into all six turn-order games'
 * SetupForms (psychicnum, wordle, connections, waffle, wordiply,
 * scrabble-coop); the component self-gates so those forms render it
 * unconditionally:
 *
 *   - **compete** → renders nothing (turns are a coop-only concept here).
 *   - **solo (1 selected player)** → renders nothing (a rotation of one
 *     is a no-op; the server's _require_turn always passes anyway).
 *
 * Follows TimerField's shape: a collapsed `<SetupSection>` whose
 * summary carries the live value ("Co-op: free-for-all",
 * "Co-op: turns (ada first)"), so the setting reads at a glance
 * without expanding. Inside, two labelled radio rows — "Co-op style"
 * and (only when turns is chosen) "First player".
 *
 * First-player seeding mirrors codenamesduet's SetupForm: an effect
 * calls the parent-owned `onChange` (NOT a local setState — that would
 * trip the repo's no-setState-in-effects rule) to pick players[0]
 * whenever turns is on and the current choice isn't among the selected
 * players (initial empty, or the chosen player got unchecked).
 */
export function CoopStyleField({
  mode,
  players,
  coopStyle,
  firstTurnUserId,
  onChange,
}: Props) {
  const isTurns = coopStyle === 'turns'
  // Coop-only, and pointless for a lone player — a one-person rotation.
  const active = mode === 'coop' && players.length > 1

  // Re-seed the first player to players[0] when turns is on and the
  // current pick isn't a selected player: the initial empty string, or
  // a previously-chosen player who's since been unchecked in the picker.
  // Parent-owned onChange, so this is not a setState-in-effect.
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
    // it's readable without opening (matches TimerField's disclosure).
    <SetupSection label={`Co-op: ${summaryValue}`}>
      <RadioRow
        name="coopStyle"
        prefix="Co-op style"
        options={[
          { value: 'free-for-all', label: 'free-for-all' },
          { value: 'turns', label: 'turns' },
        ]}
        value={coopStyle}
        onChange={(next) => onChange({ coopStyle: next, firstTurnUserId })}
      />
      {isTurns && (
        <RadioRow
          name="firstTurn"
          prefix="First player"
          options={players.map((p) => ({ value: p.user_id, label: p.username }))}
          value={firstTurnUserId}
          onChange={(id) => onChange({ coopStyle, firstTurnUserId: id })}
        />
      )}
    </SetupSection>
  )
}
