#!/usr/bin/env python3
"""
obj2map.py — 3D geometry (OBJ mesh) -> SIEGE AIM LAB map JSON (walls + furniture boxes with real heights)

Built for full game-map exports (millions of faces): everything is vectorized with numpy.

Pipeline (per floor):
  1. read OBJ (only 'v' and 'f' lines), optionally crop to an XZ rectangle (the building)
  2. keep triangles that intersect the floor's height slab [floor+lo, floor+hi]
  3. split triangles until every edge < voxel/2, take vertices + centroids as surface samples
  4. voxelize; per (x,z) column measure the height of solid material contiguous from just above the floor
       wall      : contiguous solid up to >= --wall-h (default 2.0 m above floor)  -> blocks bullets and movement
       furniture : contiguous solid of 0.3 m .. wall-h                            -> cover with measured height
  5. fill small hollow shells (inside of crates / thick walls), greedy-merge columns into boxes

Usage:
  python3 obj2map.py oregon_all.obj --name "オレゴン 1F" --out oregon-1f.json --floor-y 0.0 \
      --crop -50,25,-5,75 [--voxel 0.2] [--spawn X,Z] [--spawn-yaw RAD]
  (OBJ must be metres, Y-up. Output keeps the OBJ's X and Z axes.)
"""
import sys, json, argparse, time
import numpy as np
from collections import deque

def log(*a): print(f'[{time.strftime("%H:%M:%S")}]', *a, flush=True)

def read_obj(path):
    vs, fs = [], []
    with open(path, 'rb') as f:
        for line in f:
            if line[:2] == b'v ': vs.append(line[2:])
            elif line[:2] == b'f ': fs.append(line[2:])
    log(f'parsed lines: v={len(vs):,} f={len(fs):,}')
    V = np.array(b' '.join(vs).split(), dtype=np.float64).reshape(-1, 3)
    # faces: handle 'a b c', 'a/b/c', 'a//c', and polygons (fan-triangulate)
    tri = []; poly = []
    for l in fs:
        p = l.split()
        if len(p) == 3: tri.append(p)
        else: poly.append(p)
    def idx(tok): return int(tok.split(b'/')[0])
    if tri and b'/' not in tri[0][0]:
        F = np.array(b' '.join(b' '.join(t) for t in tri).split(), dtype=np.int64).reshape(-1, 3)
    else:
        F = np.array([[idx(t) for t in p] for p in tri], dtype=np.int64).reshape(-1, 3)
    extra = []
    for p in poly:
        ii = [idx(t) for t in p]
        for k in range(1, len(ii) - 1): extra.append((ii[0], ii[k], ii[k + 1]))
    if extra: F = np.concatenate([F, np.array(extra, dtype=np.int64)])
    F = np.where(F > 0, F - 1, len(V) + F)
    return V, F

def subdivide(A, B, C, h, cap=60_000_000):
    """Split triangles (arrays of shape (n,3)) until every edge < h; return sample points."""
    pts = []
    while len(A):
        e = np.maximum.reduce([np.linalg.norm(B - A, axis=1), np.linalg.norm(C - B, axis=1), np.linalg.norm(A - C, axis=1)])
        small = e < h
        pts.append(A[small]); pts.append(B[small]); pts.append(C[small]); pts.append((A[small] + B[small] + C[small]) / 3)
        A, B, C = A[~small], B[~small], C[~small]
        if not len(A): break
        if len(A) * 4 > cap: raise SystemExit('too many subdivisions; use a larger --voxel or --crop')
        AB, BC, CA = (A + B) / 2, (B + C) / 2, (C + A) / 2
        A, B, C = np.concatenate([A, AB, CA, AB]), np.concatenate([AB, B, BC, BC]), np.concatenate([CA, BC, C, CA])
    return np.concatenate(pts) if pts else np.zeros((0, 3))

