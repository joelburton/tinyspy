import { useEffect, useState } from 'react'
import { CoopStyleField } from '../../common/components/fields/CoopStyleField'
import { DifficultyField } from '../../common/components/fields/DifficultyField'
import { SelectField } from '../../common/components/fields/SelectField'
import { TimerField } from '../../common/components/fields/TimerField'
import { SetupSection } from '../../common/components/setup/SetupSection'
import { difficultyValue } from '../../common/lib/game/difficulty'
import type { SetupBodyProps } from '../../common/lib/games'
import { db } from '../db'
import type { StrandsSetup } from '../lib/setup'
import form from '../../common/components/fields/setupForm.module.css'
import local from './SetupForm.module.css'

type PuzzleEntry = { id: string; puzzle_date: string; clue: string }

/**
 * strands' setup form.
 *
 *   - **Puzzle** — a date from the imported NYT archive. The picker resolves a
 *     date to the `puzzleId` the RPC wants; the archive's own min/max bound the
 *     input, so an empty date can't be chosen. The picked puzzle's CLUE shows
 *     under the input, because a date alone is not something anyone recognises
 *     a puzzle by — the clue is (it's the game's title, and it's on screen from
 *     the first second of play). Without it the easiest mistake in this dialog
 *     is starting one you've already played and finding out once the board is
 *     up. Reading it requires the column grant in supabase/sql/strands.sql,
 *     which lists exactly the four columns this component selects.
 *   - **Hint dictionary** — the band a word must reach to earn a hint point.
 *   - **Words per hint** / **Shortest word**.
 *
 * Plus the shared TimerField and CoopStyleField.
 */
export function SetupForm({ mode, players, value, onChange }: SetupBodyProps) {
  const s = value as StrandsSetup
  const [puzzles, setPuzzles] = useState<PuzzleEntry[]>([])

  // The archive is the only thing this form has to fetch. Ordering newest-first
  // means [0] is both the default pick and the max date.
  useEffect(() => {
    let mounted = true
    void (async () => {
      const { data } = await db
        .from('puzzles')
        .select('id, puzzle_date, clue')
        .order('puzzle_date', { ascending: false })
      if (!mounted) return
      setPuzzles((data ?? []) as PuzzleEntry[])
    })()
    return () => {
      mounted = false
    }
  }, [])

  // Default to the newest puzzle once the archive lands. Written as an effect
  // on the VALUE (not a useState initializer) because the list arrives
  // asynchronously — freezing a default at mount would pin it to '' forever,
  // which is the async-default trap the turn-log picker documents.
  useEffect(() => {
    if (!s.puzzleId && puzzles.length) onChange({ ...s, puzzleId: puzzles[0].id })
  }, [puzzles, s, onChange])

  const selected = puzzles.find((p) => p.id === s.puzzleId)
  const dates = puzzles.map((p) => p.puzzle_date)

  return (
    <div className={form.setup}>
      <CoopStyleField
        mode={mode}
        players={players}
        coopStyle={s.coop_style ?? 'free-for-all'}
        firstTurnUserId={s.first_turn_user_id ?? ''}
        onChange={({ coopStyle, firstTurnUserId }) =>
          onChange({ ...s, coop_style: coopStyle, first_turn_user_id: firstTurnUserId })
        }
      />

      <fieldset className={form.fieldset}>
        <legend>Puzzle</legend>
        <p className="muted">Which day's puzzle to play.</p>
        <input
          type="date"
          aria-label="Puzzle date"
          value={selected?.puzzle_date ?? ''}
          min={dates[dates.length - 1]}
          max={dates[0]}
          onChange={(e) => {
            const hit = puzzles.find((p) => p.puzzle_date === e.target.value)
            if (hit) onChange({ ...s, puzzleId: hit.id })
          }}
        />
        {/* The clue for the picked date — quoted, as everywhere else it appears
            (InfoCol, the mobile sticky pill): the words are the puzzle's, not
            ours. Full-strength text, not `muted`, because this is a real value
            you're meant to read and act on, unlike the helper line above it.

            The slot is RESERVED, not conditional: this renders as a non-
            breaking space before the archive lands rather than mounting once
            it does. Everything below — three sections and the timer — would
            otherwise jump down a line the moment the fetch resolved. */}
        <p className={local.clue} aria-live="off">
          {selected ? `“${selected.clue}”` : ' '}
        </p>
      </fieldset>

      <SetupSection label={`Hint dictionary: ${difficultyValue(s.band)}`}>
        {/* The direction is counter-intuitive and worth saying out loud: this is
            the OPPOSITE of waffle's tier, where a higher band is a harder
            board. Here a wider dictionary means more words qualify, so hints
            arrive sooner. */}
        <p className="muted">
          How obscure a word may be and still earn a hint. A wider dictionary makes the
          game <strong>easier</strong> — more words count, so hints come faster.
        </p>
        <DifficultyField
          label="Hint dictionary"
          // '3+' — strands' hint words have no fixed length (min_word_length is
          // its own knob), so the field samples from the general word list.
          length="3+"
          minDifficulty={1}
          maxDifficulty={6}
          value={s.band}
          onChange={(band) => onChange({ ...s, band })}
        />
      </SetupSection>

      <SetupSection label={`Words per hint: ${s.hint_cost}`}>
        <p className="muted">How many valid non-theme words buy one hint (3 is standard).</p>
        <SelectField
          label="Words per hint"
          value={String(s.hint_cost)}
          onChange={(v) => onChange({ ...s, hint_cost: Number(v) })}
        >
          {[1, 2, 3, 4, 5].map((n) => (
            <option key={n} value={n}>{n}</option>
          ))}
        </SelectField>
      </SetupSection>

      <SetupSection label={`Shortest word: ${s.min_word_length}`}>
        <p className="muted">
          The shortest word that can earn a hint. Theme words always count, however short.
        </p>
        <SelectField
          label="Shortest word"
          value={String(s.min_word_length)}
          onChange={(v) => onChange({ ...s, min_word_length: Number(v) })}
        >
          {[3, 4, 5, 6].map((n) => (
            <option key={n} value={n}>{n} letters</option>
          ))}
        </SelectField>
      </SetupSection>

      <TimerField value={s.timer} onChange={(timer) => onChange({ ...s, timer })} />
    </div>
  )
}
