from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter, ImageFont
import numpy as np, re, math

ROOT=Path(__file__).resolve().parents[1]
SRC=ROOT/'public'/'source-assets'
OUT=ROOT/'public'/'products'
W,H=1122,1402
SS=2
BG=(246,245,242)
COLORS={'Forest':'#26322b','Stone':'#d7d0c4','Black':'#171817','Sage':'#8e9483','Sand':'#bbae96','Ice':'#e3e5df','Charcoal':'#454946','Slate':'#65706d','Moss':'#586653','Bone':'#eee9de'}

products=[]
text=(ROOT/'data'/'products.ts').read_text()
for m in re.finditer(r'\{\n\s*id:\s*"([^"]+)"(.*?)\n\s*\},',text,re.S):
    pid,block=m.group(1),m.group(2)
    sub=re.search(r'\n\s*subcategory:\s*"([^"]+)"',block).group(1)
    colors=re.findall(r'"([^"]+)"',re.search(r'\n\s*colors:\s*\[([^\]]+)\]',block).group(1))
    name=re.search(r'\n\s*name:\s*"([^"]+)"',block).group(1)
    products.append(dict(id=pid,name=name,sub=sub,colors=colors))

skip={'meridian-tee','northline-tee','range-tee','clubhouse-tee','trail-cap','half-tights','winter-tights'}

def rgb(h):
    h=h.lstrip('#'); return np.array([int(h[i:i+2],16) for i in (0,2,4)],dtype=np.float32)

def font(size):
    for p in ['/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf','/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf']:
        if Path(p).exists(): return ImageFont.truetype(p,size)
    return ImageFont.load_default()

# Extract real cloth luminance from generated masters; this is reused as a photographic texture field.
def texture_field(master_name):
    im=Image.open(SRC/master_name).convert('RGB').resize((W,H),Image.Resampling.LANCZOS)
    a=np.asarray(im).astype(np.float32)
    lum=a.mean(2)
    # Normalize the darker garment pixels and extend them across the canvas by using the source image itself.
    garment=lum[lum<180]
    lo,hi=np.percentile(garment,[3,97]) if garment.size else (15,95)
    n=np.clip((lum-lo)/max(hi-lo,1),0,1)
    # Real folds sit mostly in 0.72..1.08 multiplier range.
    return .72 + .36*n

TEX_TOP=texture_field('tee-front-master.png')
TEX_BOTTOM=texture_field('tights-front-master.png')
TEX_BAG=texture_field('shorts-front-master.png')


def supersampled_mask(draw_fn):
    m=Image.new('L',(W*SS,H*SS),0)
    d=ImageDraw.Draw(m)
    def pts(seq): return [(int(x*SS),int(y*SS)) for x,y in seq]
    draw_fn(d,pts,SS)
    return m.resize((W,H),Image.Resampling.LANCZOS)

def kind(p):
    if p['id']=='ridge-vest': return 'vest'
    if p['sub']=='Pullovers': return 'pullover'
    if p['sub']=='Jackets': return 'jacket'
    if p['sub']=='Pants': return 'pants'
    if p['sub']=='Tank Tops': return 'tank'
    if p['sub']=='Socks': return 'socks'
    if p['sub']=='Other': return 'bag'
    if p['id']=='terrain-waffle-ls': return 'longsleeve'
    return 'tee'

