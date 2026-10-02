// cs-unmet

/**
 * `common.games.clubpage_info`, as `psychicnum._write_statuses` writes it
 * (supabase/sql/psychicnum.sql). Every key is always present, null when it has
 * no value, so no key here is optional. The club line (`manifest.ts`'s
 * `labelFor`) reads it; the play surface reads the playarea blob instead
 * (`lib/playarea.ts`).
 *
 * The found and used counts are the team's in coop and null in compete, whose
 * club line shows no progress; the winner is compete's, null until the end and
 * always null in coop.
 */
export type PsychicnumClubpageInfo = {
  found_secrets_count: number | null
  required_secrets_count: number
  guesses_used: number | null
  max_guesses: number
  winner_user_id: string | null
}
