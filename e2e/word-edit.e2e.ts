import { execFileSync } from 'node:child_process'
import { test, expect } from '@playwright/test'
import { createSoloClub } from './helpers/fixtures'
import { signIn } from './helpers/session'

const LOCAL_DB = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'

function sql(q: string): string {
  return execFileSync('psql', [LOCAL_DB, '-tAX', '-c', q], { encoding: 'utf8' }).trim()
}

/**
 * Dictionary curation, end to end: an editor (can_edit_words granted by SQL —
 * exactly how Joel grants it on prod) edits a word through the real
 * DefinitionView link, the change applies LIVE and journals with the note;
 * Add word rides the account submenu. A non-editor sees the same definition
 * without the link.
 *
 * The fixture words are invented z/q strings so the run can't collide with
 * (or damage) the imported dictionary.
 */
test('an editor edits + adds a word; the journal records both; a non-editor sees no link', async ({
  browser,
}) => {
  const club = await createSoloClub('wedit')
  const editor = club.members[0]
  sql(`update common.profiles set can_edit_words = true where user_id = '${editor.userId}'`)
  // Letters only (digits → letters): words are /^[a-z]+$/ throughout —
  // the define edge fn and add_word both reject anything else.
  const suffix = () =>
    Date.now()
      .toString(36)
      .slice(-5)
      .replace(/[0-9]/g, (d) => 'ghijklmnopq'[Number(d)])
  const fixtureWord = `zqe${suffix()}`
  // A stored gloss ('m' = manual), so the define edge fn answers from the DB —
  // an invented word with no definition would send it to Wiktionary, which 404s.
  sql(`insert into common.words
         (word, difficulty, american, british, canadian, australian, len,
          definition, definition_source)
       values ('${fixtureWord}', 1, true, true, true, true, ${fixtureWord.length},
               'a word invented for the e2e run', 'm')`)

  const ctx = await browser.newContext()
  await signIn(ctx, editor.session)
  const page = await ctx.newPage()
  await page.goto(`/c/${club.handle}`)

  // ── Edit, via the ~ lookup's DefinitionView ──
  // (Shift+Backquote = `~`; bare Backquote is the app's Escape stand-in.
  // Retry the chord: it races the shortcut listener's effect-time attach.)
  const lookupInput = page.getByLabel('Word to look up')
  await expect(async () => {
    await page.keyboard.press('Shift+Backquote')
    await expect(lookupInput).toBeVisible({ timeout: 300 })
  }).toPass({ timeout: 10_000 })
  await lookupInput.fill(fixtureWord)
  await page.keyboard.press('Enter')

  await page.getByRole('button', { name: 'Edit word…' }).click()
  const band = page.getByLabel('Band')
  await expect(band).toHaveValue('1')
  await band.fill('5')
  await page.getByLabel('Curation note').fill('e2e: way too obscure for band 1')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(band).toHaveCount(0) // dialog closed = saved

  expect(sql(`select difficulty from common.words where word = '${fixtureWord}'`)).toBe('5')
  expect(
    sql(`select kind || '|' || (new->>'difficulty') || '|' || note || '|' || edited_by_username
           from common.words_edits where word = '${fixtureWord}'`),
  ).toBe(`update|5|e2e: way too obscure for band 1|${editor.username}`)
  // The changed-fields discipline: only difficulty was touched, so `new`
  // must claim exactly that one column.
  expect(
    sql(`select array_to_string(array(select jsonb_object_keys(new) order by 1), ',')
           from common.words_edits where word = '${fixtureWord}'`),
  ).toBe('difficulty')

  // ── Add, via the account submenu ──
  const newWord = `zqa${suffix()}`
  await page.getByRole('button', { name: 'Club menu' }).click()
  await page.getByRole('menuitem', { name: editor.username }).click()
  await page.getByRole('menuitem', { name: 'Add word' }).click()
  await page.getByLabel('New word').fill(newWord)
  await page.getByLabel('Band').fill('3')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByLabel('New word')).toHaveCount(0)
  expect(
    sql(`select difficulty || '|' || len from common.words where word = '${newWord}'`),
  ).toBe(`3|${newWord.length}`)
  expect(sql(`select kind from common.words_edits where word = '${newWord}'`)).toBe('add')

  await ctx.close()

  // ── A non-editor gets the definition surface without the link ──
  const club2 = await createSoloClub('nonedit')
  const ctx2 = await browser.newContext()
  await signIn(ctx2, club2.members[0].session)
  const page2 = await ctx2.newPage()
  await page2.goto(`/c/${club2.handle}`)
  const lookup2 = page2.getByLabel('Word to look up')
  await expect(async () => {
    await page2.keyboard.press('Shift+Backquote')
    await expect(lookup2).toBeVisible({ timeout: 300 })
  }).toPass({ timeout: 10_000 })
  await lookup2.fill(fixtureWord)
  await page2.keyboard.press('Enter')
  await expect(page2.getByText('band 5', { exact: false })).toBeVisible() // definition rendered…
  await expect(page2.getByRole('button', { name: 'Edit word…' })).toHaveCount(0) // …link absent

  await ctx2.close()
})
