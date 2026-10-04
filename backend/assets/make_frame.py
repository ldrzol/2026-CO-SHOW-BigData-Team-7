# 그림일기 양식(frame.png) 생성기 — 칸 수·문구를 바꿀 때만 다시 돌리면 돼요
#   python backend/assets/make_frame.py
import random
from PIL import Image, ImageDraw, ImageFont

W, H, M = 1024, 1365, 48
INK, LINE, BG = (40, 38, 36), (120, 115, 110), (253, 251, 246)
COLS, ROWS = 12, 5  # 12x5 = 60칸, 프롬프트의 "60자 이내"와 같은 수

font = lambda n: ImageFont.truetype("C:/Windows/Fonts/malgun.ttf", n)

img = Image.new("RGB", (W, H), BG)
d = ImageDraw.Draw(img)
random.seed(7)  # 매번 같은 삐뚤함

# 손으로 그린 느낌: 직선을 조금씩 떨리게 이어 붙여요
def wobble(x1, y1, x2, y2, width=4, fill=INK):
    n = max(2, int(((x2 - x1) ** 2 + (y2 - y1) ** 2) ** 0.5 // 40))
    pts = [(x1 + (x2 - x1) * i / n + random.uniform(-1.6, 1.6),
            y1 + (y2 - y1) * i / n + random.uniform(-1.6, 1.6)) for i in range(n + 1)]
    d.line(pts, fill=fill, width=width, joint="curve")

def box(x1, y1, x2, y2, width=4, fill=INK):
    wobble(x1, y1, x2, y1, width, fill); wobble(x2, y1, x2, y2, width, fill)
    wobble(x2, y2, x1, y2, width, fill); wobble(x1, y2, x1, y1, width, fill)

# 칸 너비에 맞춰 글자 크기를 줄여서 넣어요
def label(x, y, text, maxw):
    size = 36
    while size > 18 and d.textlength(text, font=font(size)) > maxw:
        size -= 2
    d.text((x, y), text, font=font(size), fill=INK, anchor="lm")

# 1줄: 날짜 + 날씨
y = M
box(M, y, W - M, y + 84)
label(M + 20, y + 42, "      년     월     일        날씨   맑음  흐림  비  눈  기타", 888)
# 2줄: 기분
y += 100
box(M, y, W - M, y + 84)
label(M + 20, y + 42, "기분    기쁨    평온함    피곤함    슬픔    화남", 888)
# 그림 칸
y += 104
box(M, y, W - M, y + 556, width=5)

# 제목 줄
y += 580
box(M, y, W - M, y + 80)
label(M + 20, y + 40, "제목 :", 888)

# 글 칸: 60칸 원고지
y += 100
cw = ch = (W - 2 * M) / COLS
for r in range(ROWS + 1):
    wobble(M, y + r * ch, W - M, y + r * ch, 3, LINE)
for c in range(COLS + 1):
    wobble(M + c * cw, y, M + c * cw, y + ROWS * ch, 3, LINE)
box(M, y, W - M, y + ROWS * ch, width=4)

img.save("backend/assets/frame.png")
print("backend/assets/frame.png", img.size)
