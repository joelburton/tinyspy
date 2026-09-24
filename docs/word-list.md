# Word list

`common.words`, the dictionary every word game reads: what each column means,
the rule for which words a game may put in front of a player, the definitions
cached on it, the anagram query, and the in-app curation that edits it. The
frontend halves are [`common/definitions`](../src/common/definitions/doc.md)
and [`common/anagram-finder`](../src/common/anagram-finder/doc.md).

## The word list (`common.words`)

One row per playable word — a single categorized list each game filters to its
own needs, rather than a vendored list per game. It lives in `common` because
the removability invariant forbids one game owning data another reads. The
puzzle-library games (connections, crosswords) bring their own answers and
don't touch it; boggle and scrabble's AI read a trie bundled from it at build
time rather than the live table.

**The columns are the filtering knobs:**

- **`difficulty`**, a 1–6 **recognizability band**: 1 universal, 2 common, 3
  familiar, 4 uncommon, 5 obscure, 6 expert (SOWPODS-only). It measures "would a
  player *know* this word", not how often it appears in text. Validation always
  allows the full 1–6 range; which bands a game *offers* is its own choice.
- **`american` / `british` / `canadian` / `australian`** — dialect validity,
  mostly a spelling filter. There is no app-wide default; a game that cares
  says which it wants.
- **`crude` / `slur`** — levels 0 none, 1 mild, 2 strong. **`slang`** — chiefly
  slang, independent of difficulty.
- **`wordle`** — in the fixed Wordle answer/guess list.
- **`len`**, **`root_word`** (the lemma of an inflected form).
- **`hint`** — a clue that *hides* the word ("A hooded snake" → cobra), present
  for five-letter common words and NULL elsewhere; the games with a hint read
  it live.
- **`letter_mask`** — generated: the set of distinct letters as bits, for
  "every word whose letters fit this board" queries
  (`letter_mask & ~board_mask = 0`).
- **`definition` / `definition_source`** — see [Definitions](#definitions).

**Access and import.** Public reference data: `select` granted to
`authenticated`, RLS on with a permissive policy so the table can't fail open.
It is loaded by `gmake all-words` from the word-list project's working copy,
read live rather than vendored (`WORDS_TSV` overrides the path), as a
`TRUNCATE` and a psql `\copy` — which wipes any in-app edit not yet folded back
into the source ([Curation](#curation)).

## Which words a game may use — the two-tier rule

Every dictionary read is one of two kinds, and the kind decides the filter:

| tier | the filter | what it governs |
|---|---|---|
| **must-reach** — a word the game makes a player produce, or puts on screen as important | `slur = 0 AND crude = 0 AND NOT slang AND american` | an answer, a board's words, a required set, a word shown as the best possible |
| **may-enter** — a word a player chooses to type, scoring or not | band alone; slur, crude, slang and dialect unrestricted | guesses, a legal set, bonus words, a move's word |

**We don't put a slur in front of you, and we don't stop you typing one.** A
game may be stricter than a tier for its own reasons (scrabble adds
`american OR british`, because that is the Scrabble rule), but nothing on a
must-reach list may be less strict than the must-reach filter. A word the
**app** produces follows must-reach even where the matching player action is
may-enter, because nobody chose it: scrabble's AI plays from a vocabulary
filtered `slur = 0 AND crude = 0` (not slang, which isn't offensive).

**One list doing two jobs is the failure to recognize.** If a game has a single
word list and both tiers apply to it, one of them is wrong — the fix is to keep
the wide list and derive the clean subset from it, flagged per word, as
spellingbee's `is_required` does.

## A game and a list that can change

Words are edited live ([Curation](#curation)), so a band can move under a game
in progress. Most games copy their word lists at creation; the rest consult the
live list only for may-enter checks, where a moved band just changes what a
player may type. **A game that validates guesses against the live list checks
its own solution first**, so the answer stays enterable even if its band moves
out of the game's range — wordle does, pinned by
`supabase/tests/wordle/banded_answer_test.sql`.

## Definitions

Definitions are columns on `common.words`, since we only ever define words in
the list; a lookup of anything else answers "Unknown word" and is never stored.

- **`definition_source`** is provenance: `s` a seeded gloss, `e` an automatic
  gloss ("plural of X"), `w` live Wiktionary, `m` a manual edit, NULL never
  looked up. A `w` source with a NULL `definition` is a **tombstone** —
  "looked up, Wiktionary had nothing" — so a repeat lookup doesn't call out
  again.
- **The seeded glosses ship in the word list**, and the rest are filled lazily
  by the **`common-define` edge function**, a read-through cache: it reads the
  word as the caller and, for an in-list word never looked up, asks Wiktionary
  and writes the answer back through `common.cache_definition` — service-role
  only, and an update guarded by `definition is null`, so a seeded gloss is
  never overwritten and a word not in the list is a no-op. A failed call
  writes no tombstone; only a definite "nothing" is cached.

## The anagram query

`common.anagrams(letters)` backs the ⌥~ anagram finder: every word of exactly
the pattern's length, where lowercase letters float, `?` is a wildcard and an
uppercase letter is pinned to its position. Three stages, cheapest first, over
the words of that length: the pinned letters as a `LIKE`, the `letter_mask`
prefilter (paying for missing letters with wildcards), then an exact
letter-count check on what survives. It is security-definer so it can call its
revoked helper. **It is deliberately unfiltered** — the player typed the
letters, so every tier answers — and pgTAP pins that. Case is tested with
`ascii()` bounds, not `between 'A' and 'Z'`, because the collation interleaves
upper and lower case.

## Curation

A trusted player who spots a problem word mid-game — a wrong band, a missing
definition, a word that shouldn't be there — fixes it on the spot. The edit
applies to `common.words` **live and** is journaled; the upstream word-list
process later reads the journal and folds the changes into the source file.

- **Who**: `common.profiles.can_edit_words`, granted by hand in the database.
  Every curation RPC re-checks it (`_require_word_editor`); a non-editor never
  sees the controls.
- **`update_word(target_word, patch, note)`** applies only the changed fields;
  a definition change stamps `definition_source = 'm'`. Clearing a
  definition lets the next lookup fetch a fresh one from Wiktionary, which
  records itself as `w`; the journal keeps that an editor cleared it.
  **`delete_word(target_word, note)`** is a hard delete, safe because nothing
  references `common.words` by foreign key. **`add_word(new_word, fields,
  note)`** takes `^[a-z]{1,45}$` and a required band.
- **`common.words_edits`** is the journal: one row per call — the word, the
  kind, the full row before, the change, the curator's note, who and when.
  Editors only.
- **`gmake all-words` truncates and re-imports**, so an edit not yet folded
  into the source is lost from the table; the journal survives, and is the
  record to reconcile from.

Tests: `supabase/tests/common/words_edit_test.sql`,
`supabase/tests/common/anagrams_test.sql`, `e2e/word-edit.e2e.ts`.
