from __future__ import annotations
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import numpy as np, cv2, re, math

ROOT=Path(__file__).resolve().parents[1]
SRC=ROOT/'public'/'source-assets'
OUT=ROOT/'public'/'products'
DATA=(ROOT/'data'/'products.ts').read_text(encoding='utf-8')
W,H=1122,1402
BG=np.array([244,243,240],dtype=np.uint8)
COLORS={'Forest':'#26322b','Stone':'#d7d0c4','Black':'#171817','Sage':'#8e9483','Sand':'#bbae96','Ice':'#e3e5df','Charcoal':'#454946','Slate':'#65706d','Moss':'#586653','Bone':'#eee9de'}
SKIP={'meridian-tee','northline-tee','range-tee','clubhouse-tee','trail-cap','half-tights','winter-tights'}

TEE_F=np.array(Image.open(SRC/'tee-front-master.png').convert('RGB'))
TEE_B=np.array(Image.open(SRC/'tee-back-master.png').convert('RGB'))
TIGHTS=np.array(Image.open(SRC/'tights-front-master.png').convert('RGB'))
SHORTS=np.array(Image.open(SRC/'shorts-front-master.png').convert('RGB'))
CAP=np.array(Image.open(SRC/'cap-front-master.png').convert('RGB'))


def parse_products():
    out=[]
    for m in re.finditer(r'\{\n\s*id:\s*"([^"]+)"(.*?)\n\s*\},',DATA,re.S):
        pid,block=m.group(1),m.group(2)
        name=re.search(r'\n\s*name:\s*"([^"]+)"',block).group(1)
        sub=re.search(r'\n\s*subcategory:\s*"([^"]+)"',block).group(1)
        colors=re.findall(r'"([^"]+)"',re.search(r'\n\s*colors:\s*\[([^\]]+)\]',block).group(1))
        out.append({'id':pid,'name':name,'sub':sub,'colors':colors})
    return out

def hexrgb(h):
    h=h.lstrip('#'); return np.array([int(h[i:i+2],16) for i in (0,2,4)],dtype=np.float32)

def master_mask(arr,threshold=165):
    lum=arr.mean(2)
    m=(lum<threshold).astype(np.uint8)*255
    m=cv2.morphologyEx(m,cv2.MORPH_CLOSE,np.ones((7,7),np.uint8))
    n,lab,stats,_=cv2.connectedComponentsWithStats(m,8)
    if n>1:
        idx=1+np.argmax(stats[1:,cv2.CC_STAT_AREA])
        m=(lab==idx).astype(np.uint8)*255
    return cv2.GaussianBlur(m,(3,3),0)

TEE_MASK=master_mask(TEE_F)
TEE_B_MASK=master_mask(TEE_B)
TIGHTS_MASK=master_mask(TIGHTS)
SHORTS_MASK=master_mask(SHORTS)
CAP_MASK=master_mask(CAP)


def recolor_master(arr,mask,color):
    target=hexrgb(COLORS[color])
    lum=arr.mean(2).astype(np.float32)
    vals=lum[mask>80]
    lo,hi=np.percentile(vals,[3,98]) if vals.size else (10,100)
    n=np.clip((lum-lo)/max(hi-lo,1),0,1)
    # maintain photographic highlights and folds
    fac=.58+.78*n
    out=target[None,None,:]*fac[...,None]
    # small neutral highlight keeps light colors from looking painted
    out += (n[...,None]**2)*18
    out=np.clip(out,0,255).astype(np.uint8)
    bg=arr.copy()
    a=(mask.astype(np.float32)/255)[...,None]
    return np.uint8(bg*(1-a)+out*a)


def fabric_from_master(arr,mask,color):
    return recolor_master(arr,mask,color)


