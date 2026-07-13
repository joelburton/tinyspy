import { Dot } from '../text/Dot'
import type { Member } from '../../lib/games'
import shared from './PlayArea.module.css'

type Props = {
  /** The common turn pointer (commonGame.current_turn_user_id). In a
   *  turn game it's always set; the terminal branch is handled below. */
  currentTurnUserId: string | null
  /** The game's players, to resolve the current player's name + color. */
  players: Member[]
  /** The viewer's user id — decides "Your turn" vs "Waiting for …". */
  selfId: string
  /** At terminal the line goes inert (no "waiting for …" nag) but KEEPS
   *  its height, so the play→terminal transition doesn't reflow the
   *  column below it (the repo's no-reflow rule). */
  isTerminal: boolean
}

/**
 * The whose-turn line for turn-order coop games — "Your turn" when it's
 * yours, "Waiting for ● Name…" when it's a teammate's. Extracted from
 * scrabble compete's InfoCol state line (the literal template) so all
 * six opting-in games render an identical indicator.
 *
 * Rendered by an InfoCol ONLY for a turn game (setup.coopStyle ===
 * 'turns'). Whether a game is turn-ordered is fixed at create-time, so
 * this line's presence never changes mid-game — no reflow from it
 * appearing/disappearing. Within a turn game it renders in EVERY state
 * (including terminal, as an inert height-holder), so the slot is
 * stable there too.
 *
 * It reuses the shared `.infoState` type register (same size/color as
 * each game's own state line) but is a SEPARATE line — it sits
 * alongside, never replacing, the per-game state text.
 */
export function TurnStatusLine({
  currentTurnUserId,
  players,
  selfId,
  isTerminal,
}: Props) {
  // Terminal: hold the line's height with a non-breaking space rather
  // than nagging about whose turn it "is" in a finished game.
  if (isTerminal) {
    return <p className={shared.infoState}>{' '}</p>
  }

  if (currentTurnUserId === selfId) {
    return (
      <p className={shared.infoState}>
        <strong>Your turn</strong>
      </p>
    )
  }

  // A teammate's turn. Leading color disc + the bare name (never the
  // possessive "name's turn" — we don't apostrophize usernames), an
  // ellipsis for the wait. `current` is defensively optional: the
  // pointer should always name a player, but a departed member falls
  // back to a neutral disc + "someone".
  const current = players.find((p) => p.user_id === currentTurnUserId)
  return (
    <p className={shared.infoState}>
      Waiting for <Dot color={current?.color} /> {current?.username ?? 'someone'}…
    </p>
  )
}
