// cs-blessed-word-list

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

/** The KIND axis, as a closed set — three shipped values that never grow, so
 *  the compiler can read `kind === BONUS` rather than trusting a `string`. WHO
 *  gets no such type on purpose: it holds user ids, so it is genuinely open. */
type Kind = typeof LEGAL | typeof REQUIRED | typeof BONUS
const KINDS: readonly Kind[] = [LEGAL, REQUIRED, BONUS]

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
 *     WHO    All · Found · Missed · …every player by handle
 *
 * WHO's default is All mid-game and **Found** at the end once a missed row
 * exists, which is how these games hold the answer back a beat — see `doc.md`.
 * KIND always defaults to Legal.
 *
 * KIND always offers all three. WHO's option set is DERIVED, from the rows and
 * from the flags below, so a caller never has to decide what to offer: it adds
 * Found/Missed only once a missed row exists and the per-player entries only
 * where peers' words are visible. Players are named by
 * handle, yours included.
 *
 *     const f = useWordListFilter({ rows, players, myId, isCompete, isGameEnded })
 *     const shown = f.filter(rows)
 *
 * Why the axes are shaped this way, and why only one of them is gated, is in
 * `common/word-list/doc.md`.
 */
export function useWordListFilter({
  rows,
  players,
  myId,
  isCompete,
  isGameEnded,
}: {
  // The unfiltered rows — the option set is partly derived from what is IN them.
  rows: readonly WordListRow[]
  players: Member[]
  myId: string
  isCompete: boolean
  // Gates the per-player options in compete, where RLS hides peers until the end.
  isGameEnded: boolean
}): WordListFilter {
  const [kindChosen, setKindChosen] = useState<Kind | null>(null)
  const [whoChosen, setWhoChosen] = useState<string | null>(null)

  const ordered = orderSelfFirst(players, myId)

  // Found/Missed only mean something once BOTH kinds of row can exist. Derived
  // from the rows rather than from `isGameEnded` so a team that found everything
  // isn't offered a "Missed" that resolves to nothing.
  const hasMissed = rows.some((r) => r.kind === 'unfound')

  // Per-player options need the data to actually be visible. In coop every find
  // is everyone's to see from the start; in compete RLS scopes `found_words` to
  // you until the game ends, so offering peers mid-game would be a menu of
  // guaranteed-empty lists. A solo game has nobody to pick between.
  const arePlayersOffered = players.length > 1 && (!isCompete || isGameEnded)

  const whoOffered = [
    ALL,
    ...(hasMissed ? [FOUND, MISSED] : []),
    ...(arePlayersOffered ? ordered.map((p) => p.id) : []),
  ]

  // State holds only what the USER picked; the default is DERIVED every render.
  // Same reasoning as useEventLogPlayerPicker: the roster arrives asynchronously,
  // so a default frozen at mount would be computed against an empty player list —
  // and a selection that stops being offered (a player who left, or Missed before
  // the reveal lands) degrades to the default instead of filtering to nothing
  // forever.
  //
  // WHO's default is the one place the missed words are held back — they are
  // already in the rows at the end, and Found is what keeps the list off the
  // answer for a beat (see doc.md).
  //
  // Gated on `hasMissed` as well as `isGameEnded`, because Found is not offered
  // until a missed row exists — a default that is not in the option set would
  // filter to a list the player cannot get back from.
  const whoDefault = isGameEnded && hasMissed ? FOUND : ALL
  const kind: Kind = kindChosen ?? LEGAL
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
    // after the end). `finderIds` defaults to the attributed finder alone.
    return r.kind === 'found' && (r.finderIds ?? [r.userId]).includes(who)
  }

  return {
    picker: (
      // FilterSelect, not <select>: a native dropdown steals the keyboard from
      // the board and there's no event that reliably gives it back. See
      // FilterSelect's docstring.
      <div className={infoPanel.selectGroup}>
        <FilterSelect
          label="Which words to show"
          value={kind}
          // `FilterSelect` answers in `string`, so the closed set is narrowed
          // HERE rather than asserted: anything it hands back that is not an
          // kind stores null, which the derivation above reads as the default. A
          // cast would have promised what only this check proves.
          onChange={(v) => setKindChosen(KINDS.find((k) => k === v) ?? null)}
          options={[
            { value: LEGAL, label: 'Legal' },
            { value: REQUIRED, label: 'Required' },
            { value: BONUS, label: 'Bonus' },
          ]}
        />
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
            ...(arePlayersOffered
              ? ordered.map((p) => ({ value: p.id, label: p.username, dot: p.color }))
              : []),
          ]}
        />
      </div>
    ),
    filter: (rs) => rs.filter((r) => matchesKind(r) && matchesWho(r)),
    emptyText: emptyTextFor(kind, who, players, isGameEnded),
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
function emptyTextFor(kind: Kind, who: string, players: Member[], isGameEnded: boolean): string {
  const kindWord = kind === REQUIRED ? 'required' : kind === BONUS ? 'bonus' : ''
  // "yet" promises more is coming, which a finished game cannot keep.
  const yet = isGameEnded ? '' : ' yet'

  if (who === MISSED) return kindWord ? `No ${kindWord} words missed.` : 'Nothing missed.'
  // Reachable only at the end, where Found is the default.
  if (who === FOUND) return kindWord ? `No ${kindWord} words found.` : 'Nothing found.'
  if (who !== ALL) {
    const name = players.find((p) => p.id === who)?.username ?? 'that player'
    return kindWord ? `No ${kindWord} words from ${name}${yet}.` : `Nothing from ${name}${yet}.`
  }
  return kindWord ? `No ${kindWord} words${yet}.` : `No words${yet}.`
}