def shadow_canvas(base_mask,strength=72):
    ys,xs=np.where(base_mask>50)
    sh=np.zeros((H,W),np.uint8)
    if len(xs):
        x0,x1=xs.min(),xs.max(); y1=ys.max()
        cv2.ellipse(sh,((x0+x1)//2,min(H-35,y1+16)),(max(80,(x1-x0)//3),26),0,0,360,strength,-1,cv2.LINE_AA)
        sh=cv2.GaussianBlur(sh,(0,0),27)
    bg=np.full((H,W,3),BG,dtype=np.uint8)
    a=(sh.astype(np.float32)/255)[...,None]*.55
    bg=np.uint8(bg*(1-a)+np.full_like(bg,120)*a)
    return bg


def paste_rgba(bg,fg,mask):
    a=(mask.astype(np.float32)/255)[...,None]
    return np.uint8(bg*(1-a)+fg*a)


def top_target_mask(kind):
    m=np.zeros((H,W),np.uint8)
    if kind in ('knit','longsleeve','crewneck','quarterzip','sherpa'):
        # Torso + separate full sleeves avoids the short-sleeve silhouette of the photo master.
        torso=np.array([[365,185],[757,185],[815,330],[805,1195],[317,1195],[307,330]],np.int32)
        left=np.array([[365,205],[270,225],[165,315],[175,1015],[285,1060],[335,620],[420,330]],np.int32)
        right=left.copy(); right[:,0]=W-right[:,0]
        cv2.fillPoly(m,[torso,left,right],255,cv2.LINE_AA)
        if kind in ('quarterzip','sherpa'):
            cv2.rectangle(m,(475,110),(647,275),255,-1)
            cv2.ellipse(m,(561,190),(64,58),0,0,360,0,-1,cv2.LINE_AA)
        else:
            cv2.ellipse(m,(561,190),(92,72),0,0,360,0,-1,cv2.LINE_AA)
        # slightly rounded lower hem / cuffs
        cv2.ellipse(m,(230,1035),(58,28),0,0,360,255,-1,cv2.LINE_AA)
        cv2.ellipse(m,(892,1035),(58,28),0,0,360,255,-1,cv2.LINE_AA)
        return cv2.GaussianBlur(m,(3,3),0)

    if kind=='vest':
        # Straight technical vest with a high collar and clean armholes.
        pts=np.array([[420,160],[485,135],[637,135],[702,160],[805,230],[852,405],[820,1160],[302,1160],[270,405],[317,230]],np.int32)
        cv2.fillPoly(m,[pts],255,cv2.LINE_AA)
        cv2.rectangle(m,(470,115),(652,270),255,-1)
        cv2.ellipse(m,(561,195),(60,54),0,0,360,0,-1,cv2.LINE_AA)
        # armholes inspired by running-shell vest proportions
        cv2.ellipse(m,(305,445),(138,245),-8,0,360,0,-1,cv2.LINE_AA)
        cv2.ellipse(m,(817,445),(138,245),8,0,360,0,-1,cv2.LINE_AA)
        return cv2.GaussianBlur(m,(3,3),0)

    if kind=='tank':
        # Minimal race tank: narrow shoulders, deep armholes, straight hem.
        pts=np.array([[370,175],[455,155],[505,185],[525,245],[597,245],[617,185],[667,155],[752,175],[805,350],[835,1180],[287,1180],[317,350]],np.int32)
        cv2.fillPoly(m,[pts],255,cv2.LINE_AA)
        cv2.ellipse(m,(561,180),(118,102),0,0,360,0,-1,cv2.LINE_AA)
        cv2.ellipse(m,(315,440),(155,275),-8,0,360,0,-1,cv2.LINE_AA)
        cv2.ellipse(m,(807,440),(155,275),8,0,360,0,-1,cv2.LINE_AA)
        return cv2.GaussianBlur(m,(3,3),0)
    return m

def fill_extensions(base_img,base_mask,target_mask,color,kind):
    # Inside the target silhouette we keep every authentic source pixel that overlaps the master garment.
    # Missing regions (long sleeves / vest collar / tank edges) are filled from a real fabric crop,
    # not a flat procedural color.
    out=np.full_like(base_img,BG)
    overlap=cv2.bitwise_and(base_mask,target_mask)
    a=(overlap.astype(np.float32)/255)[...,None]
    out=np.uint8(out*(1-a)+base_img*a)
    missing=cv2.subtract(target_mask,overlap)
    if np.any(missing>20):
        crop=base_img[360:1120,315:807]
        tex=cv2.resize(crop,(W,H),interpolation=cv2.INTER_CUBIC)
        # vertical studio falloff keeps extended sleeves from looking tiled
        yy,xx=np.mgrid[0:H,0:W]
        fall=(.96+.06*np.exp(-((xx-W*.42)/(W*.45))**2)-.03*(yy/H))[...,None]
        tex=np.uint8(np.clip(tex.astype(np.float32)*fall,0,255))
        if kind=='sherpa':
            rng=np.random.default_rng(17)
            fuzzy=cv2.GaussianBlur(rng.normal(0,11,(H,W)).astype(np.float32),(0,0),.8)
            tex=np.uint8(np.clip(tex.astype(np.float32)+fuzzy[...,None],0,255))
        ma=(missing.astype(np.float32)/255)[...,None]
        out=np.uint8(out*(1-ma)+tex*ma)
    return out

def add_wordmark(img,pos,color=(245,245,240,220),size=21,spacing=6):
    pil=Image.fromarray(img).convert('RGBA'); d=ImageDraw.Draw(pil,'RGBA')
    path='/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
    ft=ImageFont.truetype(path,size) if Path(path).exists() else ImageFont.load_default()
    text='ALTURA'; widths=[d.textlength(ch,font=ft) for ch in text]; total=sum(widths)+spacing*(len(text)-1)
    x,y=pos; x-=total/2
    for ch,w in zip(text,widths):
        d.text((x,y),ch,font=ft,fill=color); x+=w+spacing
    return np.array(pil.convert('RGB'))


def draw_top_details(img,kind,color,view):
    pil=Image.fromarray(img).convert('RGBA'); d=ImageDraw.Draw(pil,'RGBA')
    light=hexrgb(COLORS[color]).mean(); seam=(255,255,255,55) if light<145 else (20,20,20,45); dark=(0,0,0,100)
    # cuff and sleeve seams on long sleeves
    if kind not in ('vest','tank'):
        d.line([(128,704),(205,1085)],fill=seam,width=2); d.line([(994,704),(917,1085)],fill=dark,width=2)
        d.line([(178,1070),(282,1020)],fill=dark,width=3); d.line([(944,1070),(840,1020)],fill=dark,width=3)
    if kind=='quarterzip':
        d.rounded_rectangle((552,205,570,575),radius=6,fill=(12,12,12,160)); d.ellipse((546,555,576,585),fill=(15,15,15,180))
        d.line([(460,300),(662,300)],fill=seam,width=2)
    elif kind=='sherpa':
        d.line([(561,205),(561,1200)],fill=dark,width=5)
        d.rounded_rectangle((330,620,500,780),radius=18,outline=dark,width=3); d.rounded_rectangle((622,620,792,780),radius=18,outline=dark,width=3)
        d.rounded_rectangle((650,410,820,575),radius=15,outline=seam,width=3)
    elif kind=='vest':
        d.line([(561,300),(561,1185)],fill=dark,width=5)
        for yy in [500,670,840,1010]: d.line([(300,yy),(820,yy)],fill=seam,width=2)
        d.rounded_rectangle((330,700,500,820),radius=16,outline=dark,width=3); d.rounded_rectangle((622,700,792,820),radius=16,outline=dark,width=3)
    elif kind=='knit':
        for yy in range(430,1120,24): d.line([(300,yy),(820,yy)],fill=(255,255,255,13),width=1)
        d.line([(275,1165),(847,1165)],fill=dark,width=3)
    elif kind=='crewneck':
        d.line([(270,1168),(852,1168)],fill=dark,width=3)
    elif kind=='tank':
        d.line([(345,430),(315,1155)],fill=seam,width=2); d.line([(777,430),(807,1155)],fill=dark,width=2)
    return np.array(pil.convert('RGB'))


def top_photo(kind,color,view='front'):
    master=TEE_B if view=='back' else TEE_F; mm=TEE_B_MASK if view=='back' else TEE_MASK
    recol=recolor_master(master,mm,color)
    target=top_target_mask(kind)
    # body uses true pixels where the real shirt exists; extensions use true fabric luminance resampled.
    bg=shadow_canvas(target,75)
    combined=fill_extensions(recol,mm,target,color,kind)
    result=paste_rgba(bg,combined,target)
    result=draw_top_details(result,kind,color,view)
    if view=='back':
        result=add_wordmark(result,(561,360),size=20)
    elif kind in ('vest','quarterzip','sherpa'):
        result=add_wordmark(result,(700,485),size=18)
    # crop/angle after photo construction
    if view=='detail':
        result=cv2.resize(result[220:930,215:907],(W,H),interpolation=cv2.INTER_CUBIC)
    elif view=='angled':
        src=np.float32([[0,0],[W,0],[W,H],[0,H]]); dst=np.float32([[60,35],[W-10,75],[W-65,H-25],[100,H-55]])
        M=cv2.getPerspectiveTransform(src,dst); result=cv2.warpPerspective(result,M,(W,H),borderValue=tuple(map(int,BG)))
    return result


def recolored_tights(color): return recolor_master(TIGHTS,TIGHTS_MASK,color)

def warp_runs(img,mask,scale_top=1.08,scale_mid=1.23,scale_bottom=1.14):
    out=np.full_like(img,BG); om=np.zeros_like(mask)
    for y in range(H):
        row=mask[y]>80
        xs=np.where(row)[0]
        if len(xs)==0: continue
        # find runs
        splits=np.where(np.diff(xs)>1)[0]; starts=np.r_[0,splits+1]; ends=np.r_[splits,len(xs)-1]
        runs=[(xs[s],xs[e]) for s,e in zip(starts,ends) if xs[e]-xs[s]>6]
        if y<420: sc=scale_top
        elif y<980: sc=scale_mid
        else: sc=scale_bottom
        for x0,x1 in runs:
            c=(x0+x1)/2; nw=max(2,int((x1-x0+1)*sc)); nx0=max(0,int(c-nw/2)); nx1=min(W-1,nx0+nw-1)
            src=img[y:y+1,x0:x1+1]
            if src.shape[1]<2 or nx1<=nx0: continue
            resized=cv2.resize(src,(nx1-nx0+1,1),interpolation=cv2.INTER_LINEAR)
            out[y:y+1,nx0:nx1+1]=resized
            om[y,nx0:nx1+1]=255
    om=cv2.GaussianBlur(om,(3,3),0)
    return out,om


def pants_photo(color,view,jogger=True):
    rec=recolored_tights(color)
    warped,mask=warp_runs(rec,TIGHTS_MASK,1.10,1.28 if jogger else 1.18,1.18 if jogger else 1.12)
    bg=shadow_canvas(mask,72); result=paste_rgba(bg,warped,mask)
    pil=Image.fromarray(result).convert('RGBA'); d=ImageDraw.Draw(pil,'RGBA')
    dark=(8,8,8,150); seam=(255,255,255,45)
    # elastic/drawcord and angled pockets make the source read as pants rather than tights.
    d.line([(410,300),(712,300)],fill=dark,width=4)
    d.line([(540,300),(532,470)],fill=dark,width=5); d.line([(582,300),(590,470)],fill=dark,width=5)
    d.ellipse((525,455,539,472),fill=dark); d.ellipse((583,455,597,472),fill=dark)
    d.line([(340,430),(420,620)],fill=dark,width=3); d.line([(782,430),(702,620)],fill=dark,width=3)
    result=np.array(pil.convert('RGB'))
    if view=='back':
        # subdued rear yoke / pocket detail
        pil=Image.fromarray(result).convert('RGBA'); d=ImageDraw.Draw(pil,'RGBA'); d.line([(385,370),(737,370)],fill=seam,width=2); d.rounded_rectangle((610,405,725,505),radius=10,outline=dark,width=2); result=np.array(pil.convert('RGB'))
    if view=='detail': result=cv2.resize(result[240:980,250:872],(W,H),interpolation=cv2.INTER_CUBIC)
    elif view=='angled':
        src=np.float32([[0,0],[W,0],[W,H],[0,H]]); dst=np.float32([[70,35],[W-5,80],[W-70,H-20],[110,H-60]])
        result=cv2.warpPerspective(result,cv2.getPerspectiveTransform(src,dst),(W,H),borderValue=tuple(map(int,BG)))
    return result


def socks_photo(color,view):
    # Reuse actual lower-leg fabric from tights as a textile source.
    rec=recolored_tights(color)
    tex=rec[650:1250,250:870]
    bg=np.full((H,W,3),BG,dtype=np.uint8)
    mask=np.zeros((H,W),np.uint8)
    # pair of technical crew socks
    for dx in [0,330]:
        pts=np.array([[250+dx,300],[390+dx,300],[405+dx,800],[490+dx,890],[430+dx,1000],[315+dx,940],[245+dx,850]],np.int32)
        cv2.fillPoly(mask,[pts],255,cv2.LINE_AA)
    fabric=cv2.resize(tex,(W,H),interpolation=cv2.INTER_CUBIC)
    sh=shadow_canvas(mask,62); bg=sh; out=paste_rgba(bg,fabric,mask)
    pil=Image.fromarray(out).convert('RGBA'); d=ImageDraw.Draw(pil,'RGBA')
    for x in [275,300,325,350,365,605,630,655,680,695]: d.line([(x,320),(x,500)],fill=(255,255,255,40),width=2)
    out=np.array(pil.convert('RGB')); out=add_wordmark(out,(365,630),size=17)
    if view=='detail': out=cv2.resize(out[260:900,190:900],(W,H),interpolation=cv2.INTER_CUBIC)
    elif view=='angled':
        src=np.float32([[0,0],[W,0],[W,H],[0,H]]); dst=np.float32([[70,30],[W-15,70],[W-70,H-25],[110,H-60]])
        out=cv2.warpPerspective(out,cv2.getPerspectiveTransform(src,dst),(W,H),borderValue=tuple(map(int,BG)))
    return out


def bag_photo(color,view):
    # Texture is sampled from the generated performance shorts: real nylon folds, rendered into a duffel silhouette.
    rec=recolor_master(SHORTS,SHORTS_MASK,color)
    tex=cv2.resize(rec[250:1050,170:950],(W,H),interpolation=cv2.INTER_CUBIC)
    mask=np.zeros((H,W),np.uint8)
    cv2.roundedRectangle if False else None
    cv2.ellipse(mask,(561,760),(390,260),0,0,360,255,-1,cv2.LINE_AA)
    cv2.rectangle(mask,(235,590),(887,930),255,-1)
    bg=shadow_canvas(mask,74); out=paste_rgba(bg,tex,mask)
    pil=Image.fromarray(out).convert('RGBA'); d=ImageDraw.Draw(pil,'RGBA')
    dark=(10,10,10,180); seam=(255,255,255,45)
    d.line([(260,620),(862,620)],fill=seam,width=3); d.line([(260,805),(862,805)],fill=dark,width=3)
    d.arc((335,320,585,760),180,350,fill=dark,width=23); d.arc((537,320,787,760),190,360,fill=dark,width=23)
    d.rounded_rectangle((720,650,850,850),radius=20,outline=dark,width=3)
    out=np.array(pil.convert('RGB')); out=add_wordmark(out,(561,820),size=21)
    if view=='detail': out=cv2.resize(out[500:1000,180:942],(W,H),interpolation=cv2.INTER_CUBIC)
    elif view=='angled':
        src=np.float32([[0,0],[W,0],[W,H],[0,H]]); dst=np.float32([[60,40],[W-10,85],[W-60,H-35],[100,H-70]])
        out=cv2.warpPerspective(out,cv2.getPerspectiveTransform(src,dst),(W,H),borderValue=tuple(map(int,BG)))
    return out


def kind_for(p):
    pid=p['id']; sub=p['sub']
    return {
        'summit-knit':'knit','ridge-vest':'vest','terrain-waffle-ls':'longsleeve','altitude-quarter-zip':'quarterzip',
        'field-sherpa':'sherpa','club-crewneck':'crewneck','race-tank':'tank','merino-socks':'socks','summit-gym-bag':'bag'
    }.get(pid,'pants' if sub=='Pants' else 'longsleeve')


def render_product(p,color,view):
    kind=kind_for(p)
    if kind=='pants': return pants_photo(color,view,jogger=(p['id']=='motion-joggers'))
    if kind=='socks': return socks_photo(color,view)
    if kind=='bag': return bag_photo(color,view)
    return top_photo(kind,color,view)

if __name__=='__main__':
    products=parse_products(); count=0
    for p in products:
        if p['id'] in SKIP: continue
        folder=OUT/p['id']; folder.mkdir(parents=True,exist_ok=True)
        for color in p['colors']:
            slug=color.lower().replace(' ','-')
            for view in ['front','back','detail','angled']:
                im=render_product(p,color,view)
                Image.fromarray(im).save(folder/f'{slug}-{view}.jpg','JPEG',quality=95,optimize=True,progressive=True,subsampling=0)
                count+=1
        print('photo-v3',p['id'],kind_for(p),flush=True)
    print('generated',count,'remaining photoreal packshots',flush=True)
