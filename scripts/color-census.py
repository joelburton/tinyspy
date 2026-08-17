"""Color census — every color literal in src/**/*.css, grouped by game, each one
measured against the nearest token in common/theme.css (oklab distance) so a
lookalike can be spotted.

Written for the palette sweep (docs/colors-refinement.md), and kept because it is
also the "did we get them all" check afterwards: run it again and the per-game
lists should be brand colors and nothing else.

    python3 scripts/color-census.py

Distance is oklab euclidean, which is roughly perceptual: < 0.012 reads as the
same colour, < 0.05 as close enough to ask whether the difference was meant. It
deliberately does NOT decide anything — see the doc's rule about collapsing a
lookalike onto a shared token only when you are certain."""
import re, glob, os, math

HEX = re.compile(r'#[0-9a-fA-F]{3,8}\b')
FUNC = re.compile(r'\b(rgba?|hsla?|oklch|color-mix)\(')

def strip_comments(t): return re.sub(r'/\*.*?\*/', '', t, flags=re.S)

def hex2rgb(h):
    h = h.lstrip('#')
    if len(h) == 3: h = ''.join(c*2 for c in h)
    if len(h) == 8: h = h[:6]
    if len(h) != 6: return None
    return tuple(int(h[i:i+2], 16)/255 for i in (0, 2, 4))

def s2l(c): return c/12.92 if c <= 0.04045 else ((c+0.055)/1.055)**2.4
def oklab(rgb):
    r, g, b = (s2l(c) for c in rgb)
    l = (0.4122214708*r + 0.5363325363*g + 0.0514459929*b) ** (1/3)
    m = (0.2119034982*r + 0.6806995451*g + 0.1073969566*b) ** (1/3)
    s = (0.0883024619*r + 0.2817188376*g + 0.6299787005*b) ** (1/3)
    return (0.2104542553*l+0.7936177850*m-0.0040720468*s,
            1.9779984951*l-2.4285922050*m+0.4505937099*s,
            0.0259040371*l+0.7827717662*m-0.8086757660*s)
def dist(a, b):
    A, B = oklab(a), oklab(b)
    return math.sqrt(sum((x-y)**2 for x, y in zip(A, B)))

# common tokens with literal hex values
common = {}
for line in strip_comments(open('src/common/theme.css').read()).splitlines():
    m = re.match(r'\s*(--[a-z0-9-]+)\s*:\s*(#[0-9a-fA-F]{3,8})\s*;', line)
    if m: common[m.group(1)] = m.group(2)

def nearest(h):
    rgb = hex2rgb(h)
    if not rgb: return ('', 9)
    best, bd = '', 9
    for name, val in common.items():
        v = hex2rgb(val)
        if not v: continue
        d = dist(rgb, v)
        if d < bd: best, bd = name, d
    return best, bd

def decls(text):
    t = strip_comments(text)
    # (selector-ish context, prop, value)
    ctx = ''
    for part in re.split(r'([{}])', t):
        if part == '{' or part == '}': continue
        if ':' not in part:
            ctx = ' '.join(part.split())[-60:]
            continue
        for chunk in part.split(';'):
            if ':' not in chunk: 
                ctx = ' '.join(chunk.split())[-60:] or ctx
                continue
            prop, _, val = chunk.partition(':')
            yield ctx, prop.strip(), ' '.join(val.split())

games = {}
for f in sorted(glob.glob('src/**/*.css', recursive=True)):
    area = f.split('/')[1] if f.startswith('src/') else '?'
    for ctx, prop, val in decls(open(f).read()):
        if not (HEX.search(val) or FUNC.search(val)): continue
        for h in HEX.findall(val):
            n, d = nearest(h)
            games.setdefault(area, []).append((os.path.basename(f), prop, h, n, round(d, 3)))
        if FUNC.search(val) and not HEX.search(val):
            games.setdefault(area, []).append((os.path.basename(f), prop, val[:44], '(expression)', ''))

for area in sorted(games):
    print(f'\n===== {area} ({len(games[area])})')
    for f, prop, h, n, d in games[area]:
        flag = '' if d == '' else ('  SAME' if d < 0.012 else ('  near' if d < 0.05 else ''))
        print(f'  {f:34} {prop:22} {h:22} ~{n} {d}{flag}')
