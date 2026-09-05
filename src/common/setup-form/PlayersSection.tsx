// cs-unmet

import { Dot } from '../members/Dot'
import { PlayersField } from '../fields/PlayersField'
import { SetupSection } from './SetupSection'
import type { Member } from '../members/member'
import styles from './PlayersSection.module.css'

type Props = {
  /** The club roster, in the order it should be listed. */
  members: Member[]
  /** The creating user, whose row is locked on. */
  selfId: string
  /** Who is checked right now — the form's `player_user_ids`. */
  value: Set<string>
  onChange: (next: Set<string>) => void
  /** The manifest's `[min, max]`, which decides the count complaint. */
  numberOfPlayers: [number, number]
  /** The form's entry for this field, when there is one. It WINS over the
   *  count check below: the server saw the real roster, and this component
   *  only counted. */
  error?: string
  disabled?: boolean
}

/**
 * WHO IS PLAYING — the players picker as a setup section, rendered by each
 * game's setup form the way `<SetupTimerSection>` is.
 *
 * **In the form, not around it.** It sat in `<SetupGameModal>` while the setup
 * bodies were handed a `setup` object the picker was not part of. Now the form
 * holds one values object and `player_user_ids` is a field in it, so the picker
 * belongs where the other fields are — and every setup body reads the same,
 * rather than one section arriving from the dialog and the rest from the game.
 *
 * A section rather than sixteen copies of its markup: the summary, the
 * `defaultOpen`, and the count complaint are the same everywhere, and only the
 * bounds differ.
 *
 * **Open to start**, unlike every other section. Who is playing changes what
 * the rest of the form can offer — the turn-order picker lists only the checked
 * players — so it cannot be a thing you discover by expanding.
 *
 * **Its summary is the players themselves.** Every other section's summary
 * carries its live value ("Timer: none"); this one's value is WHO, and a row of
 * colored dots says that faster than a list of names would.
 */
export function PlayersSection({
  members,
  selfId,
  value,
  onChange,
  numberOfPlayers,
  error,
  disabled,
}: Props) {
  // A solo club has nothing to choose, and a picker with one locked row is
  // worse than no picker.
  if (members.length <= 1) return null

  const [minPlayers, maxPlayers] = numberOfPlayers
  // The count complaint, which is also what keeps Start disabled. The server
  // re-checks in create_game — this is the answer before the round trip.
  const countComplaint =
    value.size < minPlayers
      ? `Pick at least ${minPlayers} player${minPlayers === 1 ? '' : 's'}.`
      : value.size > maxPlayers
        ? `At most ${maxPlayers} players.`
        : null

  return (
    <SetupSection
      defaultOpen
      label={
        <>
          <span>Players: &nbsp;</span>
          <span className={styles.playerDots}>
            {members
              .filter((m) => value.has(m.user_id))
              .map((m) => (
                <Dot key={m.user_id} color={m.color} className={styles.playerDot} />
              ))}
          </span>
        </>
      }
    >
      <PlayersField
        name="player_user_ids"
        members={members}
        selfId={selfId}
        value={value}
        onChange={onChange}
        disabled={disabled}
        error={error ?? countComplaint}
      />
    </SetupSection>
  )
}
