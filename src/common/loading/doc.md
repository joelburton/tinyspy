# loading

The stand-in shown while a page loads.

## Intro to area

One component and one word, because there is one idea. A page that is still
pending has nothing to distinguish it from any other page that is still
pending: "Loading club…" tells a reader nothing that "Loading…" doesn't, and
naming the thing you are waiting for only matters when you could be waiting for
two.

It takes no box. A bordered box that exists for 200ms and is then replaced by a
differently shaped one is a flash, and layout stability
([ui.md](../../../docs/ui.md#layout-stability)) is the thing that rules out. A
word on the page costs nothing when it goes, and it is muted because it is not
the content — it is a note that the content is coming.

The distinction worth holding is between this and a held slot. HomePage keeps a
blank line where its club list will be, because the rest of that page is
already drawn and the list arriving must not push it around. That is the page
reserving its own space. This is for when there is no page yet to reserve
anything in.
