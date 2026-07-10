# UI Redesign Decisions — RETIRED (redirected)

This doc has been **retired**. Its rules are now merged into the two canonical FE
docs, [ui.md](ui.md) (the visual language) and [playarea.md](playarea.md) (the play
surface). The v3 convergence pass is complete — all eleven games are v3 — so the
standalone convergence spec's job is done.

Older references (including code comments) that cite `design-decisions.md → X` map
as follows:

| old section | now lives in |
|---|---|
| Terms / Feedback / Tones / Tone follows the event / Dismissal modes / Transient vs permanent | [ui.md → Feedback pill](ui.md#feedback-pill) |
| Action buttons | [ui.md → Button iconography](ui.md#button-iconography) |
| Game versions (v1 → v3) | [ui.md → Game versions](ui.md#game-versions-v1--v3) |
| Board column / The board / The grid / Tiles / `belowBoard` | [playarea.md → Board sizing](playarea.md#board-sizing) + [ui.md → Interactive tile states](ui.md#interactive-tile-states) |
| Move entry (`EntryRow`) | [playarea.md → Text entry](playarea.md#text-entry--capture-not-input) |
| Info column / InfoCol order | [playarea.md → Info-column readouts](playarea.md#info-column-readouts) |
| Turn log / Conversion gotchas | [playarea.md → Turn log](playarea.md#turn-log) |
| Reconciliation with the code | done — every reconciliation item landed during the v3 sweep |

> The `src/` code comments that used to cite `docs/design-decisions.md → …` have
> been repointed to the ui.md / playarea.md sections above. This stub remains only
> as a redirect for any older external reference; it can be deleted once nothing
> points here.
