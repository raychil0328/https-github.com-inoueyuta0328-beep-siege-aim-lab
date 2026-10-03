import json, sys
src, dst, name, yaw = sys.argv[1], sys.argv[2], sys.argv[3], float(sys.argv[4])
d=json.load(open(src))
T=0.36  # wall thickness (m)
walls=[]
for x,z,w,dd in d['walls']:
    if dd > w*1.5: walls.append(['v', x, z-dd/2, z+dd/2])      # vertical segment: x, z0, z1
    elif w > dd*1.5: walls.append(['h', z, x-w/2, x+w/2])     # horizontal: z, x0, x1
    else: walls.append(['b', x, z, w, dd])                     # block (junction)
def merge(segs):
    segs=sorted(segs, key=lambda s:(round(s[1]/0.12), s[2]))
    out=[]
    for s in segs:
        if out and abs(out[-1][1]-s[1])<0.13 and s[2] <= out[-1][3]+0.78:   # also fills window gaps (< 0.78 m); doors are >= 1.0 m
            out[-1][3]=max(out[-1][3], s[3]); out[-1][1]=(out[-1][1]+s[1])/2
        else: out.append(list(s))
    return out
V=merge([s for s in walls if s[0]=='v']); Hh=merge([s for s in walls if s[0]=='h']); B=[s for s in walls if s[0]=='b']
# stairs: groups of >=3 short parallel segments close together (plan draws treads as thin lines) -> one 1.0 m block
def stair_groups(segs):
    n=len(segs); grp=[-1]*n; blocks=[]; keep=[]
    for i in range(n):
        _,p,a0,a1=segs[i]; near=[]
        for j in range(n):
            if i==j: continue
            _,q,b0,b1=segs[j]
            ov=min(a1,b1)-max(a0,b0)
            if abs(p-q)<0.75 and ov > 0.5*min(a1-a0,b1-b0) and (a1-a0)<3.5 and (b1-b0)<3.5: near.append(j)
        if len(near)>=2: grp[i]=1
    for i in range(n):
        if grp[i]==1:
            _,p,a0,a1=segs[i]; blocks.append([p-0.2,p+0.2,a0,a1])
        else: keep.append(segs[i])
    # union of overlapping stair boxes
    merged=[]
    for b in blocks:
        for m in merged:
            if b[0]<m[1]+0.3 and b[1]>m[0]-0.3 and b[2]<m[3]+0.3 and b[3]>m[2]-0.3:
                m[0]=min(m[0],b[0]); m[1]=max(m[1],b[1]); m[2]=min(m[2],b[2]); m[3]=max(m[3],b[3]); break
        else: merged.append(list(b))
    return keep, merged
V, sv = stair_groups(V); Hh, sh = stair_groups(Hh)
stairs=[]
for p0,p1,a0,a1 in sv: stairs.append([round((p0+p1)/2,2), round((a0+a1)/2,2), round(p1-p0,2), round(a1-a0,2), 1.0])
for p0,p1,a0,a1 in sh: stairs.append([round((a0+a1)/2,2), round((p0+p1)/2,2), round(a1-a0,2), round(p1-p0,2), 1.0])
res=[]
for _,x,z0,z1 in V: res.append([round(x,2), round((z0+z1)/2,2), T, round(z1-z0+0.1,2), 3.2])
for _,z,x0,x1 in Hh: res.append([round((x0+x1)/2,2), round(z,2), round(x1-x0+0.1,2), T, 3.2])
for _,x,z,w,dd in B: res.append([x,z,max(w,T),max(dd,T),3.2])
furn=[f for f in d['furn'] if not (f[2]>4.5 and f[3]>4.5) and f[2]>0.35 and f[3]>0.35 and f[2]*f[3] < 14]
out=[]
for x,z,w,dd in furn:
    area=w*dd; aspect=max(w,dd)/max(0.01,min(w,dd)); h = 0.8 if area>3 else (1.1 if aspect>3 else 0.9); out.append([x,z,w,dd,h])
o={'name':name,'source':'r6maps.com floor plan, 17.6 px/m; walls traced from the white wall layer, furniture auto-detected (heights estimated)','walls':res,'furn':out+stairs,'bounds':[float(v) for v in d['bounds']],'spawn':d['spawn'],'spawnYaw':yaw}
json.dump(o,open(dst,'w'))
print(name,'walls',len(d['walls']),'->',len(res),'furn',len(out),'stairs',len(stairs),'spawn',d['spawn'])
