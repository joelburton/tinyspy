import { useState } from 'react'
import type { WordListRow } from '../../components/game/lists/WordList'
import infoPanel from '../../components/game/infoPanel.module.css'
import { orderSelfFirst } from '../../lib/game/peers'
import type { Member } from '../../lib/games'

/**
 * The KIND axis — which shipped list a word came from. `LEGAL` is the aggregate
 * (required ∪ bonus), which is the games' own word for it: boggle's setup
 * disclosure already reads "Dictionary (required) / Dictionary (legal)".
 *
 * Deliberately NOT called "All" even though that's what it means, because the WHO
 * axis has an "All" too and the two selects render bare, side by side, with no
 * visible labels. Two adjacent dropdowns both reading "All" can't be told apart at
 * a glance; "Legal · All" can.
 */
const LEGAL = 'legal'
const REQUIRED = 'required'
const BONUS = 'bonus'

/** The WHO axis's three aggregates. None is a user id, so they can't collide. */
const ALL = 'all'
const FOUND = 'found'
const MISSED = 'missed'

export type WordListFilter = {
  /** Both `<select>`s as one group, for the word list's heading row. */
  picker: React.ReactNode
  /** Rows narrowed to both current selections. */
  filter: (rows: readonly WordListRow[]) => WordListRow[]
  /**
   * The empty-state line, which has to name WHICH axis emptied the list — "No
   * words yet" is a lie when you've picked Bonus and simply have none.
   */
  emptyText: string
}

/**
 * The word list's **two-axis filter**: a KIND select and a WHO select, side by
 * side in the list's heading row.
 *
 *     KIND   Legal (default) · Required · Bonus
 *     WHO    All (default) · Found · Missed · …every player by handle
 *
 * **Why two controls and not one flat list.** They answer independent questions,
 * so a single select can't express "leah's bonus words" — and worse, picking
 * `Bonus` would silently discard a `leah` selection with nothing on screen saying
 * it had. Two controls make the whole state readable at rest: "Legal · All".
 *
 * **Why WHO is one axis and not two.** `Missed` looks like it belongs on a
 * separate found-vs-missed axis alongside a person, but it doesn't: a missed word
 * has no finder, so `Missed × leah` is a contradiction and `All × leah` is just
 * `Found × leah` again. "Everyone / somebody / nobody / this person" is one proper
 * enumeration — mutually exclusive, jointly exhaustive — so it stays one select.
 *
 * **Which axis needs gating.** KIND is always live: it narrows whatever rows you
 * can already see, which is correct mid-game in compete too (RLS has scoped them
 * to you, and "just my bonus words" is a fine question). WHO carries all the
 * honesty rules instead — see the option-set derivation below.
 *
 * Vocabulary note: players are named by **handle, including you**, matching the
 * turn log's picker (settled 2026-08-02) — a list of handles is one list, where
 * labelling yourself "You" makes your own entry read as a different kind of thing.
 *
 *     const f = useWordListFilter({ rows, players, selfId, isCompete, isTerminal, hasBonus })
 *     const shown = f.filter(rows)
 */
