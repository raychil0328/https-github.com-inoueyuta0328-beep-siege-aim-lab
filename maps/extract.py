import sys, json
from PIL import Image, ImageDraw
import numpy as np
from collections import deque
src, out, cx, cy, ppm, spawn_px = sys.argv[1], sys.argv[2], float(sys.argv[3]), float(sys.argv[4]), float(sys.argv[5]), sys.argv[6]
im0 = Image.open(src).convert('RGB'); im = np.array(im0).astype(int)
r,g,b = im[...,0],im[...,1],im[...,2]
white = (r>215)&(g>215)&(b>215); yellow = (r>190)&(g>140)&(b<90)
wall = white|yellow
floor = (b>r+25)&(b>110)&(~white)
lum = im.sum(2).astype(float)
# furniture = locally brighter than the surrounding floor (plans shade furniture lighter than the floor)
def boxmean(vals, mask, k):
    v = np.where(mask, vals, 0.0); m = mask.astype(float)
    cv = np.pad(v,1).cumsum(0).cumsum(1); cm = np.pad(m,1).cumsum(0).cumsum(1)
    H_,W_ = vals.shape; r_ = k//2
    def win(c):
        y0=np.clip(np.arange(H_)-r_,0,H_); y1=np.clip(np.arange(H_)+r_+1,0,H_); x0=np.clip(np.arange(W_)-r_,0,W_); x1=np.clip(np.arange(W_)+r_+1,0,W_)
        return c[y1][:,x1]-c[y0][:,x1]-c[y1][:,x0]+c[y0][:,x0]
    return win(cv)/np.maximum(win(cm),1)
bg = boxmean(lum, floor, 61)
furn = floor & (lum > bg + 38)
H,W = wall.shape
lum = im.sum(2).astype(float)
def dil(m):
    o=m.copy(); o[1:]|=m[:-1]; o[:-1]|=m[1:]; o[:,1:]|=m[:,:-1]; o[:,:-1]|=m[:,1:]; return o
def ero(m):
    o=m.copy(); o[1:]&=m[:-1]; o[:-1]&=m[1:]; o[:,1:]&=m[:,:-1]; o[:,:-1]&=m[:,1:]; return o
# breakable walls are drawn as yellow/black hatching: fill the black stripes next to yellow
hatch = dil(dil(dil(yellow))) & (lum < 230)
wall = wall | hatch
wall = dil(wall)
def label(mask):
    lab=np.zeros(mask.shape,int); n=0; comps=[]
    for y in range(mask.shape[0]):
        for x in range(mask.shape[1]):
            if mask[y,x] and lab[y,x]==0:
                n+=1; q=deque([(y,x)]); lab[y,x]=n; pts=[]
                while q:
                    cy_,cx_=q.popleft(); pts.append((cy_,cx_))
                    for dy,dx in ((1,0),(-1,0),(0,1),(0,-1)):
                        ny,nx=cy_+dy,cx_+dx
                        if 0<=ny<mask.shape[0] and 0<=nx<mask.shape[1] and mask[ny,nx] and lab[ny,nx]==0: lab[ny,nx]=n; q.append((ny,nx))
                comps.append(pts)
    return comps
# morphological close on furniture (dilate then erode, 1px) using numpy shifts
def dil(m):
    o=m.copy(); o[1:]|=m[:-1]; o[:-1]|=m[1:]; o[:,1:]|=m[:,:-1]; o[:,:-1]|=m[:,1:]; return o
def ero(m):
    o=m.copy(); o[1:]&=m[:-1]; o[:-1]&=m[1:]; o[:,1:]&=m[:,:-1]; o[:,:-1]&=m[:,1:]; return o
fm = ero(dil(dil(furn)))
fm = fm & ~dil(wall)
comps = label(fm)
furn_boxes=[]
for pts in comps:
    if len(pts) < 30: continue
    ys=[p[0] for p in pts]; xs=[p[1] for p in pts]
    x0,x1,y0,y1=min(xs),max(xs),min(ys),max(ys)
    if (x1-x0+1)*(y1-y0+1) < 60: continue
    fill = len(pts)/((x1-x0+1)*(y1-y0+1))
    furn_boxes.append((x0,y0,x1,y1,fill))