def mask_for(k):
    def f(d,P,S):
        if k in ('pullover','longsleeve','jacket'):
            d.polygon(P([(340,330),(782,330),(835,980),(287,980)]),fill=255)
            d.polygon(P([(340,355),(230,405),(125,855),(270,900),(390,560)]),fill=255)
            d.polygon(P([(782,355),(892,405),(997,855),(852,900),(732,560)]),fill=255)
            if k=='jacket':
                d.rounded_rectangle((465*S,285*S,657*S,410*S),radius=38*S,fill=255)
            else:
                d.ellipse((475*S,292*S,647*S,430*S),fill=255)
                d.ellipse((515*S,320*S,607*S,405*S),fill=0)
        elif k=='vest':
            d.polygon(P([(370,330),(752,330),(820,1010),(302,1010)]),fill=255)
            d.rounded_rectangle((472*S,285*S,650*S,405*S),radius=35*S,fill=255)
            # carve deeper armholes
            d.ellipse((270*S,360*S,455*S,690*S),fill=0)
            d.ellipse((667*S,360*S,852*S,690*S),fill=0)
        elif k=='tank':
            d.polygon(P([(405,305),(505,305),(525,390),(597,390),(617,305),(717,305),(805,1015),(317,1015)]),fill=255)
            d.ellipse((490*S,285*S,632*S,420*S),fill=0)
            d.ellipse((300*S,340*S,500*S,690*S),fill=0)
            d.ellipse((622*S,340*S,822*S,690*S),fill=0)
        elif k=='pants':
            d.rounded_rectangle((330*S,285*S,792*S,420*S),radius=42*S,fill=255)
            d.polygon(P([(348,365),(555,365),(515,1185),(320,1185)]),fill=255)
            d.polygon(P([(567,365),(774,365),(802,1185),(607,1185)]),fill=255)
            # taper cuffs slightly
            d.rectangle((320*S,1120*S,515*S,1190*S),fill=255)
            d.rectangle((607*S,1120*S,802*S,1190*S),fill=255)
        elif k=='socks':
            d.rounded_rectangle((275*S,310*S,435*S,915*S),radius=34*S,fill=255)
            d.polygon(P([(310,820),(435,820),(555,985),(430,1040),(310,955)]),fill=255)
            d.rounded_rectangle((655*S,310*S,815*S,915*S),radius=34*S,fill=255)
            d.polygon(P([(690,820),(815,820),(935,985),(810,1040),(690,955)]),fill=255)
        elif k=='bag':
            d.rounded_rectangle((190*S,530*S,932*S,985*S),radius=105*S,fill=255)
            d.ellipse((155*S,585*S,345*S,925*S),fill=255)
            d.ellipse((777*S,585*S,967*S,925*S),fill=255)
    return supersampled_mask(f)

def make_texture(target_hex, tex):
    target=rgb(target_hex)
    arr=np.zeros((H,W,3),dtype=np.float32)
    # top-left soft studio light + cloth variation from original generated photograph
    yy,xx=np.mgrid[0:H,0:W]
    studio=1.0 + .055*np.exp(-(((xx-W*.35)/(W*.48))**2+((yy-H*.28)/(H*.5))**2)) - .035*(yy/H)
    factor=np.clip(tex*studio,.68,1.12)[...,None]
    arr=target[None,None,:]*factor
    if target.mean()<90:
        arr += 12*np.clip((tex[...,None]-.76)/.32,0,1)
    return Image.fromarray(np.uint8(np.clip(arr,0,255)),'RGB')

