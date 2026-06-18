# Vendored data

Source data committed to the repo so the import scripts run without network
access.

| file | who reads it | what it is |
|---|---|---|
| `scowl-50.txt` | `npm run freebee:import` | The **scoring** word list for FreeBee — a smaller, higher-quality subset of [SCOWL](http://wordlist.aspell.net/) (Spell Checker Oriented Word Lists). Words in this list earn points and contribute to the player's rank. Plain text, one lowercase word per line. |
| `scowl-80.txt` | `npm run freebee:import` | The **legal** word list — a larger SCOWL subset. Words in this list (but NOT in the scoring list) are accepted as **bonus** — 0 points, no rank progress, but recorded. |

Both files are sourced from `~/freebee-ws/data/` (the upstream freebee codebase),
which in turn pulls from [aspell.net](http://wordlist.aspell.net/) at vendoring
time. Both are public-domain reference data.

We don't chase SCOWL versions — the importer is idempotent, and Joel's call is
that one vendoring is enough. If you do need to bump:

```
truncate freebee.dictionary, freebee.pangrams cascade;
npm run freebee:import
```
