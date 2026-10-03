#!/usr/bin/env python3
"""
obj2map.py — 3D geometry (OBJ mesh or PLY point cloud) -> SIEGE AIM LAB map JSON

Takes real map geometry (extracted game meshes, Sketchfab photogrammetry, etc.),
voxelizes it, splits it into floors, and emits axis-aligned boxes with REAL heights:
  walls      = voxel columns that are solid from floor level up to (near) the ceiling
  furniture  = everything else that sticks up from the floor (tables, crates, beds ...)

Usage:
  python3 obj2map.py input.obj  --name "オレゴン 1F" --out oregon-1f.json [--floor 1] [--voxel 0.2]
                                [--scale 1.0] [--up y|z] [--spawn X,Z] [--floor-z ZMIN,ZMAX]
  python3 obj2map.py cloud.ply  ... (same options; binary/ascii PLY with x y z)

Coordinates: output is metres, X east, Z south (+Z toward the default camera), Y up.
  --up z   : input is Z-up (e.g. Blender default export without Y-up conversion)
  --scale  : multiply input units (e.g. 0.01 if the source is in centimetres)
Floors: detected automatically from the histogram of upward-facing surface heights,
  or forced with --floor-z (height range of the floor slab you want, in input units after scale).
Only numpy is required.
"""
import sys, json, argparse, struct, math
import numpy as np

def read_obj(path, scale, up):
    V = []; F = []
    with open(path, 'r', errors='ignore') as f:
        for line in f:
            if line.startswith('v '):
                p = line.split(); V.append((float(p[1]), float(p[2]), float(p[3])))
            elif line.startswith('f '):
                idx = [int(t.split('/')[0]) for t in line.split()[1:]]
                idx = [i - 1 if i > 0 else len(V) + i for i in idx]
                for k in range(1, len(idx) - 1): F.append((idx[0], idx[k], idx[k + 1]))
    V = np.array(V, dtype=np.float64) * scale
    if up == 'z': V = V[:, [0, 2, 1]]; V[:, 2] = -V[:, 2]   # Z-up -> Y-up (x, z->y, -y->z)
    return V, np.array(F, dtype=np.int64)

def read_ply(path, scale, up):
    with open(path, 'rb') as f:
        header = []
        while True:
            line = f.readline().decode('ascii', errors='ignore').strip(); header.append(line)
            if line == 'end_header': break
        n = 0; props = []; fmt = 'ascii'
        for h in header:
            if h.startswith('format'): fmt = h.split()[1]
            if h.startswith('element vertex'): n = int(h.split()[2])
            if h.startswith('property') and n and not props_done(header, h): props.append(h.split()[1:])
        names = [p[1] for p in props]; types = [p[0] for p in props]
        ix, iy, iz = names.index('x'), names.index('y'), names.index('z')
        if fmt == 'ascii':
            pts = np.loadtxt(f, max_rows=n, usecols=(ix, iy, iz))
        else:
            tmap = {'float': 'f', 'float32': 'f', 'double': 'd', 'uchar': 'B', 'uint8': 'B', 'char': 'b', 'int': 'i', 'uint': 'I', 'short': 'h', 'ushort': 'H'}
            rec = ('<' if 'little' in fmt else '>') + ''.join(tmap[t] for t in types)
            size = struct.calcsize(rec); buf = f.read(size * n)
            arr = np.frombuffer(buf, dtype=np.dtype([(f'c{i}', ('<' if 'little' in fmt else '>') + tmap[t]) for i, t in enumerate(types)]), count=n)
            pts = np.stack([arr[f'c{ix}'], arr[f'c{iy}'], arr[f'c{iz}']], 1).astype(np.float64)
    pts = pts * scale
    if up == 'z': pts = pts[:, [0, 2, 1]]; pts[:, 2] = -pts[:, 2]
    return pts

def props_done(header, h):
    # properties listed after 'element face' belong to faces, not vertices
    seen_face = False
    for line in header:
        if line.startswith('element face'): seen_face = True
        if line == h: return seen_face
    return False

