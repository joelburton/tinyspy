# invitations

Being added to a game: the watcher that notices, the pure filter and the seen set that decide whether to say anything, and the headless mirror into the toast store.

## Design

docs/common.md → Joining a game — the invitation toast states the rule this folder exists to serve: a game seats every player at creation, and nobody is dragged into it. This is how that stays true.

**Seated at creation, never pulled in.** Creating a game writes a `game_players` row for everyone, and that row is the only thing anyone is committed to. Entering is always the player's own click, and the game waits: presence-pause counts every seated row as an expected player, so a fresh game sits paused — "Waiting for Bea…" — until each invited person actually arrives. That is the point rather than a side effect. A game that "started" for someone who was not at their computer is the thing this design refuses.

**The watcher is mounted at the root**, because being added to a game can happen while you are anywhere in the app, and there is no subtree that could observe every club. It is mounted after the claim-handle gate, so an invite can never appear over the login or claim screens.

**Two trigger paths, and the second is the one that needs explaining.** Realtime catches `game_players` INSERTs for your own rows, so an invite appears instantly while you are online. But a subscription only tells you what happened while you were listening, so the hook also re-scans on subscribe — which fires on first connect *and* on reconnect — to recover invites sent while you were offline or before your tab loaded.

**That re-scan is why both bounds exist, and neither substitutes for the other.** The scan asks for non-terminal games you are seated in, and `is_terminal = false` is not a staleness bound: an abandoned game never becomes terminal — nobody ends it, it just sits there — so without an age cap the candidate pool is every unfinished game you have ever been in, and it grows forever. `INVITE_MAX_AGE_MS` is that cap, and its docstring says why an hour and what the client clock costs. The seen set is the other bound and answers a different question: a game's invite surfaces once and is then marked seen, so a reload or a refetch does not nag you about the same thing twice. Each hid the other's absence for a while. The seen set made the unbounded pool invisible right up until it was empty — a new device, another browser, cleared storage — and then the whole accumulated backlog popped at sign-in.

**A dismissed invite and a joined one are equally seen**, and the way back is the club page rather than a re-pop. An invitation is a nudge, not the only route into a game; the game is still listed where you would look for it.

**Entering the invited game by any route is a real dismissal.** The club's active-game card is a plain link, and so is a shared URL or the back button — none of them is the toast's own Join. Suppressing only the game you are currently looking at would hide the invite while you were in it and pop it back the moment you navigated away. So the invite is dropped from the pending list the render the path first resolves to it, using React's adjust-state-during-render rather than an effect: no extra commit, and it cannot lag a frame behind the navigation. The render-time filter on top of that is what prevents a one-frame flash of an invitation to the game you are already in.

**The component renders nothing.** It mirrors the hook's live invite list into the toast store, one toast per invite keyed by game id, and dismisses any whose invite has gone. Announcements belong in one stack whatever produced them, so an invitation arrives where a deletion notice or a heads-up does — and, since that stack outranks chat, an open chat panel never hides one. The two exits carry the split the toast card guarantees: the ✕ marks the invite dismissed, while Join does not, because joining removes it from the list anyway and marking it dismissed would be recording something nobody did.

The filter itself is pure and tested apart from the hook, because the two questions are asked in different places: whether a game is *new to you* is a filter over candidates, and whether it is *recent* rides on the query, so stale rows never leave the database and the arithmetic is the only testable part.