export function useWordListFilter({
  rows,
  players,
  selfId,
  isCompete,
  isTerminal,
  hasBonus,
}: {
  /** The unfiltered rows — the option set is partly derived from what's IN them. */
  rows: readonly WordListRow[]
  players: Member[]
  selfId: string
  isCompete: boolean
  /** Gates the per-player options in compete, where RLS hides peers until the end. */
  isTerminal: boolean
  /**
   * Does this board have a bonus list at all? boggle can be set up with the legal
   * band equal to the required band, which leaves bonus meaning only "words the
   * clean filter removed" — a distinction that game already suppresses in its
   * stats. False drops the KIND select entirely rather than offering a `Bonus`
   * option that can never match.
   */
  hasBonus: boolean
}): WordListFilter {
  const [kindChosen, setKindChosen] = useState<string | null>(null)
  const [whoChosen, setWhoChosen] = useState<string | null>(null)

  const ordered = orderSelfFirst(players, selfId)

  // Found/Missed only mean something once BOTH kinds of row can exist. Derived
  // from the rows rather than from `isTerminal` so a team that found everything
  // isn't offered a "Missed" that resolves to nothing.
  const hasMissed = rows.some((r) => r.kind === 'unfound')

  // Per-player options need the data to actually be visible. In coop every find
  // is everyone's to see from the start; in compete RLS scopes `found_words` to
  // you until the game ends, so offering peers mid-game would be a menu of
  // guaranteed-empty lists. A solo game has nobody to pick between.
  const peopleVisible = players.length > 1 && (!isCompete || isTerminal)

  const kindOffered = hasBonus ? [LEGAL, REQUIRED, BONUS] : [LEGAL]
  const whoOffered = [
    ALL,
    ...(hasMissed ? [FOUND, MISSED] : []),
    ...(peopleVisible ? ordered.map((p) => p.user_id) : []),
  ]

  // State holds only what the USER picked; the default is DERIVED every render.
  // Same reasoning as useTurnLogPlayerPicker: the roster arrives asynchronously,
  // so a default frozen at mount would be computed against an empty player list —
  // and a selection that stops being offered (a player who left, or Missed before
  // the reveal lands) degrades to the default instead of filtering to nothing
  // forever.
  const kind = kindChosen !== null && kindOffered.includes(kindChosen) ? kindChosen : LEGAL
  const who = whoChosen !== null && whoOffered.includes(whoChosen) ? whoChosen : ALL

  function matchesKind(r: WordListRow): boolean {
    if (kind === LEGAL) return true
    return kind === BONUS ? !!r.isBonus : !r.isBonus
  }

  function matchesWho(r: WordListRow): boolean {
    if (who === ALL) return true
    if (who === FOUND) return r.kind === 'found'
    if (who === MISSED) return r.kind === 'unfound'
    // A named player: match against EVERY finder, not just the attributed one, or
    // filtering to yourself hides a word someone else found first (compete
    // post-terminal). `finderIds` defaults to the attributed finder alone.
    return r.kind === 'found' && (r.finderIds ?? [r.userId]).includes(who)
  }

  return {
    picker: (
      <div className={infoPanel.selectGroup}>
        {/* KIND is dropped entirely when there's no bonus list to distinguish —
            a lone "Legal" option would be a dead control. */}
        {hasBonus && (
          <select
            className={infoPanel.select}
            aria-label="Which words to show"
            value={kind}
            onChange={(e) => setKindChosen(e.target.value)}
          >
            <option value={LEGAL}>Legal</option>
            <option value={REQUIRED}>Required</option>
            <option value={BONUS}>Bonus</option>
          </select>
        )}
        <select
          className={infoPanel.select}
          aria-label="Whose words to show"
          value={who}
          onChange={(e) => setWhoChosen(e.target.value)}
        >
          <option value={ALL}>All</option>
          {hasMissed && <option value={FOUND}>Found</option>}
          {hasMissed && <option value={MISSED}>Missed</option>}
          {peopleVisible &&
            ordered.map((p) => (
              <option key={p.user_id} value={p.user_id}>
                {p.username}
              </option>
            ))}
        </select>
      </div>
    ),
    filter: (rs) => rs.filter((r) => matchesKind(r) && matchesWho(r)),
    emptyText: emptyTextFor(kind, who, players),
  }
}

/**
 * The empty line, named by whichever axis emptied the list. With both axes at
 * their defaults an empty list really is "nothing here yet"; once you've narrowed,
 * saying that would read as "the game has no words" rather than "your filter
 * matched none".
 *
 * There's no "hidden until the game ends" case to word carefully here, unlike the
 * turn log's picker: the options that would need one — Missed and the per-player
 * entries — simply aren't offered until their data is visible, so every empty this
 * has to explain is a genuine empty.
 */
function emptyTextFor(kind: string, who: string, players: Member[]): string {
  const kindWord = kind === REQUIRED ? 'required' : kind === BONUS ? 'bonus' : ''

  if (who === MISSED) return kindWord ? `No ${kindWord} words missed.` : 'Nothing missed.'
  if (who !== ALL && who !== FOUND) {
    const name = players.find((p) => p.user_id === who)?.username ?? 'that player'
    return kindWord ? `No ${kindWord} words from ${name} yet.` : `Nothing from ${name} yet.`
  }
  return kindWord ? `No ${kindWord} words yet.` : 'No words yet'
}
