"""Compose img/ogp.png (1200x630) for the R6S edition of ブラウザで動くエイム練習サイト / Browser Aim Trainer:
paper sheet on the slate board (this site's look), shared brand name, combat pictogram on the right.
Run: python tools/build_ogp.py"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

IMG = Path(__file__).resolve().parent.parent / "img"
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
pic = Image.open(IMG / "mode-combat.webp").convert("RGB").resize((320, 320), Image.LANCZOS)
card.paste(pic, (790, 160))
F = "C:/Windows/Fonts/"
mono = ImageFont.truetype(F + "consola.ttf", 20)
brand = ImageFont.truetype(F + "YuGothB.ttc", 42)
game = ImageFont.truetype(F + "bahnschrift.ttf", 44); game.set_variation_by_name("Bold Condensed")
jp_b = ImageFont.truetype(F + "YuGothB.ttc", 30)
jp = ImageFont.truetype(F + "YuGothM.ttc", 22)
d.text((110, 120), "BROWSER AIM TRAINER · FOR RAINBOW SIX SIEGE PLAYERS", font=mono, fill=INK2)
d.text((106, 160), "ブラウザで動くエイム練習サイト", font=brand, fill=INK)
d.text((110, 228), "(R6S)", font=game, fill=ORANGE)
d.text((110, 312), "マッチング待ちの数分で、", font=jp_b, fill=INK)
d.text((110, 356), "R6S の感度そのままエイム練習。", font=jp_b, fill=INK)
d.line([(110, 420), (680, 420)], fill=INK, width=3)
d.text((110, 438), "マップ戦 / ドリル / ブラウザで即起動", font=jp, fill=INK2)
d.text((110, 474), "Unofficial · not affiliated with Ubisoft", font=jp, fill=INK2)
card.save(IMG / "ogp.png", optimize=True)
print("ogp.png", (IMG / "ogp.png").stat().st_size // 1024, "KB")
