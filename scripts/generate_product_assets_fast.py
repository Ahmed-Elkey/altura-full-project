from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter, ImageFont, ImageEnhance
import re, random, math, shutil

ROOT=Path(__file__).resolve().parents[1]
DATA=(ROOT/'data/products.ts').read_text(encoding='utf-8')
OUT=ROOT/'public/products'
TMP=ROOT/'public/products-polished-tmp'
SW,SH=600,730
W,H=1200,1460
COLOR_HEX={'Forest':'#26322b','Stone':'#d7d0c4','Black':'#171817','Sage':'#8e9483','Sand':'#bbae96','Ice':'#e3e5df','Charcoal':'#454946','Slate':'#65706d','Moss':'#586653','Bone':'#eee9de'}

def parse_products():
    out=[]
    for m in re.finditer(r'\{\n\s*id:\s*"([^"]+)"(.*?)\n\s*\},',DATA,re.S):
        pid,block=m.group(1),m.group(2)
        def field(n,default=''):
            mm=re.search(rf'\n\s*{n}:\s*"([^"]+)"',block); return mm.group(1) if mm else default
        cm=re.search(r'\n\s*colors:\s*\[([^\]]+)\]',block); colors=re.findall(r'"([^"]+)"',cm.group(1)) if cm else ['Black']
        out.append({'id':pid,'name':field('name',pid),'subcategory':field('subcategory','T-Shirts & Longsleeves'),'colors':colors})
    return out

def rgb(h):
    h=h.lstrip('#'); return tuple(int(h[i:i+2],16) for i in (0,2,4))
def luminance(c): return (0.2126*c[0]+0.7152*c[1]+0.0722*c[2])/255

def font(size,bold=False):
    p='/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf' if bold else '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
    try:return ImageFont.truetype(p,size)
    except:return ImageFont.load_default()

def kind(sub):
    return {'Headwear':'hat','Socks':'socks','Other':'bag','Pants':'pants','Tights':'tights','Tank Tops':'tank','Jackets':'jacket','Pullovers':'pullover'}.get(sub,'tee')

def bg_for(c):
    light=luminance(c)
    edge=(214,216,211) if light<.67 else (198,201,197)
    center=(244,244,238) if light<.67 else (232,233,228)
    # radial gradient on small canvas for speed
    b=Image.new('RGB',(150,183),edge); px=b.load(); cx,cy=75,80
    for y in range(183):
        for x in range(150):
            d=min(1,math.sqrt(((x-cx)/100)**2+((y-cy)/120)**2))
            px[x,y]=tuple(round(center[i]*(1-d)+edge[i]*d) for i in range(3))
    return b.resize((SW,SH),Image.Resampling.BICUBIC).convert('RGBA')

def mask_for(k):
    m=Image.new('L',(SW,SH),0); d=ImageDraw.Draw(m)
    if k in ('tee','pullover','jacket'):
        d.polygon([(182,200),(418,200),(438,515),(162,515)],fill=255)
        d.polygon([(182,210),(102,240),(48,360),(158,395),(195,305)],fill=255)
        d.polygon([(418,210),(498,240),(552,360),(442,395),(405,305)],fill=255)
        d.ellipse((252,172,348,245),fill=255); d.ellipse((268,183,332,232),fill=0)
        if k=='pullover': d.rounded_rectangle((260,182,340,255),18,fill=255); d.ellipse((276,196,324,230),fill=0)
    elif k=='tank':
        d.polygon([(205,180),(258,180),(270,220),(330,220),(342,180),(395,180),(425,515),(175,515)],fill=255)
        d.ellipse((260,172,340,238),fill=0); d.ellipse((165,190,250,330),fill=0); d.ellipse((350,190,435,330),fill=0)
    elif k in ('pants','tights'):
        d.rounded_rectangle((175,150,425,220),28,fill=255)
        d.polygon([(182,195),(292,195),(267,590),(165,590)],fill=255); d.polygon([(308,195),(418,195),(435,590),(333,590)],fill=255)
    elif k=='hat':
        d.pieslice((155,190,445,450),180,360,fill=255); d.polygon([(155,320),(445,320),(420,385),(178,385)],fill=255); d.polygon([(325,340),(505,360),(400,420),(285,380)],fill=255)
    elif k=='socks':
        d.rounded_rectangle((165,165,250,490),22,fill=255); d.rounded_rectangle((350,165,435,490),22,fill=255); d.rounded_rectangle((215,410,325,510),25,fill=255); d.rounded_rectangle((400,410,510,510),25,fill=255)
    elif k=='bag':
        d.rounded_rectangle((122,260,478,485),62,fill=255); d.ellipse((105,285,195,455),fill=255); d.ellipse((405,285,495,455),fill=255)
    return m

