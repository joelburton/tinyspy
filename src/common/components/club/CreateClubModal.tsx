// cs-unmet

import { StandardForm } from '../fields/StandardForm'
import { FORM_ERROR_KEYNAME, type FormErrors } from '../fields/formState'
import { useState } from 'react'
import { db as commonDb } from '../../db'
import { runRpc } from '../../lib/supabase/dbResult'
import { NormalModal } from '../floating-panels/NormalModal'
import { FailureLine } from '../feedback/FailureLine'
import actionRow from '../floating-panels/modalActions.module.css'
import styles from './CreateClubModal.module.css'
import { StandardButton } from '../buttons/StandardButton'
import { CancelButton } from '../buttons/CancelButton'
import { TextField } from '../fields/TextField'

type Props = {
  /** The club exists — its handle, so the opener can go there. */
  onCreated: (handle: string) => void
  /** User dismissed without creating (Cancel / Esc / X). */
  onCancel: () => void
}

/**
 * Slugify a user-typed name into the club's URL handle.
 *
 * Mirrors `common.slugify_club_name` in the SQL baseline — same
 * shape (lowercase → strip non-alphanumeric → collapse to single
 * hyphens → trim ends → cap at 40 chars). Used to pre-validate the
 * derived handle on the FE (see `getErrorTextForSlug`) and to name the handle
 * in the "name is taken" message; the server runs the canonical
 * version before insert.
 *
 * Keep in sync with `common.slugify_club_name` in
 * 20260615000000_common.sql.
 */
function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
}

/**
 * Validate the handle a name would slugify to, against `common.clubs`'
 * CHECK (`^=?[a-z][a-z0-9-]{2,29}$`): start with a letter, then 2–29
 * more url-safe chars (3–30 total). Returns a friendly message, or null
 * if the handle is valid.
 *
 * A LOCAL PRE-EMPT, not the only guard: `create_club` raises a key for each of
 * these rules, so a name that gets here anyway comes back with words rather
 * than a constraint name. What this buys is an answer without a round trip,
 * and a message that can name the derived handle — the server sees a handle
 * and never knows which name produced it.
 */
function getErrorTextForSlug(slug: string): string | null {
  if (/^[a-z][a-z0-9-]{2,29}$/.test(slug)) return null
  if (!slug) return 'Please use at least one letter or number in the name.'
  if (!/^[a-z]/.test(slug)) {
    return `That makes the handle “${slug}”, which must start with a letter — try a name beginning with a letter.`
  }
  if (slug.length < 3) {
    return `That makes the handle “${slug}”, which is too short — the handle needs at least 3 characters.`
  }
  return `That makes the handle “${slug}”, which is too long — please shorten the name.`
}

/** Club-name ceiling, mirroring the `char_length(name) between 1 and 20` CHECK
 *  on `common.clubs.name`. Bounded because the name headlines the club page and
 *  the home clubs list, where an unbounded string is the classic way a phone
 *  ends up scrolling sideways (docs/mobile.md). */
const CLUB_NAME_MAX = 20

/**
 * "Create a club" dialog. POSTs to `common.create_club` and hands the new
 * club's handle back, so the opener can go there.
 *
 * The exact sibling of `<EditClubModal>` — create and edit of the same object,
 * in the same shell — and it takes no `session`, because `create_club` reads
 * `auth.uid()` on the server.
 *
 * The "Club name" field doubles as the handle source — we slugify
 * it live and show the preview ("/c/joels-crossword-club") as the
 * user types. There's no separate handle input; if they want a
 * different URL they edit the name. Same pattern keeps the
 * handle/name relationship one-way: handle is derived FROM name,
 * never typed independently.
 *
 * v1 club semantics (see CLAUDE.md / docs/common.md / project
 * memory): the membership list is fixed at creation. There's no
 * "invite later" flow yet. The creator is auto-added by the RPC,
 * so this form only asks for the other members.
 *
 * UX is intentionally minimal — alpha-software prior; we're
 * optimizing for "Joel and a couple friends can use this" not
 * "looks polished for strangers." A real picker for member
 * selection (typeahead from common.profiles) lands when we have
 * enough users to make that worthwhile.
 *
 * Lifecycle mirrors the other normal modals: the opener conditionally renders
 * us — mounting opens, unmounting closes. We hold no "is open" state.
 */
/**
 * What the form holds, keyed by the name each value is SENT AS.
 *
 * The keys are `common.create_club`'s own parameters, which is what makes the
 * round trip need no translation: the input is named `club_name`, the RPC
 * argument is `club_name`, and PN009 raises `column = 'club_name'`, so the
 * server's answer lands under the box that caused it.
 */
type Values = { club_name: string; member_usernames: string }

