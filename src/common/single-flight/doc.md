# single-flight

One run of an async action at a time: a second click while the first is in flight is dropped, not queued. Every game's New game wraps it — `common.create_game` is not idempotent, so a double-click really does make two games — and so does a board action whose control stays live across the round trip.
