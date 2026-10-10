# paw-protection

The frontend half of paw protection — a club's daily cap on starting a
gametype: the question every start asks first, the card that answers a spent
cap, and the host that draws it.

## Intro to area

A club can cap how many games of a gametype are started each day, and the
server keeps the count and refuses a start past it
(docs/common-schema.md → Paw protection). That refusal is a fault on purpose,
because nothing should reach it: every way a game is started asks here first,
and a spent cap is answered with this folder's card before any setup dialog
opens or any New game fires.

The asking is one function, `ensureCanStart`, in the shape of
`askConfirmation`: the code asking is usually not a component, so the card is
drawn by `<PawProtectionHost>` at the app root and the caller awaits a yes or
a no. It reads the club's row for the gametype fresh each time — friends start
games while a page sits open — through the `clubs_gametypes_today` view, which
hands back today's count with the day rule (midnight Pacific) already
applied, so no client computes a date. A read that fails answers no, since the wrapper has shown
that fault already; a club with no row answers yes, so the server's refusal
names the bug rather than a button that silently does nothing.

Two surfaces start games and they ask differently. The club page knows the
club and the gametype at the press of a start row, and `useSetupDialog` asks
with them in hand — for a pressed row and for a `?new=` link arriving, which
opens nothing until the answer is yes. The game page's New game is an action,
and its shared run cannot know the club, so the page registers its subject
(`registerPawSubject`, in `usePageActions`) and the run asks
`ensureCanStartRegistered` for any action whose registry row says
`pawProtected` — before the action's own question, and game over or not,
since the cap is on the next game. That is what keeps every game's own New
game untouched: a game cannot forget to ask, the same way it cannot forget
the confirmation.

The card is not an error's look. No outcome color, no diagnostics: the
heading "Paw Protection" at a page title's size, the picture beside the
words, one button. It is a poster rather than the category's card
(BlockingModal's `layout`) — wider on a desktop, and the whole screen on a
phone with the picture above the words — because it is a notice with
nothing behind it worth seeing, where a question's card keeps the board
visible. The words name the cap and the game's brand, both in bold.

## Details

```
pawProtectionService.ts    ensureCanStart(subject) · ensureCanStartRegistered() · registerPawSubject(subject)
                           the pending refusal, and the host's subscription to it
PawProtectionHost          at the app root (App): draws the refusal while one is pending
PawProtectionModal         the card: BlockingModal, the picture (paw.jpg) and the words
```

- **The refusal is a promise that resolves false on dismiss**, and `true` is
  answered without the card. A caller awaits either and proceeds only on
  true; nothing reports which way the card was left, since there is one way.
- **With no host mounted the answer is no.** A start the card could not
  refuse would be one the server refuses as a fault, and a quiet no is the
  safer direction; the console says so.
- **A page registers one subject and releases it on unmount.** A release
  after another page has registered leaves that page's alone, so a route
  change cannot clear the subject the new page just set.
- **The picture is a 480-pixel JPEG derivative** of the artwork, drawn at a
  fixed width inside the poster and full-width on a phone. The master stays
  outside the repo.
