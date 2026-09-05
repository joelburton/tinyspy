# club — todo

## Bugs

## Soon

- **`<ModePill>` is a BADGE and should be renamed.** Its module already reads
  the shared `.badge` and holds nothing but the two colors, so this is a name,
  not a conversion. The rule it carries is general: **"pill" means the
  FEEDBACK pill and nothing else** — the fully-round-ended lozenge is a badge.
  (`ModePill.tsx` sits in `game-page` today; all its render sites are club
  surfaces, and a folder is not an owner.) docs/ui.md's "Mode pills" heading
  goes with it.
- **The `=` solo-handle convention is still tested in the FE** — `soloClub`
  in `ClubPage.tsx` and `modeSuffix` in `SetupGameModal.tsx`.
  `common.clubs.is_solo` (a generated column) carries it, and the homepage
  reads that instead. Joel: *"fine for now, but we should get '=' stuff out
  of FE when we get to them."* The two SQL sites (`common.sql`, the setgame
  migration) write `like '=%'` and can take the column too.
- **The two-line row** — a name line over a muted meta line — is written in
  THREE files: `StartGameRow`, `ClubGameRow` and the standalone `ClubGameCard`.
  The pattern should name the SLOTS; each component keeps its own name for
  what goes in one.
- **The viewport-fit chain has no vocabulary.** `min-height: 0` does TWO jobs
  in the app: the chain (the **bound** — `max-height` on a centered card or
  `height` on a full-bleed page; the **relay** — a flex column carrying it
  down; the **scroller**), and a flex/grid item allowed to shrink below its
  content, which is board geometry. The relay still has no good name.
- The club page's filters render TWICE, desktop and mobile, each hidden in
  the other mode. A markup decision before a CSS one.
- The two-column fold: `.columns` stacks at `--mobile` and `data-tab` hides
  one side. GamePage answers the same question with the info sheet.

## Someday

## Maybe
