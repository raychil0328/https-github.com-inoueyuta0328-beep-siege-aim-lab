import json, sys, numpy as np
from collections import deque
src, dst, name = sys.argv[1], sys.argv[2], sys.argv[3]
cx0, cx1, cz0, cz1 = map(float, sys.argv[4].split(','))        # building crop
minArea = float(sys.argv[5]) if len(sys.argv) > 5 else 0.35     # furniture smaller than this (m^2) is clutter
d = json.load(open(src)); vx = 0.1
W = int((cx1 - cx0) / vx) + 2; H = int((cz1 - cz0) / vx) + 2
def paint(mask, hmap, boxes):
    for x, z, w, dd, h in boxes:
        i0, i1 = int(round((x - w / 2 - cx0) / vx)), int(round((x + w / 2 - cx0) / vx)); j0, j1 = int(round((z - dd / 2 - cz0) / vx)), int(round((z + dd / 2 - cz0) / vx))
        if i1 < 0 or j1 < 0 or i0 >= W or j0 >= H: continue
        i0, i1, j0, j1 = max(0, i0), min(W, i1), max(0, j0), min(H, j1)
        mask[j0:j1, i0:i1] = True
        if hmap is not None: hmap[j0:j1, i0:i1] = h
wall = np.zeros((H, W), bool); furn = np.zeros((H, W), bool); hm = np.zeros((H, W))
paint(wall, None, d['walls']); paint(furn, hm, d['furn'])
def _ero(m):
    o = m.copy(); o[1:] &= m[:-1]; o[:-1] &= m[1:]; o[:, 1:] &= m[:, :-1]; o[:, :-1] &= m[:, 1:]; return o

def dil(m):
    o = m.copy(); o[1:] |= m[:-1]; o[:-1] |= m[1:]; o[:, 1:] |= m[:, :-1]; o[:, :-1] |= m[:, 1:]; return o
# ---- walls: merge the voxel wall boxes into straight segments ----
T = 0.3
segs = []   # (orient, p, a, b, pmin, pmax)
for x, z, w, dd, h in d['walls']:
    if x + w / 2 < cx0 or x - w / 2 > cx1 or z + dd / 2 < cz0 or z - dd / 2 > cz1: continue
    if w >= dd: segs.append(['h', z, x - w / 2, x + w / 2, z - dd / 2, z + dd / 2])
    if dd >= w: segs.append(['v', x, z - dd / 2, z + dd / 2, x - w / 2, x + w / 2])
def merge_axis(ss, ptol, gap):
    ss = sorted(ss, key=lambda s: (s[1], s[2])); out = []
    for s in ss:
        m = None
        for o in out[-40:]:
            if abs(o[1] - s[1]) < ptol and s[2] <= o[3] + gap and s[3] >= o[2] - gap: m = o; break
        if m:
            la, lb = m[3] - m[2], s[3] - s[2]
            m[1] = (m[1] * la + s[1] * lb) / max(1e-6, la + lb); m[2] = min(m[2], s[2]); m[3] = max(m[3], s[3]); m[4] = min(m[4], s[4]); m[5] = max(m[5], s[5])
        else: out.append(list(s))
    return out
walls = []
for o in ('h', 'v'):
    ss = [s for s in segs if s[0] == o]
    for _ in range(3): ss = merge_axis(ss, 0.22, 0.35)        # collinear pieces + window gaps
    ss = merge_axis(ss, 0.45, 0.0)                              # the two faces of one thick wall
    for _, p, a, b, pmin, pmax in ss:
        if b - a < 0.8: continue
        th = min(0.8, max(T, pmax - pmin)); pc = (pmin + pmax) / 2
        if o == 'h': walls.append([round((a + b) / 2, 2), round(pc, 2), round(b - a, 2), round(th, 2), 3.2])
        else: walls.append([round(pc, 2), round((a + b) / 2, 2), round(th, 2), round(b - a, 2), 3.2])
# ---- furniture: one box per connected blob ----
fm = dil(furn) & ~wall; lab = np.zeros((H, W), np.int32); furns = []; c = 0
for j0, i0 in zip(*np.where(fm)):
    if lab[j0, i0]: continue
    c += 1; q = deque([(j0, i0)]); lab[j0, i0] = c; cells = []
    while q:
        j, i = q.popleft(); cells.append((j, i))
        for dj, di in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            a, b = j + dj, i + di
            if 0 <= a < H and 0 <= b < W and fm[a, b] and not lab[a, b]: lab[a, b] = c; q.append((a, b))
    jj = np.array([p[0] for p in cells]); ii = np.array([p[1] for p in cells])
    w = (ii.max() - ii.min() + 1) * vx - vx; dd = (jj.max() - jj.min() + 1) * vx - vx
    hs = hm[jj, ii]; hs = hs[hs > 0]
    if w * dd < minArea or not len(hs): continue
    if w * dd > 40: continue                               # giant blobs = terrain / vehicles outside
    furns.append([round(cx0 + (ii.min() + ii.max() + 1) / 2 * vx, 2), round(cz0 + (jj.min() + jj.max() + 1) / 2 * vx, 2), round(max(0.3, w), 2), round(max(0.3, dd), 2), round(float(np.percentile(hs, 75)), 2)])
sp = d['spawn']
out = {'name': name, 'source': d.get('source', '') + '; simplified: walls merged into straight segments, one box per object', 'walls': walls, 'furn': furns,
       'bounds': [cx0 - 0.5, cx1 + 0.5, cz0 - 0.5, cz1 + 0.5], 'spawn': sp, 'spawnYaw': d.get('spawnYaw', 0)}
json.dump(out, open(dst, 'w'), separators=(',', ':'))
print(name, 'walls', len(d['walls']), '->', len(walls), 'furn', len(d['furn']), '->', len(furns))
