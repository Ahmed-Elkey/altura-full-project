from __future__ import annotations
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import numpy as np
import cv2, re, math, random

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'public'/'products'
DATA=(ROOT/'data'/'products.ts').read_text(encoding='utf-8')
W,H=1200,1500
BG=np.array([247,245,239],dtype=np.float32)
COLORS={'Forest':'#26322b','Stone':'#d7d0c4','Black':'#171817','Sage':'#8e9483','Sand':'#bbae96','Ice':'#e3e5df','Charcoal':'#454946','Slate':'#65706d','Moss':'#586653','Bone':'#eee9de'}
SKIP={'meridian-tee','northline-tee','range-tee','clubhouse-tee','trail-cap','half-tights','winter-tights'}

# ---------- parsing ----------
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

def bezier(p0,p1,p2,p3,n=30):
    t=np.linspace(0,1,n)[:,None]
    p0,p1,p2,p3=map(lambda p:np.array(p,dtype=float),[p0,p1,p2,p3])
    pts=(1-t)**3*p0+3*(1-t)**2*t*p1+3*(1-t)*t**2*p2+t**3*p3
    return [tuple(map(int,p)) for p in pts]

def closed_curve(segments):
    pts=[]
    for s in segments:
        pts += bezier(*s)
    return np.array(pts,np.int32)

def new_mask(): return np.zeros((H,W),np.uint8)

