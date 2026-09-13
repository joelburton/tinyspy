# scratchpad

A game's notepad: a floating panel players jot in while they play, kept in the
database so the notes survive a reload and outlive the game. A game opts in
through its manifest; coop shares one pad among everyone, and compete gives
each player a private one.

## Design

A pad belongs to a game, and who may write in it follows from the game's mode.
In coop the whole table is solving one puzzle, so there is one pad and every
player writes in it; in compete each player is solving alone, and a shared pad
would leak progress between opponents, so each gets a private one that nobody
else can read. Both are rows in one table keyed by game and owner, where a null
owner is the shared pad, and the select policy is what keeps a private pad
private. Writes go through the `set_scratchpad` RPC, which checks that the
caller is a player naming their own pad or the shared one, and nothing about
the game's state: the notes are the players', not the game's, so a finished
game's pad stays writable and a note typed as the verdict lands saves like any
other. The table, the policy and the RPC are
[docs/common.md](../../../docs/common.md)'s.

A page connects to all of it through one seam: `GamePage` mounts
`<GameScratchpadCompanion>` and hands it the game, which pad (the shared one,
or the viewer's own), the viewer, and the club roster. It stays mounted for the
life of the page and renders nothing while closed, because `useScratchpad`
underneath it keeps the body and the lock current whether or not anyone is
looking, so the pad is right the moment it opens.

The body is one text blob, and that is what makes the sync simple. Typing shows
at once and schedules a debounced flush of the whole text; the row's version
bumps on every write, and a body arriving over Realtime replaces the local one
only if its version is newer, so a slow reply can never roll the pad backwards.
There is no rollback and no merge: one player writes at a time, and the next
keystroke carries the whole text again.

One player at a time is the lock, and the lock is peers agreeing, not the
server ruling. On the shared pad, typing claims the lock over Broadcast on the
game's channel; the holder re-asserts it every second while editing and
releases it a few seconds after their last keystroke, and everyone else sees
"● name is editing…" and a read-only pad until it frees. A holder who goes
silent without releasing — a dropped connection, a closed lid — is treated as
gone after a few seconds, and a little before that the others are offered
"Take over", which claims the lock from them. Waiting always works; the button
only saves the wait. The claim carries the holder's user id and nothing else,
and each screen names them from the club roster it already has. Friends are
not adversaries, so `set_scratchpad` does not check the lock: a stray write
from a non-holder is possible and harmless, because the holder's screen keeps
what they have typed. While you hold the lock, every body that arrives — an
event or a reconnect's refetch — is ignored, since your text is the newest
there is and your next flush will carry it.

The panel is a `<Companion>` at the companion rung, unlike chat, which paints
above every dim because a message can open it. Its two parts are the shell's
own: the status line, and the textarea below it, which is monospace on purpose
because it is a notepad, and which paints as a field like every other. Its
open flag is `scratchpadOpenStore`, the twin of chat's, because the header
mark that flips it and the panel that reads it share no parent; the mark also
binds `⌥S`. The flag is one boolean for the app, not per game; what is
remembered per game is where the panel sits.
