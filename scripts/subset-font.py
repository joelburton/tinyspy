#!/usr/bin/env python3
"""Build the app's font file: Roboto Flex, cut down to the characters we use.

    python3 -m venv .venv && .venv/bin/pip install fonttools brotli
    .venv/bin/python scripts/subset-font.py

Writes `public/fonts/roboto-flex.woff2`, which is what `common/base.css`
serves. Run it only when the CHARACTER SET changes — the output is committed,
so this is not part of the build.

WHY WE SUBSET OURSELVES rather than take Google's slice. Google splits a family
by script, and their Latin slice drops symbols that the font really does
contain: `→` is used 28 times in this app and would have rendered in a fallback
face, in the middle of our own sentences. Worse, their slice keeps `↑` and `↓`
while dropping `←` and `→`, so an arrow-key hint would have shown two arrows in
the app font and two in something else, side by side.

WHAT WE KEEP is Google's Latin range plus those five symbols
(plans/css-system-2.md §22). A symbol outside this set is not a bug to fix
here: it is surfaced and decided by the area that wants it, the same way a
value outside a vocabulary is.

ALL FIVE DIALS SURVIVE — weight, width, grade, slant and optical size. Each one
multiplies against the others, so this file is much larger than a single-weight
font would be, and that is the trade §22 records: grade and width are worth it,
and dropping optical size is the lever if the size ever stops being acceptable.

The source is fetched rather than committed: it is 1.7 MB, we use a quarter of
it, and a binary in the repo that nothing reads at runtime is a binary nobody
will ever notice going stale.
"""

import io
import urllib.request
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

SOURCE = (
    'https://raw.githubusercontent.com/google/fonts/main/ofl/robotoflex/'
    'RobotoFlex%5BGRAD,XOPQ,XTRA,YOPQ,YTAS,YTDE,YTFI,YTLC,YTUC,opsz,slnt,wdth,wght%5D.ttf'
)
OUT = Path('public/fonts/roboto-flex.woff2')

# Google's own Latin range for this family, so the baseline is exactly what
# their slice would have given us.
LATIN = (
    'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,'
    'U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,'
    'U+2212,U+2215,U+FEFF,U+FFFD'
)

# The five they dropped and we use: → ← ≥ ≈ ≠
EXTRA = 'U+2190,U+2192,U+2248,U+2260,U+2265'

# The dials we ship. Roboto Flex has thirteen; the eight not named here are
# parametric ones for fine-tuning a face's construction (the height of
# lowercase letters, the thickness of vertical stems), and no design decision
# in this app will ever be spelled that way. Keeping them cost 400 KB —
# measured, not assumed — because every dial multiplies against the others.
KEEP_AXES = ('wght', 'wdth', 'GRAD', 'opsz', 'slnt')


def main() -> None:
    print(f'fetching {SOURCE.rsplit("/", 1)[1][:20]}…')
    raw = urllib.request.urlopen(SOURCE).read()
    print(f'  source: {len(raw) / 1024:.0f} KB')

    font = TTFont(io.BytesIO(raw))

    # CHARACTERS FIRST, THEN DIALS, and the order is not a preference: pinning
    # an axis rewrites the per-glyph variation data, and subsetting the result
    # walks that data looking for glyphs the rewrite has already dropped
    # (`KeyError: 'uni000D'`). Cutting the character set first leaves the two
    # halves consistent.
    options = subset.Options()
    # Keep every OpenType feature the kept glyphs use. The default set drops
    # `pnum`, which is the only way back to proportional digits — this font is
    # tabular by default, and that default is one we may want to override in
    # prose one day.
    options.layout_features = ['*']
    options.name_IDs = ['*']
    options.notdef_outline = True

    subsetter = subset.Subsetter(options=options)
    subsetter.populate(unicodes=subset.parse_unicodes(f'{LATIN},{EXTRA}'))
    subsetter.subset(font)

    # Pin the dials we don't ship to their design defaults, which removes their
    # data entirely rather than merely leaving it unused.
    drop = {a.axisTag: a.defaultValue for a in font['fvar'].axes if a.axisTag not in KEEP_AXES}
    print(f'  pinning {len(drop)} parametric axes: {" ".join(drop)}')
    font = instancer.instantiateVariableFont(font, drop, inplace=True, updateFontNames=False)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    font.flavor = 'woff2'
    font.save(OUT)

    written = TTFont(OUT)
    axes = ' '.join(a.axisTag for a in written['fvar'].axes)
    missing = [c for c in '→←≥≈≠' if ord(c) not in written.getBestCmap()]
    print(f'  wrote {OUT}: {OUT.stat().st_size / 1024:.0f} KB')
    print(f'  characters: {len(written.getBestCmap())}')
    print(f'  axes: {axes}')
    print(f'  the five symbols: {"MISSING " + "".join(missing) if missing else "all present"}')


if __name__ == '__main__':
    main()