def ellipse_mask(mask,box,val):
    x0,y0,x1,y1=box
    cv2.ellipse(mask,((x0+x1)//2,(y0+y1)//2),((x1-x0)//2,(y1-y0)//2),0,0,360,val,-1,cv2.LINE_AA)

def shape_mask(kind):
    m=new_mask()
    if kind in ('knit','longsleeve','crewneck','quarterzip','sherpa'):
        # organic long-sleeve top silhouette
        pts=closed_curve([
            ((355,330),(410,300),(450,290),(485,305)),
            ((485,305),(525,330),(675,330),(715,305)),
            ((715,305),(750,292),(790,300),(845,330)),
            ((845,330),(920,360),(1005,410),(1080,465)),
            ((1080,465),(1040,610),(980,770),(900,930)),
            ((900,930),(860,920),(825,900),(790,870)),
            ((790,870),(810,1010),(815,1110),(800,1180)),
            ((800,1180),(660,1205),(540,1205),(400,1180)),
            ((400,1180),(385,1110),(390,1010),(410,870)),
            ((410,870),(375,900),(340,920),(300,930)),
            ((300,930),(220,770),(160,610),(120,465)),
            ((120,465),(195,410),(280,360),(355,330)),
        ])
        cv2.fillPoly(m,[pts],255,lineType=cv2.LINE_AA)
        if kind=='quarterzip':
            # stand collar
            cv2.roundedRectangle if False else None
            cv2.rectangle(m,(485,275),(715,375),255,-1)
            ellipse_mask(m,(525,286,675,365),0)
        elif kind=='sherpa':
            cv2.rectangle(m,(465,275),(735,390),255,-1)
            ellipse_mask(m,(505,292,695,375),0)
        else:
            ellipse_mask(m,(500,280,700,420),0)
            ellipse_mask(m,(540,315,660,390),255)
            ellipse_mask(m,(550,322,650,382),0)
    elif kind=='vest':
        pts=closed_curve([
            ((400,315),(445,292),(490,292),(520,310)),
            ((520,310),(550,325),(650,325),(680,310)),
            ((680,310),(710,292),(755,292),(800,315)),
            ((800,315),(855,395),(875,550),(850,740)),
            ((850,740),(830,920),(830,1100),(800,1180)),
            ((800,1180),(655,1205),(545,1205),(400,1180)),
            ((400,1180),(370,1100),(370,920),(350,740)),
            ((350,740),(325,550),(345,395),(400,315)),
        ])
        cv2.fillPoly(m,[pts],255,lineType=cv2.LINE_AA)
        ellipse_mask(m,(500,278,700,414),0)
        # deep curved armholes
        ellipse_mask(m,(280,360,520,740),0); ellipse_mask(m,(680,360,920,740),0)
    elif kind=='tank':
        pts=closed_curve([
            ((430,292),(470,275),(515,278),(535,300)),
            ((535,300),(555,320),(645,320),(665,300)),
            ((665,300),(685,278),(730,275),(770,292)),
            ((770,292),(825,420),(865,610),(865,1150)),
            ((865,1150),(720,1185),(480,1185),(335,1150)),
            ((335,1150),(335,610),(375,420),(430,292)),
        ])
        cv2.fillPoly(m,[pts],255,lineType=cv2.LINE_AA)
        ellipse_mask(m,(515,260,685,415),0)
        ellipse_mask(m,(300,345,535,760),0); ellipse_mask(m,(665,345,900,760),0)
    elif kind=='pants':
        # waistband
        cv2.ellipse(m,(600,330),(270,75),0,0,360,255,-1,cv2.LINE_AA)
        cv2.rectangle(m,(330,330),(870,410),255,-1)
        left=closed_curve([
            ((345,380),(420,360),(500,370),(565,405)),
            ((565,405),(540,600),(515,820),(505,1010)),
            ((505,1010),(495,1190),(490,1280),(445,1300)),
            ((445,1300),(380,1310),(330,1295),(305,1265)),
            ((305,1265),(320,1090),(320,900),(300,710)),
            ((300,710),(285,555),(295,435),(345,380)),
        ])
        right=left.copy(); right[:,0]=W-right[:,0]
        cv2.fillPoly(m,[left,right],255,lineType=cv2.LINE_AA)
        # crotch shaping
        cv2.ellipse(m,(600,505),(65,125),0,0,360,0,-1,cv2.LINE_AA)
    elif kind=='socks':
        # left sock
        for dx in (0,360):
            pts=closed_curve([
                ((255+dx,300),(290+dx,275),(380+dx,275),(415+dx,300)),
                ((415+dx,300),(430+dx,480),(420+dx,650),(405+dx,820)),
                ((405+dx,820),(450+dx,865),(500+dx,900),(560+dx,945)),
                ((560+dx,945),(520+dx,1005),(435+dx,1020),(365+dx,985)),
                ((365+dx,985),(315+dx,950),(270+dx,920),(245+dx,885)),
                ((245+dx,885),(235+dx,660),(238+dx,465),(255+dx,300)),
            ])
            cv2.fillPoly(m,[pts],255,lineType=cv2.LINE_AA)
    elif kind=='bag':
        pts=closed_curve([
            ((245,595),(280,520),(370,485),(470,480)),
            ((470,480),(560,470),(640,470),(730,480)),
            ((730,480),(830,485),(920,520),(955,595)),
            ((955,595),(975,710),(965,860),(925,965)),
            ((925,965),(835,1025),(365,1025),(275,965)),
            ((275,965),(235,860),(225,710),(245,595)),
        ])
        cv2.fillPoly(m,[pts],255,lineType=cv2.LINE_AA)
    return m

# ---------- material / rendering ----------
def multiscale_noise(seed):
    rng=np.random.default_rng(seed)
    fields=[]
    for scale,amp in [(8,0.025),(28,0.032),(90,0.040)]:
        small=rng.normal(0,1,(max(2,H//scale),max(2,W//scale))).astype(np.float32)
        f=cv2.resize(small,(W,H),interpolation=cv2.INTER_CUBIC)
        fields.append(f*amp)
    return sum(fields)

def fabric_shader(mask,color,seed,kind):
    base=hexrgb(COLORS[color])
    yy,xx=np.mgrid[0:H,0:W]
    # soft studio key light and central volume
    key=1.0 + .12*np.exp(-(((xx-W*.36)/(W*.42))**2 + ((yy-H*.26)/(H*.55))**2))
    side=1.0 - .10*np.abs((xx-W*.5)/(W*.6))
    vertical=1.0 - .045*(yy/H)
    dist=cv2.distanceTransform((mask>0).astype(np.uint8),cv2.DIST_L2,5)
    dist=dist/(dist.max()+1e-6)
    edge=.82 + .18*np.sqrt(dist)
    noise=1.0+multiscale_noise(seed)
    # fabric micro-weave
    weave=1.0 + .012*np.sin(xx*.28) + .008*np.sin(yy*.31)
    if kind=='sherpa':
        weave=1.0 + .075*np.abs(np.sin(xx*.14)*np.sin(yy*.16)) + .04*multiscale_noise(seed+7)
    elif kind=='knit':
        weave=1.0 + .024*np.sin(xx*.38)*np.sin(yy*.16)
    elif kind=='bag':
        weave=1.0 + .015*np.sin((xx+yy)*.18)
    # natural vertical folds
    folds=np.ones((H,W),np.float32)
    centers=[.40,.47,.55,.63]
    for i,c in enumerate(centers):
        cx=W*c + 20*math.sin((seed+i)%17)
        folds += (-.055 if i%2==0 else .035)*np.exp(-((xx-cx)/(W*.035))**2)*np.exp(-((yy-H*.65)/(H*.55))**2)
    factor=key*side*vertical*edge*noise*weave*folds
    arr=base[None,None,:]*factor[...,None]
    # preserve pale materials without clipping flat
    if base.mean()>190:
        arr = 245 - (245-arr)*.78
    arr=np.clip(arr,0,255)
    arr[mask==0]=BG
    return arr.astype(np.uint8)

def bg_gradient():
    yy,xx=np.mgrid[0:H,0:W]
    vign=((xx-W*.5)/(W*.9))**2+((yy-H*.48)/(H*1.1))**2
    light=BG[None,None,:] - np.clip(vign[...,None]*5,0,7)
    return np.clip(light,0,255).astype(np.uint8)

def alpha_composite(bg,fg,mask):
    a=(mask.astype(np.float32)/255.0)[...,None]
    return np.uint8(np.clip(bg*(1-a)+fg*a,0,255))

def font(size):
    for p in ['/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf','/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf']:
        if Path(p).exists(): return ImageFont.truetype(p,size)
    return ImageFont.load_default()

def spaced_text(draw,pos,text,ft,fill,spacing=7):
    x,y=pos
    widths=[draw.textlength(ch,font=ft) for ch in text]
    total=sum(widths)+spacing*(len(text)-1)
    x-=total/2
    for ch,w in zip(text,widths):
        draw.text((x,y),ch,font=ft,fill=fill)
        x+=w+spacing

def details(img,mask,kind,color,view):
    pil=Image.fromarray(img,'RGB').convert('RGBA')
    d=ImageDraw.Draw(pil,'RGBA')
    lum=hexrgb(COLORS[color]).mean()
    seam=(245,245,240,45) if lum<125 else (25,25,25,40)
    seam_dark=(20,20,20,95) if lum>120 else (0,0,0,90)
    mark=(245,245,240,220) if lum<150 else (30,30,28,160)
    # garment construction
    if kind in ('knit','longsleeve','crewneck'):
        d.line([(355,337),(410,870),(400,1172)],fill=seam,width=2)
        d.line([(845,337),(790,870),(800,1172)],fill=seam_dark,width=2)
        d.arc((500,285,700,420),185,355,fill=seam_dark,width=3)
        if kind=='crewneck':
            d.line([(400,1138),(800,1138)],fill=seam_dark,width=3)
        if kind=='knit':
            for y in range(410,1110,22): d.line([(430,y),(770,y)],fill=(255,255,255,8),width=1)
    elif kind=='quarterzip':
        d.line([(600,330),(600,650)],fill=seam_dark,width=5)
        d.line([(355,337),(410,870),(400,1172)],fill=seam,width=2)
        d.line([(845,337),(790,870),(800,1172)],fill=seam_dark,width=2)
        d.rounded_rectangle((592,345,608,650),radius=5,fill=(25,25,25,110))
        d.ellipse((585,632,615,662),fill=(24,24,24,150))
    elif kind=='sherpa':
        d.line([(600,325),(600,1175)],fill=seam_dark,width=5)
        d.rounded_rectangle((420,630,570,760),radius=18,outline=seam_dark,width=3)
        d.rounded_rectangle((630,630,780,760),radius=18,outline=seam_dark,width=3)
        d.rounded_rectangle((662,445,790,575),radius=18,outline=seam,width=3)
    elif kind=='vest':
        if view!='back':
            d.line([(600,325),(600,1175)],fill=seam_dark,width=5)
            for y in [500,680,860,1040]: d.line([(385,y),(815,y)],fill=seam,width=2)
            d.rounded_rectangle((390,690,545,800),radius=16,outline=seam_dark,width=3)
            d.rounded_rectangle((655,690,810,800),radius=16,outline=seam_dark,width=3)
    elif kind=='tank':
        d.arc((515,260,685,415),185,355,fill=seam_dark,width=3)
        d.line([(368,470),(345,1138)],fill=seam,width=2); d.line([(832,470),(855,1138)],fill=seam_dark,width=2)
    elif kind=='pants':
        d.line([(600,405),(600,690)],fill=seam_dark,width=3)
        d.line([(350,420),(330,1260)],fill=seam,width=2); d.line([(850,420),(870,1260)],fill=seam_dark,width=2)
        d.line([(385,445),(475,660)],fill=seam_dark,width=3); d.line([(815,445),(725,660)],fill=seam,width=3)
        # drawcord
        d.line([(575,385),(565,530)],fill=(12,12,12,150),width=5); d.line([(625,385),(635,530)],fill=(12,12,12,150),width=5)
        d.ellipse((557,515,573,533),fill=(12,12,12,180)); d.ellipse((627,515,643,533),fill=(12,12,12,180))
    elif kind=='socks':
        for x in [285,310,335,365,390,645,670,695,725,750]: d.line([(x,315),(x,505)],fill=seam,width=2)
        d.line([(255,525),(415,525)],fill=seam_dark,width=2); d.line([(615,525),(775,525)],fill=seam_dark,width=2)
    elif kind=='bag':
        d.line([(300,595),(900,595)],fill=seam,width=3)
        d.line([(300,780),(900,780)],fill=seam_dark,width=3)
        d.arc((340,300,590,660),185,350,fill=(20,20,20,190),width=22)
        d.arc((610,300,860,660),190,355,fill=(20,20,20,190),width=22)
        d.rounded_rectangle((780,620,910,855),radius=24,outline=seam_dark,width=3)
    # branding
    ft=font(25)
    if view=='back' and kind in ('knit','longsleeve','crewneck','quarterzip','sherpa','vest','tank'):
        spaced_text(d,(600,420),'ALTURA',ft,mark,spacing=8)
    else:
        pos={'pants':(750,545),'socks':(320,640),'bag':(600,835)}.get(kind,(735,535))
        spaced_text(d,pos,'ALTURA',ft,mark,spacing=8)
    return np.array(pil.convert('RGB'))

def shadow_for(mask,kind):
    bb=cv2.boundingRect((mask>0).astype(np.uint8))
    x,y,w,h=bb
    sh=np.zeros((H,W),np.uint8)
    if kind=='bag':
        cv2.ellipse(sh,(x+w//2,y+h-5),(int(w*.39),42),0,0,360,90,-1,cv2.LINE_AA)
    else:
        cv2.ellipse(sh,(x+w//2,min(H-35,y+h+12)),(int(w*.32),32),0,0,360,66,-1,cv2.LINE_AA)
    sh=cv2.GaussianBlur(sh,(0,0),36)
    return sh

def perspective_angled(img,bg):
    src=np.float32([[0,0],[W,0],[W,H],[0,H]])
    dst=np.float32([[70,30],[W-5,80],[W-65,H-25],[115,H-65]])
    M=cv2.getPerspectiveTransform(src,dst)
    return cv2.warpPerspective(img,M,(W,H),borderValue=tuple(map(int,BG.tolist())))

def render_set(kind,color,seed):
    mask=shape_mask(kind)
    bg=bg_gradient()
    fg=fabric_shader(mask,color,seed,kind)
    sh=shadow_for(mask,kind)
    a=(sh.astype(np.float32)/255.0)[...,None]*.42
    shadow_color=np.full_like(bg,115)
    bg2=np.uint8(np.clip(bg*(1-a)+shadow_color*a,0,255))
    base=alpha_composite(bg2,fg,mask)
    front=details(base.copy(),mask,kind,color,'front')
    back=details(base.copy(),mask,kind,color,'back')
    if kind=='bag': crop=(250,430,950,1080)
    elif kind in ('pants','socks'): crop=(250,265,950,980)
    else: crop=(250,250,950,980)
    x0,y0,x1,y1=crop
    detail=cv2.resize(front[y0:y1,x0:x1],(W,H),interpolation=cv2.INTER_CUBIC)
    angled=perspective_angled(front,bg2)
    return {'front':front,'back':back,'detail':detail,'angled':angled}

def kind_for(p):
    pid=p['id']; sub=p['sub']
    if pid=='summit-knit': return 'knit'
    if pid=='ridge-vest': return 'vest'
    if pid=='terrain-waffle-ls': return 'longsleeve'
    if pid=='altitude-quarter-zip': return 'quarterzip'
    if pid=='field-sherpa': return 'sherpa'
    if pid=='club-crewneck': return 'crewneck'
    if sub=='Pants': return 'pants'
    if sub=='Tank Tops': return 'tank'
    if sub=='Socks': return 'socks'
    if sub=='Other': return 'bag'
    return 'longsleeve'

products=parse_products()
count=0
for p in products:
    if p['id'] in SKIP: continue
    kind=kind_for(p)
    folder=OUT/p['id']; folder.mkdir(parents=True,exist_ok=True)
    for color in p['colors']:
        slug=color.lower().replace(' ','-')
        seed=abs(hash((p['id'],color)))%(2**31-1)
        rendered=render_set(kind,color,seed)
        for view,im in rendered.items():
            Image.fromarray(im).save(folder/f'{slug}-{view}.jpg','JPEG',quality=93,optimize=True,progressive=True,subsampling=0)
            count+=1
    print('rendered',p['id'],kind,flush=True)
print('generated',count,'remaining product images',flush=True)