def sample_triangles(V, F, step):
    """Dense surface samples on every triangle (spacing ~step) + upward-facing flags."""
    pts = []; upflag = []
    A, B, C = V[F[:, 0]], V[F[:, 1]], V[F[:, 2]]
    N = np.cross(B - A, C - A); area2 = np.linalg.norm(N, axis=1); ok = area2 > 1e-9
    Nn = np.zeros_like(N); Nn[ok] = N[ok] / area2[ok, None]
    for i in np.where(ok)[0]:
        a, b, c = A[i], B[i], C[i]
        la, lb = np.linalg.norm(b - a), np.linalg.norm(c - a)
        n1 = max(1, int(math.ceil(la / step))); n2 = max(1, int(math.ceil(lb / step)))
        u = np.linspace(0, 1, n1 + 1); v = np.linspace(0, 1, n2 + 1)
        uu, vv = np.meshgrid(u, v); m = uu + vv <= 1.0001
        P = a + uu[m][:, None] * (b - a) + vv[m][:, None] * (c - a)
        pts.append(P); upflag.append(np.full(len(P), Nn[i, 1] > 0.7))
    return np.concatenate(pts), np.concatenate(upflag)

def detect_floors(pts, up, voxel):
    """Floor levels = strong peaks in the height histogram of upward-facing samples."""
    ys = pts[up, 1] if up is not None and up.any() else pts[:, 1]
    bins = np.arange(ys.min() - voxel, ys.max() + voxel, voxel / 2)
    h, edges = np.histogram(ys, bins)
    peaks = []
    thr = max(h.max() * 0.08, 50)
    for i in range(1, len(h) - 1):
        if h[i] >= thr and h[i] >= h[i - 1] and h[i] >= h[i + 1]:
            y = (edges[i] + edges[i + 1]) / 2
            if not peaks or y - peaks[-1] > 2.2: peaks.append(y)
            elif h[i] > h[np.searchsorted(edges, peaks[-1]) - 1]: peaks[-1] = y
    return peaks

