# info-sheet

The info column: its mobile sheet, the switch that changes what it shows, the bordered panel its readouts wear, the whose-turn line (`TurnStatusLine`) the turn games put in it, and its action row (`InfoActionsRow`) — the game's buttons with an optional outcome-inked line beside them, in every state of the game. The switch is `act-toggle-info-sheet`, worn through `actionSurface` so the mark keeps its own look. `turnText` is the whose-turn wording itself, written here because that line and the feedback pill `common/feedback` draws must name the same player the same way.
