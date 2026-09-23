# account

Your own account: the row on every page's menu that says who you are signed in
as, the dialog behind it for changing what little is changeable, and the store
that connects the two.

## Intro to area

An account here is small on purpose. A username, chosen once on first sign-in
and immutable after — it is how friends refer to you, and a handle that moves
would make a club's history lie. A color from the palette, which is the thing
you can change, because the color is how you find yourself on a board and a
player who cannot stand theirs is stuck with it everywhere. Whether the app
plays sounds for you, which you can change too, since a bell is an
interruption not everyone wants. And a flag saying whether you may curate the
dictionary, granted by hand in the database rather than earned or requested. There is no profile page, no avatar and no bio: this
is a venue for people who already know each other, and the question the app
has to answer is which of them you are.

So the account lives in the menu rather than on a screen of its own. Every page
— home, club and game — ends its menu with the same row, drawn as your color
dot beside your username, opening a submenu of the things that are yours: edit
your profile, add a word if you may, log out. Editing opens a dialog mounted
once at the root of the app, and saving it is one RPC whose answer every
reader of the profile repaints from at once.

## Details

**The row is your name, not the word "Account"**, because "who am I signed in
as" is the question a shared laptop actually raises, and a generic label
answers it with nothing. It nests rather than sitting flat among the page's own
items, because what you can do to *this game* and what you can do to *yourself*
are different questions and a reader should not have to sort them. And it is
inside the page's menu rather than a control of its own: a fixed chip would
cost the header permanently reserved width at every viewport, and the mobile
game header needs that width for feedback.

**The dialog is mounted at the root, and its open flag lives outside both
opener and dialog.** Mounting at the root is a constraint rather than a
preference: the dialog is a floating panel, and react-rnd positions one from
where it sits in the flow, so mounting it inside a page's flex column would
open it wherever that column happens to be. Its opener, though, is the menu row
— on whichever of three pages you happen to be looking at. Opener and dialog
therefore share no parent, and the flag saying whether it is open lives in a
module-level store the App subscribes to. Nothing about it persists: "was I
editing my profile" is not worth restoring across a navigation.

**Saving the dialog is the profile's only write path.** `common.profiles` has
no update policy or grant, so a plain write from the frontend cannot reach it;
the color and the "Enable sounds" setting go together in one
`common.update_profile` call. When it answers, the dialog tells the shared
profile store what the server now holds, and every reader repaints at once:
the menu dot, the players strip, the event log — and the next sound, which
`sounds/playSound` checks against the setting. The picker itself is not this
folder's — it is `fields/ColorChoiceField`, a field like any other, shared with
the first-run claim screen so the choice looks the same whether you are making
it for the first time or changing your mind; the palette it offers has eight
entries. The table, the RPC and the policies are
[docs/common.md](../../../docs/common.md)'s.
