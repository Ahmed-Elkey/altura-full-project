from __future__ import annotations
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter, ImageFont, ImageChops
import numpy as np
import re, math, random

ROOT = Path(__file__).resolve().parents[1]
DATA = (ROOT / 'data' / 'products.ts').read_text(encoding='utf-8')
OUT = ROOT / 'public' / 'products'
W, H = 1200, 1460

COLOR_HEX = {
    'Forest':'#26322b','Stone':'#d7d0c4','Black':'#171817','Sage':'#8e9483',
    'Sand':'#bbae96','Ice':'#e3e5df','Charcoal':'#454946','Slate':'#65706d',
    'Moss':'#586653','Bone':'#eee9de'
}

# Parse the intentionally simple local product data file without adding dependencies.
products=[]
for m in re.finditer(r'\{\n\s*id:\s*"([^"]+)"(.*?)\n\s*\},', DATA, re.S):
    pid, block=m.group(1),m.group(2)
    def field(name, default=''):
        mm=re.search(rf'\n\s*{name}:\s*"([^"]+)"', block)
        return mm.group(1) if mm else default
    cm=re.search(r'\n\s*colors:\s*\[([^\]]+)\]', block)
    colors=re.findall(r'"([^"]+)"', cm.group(1)) if cm else ['Black']
    products.append({'id':pid,'name':field('name',pid),'subcategory':field('subcategory','T-Shirts & Longsleeves'),'colors':colors})


def rgb(hexv):
    hexv=hexv.lstrip('#')
    return tuple(int(hexv[i:i+2],16) for i in (0,2,4))

def lum(c):
    return (0.2126*c[0]+0.7152*c[1]+0.0722*c[2])/255

def kind_for(sub):
    if sub=='Headwear': return 'hat'
    if sub=='Socks': return 'socks'
    if sub=='Other': return 'bag'
    if sub=='Pants': return 'pants'
    if sub=='Tights': return 'tights'
    if sub=='Tank Tops': return 'tank'
    if sub=='Jackets': return 'jacket'
    if sub=='Pullovers': return 'pullover'
    return 'tee'

def font(size, bold=False):
    candidates=[
        '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf' if bold else '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
        '/usr/share/fonts/truetype/liberation2/LiberationSans-Bold.ttf' if bold else '/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf',
    ]
    for p in candidates:
        if Path(p).exists(): return ImageFont.truetype(p,size)
    return ImageFont.load_default()

def background(garment):
    g=np.array(garment)
    light=lum(garment)
    base=np.array((226,227,221) if light < .67 else (210,211,205),dtype=float)
    y,x=np.ogrid[:H,:W]
    cx,cy=W*.50,H*.42
    d=np.sqrt(((x-cx)/(W*.76))**2+((y-cy)/(H*.80))**2)
    glow=np.clip(1-d,0,1)[...,None]
    arr=np.ones((H,W,3),dtype=float)*base
    arr += glow*(26 if light<.67 else 17)
    arr += ((y/H)[...,None]-0.4)*3
    return Image.fromarray(np.uint8(np.clip(arr,0,255)),'RGB')

def fabric_fill(mask, garment, seed=0):
    rng=np.random.default_rng(seed)
    base=np.array(garment,dtype=float)
    y,x=np.mgrid[0:H,0:W]
    # Soft directional studio light + tiny fabric grain.
    light=1 + 0.11*np.cos((x/W-.34)*math.pi) - 0.07*(y/H-.45)
    fold=1 + .035*np.sin(x/42.0)+.022*np.sin((x+y)/67.0)
    noise=rng.normal(0,2.0,(H,W))
    arr=np.empty((H,W,4),dtype=np.uint8)
    for k in range(3): arr[...,k]=np.uint8(np.clip(base[k]*light*fold+noise,0,255))
    arr[...,3]=np.asarray(mask)
    im=Image.fromarray(arr,'RGBA')
    return im.filter(ImageFilter.GaussianBlur(.18))

