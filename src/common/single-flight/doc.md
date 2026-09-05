# single-flight

One run of an async action at a time: a second click while the first is in flight is dropped, not queued. Submit and action handlers wrap in it so a double-click cannot double-fire an RPC.
