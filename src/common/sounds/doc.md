# sounds

Every sound the app plays, and the one way to play it. The bell when a turn
becomes yours, and the win jingle, both obey the player's "Enable sounds"
setting.

## Intro to area

A sound is an interruption the player did not ask for, so two things are true
of every one of them: the player can turn all of them off, and none of them is
ever the only way something is said. The first is a profile setting,
`sounds_enabled`, checked inside the one function that plays anything, so a
new sound cannot forget it. The second is a rule for callers: a sound always
accompanies something visible — the yellow turn frame, the confetti — because
a browser may refuse to play it, and a player may have it off.

There are two sounds. The **bell** rings when the turn becomes yours, in every
game where the turn passes between players. The **jingle** plays when a win is
celebrated.

## Details

**`playSound(name)` is the only player.** It keeps one `Audio` element per
sound, made on first use and reused, reads the profile store through
`currentProfile()` and returns without a sound when the setting is off, and
swallows every failure: a browser refuses audio until the page has had a
click, and jsdom implements no media. It hands back a `stop`, which the jingle
uses when its dialog is dismissed early. Adding a sound is a file in
`public/audio/` and a line in `SOUND_FILES`.

**The bell's moment is the turn's arrival**, read from
`board-marks/useTurnArrival` — the same count the yellow `useTurnStartFlash`
frame reads, so the two land together. `useTurnBell` rings on each new
arrival, never on mount, and preloads the file so the first ring is not late.

**`GamePage` calls `useTurnBell` once**, with the common turn pointer
(`common.games.current_turn_user_id`, moved by `common._advance_turn`), so
every game on that pointer rings with no game code. It passes false once the
game is over. A game whose turn is its own — scrabble compete's seat,
codenamesduet's clue to give or to guess from — rings from its own code.

**The setting is written by `common.update_profile`** from the Edit profile
dialog, and defaults to on for every account (`account/doc.md`).