def shadow(base, bbox, strength=82, blur=34):
    x0,y0,x1,y1=bbox
    sh=Image.new('RGBA',(W,H),(0,0,0,0)); d=ImageDraw.Draw(sh)
    d.ellipse((x0,y1-20,x1,y1+45),fill=(0,0,0,strength))
    sh=sh.filter(ImageFilter.GaussianBlur(blur))
    base.alpha_composite(sh)

def garment_layer(kind, garment, view, seed):
    mask=Image.new('L',(W,H),0); d=ImageDraw.Draw(mask)
    seams=[]
    # Coordinates tuned for product-grid proportions similar to editorial packshots.
    if kind in ('tee','pullover','jacket'):
        body=[(365,400),(835,400),(875,1030),(325,1030)]
        left=[(365,420),(205,480),(95,720),(315,790),(390,610)]
        right=[(835,420),(995,480),(1105,720),(885,790),(810,610)]
        d.polygon(body,fill=255); d.polygon(left,fill=255); d.polygon(right,fill=255)
        # shoulders/collar
        d.ellipse((505,345,695,490),fill=255)
        d.ellipse((535,365,665,465),fill=0)
        if kind=='pullover': d.rounded_rectangle((520,365,680,505),35,fill=255); d.ellipse((550,390,650,455),fill=0)
        seams=[((365,425),(325,1015)),((835,425),(875,1015)),((350,610),(240,720)),((850,610),(960,720))]
    elif kind=='tank':
        d.polygon([(410,360),(515,360),(535,430),(665,430),(685,360),(790,360),(850,1030),(350,1030)],fill=255)
        d.ellipse((520,345,680,475),fill=0)
        d.ellipse((330,380,500,660),fill=0); d.ellipse((700,380,870,660),fill=0)
        seams=[((405,415),(355,1000)),((795,415),(845,1000))]
    elif kind in ('pants','tights'):
        d.rounded_rectangle((350,300,850,440),55,fill=255)
        d.polygon([(365,390),(585,390),(535,1160),(330,1160)],fill=255)
        d.polygon([(615,390),(835,390),(870,1160),(665,1160)],fill=255)
        if kind=='pants':
            # slightly looser calf silhouette
            d.polygon([(330,900),(535,900),(525,1190),(350,1190)],fill=255)
            d.polygon([(665,900),(870,900),(850,1190),(675,1190)],fill=255)
        seams=[((600,410),(600,710)),((420,430),(390,1130)),((780,430),(815,1130))]
    elif kind=='hat':
        d.pieslice((310,380,890,900),180,360,fill=255)
        d.polygon([(310,640),(890,640),(840,770),(355,770)],fill=255)
        d.polygon([(650,680),(1010,720),(800,840),(570,760)],fill=255)
        seams=[((600,395),(600,720)),((430,470),(520,700)),((770,470),(680,700))]
    elif kind=='socks':
        d.rounded_rectangle((330,330,500,970),45,fill=255); d.rounded_rectangle((700,330,870,970),45,fill=255)
        d.rounded_rectangle((430,820,650,1015),50,fill=255); d.rounded_rectangle((800,820,1020,1015),50,fill=255)
        seams=[((350,520),(485,520)),((720,520),(855,520))]
    elif kind=='bag':
        d.rounded_rectangle((245,520,955,965),125,fill=255)
        d.ellipse((210,570,390,910),fill=255); d.ellipse((810,570,990,910),fill=255)
        # handles are separate on overlay later
        seams=[((320,580),(320,900)),((880,580),(880,900)),((320,720),(880,720))]
    else: raise ValueError(kind)

    layer=fabric_fill(mask,garment,seed)
    # tonal edge shading using blurred mask border
    edge=mask.filter(ImageFilter.GaussianBlur(22))
    inner=np.asarray(mask,dtype=np.int16)-np.asarray(edge,dtype=np.int16)
    edge_alpha=Image.fromarray(np.uint8(np.clip(inner,0,255)*0.18),'L')
    shade=Image.new('RGBA',(W,H),(0,0,0,60)); shade.putalpha(edge_alpha)
    layer.alpha_composite(shade)

    od=ImageDraw.Draw(layer)
    seam_col=(255,255,255,40) if lum(garment)<.55 else (40,40,40,40)
    for a,b in seams: od.line([a,b],fill=seam_col,width=3)

    # Product-specific construction details.
    if kind=='jacket':
        od.line([(600,405),(600,1005)],fill=seam_col,width=5)
        od.line([(390,770),(520,820)],fill=seam_col,width=4); od.line([(810,770),(680,820)],fill=seam_col,width=4)
    if kind=='pullover':
        od.line([(600,425),(600,600)],fill=seam_col,width=5)
    if kind in ('pants','tights'):
        od.line([(430,405),(770,405)],fill=seam_col,width=4)
        od.line([(555,415),(555,640)],fill=seam_col,width=3); od.line([(645,415),(645,640)],fill=seam_col,width=3)
    if kind=='hat':
        od.line([(345,720),(835,720)],fill=seam_col,width=3)
    if kind=='socks':
        for xx in (360,390,420,450,730,760,790,820): od.line([(xx,350),(xx,520)],fill=seam_col,width=2)
    if kind=='bag':
        od.arc((410,280,610,650),180,345,fill=seam_col,width=15); od.arc((590,280,790,650),195,360,fill=seam_col,width=15)
        od.line([(350,550),(850,550)],fill=seam_col,width=5)

    # Minimal ALTURA identity.
    mark_col=(245,245,240,220) if lum(garment)<.62 else (35,42,38,170)
    if view=='back' and kind in ('tee','pullover','jacket','tank'):
        label='ALTURA'; f=font(34,False); bb=od.textbbox((0,0),label,font=f); tw=bb[2]-bb[0]
        od.text(((W-tw)/2,555),label,font=f,fill=mark_col)
    else:
        f=font(40,True)
        if kind in ('pants','tights'): pos=(785,500)
        elif kind=='hat': pos=(580,585)
        elif kind=='socks': pos=(390,600)
        elif kind=='bag': pos=(575,700)
        else: pos=(710,520)
        od.text(pos,'A',font=f,fill=mark_col,anchor='mm')

    # View transformations.
    bbox=mask.getbbox() or (260,300,940,1120)
    if view=='angled':
        layer=layer.rotate(-5,resample=Image.Resampling.BICUBIC,expand=False,center=(600,720),translate=(32,8))
    elif view=='detail':
        crop=layer.crop((270,310,930,1030)).resize((W,H),Image.Resampling.LANCZOS)
        layer=crop
        bbox=(260,280,940,1180)
    return layer,bbox

