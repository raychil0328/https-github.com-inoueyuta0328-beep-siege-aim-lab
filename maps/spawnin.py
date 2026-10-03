import json, sys, numpy as np
f, rx0, rx1, rz0, rz1, yaw = sys.argv[1], *map(float, sys.argv[2:7])
d = json.load(open(f)); vx = 0.1
x0, x1, z0, z1 = d['bounds']; W = int((x1 - x0) / vx) + 2; H = int((z1 - z0) / vx) + 2
wall = np.zeros((H, W), bool); occ = np.zeros((H, W), bool)
for kind, boxes in (('w', d['walls']), ('f', d['furn'])):
    for x, z, w, dd, h in boxes:
        i0, i1 = int((x - w / 2 - x0) / vx), int((x + w / 2 - x0) / vx) + 1; j0, j1 = int((z - dd / 2 - z0) / vx), int((z + dd / 2 - z0) / vx) + 1
        occ[max(0, j0):j1, max(0, i0):i1] = True
        if kind == 'w': wall[max(0, j0):j1, max(0, i0):i1] = True
def enclosed(i, j, maxd=120):   # walls in all 4 axis directions within maxd cells
    return all((wall[j, i:i + maxd].any(), wall[j, max(0, i - maxd):i + 1].any(), wall[j:j + maxd, i].any(), wall[max(0, j - maxd):j + 1, i].any()))
best = None
for z in np.arange(rz0, rz1, 0.2):
    for x in np.arange(rx0, rx1, 0.2):
        i, j = int((x - x0) / vx), int((z - z0) / vx)
        if occ[j, i] or not enclosed(i, j): continue
        r = 0
        while r < 40 and not occ[max(0, j - r):j + r + 1, max(0, i - r):i + r + 1].any(): r += 1
        if best is None or r > best[0]: best = (r, round(float(x), 2), round(float(z), 2))
print(f, 'clearance', best[0] * vx, 'spawn', best[1:])
d['spawn'] = [best[1], best[2]]; d['spawnYaw'] = yaw; json.dump(d, open(f, 'w'), separators=(',', ':'))