def material(mask,c,seed):
    # base fabric color + multi-scale grayscale noise + soft studio shading
    solid=Image.new('RGBA',(SW,SH),c+(255,))
    solid.putalpha(mask)
    noise=Image.effect_noise((SW,SH),18).filter(ImageFilter.GaussianBlur(.35))
    ncol=Image.new('RGBA',(SW,SH),(255,255,255,0)); ncol.putalpha(noise.point(lambda p:int(p*.12)))
    ncol.putalpha(ImageChops.multiply(ncol.getchannel('A'),mask)) if False else None
    # directional highlight overlay clipped to mask
    hl=Image.new('RGBA',(SW,SH),(255,255,255,0)); hd=ImageDraw.Draw(hl)
    hd.ellipse((90,80,390,650),fill=(255,255,255,24)); hd.ellipse((330,90,610,680),fill=(0,0,0,20)); hl.putalpha(Image.composite(hl.getchannel('A'),Image.new('L',(SW,SH),0),mask))
    solid.alpha_composite(hl)
    # texture: use screen/multiply-like subtle speckle clipped manually
    tex=Image.new('RGBA',(SW,SH),(255,255,255,0)); tex.putalpha(mask.point(lambda p:int(p*.08)))
    grain=Image.effect_noise((SW,SH),28).convert('L')
    tex.putalpha(ImageChops.multiply(tex.getchannel('A'),grain))
    solid.alpha_composite(tex)
    return solid

def draw_details(layer,k,c,view):
    d=ImageDraw.Draw(layer); light=luminance(c); seam=(255,255,255,65) if light<.55 else (35,35,35,55); mark=(248,247,241,225) if light<.62 else (30,36,32,180)
    if k in ('tee','pullover','jacket'):
        for a,b in [((182,215),(162,505)),((418,215),(438,505)),((180,305),(120,360)),((420,305),(480,360))]:d.line([a,b],fill=seam,width=2)
        if k=='jacket': d.line([(300,205),(300,505)],fill=seam,width=3); d.line([(195,390),(260,410)],fill=seam,width=2); d.line([(405,390),(340,410)],fill=seam,width=2)
        if k=='pullover': d.line([(300,205),(300,300)],fill=seam,width=3)
    elif k=='tank':
        d.line([(205,205),(178,505)],fill=seam,width=2); d.line([(395,205),(422,505)],fill=seam,width=2)
    elif k in ('pants','tights'):
        d.line([(300,205),(300,360)],fill=seam,width=2); d.line([(212,215),(190,575)],fill=seam,width=2); d.line([(388,215),(415,575)],fill=seam,width=2)
        d.line([(220,205),(380,205)],fill=seam,width=2)
    elif k=='hat':
        d.line([(300,200),(300,350)],fill=seam,width=2); d.line([(220,235),(260,350)],fill=seam,width=2); d.line([(380,235),(340,350)],fill=seam,width=2)
    elif k=='socks':
        for xx in [180,195,210,365,380,395]:d.line([(xx,175),(xx,260)],fill=seam,width=1)
    elif k=='bag':
        d.arc((205,135,305,340),180,345,fill=seam,width=8); d.arc((295,135,395,340),195,360,fill=seam,width=8); d.line([(175,285),(425,285)],fill=seam,width=3)
    if view=='back' and k in ('tee','pullover','jacket','tank'):
        f=font(17); label='ALTURA'; bb=d.textbbox((0,0),label,font=f); d.text(((SW-(bb[2]-bb[0]))/2,278),label,font=f,fill=mark)
    else:
        f=font(22,True); pos={'pants':(394,250),'tights':(394,250),'hat':(290,300),'socks':(195,300),'bag':(285,355)}.get(k,(355,265)); d.text(pos,'A',font=f,fill=mark,anchor='mm')

def base_layer(k,c,view,seed):
    m=mask_for(k); lay=material(m,c,seed); draw_details(lay,k,c,view); return lay,m

def shadow(bg,mask):
    bb=mask.getbbox();
    if not bb:return
    x0,y0,x1,y1=bb; sh=Image.new('RGBA',(SW,SH),(0,0,0,0)); d=ImageDraw.Draw(sh); d.ellipse((x0+20,y1-12,x1-20,y1+35),fill=(0,0,0,62)); sh=sh.filter(ImageFilter.GaussianBlur(22)); bg.alpha_composite(sh)

def render(k,c,view,seed):
    bg=bg_for(c)
    lay,m=base_layer(k,c,'back' if view=='back' else 'front',seed)
    shadow(bg,m)
    if view=='angled': lay=lay.rotate(-5,resample=Image.Resampling.BICUBIC,center=(300,360),translate=(18,5))
    elif view=='detail': lay=lay.crop((135,150,465,515)).resize((SW,SH),Image.Resampling.LANCZOS)
    bg.alpha_composite(lay)
    out=bg.convert('RGB').resize((W,H),Image.Resampling.LANCZOS)
    return out

# delayed import used above, keeping script dependency-free outside Pillow
from PIL import ImageChops
products=parse_products()
if TMP.exists(): shutil.rmtree(TMP)
TMP.mkdir(parents=True)
count=0
for p in products:
    folder=TMP/p['id']; folder.mkdir()
    k=kind(p['subcategory'])
    for col in p['colors']:
        c=rgb(COLOR_HEX.get(col,'#26322b')); sl=col.lower().replace(' ','-')
        seed=abs(hash((p['id'],col)))%100000
        for view in ('front','back','detail','angled'):
            render(k,c,view,seed).save(folder/f'{sl}-{view}.jpg',quality=90,optimize=True,progressive=True)
            count+=1
if count!=176: raise SystemExit(f'Expected 176 images, generated {count}')
# Atomic-ish replacement only after all images are ready.
backup=ROOT/'public/products-prepolish-backup'
if backup.exists(): shutil.rmtree(backup)
OUT.rename(backup)
TMP.rename(OUT)
shutil.rmtree(backup)
print(f'Generated {count} polished product assets.')
