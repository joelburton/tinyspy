# gallery-keep — the snapshots worth remembering

Committed counterpart to `gallery/`, which is gitignored.

`gmake gallery` regenerates its **whole** output every run, so committing that
folder would mean a diff of thirty-odd changed PNGs every time you looked at
anything — noise that buries the one change you cared about. So the working
output stays out of git, and you promote the runs that mean something:

```
gmake gallery                              # look at gallery/index.html
gmake gallery-keep NAME=before-mobile-pass  # keep this one
```

That copies the entire folder to `gallery-keep/<date>-<name>/`, index and all.

**Copy the whole folder, not single images.** `index.html` links its tiles by
relative path, so a folder with a few PNGs cherry-picked out of it renders a
sheet full of broken tiles. The make target does the right thing; if you copy by
hand, take everything.

What's worth keeping, roughly: the state just before a big visual pass (so the
after has something to sit beside), the state just after one, and anything you
want to be able to point at later — "this is what the club page looked like in
July". Not every run.

Nothing reads this folder. It's for your eyes, and for `git log`.
