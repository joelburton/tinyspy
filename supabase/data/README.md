# Vendored data

Source data committed to the repo so the import scripts run without network
access.

| file | who reads it | what it is |
|---|---|---|
| `strands-puzzles.jsonl` | `gmake g-strands-puzzles` | The **NYT Strands archive** — one JSON object per line (`source_id`, `puzzle_date`, `board`, `clue`, `solution`), ~884 puzzles from 2024-03-04 onward. Fetched from `nytimes.com/svc/strands/v2/<date>.json` by the SEPARATE `gmake g-strands-fetch`, which is incremental and the only thing that touches the network. See the note below. |
| `stackdown-boards.jsonl` | `gmake g-stackdown-puzzles` | Pre-generated stackdown boards, produced locally by `gmake g-stackdown-genpuzzles` (not vendored from anywhere — see docs/games/stackdown.md). |
| `scowl-50.txt` | `gmake g-spellingbee-pangrams` | The **scoring** word list for Spellingbee — a smaller, higher-quality subset of [SCOWL](http://wordlist.aspell.net/) (Spell Checker Oriented Word Lists). Words in this list earn points and contribute to the player's rank. Plain text, one lowercase word per line. |
| `scowl-80.txt` | `gmake g-spellingbee-pangrams` | The **legal** word list — a larger SCOWL subset. Words in this list (but NOT in the scoring list) are accepted as **bonus** — 0 points, no rank progress, but recorded. |

Both files are sourced from `~/spellingbee-ws/data/` (the upstream spellingbee codebase),
which in turn pulls from [aspell.net](http://wordlist.aspell.net/) at vendoring
time. Both are public-domain reference data.

## Why strands fetches separately

strands is the only library sourced from a **third-party endpoint we don't own**.
Folding its fetch into the import meant `gmake db ENV=local` — routine, frequent
— fired ~900 requests at nytimes.com every single reset. That is rude at best and
a way to get blocked at worst.

So the two steps are split, and the split is the point:

```
gmake g-strands-fetch      # network. incremental. rare — usually one date.
gmake g-strands-puzzles    # disk → database. NO network. what db-data runs.
```

A database reset now reads this file and makes zero outbound requests. Picking up
today's puzzle costs exactly one. `g-strands-fetch` defaults to starting the day
after the newest puzzle already on disk, so the common case walks a single date;
pass `--force` (or `--from`) to re-fetch a range.

The archive is committed, like the rest of this directory, so a fresh clone
imports offline — the file rule fetches only when it is genuinely absent.

## Bumping SCOWL

We don't chase SCOWL versions — the importer is idempotent, and Joel's call is
that one vendoring is enough. If you do need to bump:

```
truncate spellingbee.dictionary, spellingbee.pangrams cascade;
gmake g-spellingbee-pangrams ENV=local
```
