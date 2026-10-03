"""Turn the Codex-generated pictograms (large PNGs) into the small WebP files the site loads,
and compose the OGP card. Run: python tools/build_images.py <folder with the source PNGs>

Kept out of the deployed site (tools/ is excluded from the Xserver upload)."""
import sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

SRC = Path(sys.argv[1])
OUT = Path(__file__).resolve().parent.parent / "img"
OUT.mkdir(exist_ok=True)

# display size x2 for high-DPI screens; mode thumbnails show at <=120px, guide images at ~200px
SIZES = {"mode-": 256, "guide-": 440}

def crop_margin(im, pad=0.06):
    """Trim the empty grid paper around the drawing so the pictogram fills small thumbnails."""
    g = im.convert("L").point(lambda v: 255 if v < 110 else 0)  # dark ink + orange count as content
    box = g.getbbox()
    if not box:
        return im
    l, t, r, b = box
    side = max(r - l, b - t) * (1 + 2 * pad)
    cx, cy = (l + r) / 2, (t + b) / 2
    side = min(side, im.width, im.height)
    l = max(0, min(im.width - side, cx - side / 2)); t = max(0, min(im.height - side, cy - side / 2))
    return im.crop((int(l), int(t), int(l + side), int(t + side)))

for png in sorted(SRC.glob("*.png")):
    size = next((v for k, v in SIZES.items() if png.name.startswith(k)), None)
    if size is None:
        continue
    im = crop_margin(Image.open(png).convert("RGB")).resize((size, size), Image.LANCZOS)
    dst = OUT / (png.stem + ".webp")
    im.save(dst, "WEBP", quality=80, method=6)
    print(f"{dst.name}: {dst.stat().st_size // 1024} KB")

# ---- OGP card 1200x630: paper sheet on the slate board, pictogram on the right
W, H = 1200, 630
BOARD, PAPER, INK, INK2, ORANGE, TAPE = "#1d262d", "#f2efe6", "#1b1d1f", "#575c61", "#e8590c", (222, 203, 128)
card = Image.new("RGB", (W, H), BOARD)
d = ImageDraw.Draw(card)
for x in range(0, W, 24):
    d.line([(x, 0), (x, H)], fill="#232d34" if x % 120 else "#2a353d")
for y in range(0, H, 24):
    d.line([(0, y), (W, y)], fill="#232d34" if y % 120 else "#2a353d")
d.rectangle([60, 70, 1140, 560], fill=PAPER)
tape = Image.new("RGBA", (150, 34), TAPE + (215,)).rotate(-4, expand=True)
card.paste(tape, (520, 52), tape)
pic = OUT / "mode-combat.webp"
if (SRC / "mode-combat.png").exists():
    p = crop_margin(Image.open(SRC / "mode-combat.png").convert("RGB")).resize((400, 400), Image.LANCZOS)
    card.paste(p, (700, 115))
F = "C:/Windows/Fonts/"
disp = ImageFont.truetype(F + "bahnschrift.ttf", 84); disp.set_variation_by_name("Bold Condensed")
jp_b = ImageFont.truetype(F + "YuGothB.ttc", 34)
jp = ImageFont.truetype(F + "YuGothM.ttc", 24)
d.text((110, 140), "SIEGE", font=disp, fill=ORANGE)
d.text((110 + d.textlength("SIEGE ", font=disp), 140), "AIM TRAINER", font=disp, fill=INK)
# "unofficial" stamp: the card gets shared without the page around it, so it has to say so itself
stamp_font = ImageFont.truetype(F + "YuGothB.ttc", 30)
st = Image.new("RGBA", (300, 70), (0, 0, 0, 0)); sd = ImageDraw.Draw(st)
sd.rectangle([2, 2, 297, 67], outline="#b8322a", width=4); sd.rectangle([9, 9, 290, 60], outline="#b8322a", width=2)
sd.text((150, 35), "非公式ファンメイド", font=stamp_font, fill="#b8322a", anchor="mm")
st = st.rotate(6, expand=True, resample=Image.BICUBIC)
card.paste(st, (760, 470), st)
d.text((110, 260), "マッチング待ちの数分で、", font=jp_b, fill=INK)
d.text((110, 308), "R6S の感度そのままエイム練習。", font=jp_b, fill=INK)
d.line([(110, 380), (640, 380)], fill=INK, width=3)
d.text((110, 400), "マップ戦 / ドリル / ブラウザで即起動", font=jp, fill=INK2)
d.text((110, 440), "Unofficial fan-made aim trainer for R6S", font=jp, fill=INK2)
d.text((110, 490), "Ubisoft とは関係のない個人制作のツールです", font=jp, fill="#b8322a")
card.save(OUT / "ogp.png", optimize=True)
print("ogp.png:", (OUT / "ogp.png").stat().st_size // 1024, "KB")
