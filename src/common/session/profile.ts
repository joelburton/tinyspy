// cs-fixed-session

/** The slice of `common.profiles` the FE consumes today — the
 *  identity fields used by greetings, the user menu badge, etc.
 *  Add more columns as a real consumer arrives. */
export type Profile = {
  username: string
  color: string
  /** May this user edit the shared dictionary? Drives the edit-word link in
   *  DefinitionView + the account menu's "Add word" (granted by hand in SQL
   *  — see the column's comment in the common migration). */
  can_edit_words: boolean
  /** May the app play sounds for this user — the bell when a turn becomes
   *  theirs, the win jingle, every sound. `common/sounds/playSound` reads it,
   *  so no caller decides for itself. Set from the Edit profile dialog. */
  sounds_enabled: boolean
}
