import { CoopStyleField } from '../../common/components/fields/CoopStyleField'
import { DifficultyField } from '../../common/components/fields/DifficultyField'
import { SelectField } from '../../common/components/fields/SelectField'
import { TimerField } from '../../common/components/fields/TimerField'
import { NextPuzzleField } from '../../common/components/fields/NextPuzzleField'
import { SetupSection } from '../../common/components/setup/SetupSection'
import { difficultyValue } from '../../common/lib/game/difficulty'
import type { SetupBodyProps } from '../../common/lib/games'
import { db } from '../db'
import type { StrandsSetup } from '../lib/setup'
import form from '../../common/components/fields/setupForm.module.css'

/**
 * strands' setup form.
 *
 *   - **Puzzle** — a read-only line naming what Start will play, NOT a picker.
 *     The server chooses (`strands.next_puzzle_for_club`): the earliest puzzle
 *     none of the selected players has played, in any club. The date picker
 *     this replaced offered 884 identical-looking dates, and its besetting
 *     problem was starting one you'd already done — first patched by showing
 *     the clue under the input, then solved properly by removing the choice.
 *     The clue survives as the label on that line, which is the right place
 *     for it: it's how a person recognises a strands puzzle.
 *   - **Hint dictionary** — the band a word must reach to earn a hint point.
 *   - **Words per hint** / **Shortest word**.
 *
 * Plus the shared TimerField and CoopStyleField.
 */
export function SetupForm({ brand, mode, players, value, onChange }: SetupBodyProps) {
  const s = value as StrandsSetup

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

      <NextPuzzleField
        brand={brand}
        seenBy={players.map((p) => p.user_id)}
        load={async (seenBy) => {
          const { data } = await db.rpc('next_puzzle_for_club', { seen_by: seenBy })
          // Both RPCs return 0 or 1 rows. Zero from this one means the archive
          // is spent for these players; zero from the by-date one means no
          // puzzle that day. NextPuzzleField renders each as its own state.
          return data?.[0] ?? null
        }}
        loadByDate={async (date) => {
          const { data } = await db.rpc('puzzle_for_date', { target_date: date })
          return data?.[0] ?? null
        }}
        // A chosen date rides in setup.puzzleId; cleared, the key is dropped
        // entirely — its ABSENCE is what tells create_game to choose.
        onPick={(puzzleId) => {
          const next = { ...s, puzzleId }
          if (puzzleId === undefined) delete next.puzzleId
          onChange(next)
        }}
      />

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