# walls: grid rects
c=2; gh,gw=H//c,W//c
wg=np.zeros((gh,gw),bool)
for j in range(gh):
    for i in range(gw): wg[j,i]=wall[j*c:(j+1)*c,i*c:(i+1)*c].mean()>0.3
def rects(mask):
    m=mask.copy(); out=[]
    for j in range(m.shape[0]):
        i=0
        while i<m.shape[1]:
            if m[j,i]:
                i2=i
                while i2+1<m.shape[1] and m[j,i2+1]: i2+=1
                j2=j
                while j2+1<m.shape[0] and m[j2+1,i:i2+1].all(): j2+=1
                out.append((i*c,j*c,(i2+1)*c,(j2+1)*c)); m[j:j2+1,i:i2+1]=False; i=i2+1
            else: i+=1
    return out
wr=rects(wg)
# merge touching rects with identical extents (removes the 'picket fence' slicing)
def merge(rs):
    rs=[list(r) for r in rs]; changed=True
    while changed:
        changed=False; out=[]; used=[False]*len(rs)
        for i in range(len(rs)):
            if used[i]: continue
            a=rs[i]
            for j in range(i+1,len(rs)):
                if used[j]: continue
                b=rs[j]
                if a[1]==b[1] and a[3]==b[3] and (a[2]==b[0] or b[2]==a[0]): a=[min(a[0],b[0]),a[1],max(a[2],b[2]),a[3]]; used[j]=True; changed=True
                elif a[0]==b[0] and a[2]==b[2] and (a[3]==b[1] or b[3]==a[1]): a=[a[0],min(a[1],b[1]),a[2],max(a[3],b[3])]; used[j]=True; changed=True
            out.append(a)
        rs=out
    return [tuple(r) for r in rs]
wr=merge(wr)
# spawn: pick the floor pixel near the requested spawn with the largest clearance from walls
sx0,sy0=map(float,spawn_px.split(','))
best=None
wall_d=dil(dil(dil(wall)))
for yy in range(int(sy0)-50,int(sy0)+51,2):
    for xx in range(int(sx0)-50,int(sx0)+51,2):
        if not floor[yy,xx]: continue
        # clearance = min distance to any wall pixel within 40px window
        win=wall[max(0,yy-40):yy+41,max(0,xx-40):xx+41]
        ys_,xs_=np.where(win)
        if len(ys_)==0: dmin=40
        else: dmin=np.sqrt(((ys_-(yy-max(0,yy-40)))**2+(xs_-(xx-max(0,xx-40)))**2)).min()
        if best is None or dmin>best[0]: best=(dmin,xx,yy)
print('spawn clearance px',best); spawn_px=f"{best[1]},{best[2]}"

ov=im0.copy(); d=ImageDraw.Draw(ov)
for (x0,y0,x1,y1) in wr: d.rectangle((x0,y0,x1-1,y1-1),outline=(255,0,0))
for (x0,y0,x1,y1,f) in furn_boxes: d.rectangle((x0,y0,x1,y1),outline=(0,255,0))
ov.save(out+'_overlay.png')
s=1.0/ppm
def wx(px): return round((px-cx)*s,2)
def wz(py): return round((py-cy)*s,2)
walls=[[wx((x0+x1)/2), wz((y0+y1)/2), round((x1-x0)*s,2), round((y1-y0)*s,2)] for (x0,y0,x1,y1) in wr]
furn=[[wx((x0+x1)/2), wz((y0+y1)/2), round((x1-x0+1)*s,2), round((y1-y0+1)*s,2)] for (x0,y0,x1,y1,f) in furn_boxes]
# floor bbox for room bounds
ys,xs=np.where(floor|wall)
sx,sy=map(float,spawn_px.split(','))
data={'walls':walls,'furn':furn,'bounds':[wx(xs.min())-1,wx(xs.max())+1,wz(ys.min())-1,wz(ys.max())+1],'spawn':[wx(sx),wz(sy)]}
open(out+'.json','w').write(json.dumps(data))
print('walls',len(walls),'furn',len(furn),'bounds',data['bounds'],'spawn',data['spawn'])
