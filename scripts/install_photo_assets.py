from pathlib import Path
from PIL import Image, ImageEnhance, ImageFilter
import numpy as np

ROOT=Path(__file__).resolve().parents[1]
SRC=ROOT/'public'/'source-assets'
ED=ROOT/'public'/'editorial'
PROD=ROOT/'public'/'products'

COLORS={
'Forest':'#26322b','Stone':'#d7d0c4','Black':'#171817','Sage':'#8e9483','Sand':'#bbae96',
'Ice':'#e3e5df','Charcoal':'#454946','Slate':'#65706d','Moss':'#586653','Bone':'#eee9de'
}

def rgb(h):
    h=h.lstrip('#'); return np.array([int(h[i:i+2],16) for i in (0,2,4)], dtype=float)

def save_jpg(im, path, quality=94):
    path.parent.mkdir(parents=True, exist_ok=True)
    if im.mode!='RGB': im=im.convert('RGB')
    im.save(path, 'JPEG', quality=quality, subsampling=0, optimize=True)

# Editorial masters: upscale once with high-quality resampling and restrained contrast.
def editorial(src, out, size=(2560,1440), crop='center'):
    im=Image.open(src).convert('RGB')
    sw,sh=im.size; tw,th=size
    scale=max(tw/sw, th/sh)
    im=im.resize((round(sw*scale),round(sh*scale)), Image.Resampling.LANCZOS)
    w,h=im.size
    # preserve useful negative space on the left for hero copy
    if crop=='left-space':
        x=max(0, min(w-tw, round((w-tw)*0.65)))
    elif crop=='runner-left':
        x=max(0, min(w-tw, round((w-tw)*0.22)))
    else:
        x=(w-tw)//2
    y=(h-th)//2
    im=im.crop((x,y,x+tw,y+th))
    im=ImageEnhance.Contrast(im).enhance(1.035)
    im=ImageEnhance.Color(im).enhance(.93)
    im=ImageEnhance.Sharpness(im).enhance(1.18)
    save_jpg(im,out,94)

editorial(SRC/'hero-master.png', ED/'hero.jpg', (2560,1440), 'left-space')
editorial(SRC/'story-master.png', ED/'story.jpg', (2200,1320), 'runner-left')
# Extra editorial crops so repeated sections no longer reuse the same low-res image.
editorial(SRC/'hero-master.png', ED/'race-day.jpg', (1800,1350), 'center')
editorial(SRC/'story-master.png', ED/'trail-story.jpg', (1800,1350), 'runner-left')

# Product-photo utilities. Input is black garment on near-white studio background.
def recolor(im, target_hex):
    arr=np.array(im.convert('RGB')).astype(np.float32)
    # Background in generated masters is warm white. Garment mask is driven by luminance and saturation-independent contrast.
    lum=arr.mean(axis=2)
    mask=np.clip((238-lum)/100,0,1)[...,None]
    mask=np.power(mask, 1.15)
    target=rgb(target_hex)
    # Preserve photographed folds while keeping light colorways genuinely light.
    garment_pixels=lum[(lum < 180)]
    if garment_pixels.size:
        lo, hi=np.percentile(garment_pixels,[4,96])
    else:
        lo, hi=15.0, 95.0
    norm=np.clip((lum-lo)/max(hi-lo,1),0,1)[...,None]
    if target.mean() >= 135:
        factor=.76 + .28*norm
        colored=np.clip(target[None,None,:]*factor,0,255)
    else:
        factor=.70 + .38*norm
        colored=np.clip(target[None,None,:]*factor + 24*norm,0,255)
    out=arr*(1-mask)+colored*mask
    return Image.fromarray(out.astype(np.uint8),'RGB')

def canvas_from(im, mode='front'):
    W,H=1122,1402
    bg=Image.new('RGB',(W,H),(246,245,242))
    if mode=='front' or mode=='back':
        fitted=im.resize((W,H),Image.Resampling.LANCZOS)
        return fitted
    if mode=='detail':
        # close crop of chest/waist/detail but still on editorial canvas
        crop=im.crop((180,170,942,1010)).resize((W,H),Image.Resampling.LANCZOS)
        return crop
    if mode=='angled':
        fitted=im.resize((1020,1275),Image.Resampling.LANCZOS)
        rot=fitted.rotate(-3.0, Image.Resampling.BICUBIC, expand=True, fillcolor=(246,245,242))
        x=(W-rot.width)//2; y=(H-rot.height)//2
        bg.paste(rot,(x,y))
        return bg
    return im.resize((W,H),Image.Resampling.LANCZOS)

def install_product(pid, colors, front, back=None):
    front_master=Image.open(front).convert('RGB')
    back_master=Image.open(back).convert('RGB') if back else front_master.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
    for color in colors:
        slug=color.lower().replace(' ','-')
        target=COLORS[color]
        f=recolor(front_master,target)
        b=recolor(back_master,target)
        for view,src in [('front',f),('back',b),('detail',f),('angled',f)]:
            out=canvas_from(src,view)
            save_jpg(out, PROD/pid/f'{slug}-{view}.jpg', 93)

# Exact/high-confidence photographic replacements.
for pid, colors in {
    'meridian-tee':['Bone','Forest'],
    'northline-tee':['Black','Stone'],
    'range-tee':['Sage','Bone'],
    'clubhouse-tee':['Forest','Stone'],
}.items():
    install_product(pid, colors, SRC/'tee-front-master.png', SRC/'tee-back-master.png')

install_product('trail-cap',['Sage','Black','Stone','Forest'],SRC/'cap-front-master.png')
install_product('half-tights',['Black','Forest'],SRC/'tights-front-master.png')
install_product('winter-tights',['Black','Forest'],SRC/'tights-front-master.png')
install_product('summit-shorts',['Black','Stone','Sage'],SRC/'shorts-front-master.png')
install_product('trail-shorts',['Forest','Black'],SRC/'shorts-front-master.png')

print('Installed high-resolution editorial photography and photographic packshots for featured ALTURA products.')