def boxes_from_mask(mask, origin, voxel, height_of):
    """Greedy merge of a 2D occupancy mask into rectangles; height_of(i0,i1,j0,j1) gives box height."""
    m = mask.copy(); out = []
    H, W = m.shape
    for j in range(H):
        i = 0
        while i < W:
            if m[j, i]:
                i2 = i
                while i2 + 1 < W and m[j, i2 + 1]: i2 += 1
                j2 = j
                while j2 + 1 < H and m[j2 + 1, i:i2 + 1].all(): j2 += 1
                x0, x1 = origin[0] + i * voxel, origin[0] + (i2 + 1) * voxel
                z0, z1 = origin[1] + j * voxel, origin[1] + (j2 + 1) * voxel
                out.append([round((x0 + x1) / 2, 3), round((z0 + z1) / 2, 3), round(x1 - x0, 3), round(z1 - z0, 3), round(height_of(i, i2, j, j2), 2)])
                m[j:j2 + 1, i:i2 + 1] = False; i = i2 + 1
            else: i += 1
    return out

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('input'); ap.add_argument('--name', required=True); ap.add_argument('--out', required=True)
    ap.add_argument('--voxel', type=float, default=0.2); ap.add_argument('--scale', type=float, default=1.0)
    ap.add_argument('--up', choices=['y', 'z'], default='y'); ap.add_argument('--floor', type=int, default=None, help='floor index (0 = lowest) to export')
    ap.add_argument('--floor-z', default=None, help='force floor slab height range, e.g. 0.0,0.4'); ap.add_argument('--spawn', default=None, help='X,Z in output metres')
    ap.add_argument('--ceiling', type=float, default=3.0, help='height above floor considered "full height" (wall)')
    a = ap.parse_args()
    vx = a.voxel
    if a.input.lower().endswith('.ply'):
        pts = read_ply(a.input, a.scale, a.up); up = None
    else:
        V, F = read_obj(a.input, a.scale, a.up); pts, up = sample_triangles(V, F, vx * 0.5)
    print(f'samples: {len(pts):,}  bbox x[{pts[:,0].min():.1f},{pts[:,0].max():.1f}] y[{pts[:,1].min():.1f},{pts[:,1].max():.1f}] z[{pts[:,2].min():.1f},{pts[:,2].max():.1f}]')
    if a.floor_z:
        lo, hi = map(float, a.floor_z.split(',')); floor_y = (lo + hi) / 2; floors = [floor_y]
    else:
        floors = detect_floors(pts, up, vx); print('floor levels (y):', [round(f, 2) for f in floors])
        if not floors: sys.exit('no floor detected; use --floor-z')
        floor_y = floors[a.floor if a.floor is not None else 0]
    y0, y1 = floor_y + 0.25, floor_y + a.ceiling + 0.6      # slab of interest above this floor
    sel = (pts[:, 1] >= y0) & (pts[:, 1] < y1); P = pts[sel]
    xmin, zmin = P[:, 0].min(), P[:, 2].min(); W = int((P[:, 0].max() - xmin) / vx) + 2; H = int((P[:, 2].max() - zmin) / vx) + 2; L = int((y1 - y0) / vx) + 1
    gi = ((P[:, 0] - xmin) / vx).astype(int); gj = ((P[:, 2] - zmin) / vx).astype(int); gk = ((P[:, 1] - y0) / vx).astype(int)
    occ = np.zeros((H, W, L), bool); occ[gj, gi, gk] = True
    # column analysis: top of the solid part starting at the floor, and total vertical coverage
    hcol = np.zeros((H, W)); cover = occ.sum(2)
    for k in range(L):
        layer = occ[:, :, k]
        hcol[layer & (hcol >= k * vx - vx * 1.01)] = (k + 1) * vx   # continue only if column is contiguous from the floor
    wall_mask = (hcol >= a.ceiling - 0.6) | ((cover * vx) >= a.ceiling - 0.9)
    furn_mask = (cover > 0) & ~wall_mask & (hcol >= vx)
    # fill enclosed hollows (surface meshes only sample the shell of crates/tables/thick walls)
    from collections import deque
    solid = wall_mask | furn_mask; reach = np.zeros_like(solid)
    q = deque()
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
    holes = ~solid & ~reach
    # label hole components; small ones (<= 3 m^2) are hollow object shells -> fill; large ones are enclosed rooms -> keep open
    lab = np.zeros((H, W), int); comp = 0
    for j0, i0 in zip(*np.where(holes)):
        if lab[j0, i0]: continue
        comp += 1; cells = [(j0, i0)]; lab[j0, i0] = comp; qq = deque([(j0, i0)])
        while qq:
            j, i = qq.popleft()
            for dj, di in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                nj, ni = j + dj, i + di
                if 0 <= nj < H and 0 <= ni < W and holes[nj, ni] and not lab[nj, ni]: lab[nj, ni] = comp; qq.append((nj, ni)); cells.append((nj, ni))
        if len(cells) * vx * vx > 3.0: continue
        for j, i in cells:
            nb = [(j + dj, i + di) for dj, di in ((1, 0), (-1, 0), (0, 1), (0, -1)) if 0 <= j + dj < H and 0 <= i + di < W]
            if all(wall_mask[a, b] or holes[a, b] for a, b in nb) and any(wall_mask[a, b] for a, b in nb): wall_mask[j, i] = True
            else: furn_mask[j, i] = True; hcol[j, i] = max([hcol[a, b] for a, b in nb if furn_mask[a, b] or wall_mask[a, b]] + [vx])
    org = (xmin, zmin)
    walls = boxes_from_mask(wall_mask, org, vx, lambda i, i2, j, j2: a.ceiling + 0.2)
    furn = boxes_from_mask(furn_mask, org, vx, lambda i, i2, j, j2: max(0.3, float(np.median(hcol[j:j2 + 1, i:i2 + 1]) + 0.25)))
    furn = [b for b in furn if b[2] * b[3] >= vx * vx * 2]      # drop single-voxel noise
    bounds = [float(xmin) - 1, float(xmin + W * vx) + 1, float(zmin) - 1, float(zmin + H * vx) + 1]
    if a.spawn: sx, sz = map(float, a.spawn.split(','))
    else:   # spawn = centre of the largest open area (max distance to any occupied cell), cheap approximation
        free = ~(wall_mask | furn_mask); best = None
        for j in range(0, H, 2):
            for i in range(0, W, 2):
                if not free[j, i]: continue
                r = 0
                while r < 30 and j - r >= 0 and j + r < H and i - r >= 0 and i + r < W and free[j - r:j + r + 1, i - r:i + r + 1].all(): r += 1
                if best is None or r > best[0]: best = (r, i, j)
        sx, sz = xmin + best[1] * vx, zmin + best[2] * vx
    out = {'name': a.name, 'source': f'{a.input} voxelized at {vx} m, floor y={floor_y:.2f}', 'walls': walls, 'furn': furn, 'bounds': bounds, 'spawn': [round(sx, 2), round(sz, 2)], 'spawnYaw': 0}
    json.dump(out, open(a.out, 'w'))
    print(f'wrote {a.out}: walls {len(walls)} furniture {len(furn)} spawn {out["spawn"]}')

if __name__ == '__main__':
    main()