def boxes_from_mask(mask, x0, z0, vx, height_of):
    m = mask.copy(); out = []; H, W = m.shape
    for j in range(H):
        row = m[j]
        if not row.any(): continue
        i = 0
        while i < W:
            if m[j, i]:
                i2 = i
                while i2 + 1 < W and m[j, i2 + 1]: i2 += 1
                j2 = j
                while j2 + 1 < H and m[j2 + 1, i:i2 + 1].all(): j2 += 1
                ax, bx = x0 + i * vx, x0 + (i2 + 1) * vx; az, bz = z0 + j * vx, z0 + (j2 + 1) * vx
                out.append([round((ax + bx) / 2, 3), round((az + bz) / 2, 3), round(bx - ax, 3), round(bz - az, 3), round(float(height_of(i, i2, j, j2)), 2)])
                m[j:j2 + 1, i:i2 + 1] = False; i = i2 + 1
            else: i += 1
    return out

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('input'); ap.add_argument('--name', required=True); ap.add_argument('--out', required=True)
    ap.add_argument('--floor-y', type=float, required=True, help='height of this floor slab (meta.json floors[].y)')
    ap.add_argument('--crop', default=None, help='xmin,xmax,zmin,zmax (OBJ metres)')
    ap.add_argument('--voxel', type=float, default=0.1)
    ap.add_argument('--lo', type=float, default=0.45, help='ignore geometry below floor+lo (floor slab, rugs, raised floor steps)')
    ap.add_argument('--hi', type=float, default=2.4, help='ignore geometry above floor+hi (lintels, ceiling)')
    ap.add_argument('--wall-h', type=float, default=2.0, help='contiguous height above floor that counts as wall')
    ap.add_argument('--spawn', default=None); ap.add_argument('--spawn-yaw', type=float, default=0.0)
    ap.add_argument('--cache', default=None, help='.npz cache of parsed V/F (speeds up re-runs)')
    a = ap.parse_args(); vx = a.voxel; fy = a.floor_y
    if a.cache and __import__('os').path.exists(a.cache):
        d = np.load(a.cache); V, F = d['V'], d['F']; log('loaded cache', a.cache)
    else:
        V, F = read_obj(a.input)
        if a.cache: np.savez(a.cache, V=V, F=F)
    log(f'verts {len(V):,} faces {len(F):,}')
    A, B, C = V[F[:, 0]], V[F[:, 1]], V[F[:, 2]]
    ymin = np.minimum.reduce([A[:, 1], B[:, 1], C[:, 1]]); ymax = np.maximum.reduce([A[:, 1], B[:, 1], C[:, 1]])
    keep = (ymax >= fy + a.lo) & (ymin <= fy + a.hi)
    if a.crop:
        x0c, x1c, z0c, z1c = map(float, a.crop.split(','))
        cx = (A[:, 0] + B[:, 0] + C[:, 0]) / 3; cz = (A[:, 2] + B[:, 2] + C[:, 2]) / 3
        keep &= (cx >= x0c - 2) & (cx <= x1c + 2) & (cz >= z0c - 2) & (cz <= z1c + 2)
    A, B, C = A[keep], B[keep], C[keep]; log(f'triangles in slab: {len(A):,}')
    P = subdivide(A, B, C, vx * 0.5); log(f'samples {len(P):,}')
    P = P[(P[:, 1] >= fy + a.lo) & (P[:, 1] < fy + a.hi)]
    if a.crop: P = P[(P[:, 0] >= x0c) & (P[:, 0] <= x1c) & (P[:, 2] >= z0c) & (P[:, 2] <= z1c)]
    x0, z0 = P[:, 0].min(), P[:, 2].min()
    W = int((P[:, 0].max() - x0) / vx) + 2; H = int((P[:, 2].max() - z0) / vx) + 2; L = int((a.hi - a.lo) / vx) + 1
    gi = ((P[:, 0] - x0) / vx).astype(np.int32); gj = ((P[:, 2] - z0) / vx).astype(np.int32); gk = ((P[:, 1] - fy - a.lo) / vx).astype(np.int32)
    occ = np.zeros((H, W, L), bool); occ[gj, gi, np.clip(gk, 0, L - 1)] = True
    log(f'grid {W}x{H}x{L}')
    # contiguous solid height from the bottom of the slab
    run = np.cumprod(occ, axis=2).sum(axis=2)            # number of contiguous voxels from k=0
    hcol = a.lo + run * vx                               # height above floor of that solid
    wall = hcol >= a.wall_h
    furn = (run > 0) & ~wall & (hcol >= 0.3 + a.lo * 0)  # run>0 means it reaches down to floor+lo
    # fill hollow shells (crate / wall interiors): non-solid regions <= 3 m^2 not connected to the outside
    solid = wall | furn; reach = np.zeros_like(solid); q = deque()
    for j in range(H):
        for i in (0, W - 1):
            if not solid[j, i] and not reach[j, i]: reach[j, i] = True; q.append((j, i))
    for i in range(W):
        for j in (0, H - 1):
            if not solid[j, i] and not reach[j, i]: reach[j, i] = True; q.append((j, i))
    while q:
        j, i = q.popleft()
        for dj, di in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nj, ni = j + dj, i + di
            if 0 <= nj < H and 0 <= ni < W and not solid[nj, ni] and not reach[nj, ni]: reach[nj, ni] = True; q.append((nj, ni))
    holes = ~solid & ~reach; lab = np.zeros((H, W), np.int32); comp = 0; filled = 0
    for j0, i0 in zip(*np.where(holes)):
        if lab[j0, i0]: continue
        comp += 1; cells = [(j0, i0)]; lab[j0, i0] = comp; qq = deque([(j0, i0)])
        while qq:
            j, i = qq.popleft()
            for dj, di in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                nj, ni = j + dj, i + di
                if 0 <= nj < H and 0 <= ni < W and holes[nj, ni] and not lab[nj, ni]: lab[nj, ni] = comp; qq.append((nj, ni)); cells.append((nj, ni))
        if len(cells) * vx * vx > 3.0: continue
        jj = np.array([c[0] for c in cells]); ii = np.array([c[1] for c in cells])
        ring = np.zeros((H, W), bool); ring[np.clip(jj - 1, 0, H - 1), ii] = True; ring[np.clip(jj + 1, 0, H - 1), ii] = True; ring[jj, np.clip(ii - 1, 0, W - 1)] = True; ring[jj, np.clip(ii + 1, 0, W - 1)] = True
        ring &= ~holes
        if wall[ring].mean() > 0.5: wall[jj, ii] = True
        else: furn[jj, ii] = True; hcol[jj, ii] = np.median(hcol[ring & furn]) if (ring & furn).any() else 0.8
        filled += len(cells)
    log(f'filled hollow cells: {filled}')
    # drop isolated single furniture voxels (noise: cables, thin poles)
    nb = np.zeros((H, W), np.int32)
    for dj, di in ((1, 0), (-1, 0), (0, 1), (0, -1)): nb += np.roll(np.roll(furn | wall, dj, 0), di, 1)
    furn &= nb > 0
    walls = boxes_from_mask(wall, x0, z0, vx, lambda *_: 3.2)
    furns = boxes_from_mask(furn, x0, z0, vx, lambda i, i2, j, j2: np.median(hcol[j:j2 + 1, i:i2 + 1]))
    # surface samples sit on faces, so each box over-extends by ~half a voxel per side: trim it back
    def trim(b): b[2] = round(max(vx, b[2] - vx / 2), 3); b[3] = round(max(vx, b[3] - vx / 2), 3); return b
    walls = [trim(b) for b in walls]; furns = [trim(b) for b in furns]
    log(f'walls {len(walls)} furniture {len(furns)}')
    bounds = [float(x0) - 0.5, float(x0 + W * vx) + 0.5, float(z0) - 0.5, float(z0 + H * vx) + 0.5]
    if a.spawn: sx, sz = map(float, a.spawn.split(','))
    else:
        free = ~(wall | furn); best = (0, W // 2, H // 2)
        for j in range(2, H - 2, 3):
            for i in range(2, W - 2, 3):
                if not free[j, i]: continue
                r = 0
                while r < 25 and j - r >= 0 and j + r < H and i - r >= 0 and i + r < W and free[j - r:j + r + 1, i - r:i + r + 1].all(): r += 1
                if r > best[0]: best = (r, i, j)
        sx, sz = x0 + best[1] * vx, z0 + best[2] * vx
    out = {'name': a.name, 'source': f'{a.input}: floor y={fy}, voxel {vx} m, slab +{a.lo}..+{a.hi} m', 'walls': walls, 'furn': furns,
           'bounds': bounds, 'spawn': [round(float(sx), 2), round(float(sz), 2)], 'spawnYaw': a.spawn_yaw}
    json.dump(out, open(a.out, 'w'), separators=(',', ':'))
    log(f'wrote {a.out} ({len(json.dumps(out)) / 1024:.0f} KB) spawn {out["spawn"]}')

if __name__ == '__main__':
    main()
