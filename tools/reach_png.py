import json
from PIL import Image, ImageDraw
d=json.load(open('/workspace/work/reach.json'))
for lv,r in d.items():
    if 'data' not in r: print(lv,r); continue
    W,H,st=r['W'],r['H'],r['st']; S=4
    im=Image.new('RGB',(W*S,H*S)); px=im.load()
    col={'0':(40,40,48),'1':(60,190,90),'2':(240,200,40)}
    for k,ch in enumerate(r['data']):
        i,j=k%W,k//W
        for a in range(S):
            for b in range(S): px[i*S+a,j*S+b]=col[ch]
    dr=ImageDraw.Draw(im)
    for x in range(0,31,5): X=int((x+1)/st*S); dr.line([(X,0),(X,H*S)],fill=(90,90,200))
    for z in (0,10,12,20): Z=int((z+1)/st*S); dr.line([(0,Z),(W*S,Z)],fill=(90,90,200))
    im.save(f'/workspace/work/shots/reach_L{lv}.png'); print(lv, r['data'].count('1'), r['data'].count('2'))
