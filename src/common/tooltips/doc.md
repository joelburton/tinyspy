# tooltips

The one renderer behind every `data-tooltip` attribute in the app: rest the
pointer on a control for a beat, tab to it, or press and hold it on a phone,
and a small bubble names it. [docs/ui.md → Button
iconography](../../../docs/ui.md) says which controls carry one and what it
says.

## Intro to area

Many of the app's controls are a glyph and nothing else, a header full of
icon-only buttons, and a glyph needs some way to say its name. The browser's
own `title` bubble would do the job, except that some browsers delay it so
long that people never see it, so the app draws its own. Rather than each
button owning a bubble, a button writes what it wants said into a `data-tooltip`
attribute, and one host, mounted once at the root, listens on the whole
document and draws the bubble for whichever element is being asked about. A
button added tomorrow needs no wiring, and the cost is one set of listeners
however many controls opt in.

Opting in is the attribute and nothing more. Nothing is imported from this
folder, and the element can be anything: letterboxed's chain strip puts one on
a plain `<button>`,

```tsx
<button onClick={onRemoveLast} data-tooltip={`Take back ${w.toUpperCase()}`}>
  <IconRemove size={18} aria-hidden />
</button>
```

and the bubble reads "Take back MOTH" after a beat. Most code never writes the
attribute by hand, though: `StandardButton` and the purpose buttons derive it,
so an icon-only button names itself and a `tooltip` prop says something richer,
and `actionSurface` writes it with the action's key appended. The convention
for which controls carry one, and what it says, is docs/ui.md's.

Most of the folder is about what "being asked about" means on each kind of
device. With a mouse, resting the pointer on a control for a short beat is the
question. The beat is what keeps a bubble from flashing at every button you
cross on the way to somewhere else, and moving to a neighbor restarts it rather
than reusing it. Tabbing to a control asks too, but only keyboard focus counts:
a click also focuses, and answering that would put a bubble under the pointer
that just dismissed one. A touch screen has no hover to ask with, so there the
question is a press and hold, and the bubble stays until the next touch
anywhere, since nothing like leaving is ever going to happen. Hover is switched
off entirely on touch devices, because a tap synthesizes a hover that never
ends and would strand a bubble on screen.

Claiming the long press costs nobody anything, since a button has no text to
select. But lifting a finger after a hold still fires a click, so holding a
Restart button to learn that it says Restart would restart the game. The host
swallows exactly the click that follows a completed hold. Just as important is
letting go of that suppression: a press the system interrupts, or whose
element vanishes before the lift, produces no click at all, and a suppression
left armed would eat someone's next unrelated tap and read as the app dropping
a press. So a canceled touch disarms it at once, and every new press begins
disarmed.

The bubble is placed by measuring rather than by CSS. A bubble drawn in CSS
relative to its control cannot see the viewport, and the controls that most
need one sit at the top of the window and in its corners. So the host measures
the control and the bubble, puts the bubble above by default, flips it below
when there is no room on top, and pins it inside the side edges. No control
has to declare itself near an edge. Drawn in a portal at the top of the page's
stacking order, it is never clipped by a scrolling ancestor, and nothing needs
to cover it because a tooltip blocks nothing.

## Details

- **The beat is 400 ms and the hold is 450 ms.** The constants at the top of
  `TooltipHost.tsx` say why each is what it is, and why the hold is the longer
  of the two.
- **The hover gate is asked once, at mount,** not subscribed to: a device does
  not grow a mouse mid-session. jsdom has no `matchMedia` and is treated as
  hover-capable, which is what lets the component tests hover.
- **A scroll hides a visible bubble but leaves a pending one alone.** The
  visible one's measured position is stale. The pending one survives because
  inner containers scroll programmatically right after state transitions, and
  eating a tooltip scheduled in that window would make the feature feel broken
  at exactly the moment it looks idle.
- **A disabled button shows its bubble like any other, and nothing here may
  filter it out.** A disabled control's tooltip is where it says why
  (docs/ui.md → A disabled button still gets a tooltip). Every current engine
  dispatches `mouseover` on a disabled form control, so no special case is
  needed.
- **The bubble is `aria-hidden`.** It duplicates the control's own accessible
  name, which the button already carries.
- **Half of the touch contract is CSS, in another folder.** iOS answers a long
  press with its own Copy / Look Up callout, which is not the `contextmenu`
  event the host suppresses for Android, so the only lever is
  `-webkit-touch-callout: none` on `[data-tooltip]` in
  `core-css/utilities.css`. `TooltipHost.test.tsx` reads that stylesheet to
  make sure the rule is still there; without it every icon-only button on an
  iPhone is unlearnable.
- **The entry fade is a `@keyframes`,** not a transition: a mounting element
  has no previous value for a transition to start from.