def composite(k,color,view='front'):
    mask=mask_for(k)
    tex=TEX_BOTTOM if k in ('pants','socks') else TEX_BAG if k=='bag' else TEX_TOP
    fabric=make_texture(COLORS[color],tex)
    bg=Image.new('RGB',(W,H),BG)
    # natural floor shadow
    sh=Image.new('L',(W,H),0); sd=ImageDraw.Draw(sh)
    if k=='bag': sd.ellipse((210,945,920,1045),fill=100)
    else: sd.ellipse((260,1120,870,1225),fill=72)
    sh=sh.filter(ImageFilter.GaussianBlur(34))
    shadow=Image.new('RGB',(W,H),(110,108,104))
    bg.paste(shadow,(0,0),sh)
    bg.paste(fabric,(0,0),mask)
    d=ImageDraw.Draw(bg,'RGBA')
    dark=(5,5,5,72); light=(255,255,255,45)
    # Construction details add realism at card scale.
    if k in ('pullover','longsleeve'):
        d.arc((475,292,647,430),180,360,fill=dark,width=3)
        d.line((340,360,295,960),fill=light,width=2); d.line((782,360,827,960),fill=dark,width=2)
        if k=='pullover':
            d.line((305,945,817,945),fill=dark,width=3)
    elif k=='jacket':
        d.line((561,340,561,980),fill=(15,15,15,150),width=5)
        d.line((350,730,500,785),fill=light,width=3); d.line((772,730,622,785),fill=dark,width=3)
        d.arc((465,285,657,410),185,355,fill=dark,width=3)
    elif k=='vest':
        d.line((561,335,561,1000),fill=(15,15,15,150),width=5)
        d.line((350,760,500,805),fill=light,width=3); d.line((772,760,622,805),fill=dark,width=3)
    elif k=='tank':
        d.arc((490,285,632,420),180,360,fill=dark,width=3)
        d.line((360,460,330,980),fill=light,width=2); d.line((762,460,792,980),fill=dark,width=2)
    elif k=='pants':
        d.line((561,365,561,720),fill=dark,width=3)
        d.line((360,415,340,1145),fill=light,width=2); d.line((762,415,785,1145),fill=dark,width=2)
        # drawcord
        d.line((535,340,525,485),fill=(10,10,10,175),width=5); d.line((587,340,597,485),fill=(10,10,10,175),width=5)
        d.ellipse((517,475,533,491),fill=(10,10,10,190)); d.ellipse((589,475,605,491),fill=(10,10,10,190))
    elif k=='socks':
        for x in [300,324,348,372,396,680,704,728,752,776]: d.line((x,330,x,510),fill=light,width=2)
        d.line((285,520,425,520),fill=dark,width=2); d.line((665,520,805,520),fill=dark,width=2)
    elif k=='bag':
        d.line((270,585,850,585),fill=light,width=3)
        d.line((300,720,825,720),fill=dark,width=3)
        # handles
        d.arc((340,310,570,690),180,355,fill=(20,20,20,215),width=20)
        d.arc((550,310,780,690),185,360,fill=(20,20,20,215),width=20)
    # subtle ALTURA wordmark
    label='ALTURA'; ft=font(23); bb=d.textbbox((0,0),label,font=ft); tw=bb[2]-bb[0]
    textcol=(245,245,242,205) if np.mean(rgb(COLORS[color]))<145 else (45,45,42,155)
    if view=='back' and k in ('pullover','longsleeve','jacket','vest','tank'):
        pos=((W-tw)//2,410)
    elif k=='pants': pos=(665,505)
    elif k=='socks': pos=(330,600)
    elif k=='bag': pos=(W//2-tw//2,770)
    else: pos=(665,515)
    d.text(pos,label,font=ft,fill=textcol)
    # Different views without inventing unrelated garments.
    if view=='back':
        # remove front-only hardware using soft overlay where useful
        if k in ('jacket','vest'):
            pass
    elif view=='detail':
        crop=bg.crop((235,250,887,990)).resize((W,H),Image.Resampling.LANCZOS)
        bg=crop
    elif view=='angled':
        small=bg.resize((1015,1268),Image.Resampling.LANCZOS)
        rot=small.rotate(-3,Image.Resampling.BICUBIC,expand=True,fillcolor=BG)
        c=Image.new('RGB',(W,H),BG); c.paste(rot,((W-rot.width)//2,(H-rot.height)//2)); bg=c
    return bg

def save(im,path):
    path.parent.mkdir(parents=True,exist_ok=True)
    im.save(path,'JPEG',quality=92,subsampling=0,optimize=True)

for p in products:
    if p['id'] in skip: continue
    k=kind(p)
    for color in p['colors']:
        slug=color.lower().replace(' ','-')
        for view in ['front','back','detail','angled']:
            save(composite(k,color,view),OUT/p['id']/f'{slug}-{view}.jpg')
    print('photo-fallback',p['id'],k)
