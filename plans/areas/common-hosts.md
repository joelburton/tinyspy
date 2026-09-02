# Area: common-hosts

An area of app-audit's step 7. The process is [app-audit.md](../app-audit.md)
§21; **the plan holds the order** (§7 → "The areas, in order"), this file holds
everything else.

**What it is.** The components `App` mounts once, at the root, that render
nothing until something elsewhere in the tree asks them to. Joel named four when
he proposed the area: `GameInvitations`, `ToastHost`, `FaultModal`,
`TooltipHost`.

**Created 2026-09-02** by Joel, out of `deep`'s question about `App.tsx` having
no seam where §7 splits it. The answer settled two things: **`App.tsx` does not
get split** — it is a shell, and a shell holds the route table and what hangs off
the root; the boot/routing line is a scope line for the audit, not one the code
owes anyone — and the root-mounted components become an area of their own.

**Status: NOT OPENED.**

**The question this area exists to answer: WHAT EARNS A MOUNT AT THE ROOT?**
Six things sit there today and the reasons differ; two more sit one level down
for no stated reason. Until that rule is written, each new case is decided by
whoever adds it. Everything below is evidence for that question rather than a
list of components to tidy.

This file exists **before** the area opens so there is somewhere to put a note
the moment one turns up. Nothing below is a commitment; the roster is agreed with
Joel when the area actually opens, by listing its files and stopping.

## The roster

*(agreed with Joel when the area opens — §21: list the files and STOP)*

**The four Joel named**, with sizes:

```
 239  components/tooltips/TooltipHost.tsx        + .module.css, .test.tsx
  77  components/feedback/FaultModal.tsx         + .module.css
  65  components/game/GameInvitations.tsx
  32  components/toasts/ToastHost.tsx            + .module.css
```

**Two more that behave identically, and are an open question for the opening.**
`EditProfileModal` (141) and `WordEditDialog` (421) are also mounted at the root,
also driven by a module store, and `App.tsx` states the reason:

> it's a `<FloatingPanel>`, and react-rnd positions one from its static flow
> position — mounted inside a page's flex column it lands far from where you
> expect. **The flag therefore has to cross subtrees, hence the store rather than
> useState.**

Two defensible rules, and the choice IS the area's subject:

- **wide** — "mounted once at the root, driven by a store, because what triggers
  it is somewhere else". All six qualify.
- **narrow** — "renders other people's content". `ToastHost`, `TooltipHost` and
  `FaultModal` are hosts; `GameInvitations` is headless (it pushes into the toast
  store and renders nothing); the two modals are instances that merely live at
  the root.

Either is fine as long as the rule is written down, because the narrow one has to
say where the other two go. Note `WordEditDialog` alone is larger than the four
hosts combined, which is a fair argument for the narrow rule.

**Also to decide at the opening:** whether the stores come with the components —
`toastStore`, `editProfileStore`, `wordEditStore`, and `faultStore`, which is
already `cs-met-deep` because `deep` took the fault sink.

## Findings

*(IDs are `F-common-hosts-1`, `F-common-hosts-2`, … — §21 → Areas. Every heading
states its status; no status prefix means OPEN.)*

## Notes, to-dos and deferrals

Findings, notes, and the record of what the sprint did here — **all of it lives
in this file**. Add freely: a line costs nothing and is the alternative to losing
it.

**The one thing that goes elsewhere:** something this area turns up that is
genuinely OUT of the sprint's scope goes to `docs/deferred.md`, deliberately and
by name. That is the app's standing register; this file is the sprint's record of
the area.

### Already waiting for this area

**1. `AnagramDialog` and `WordLookupDialog` are mounted three times.** Raised by
`deep` 2026-09-02. They are returned as JSX by `useAppShortcuts()`, which
`HomePage:162`, `ClubPage:197` and `GamePage:347` each call and each render
(`:265`, `:1187`, `:750`). Coverage is complete — every page a signed-in user can
reach has them, and `?` / `~` work everywhere — so **this is not a bug**. What it
is: three instances of a dialog only one of which can ever be open, where a page
gets the feature only by remembering **two** things, the hook call AND rendering
its node. Do one without the other and the key fires, flips state nobody renders,
and nothing appears — the failure the hook's own docstring calls worse than an
unbound key.

**The positioning argument does NOT apply, and was checked rather than assumed:**
both are `<Dialog persistKey=…>`, and `useDraggablePanel` seeds from
`centerInViewport()` off `window.innerWidth`. They position in viewport space, so
mounting them deeper does not misplace them. Moving them fixes no visible bug —
the case is one instance instead of three, plus insurance against a future
ancestor with `transform` / `filter` / `will-change`, which would trap a
`position: fixed` panel at any depth but the root.

**The work is not the move; it is `chat: false`.** `useAppShortcuts` binds three
things at **two scopes**: `~` word lookup and `⌥\`` anagrams are global, `?`
page menu is global already (it goes through `pageMenuStore`), and **`/` chat is
page-dependent** — off on HomePage, because no `<Chat>` is mounted there. So the
hook cannot simply move to `App`: the shell would have to decide whether chat
exists on the current route, which is page knowledge in the shell for a keyboard
concern. The honest shape is a split — the dialogs and their keys become an
app-level host, the `/`-chat binding stays with the pages that have a chat panel.
That is two listeners instead of one, which is the cost, against scopes that
match reality.

**2. `FaultModal` is `floating-panels`' orphan.** That area is explicitly *the
machinery and the shared look, not the instances*, so the one fault-modal host
has had no area. It is this one's.

**3. `DefinitionPopover` is the adjacent question, and its answer is probably
different.** `useDefinePopover()` is called at **sixteen** sites, each holding its
own `{ word, rect }`. That is not the same accident: the popover is **anchored to
the element you clicked** (`getBoundingClientRect()`), so its state really is
about a node on a surface, where the other dialogs are centered panels with
nothing to anchor to. Sixteen copies of the same three lines is still a lot, and
"the rect is just data" — a root-mounted popover reading a store would work. It
is adjacent to §7 → "Carried forward"'s item about the definable-props bundle
repeating at fourteen surfaces, and is `shared-game-chrome`'s as much as this
area's.

## Predicted test breaks

*(written when the area starts changing things, per §21's test-break rule:
predict them, name the specs, leave them)*
