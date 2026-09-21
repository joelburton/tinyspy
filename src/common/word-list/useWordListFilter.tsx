// cs-audited-word-list

import { useState } from 'react'
import type { WordListRow } from './WordList'
import infoPanel from '../info-sheet/infoPanel.module.css'
import { orderSelfFirst } from '../members/memberList'
import { FilterSelect } from '../lists/FilterSelect'
import type { Member } from '../members/member'

/**
 * The KIND axis — which shipped list a word came from. `LEGAL` is the aggregate
 * (required ∪ bonus), which is the games' own word for it: boggle's setup
 * disclosure already reads "Dictionary (required) / Dictionary (legal)".
 *
 * Deliberately NOT called "All" even though that's what it means: the WHO axis
 * has an "All" too, and the two selects render bare and side by side, where two
 * dropdowns both reading "All" cannot be told apart at a glance.
 */
const LEGAL = 'legal'
const REQUIRED = 'required'
const BONUS = 'bonus'

/** The WHO axis's three aggregates. None is a user id, so they can't collide. */
const ALL = 'all'
const FOUND = 'found'
const MISSED = 'missed'

export type WordListFilter = {
  // Both `<select>`s as one group, for the word list's heading row.
  picker: React.ReactNode
  // Rows narrowed to both current selections.
  filter: (rows: readonly WordListRow[]) => WordListRow[]
  // The empty-state line, named for whichever axis emptied the list.
  emptyText: string
}

/**
 * The word list's two-axis filter: a KIND select and a WHO select, side by side,
 * plus the `filter` that applies both and the line to show when nothing matches.
 *
 *     KIND   Legal (default) · Required · Bonus
 *     WHO    All (default) · Found · Missed · …every player by handle
 *
 * Both option sets are DERIVED, from the rows and from the four flags below, so
 * a caller never has to decide what to offer: KIND is dropped whole without a
 * bonus list, and WHO adds Found/Missed only once a missed row exists and the
 * per-player entries only where peers' words are visible. Players are named by
 * handle, yours included.
 *
 *     const f = useWordListFilter({ rows, players, selfId, isCompete, isTerminal, hasBonus })
 *     const shown = f.filter(rows)
 *
 * Why the axes are shaped this way, and why only one of them is gated, is in
 * `common/word-list/doc.md`.
 */
export function useWordListFilter({
  rows,
  players,
  selfId,
  isCompete,
  isTerminal,
  hasBonus,
}: {
  // The unfiltered rows — the option set is partly derived from what is IN them.
  rows: readonly WordListRow[]
  players: Member[]
  selfId: string
  isCompete: boolean
  // Gates the per-player options in compete, where RLS hides peers until the end.
  isTerminal: boolean
  // Does this board have a bonus list at all? False drops the KIND select
  // entirely rather than offering a `Bonus` option that can never match.
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
  // Same reasoning as useEventLogPlayerPicker: the roster arrives asynchronously,
  // so a default frozen at mount would be computed against an empty player list —
  // and a selection that stops being offered (a player who left, or Missed before
  // the reveal lands) degrades to the default instead of filtering to nothing
  // forever.
  // WHO's default is the one place the missed words are held back. They fold
  // into the rows the moment the game ends, so a list opening on All would open
  // on the answer — you would read what you missed before you had read what you
  // got. Defaulting to Found gives that beat, and the answer stays one select
  // away rather than behind a second control: the WHO axis IS the reveal for
  // these games, which is why they carry no Reveal button.
  //
  // Gated on `hasMissed` as well as `isTerminal`, because Found is not offered
  // until a missed row exists — a default that is not in the option set would
  // filter to a list the player cannot get back from.
  const whoDefault = isTerminal && hasMissed ? FOUND : ALL
  const kind = kindChosen !== null && kindOffered.includes(kindChosen) ? kindChosen : LEGAL
  const who = whoChosen !== null && whoOffered.includes(whoChosen) ? whoChosen : whoDefault

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
      // FilterSelect, not <select>: a native dropdown steals the keyboard from
      // the board and there's no event that reliably gives it back. See
      // FilterSelect's docstring.
      <div className={infoPanel.selectGroup}>
        {/* KIND is dropped entirely when there's no bonus list to distinguish —
            a lone "Legal" option would be a dead control. */}
        {hasBonus && (
          <FilterSelect
            label="Which words to show"
            value={kind}
            onChange={setKindChosen}
            options={[
              { value: LEGAL, label: 'Legal' },
              { value: REQUIRED, label: 'Required' },
              { value: BONUS, label: 'Bonus' },
            ]}
          />
        )}
        <FilterSelect
          label="Whose words to show"
          value={who}
          onChange={setWhoChosen}
          options={[
            { value: ALL, label: 'All' },
            ...(hasMissed
              ? [
                  { value: FOUND, label: 'Found' },
                  { value: MISSED, label: 'Missed' },
                ]
              : []),
            // Players carry their identity disc; the fixed options above don't,
            // so FilterSelect indents them to match (see FilterOption.dot).
            ...(peopleVisible
              ? ordered.map((p) => ({ value: p.user_id, label: p.username, dot: p.color }))
              : []),
          ]}
        />
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
 * event log's picker: the options that would need one — Missed and the per-player
 * entries — simply aren't offered until their data is visible, so every empty this
 * has to explain is a genuine empty.
 */
function emptyTextFor(kind: string, who: string, players: Member[]): string {
  const kindWord = kind === REQUIRED ? 'required' : kind === BONUS ? 'bonus' : ''

  if (who === MISSED) return kindWord ? `No ${kindWord} words missed.` : 'Nothing missed.'
  // Reachable only at terminal, where Found is the default — and where "yet" of
  // the plain line below would be a lie, since nothing more is coming.
  if (who === FOUND) return kindWord ? `No ${kindWord} words found.` : 'Nothing found.'
  if (who !== ALL && who !== FOUND) {
    const name = players.find((p) => p.user_id === who)?.username ?? 'that player'
    return kindWord ? `No ${kindWord} words from ${name} yet.` : `Nothing from ${name} yet.`
  }
  return kindWord ? `No ${kindWord} words yet.` : 'No words yet'
}