def render(product,color,view):
    garment=rgb(COLOR_HEX.get(color,'#26322b'))
    kind=kind_for(product['subcategory'])
    bg=background(garment).convert('RGBA')
    layer,bbox=garment_layer(kind,garment,view,abs(hash((product['id'],color,view)))%2**32)
    # grounded shadow; smaller on detail view
    shadow(bg,bbox,strength=70 if view!='detail' else 45,blur=38)
    bg.alpha_composite(layer)
    # light top-left studio bloom and very subtle vignette
    arr=np.array(bg.convert('RGB')).astype(np.float32)
    y,x=np.ogrid[:H,:W]
    vign=np.clip(((x-W/2)/(W*.76))**2+((y-H*.47)/(H*.82))**2,0,1)[...,None]
    arr*=1-vign*.05
    out=Image.fromarray(np.uint8(np.clip(arr,0,255)),'RGB')
    return out

count=0
for product in products:
    folder=OUT/product['id']; folder.mkdir(parents=True,exist_ok=True)
    for color in product['colors']:
        slug=color.lower().replace(' ','-')
        for view in ('front','back','detail','angled'):
            im=render(product,color,view)
            im.save(folder/f'{slug}-{view}.jpg',quality=91,optimize=True,progressive=True)
            count+=1
print(f'Generated {count} polished product assets for {len(products)} products.')
