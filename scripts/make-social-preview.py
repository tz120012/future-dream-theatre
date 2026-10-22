"""生成仓库的社交预览图（1280x640）。

用法（在仓库根目录）：
    backend\\.venv\\Scripts\\python.exe scripts\\make-social-preview.py

产物：docs/social-preview.png，然后到 GitHub →
Settings → Social preview → Upload image 上传（GitHub API 不支持设置这一项）。

依赖 Pillow（后端 requirements 里已有）和 Windows 自带的微软雅黑字体。
"""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
COVER = ROOT / "frontend" / "src" / "assets" / "cover-space.png"
OUTPUT = ROOT / "docs" / "social-preview.png"

W, H = 1280, 640
CREAM = (251, 248, 243)
NAVY = (31, 42, 68)
YELLOW = (247, 208, 70)
GREY = (122, 128, 140)
BORDER = (231, 226, 216)

FONT_BOLD = r"C:\Windows\Fonts\msyhbd.ttc"
FONT_REG = r"C:\Windows\Fonts\msyh.ttc"


def build() -> Path:
    canvas = Image.new("RGB", (W, H), CREAM)

    # 右侧插画：等比放大后裁切铺满
    cover = Image.open(COVER).convert("RGB")
    panel_w = 660
    scale = max(panel_w / cover.width, H / cover.height)
    resized = cover.resize(
        (round(cover.width * scale), round(cover.height * scale)), Image.LANCZOS
    )
    left = (resized.width - panel_w) // 2
    top = (resized.height - H) // 2
    canvas.paste(resized.crop((left, top, left + panel_w, top + H)), (W - panel_w, 0))

    draw = ImageDraw.Draw(canvas)
    title_font = ImageFont.truetype(FONT_BOLD, 84)
    sub_font = ImageFont.truetype(FONT_REG, 34)
    tech_font = ImageFont.truetype(FONT_REG, 25)
    tag_font = ImageFont.truetype(FONT_BOLD, 22)

    x = 78
    draw.text((x, 168), "未来梦想剧场", font=title_font, fill=NAVY)
    title_w = draw.textlength("未来梦想剧场", font=title_font)
    draw.rounded_rectangle([(x + 6, 276), (x + title_w - 6, 296)], radius=10, fill=YELLOW)

    draw.text((x, 322), "把孩子的梦想", font=sub_font, fill=NAVY)
    draw.text((x, 370), "变成一张魔法卡", font=sub_font, fill=NAVY)
    draw.text((x, 446), "语音访谈 · AI 插画梦想卡 · 和未来的自己对话", font=tech_font, fill=GREY)
    draw.text((x, 484), "FastAPI · React · 本地 Whisper 语音识别 · 可离线部署", font=tech_font, fill=GREY)

    tag = "MIT License"
    tw = draw.textlength(tag, font=tag_font)
    draw.rounded_rectangle([(x, 536), (x + tw + 28, 578)], radius=12, outline=NAVY, width=2)
    draw.text((x + 14, 543), tag, font=tag_font, fill=NAVY)

    draw.rectangle([(0, 0), (W - 1, H - 1)], outline=BORDER, width=2)

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(OUTPUT, optimize=True)
    return OUTPUT


if __name__ == "__main__":
    print("saved:", build())