const EMPTY: Values = { club_name: '', member_usernames: '' }

export function CreateClubModal({ onCreated, onCancel }: Props) {
  const [errors, setErrors] = useState<FormErrors>({})
  const [busy, setBusy] = useState(false)

  async function onSubmit(values: Values) {
    setErrors({})

    const trimmed = values.club_name.trim()
    if (!trimmed) {
      setErrors({ club_name: 'Please give the club a name.' })
      return
    }
    // Validate the derived handle before hitting the server so a
    // too-short / non-letter-leading name gets guidance, not the raw
    // clubs_handle CHECK violation. Same object as the server's answers —
    // whoever noticed the problem writes into one place.
    const slugErr = getErrorTextForSlug(slugify(trimmed))
    if (slugErr) {
      setErrors({ club_name: slugErr })
      return
    }
    const usernames = values.member_usernames
      .split(/[\s,]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0)

    setBusy(true)
    const res = await runRpc<{ handle: string }>(
      commonDb.rpc('create_club', {
        club_name: trimmed,
        member_usernames: usernames,
      }),
    )
    setBusy(false)

    if (res.type !== 'ok') {
      // ONE entry, under the field the server named. Its three validations
      // each say which input they are about — PN009 `club_name`, PN007 and
      // PN008 `member_usernames` — so the message appears beneath that box and
      // rings it, rather than on a line at the bottom that makes you work out
      // which of the two it meant.
      //
      // A fault says `_` and lands on the form's own line; it has also already
      // raised the modal, and the line is what remains once that is dismissed.
      setErrors({ [res.field ?? FORM_ERROR_KEYNAME]: res.message })
      return
    }
    // Don't bother clearing `busy` — onCreated navigates away and unmounts us.
    onCreated(res.data.handle)
  }

  return (
    <NormalModal
      title="Create a club"
      onClose={onCancel}
      resizable={false}
      // Height is the content's: the number below is only the first-paint seed,
      // and `fitContent` grows past it — the error line and the handle preview
      // both appear as you type. Width matches EditClubModal, its sibling.
      fitContent
      defaultSize={{ width: 440, height: 400 }}
    >
      <p className="muted">
        A club is a fixed group of friends who play games together.
        Membership is set at creation and can't be changed later
        (no invitations, no leaving). Chat and any in-progress games
        in this club will be visible to all members.
      </p>

      {/* The action row sits INSIDE the form, which is what makes Enter in
          either field submit — implicit submission needs the submit button in
          the form, and typing a club name and pressing Enter is the fast path
          this dialog is for. */}
      <StandardForm initialValues={EMPTY} onSubmit={onSubmit}>
        {({ values, set }) => (
          <>
            {/* maxLength mirrors the CHECK on common.clubs.name — the same
                belt-and-braces the handle field uses (ClaimHandleScreen). The
                server is the authority; this just means you can't type a name
                only to be told no. */}
            <TextField
              name="club_name"
              label={
                <span className={styles.labelRow}>
                  Club name
                  {/* The derived URL handle, so the validation — which is
                      really about the handle, not the name — reads sensibly.
                      Hidden until something is typed; "(empty)" when the name
                      has no slug-able characters at all (e.g. "!!!"). */}
                  {values.club_name.trim() && (
                    <span className={styles.handleHint}>
                      {slugify(values.club_name)
                        ? `(becomes handle: ${slugify(values.club_name)})`
                        : '(empty)'}
                    </span>
                  )}
                </span>
              }
              value={values.club_name}
              onChange={(v) => set('club_name', v)}
              error={errors.club_name}
              disabled={busy}
              placeholder="Joel and Leah"
              maxLength={CLUB_NAME_MAX}
              autoFocus
              required
              entryHelp={`Up to ${CLUB_NAME_MAX} characters — it headlines the club page.`}
            />

            <TextField
              name="member_usernames"
              label="Other members' usernames"
              value={values.member_usernames}
              onChange={(v) => set('member_usernames', v)}
              error={errors.member_usernames}
              disabled={busy}
              placeholder="alice, bob"
              multiline
              rows={2}
              entryHelp="Comma or space separated. You're added automatically."
            />

            {/* The form's own line, for a message that named no field. Each
                field's own message renders under that field, not here. */}
            <FailureLine>{errors[FORM_ERROR_KEYNAME]}</FailureLine>

            <div className={actionRow.modalActions}>
              <CancelButton onClick={onCancel} disabled={busy} />
              <StandardButton
                name={busy ? 'Creating…' : 'Create club'}
                type="submit"
                weight="primary"
                disabled={busy}
              />
            </div>
          </>
        )}
      </StandardForm>
    </NormalModal>
  )
}
