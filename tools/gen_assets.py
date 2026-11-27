#!/usr/bin/env python3
"""
도트 그래픽 리소스 생성기 (외부 라이브러리 없음)

출력
  assets/img/tiles.png        16x16 타일 시트 (지형 + 오브젝트)
  assets/img/characters.png   캐릭터 걷기 시트 (행 = 캐릭터, 열 = 아래3·왼쪽3·오른쪽3·위3)
  assets/img/monsters.png     몬스터 시트 (32x32, 보스 48x48)
  assets/img/bg/*.png         전투 배경 (320x120)
  data/tiles.json             타일 목록·속성 (인덱스 = 맵 데이터 값)
  data/sprites.json           캐릭터·몬스터 스프라이트 카탈로그

실행: python tools/gen_assets.py
"""
import json, math, os, random, struct, zlib

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
T = 16
OUTLINE = (30, 24, 40, 255)


# ------------------------------------------------------------------ 기본 도구
def hexc(h, a=255):
    h = h.lstrip('#')
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), a)


def mix(c1, c2, t):
    return tuple(int(round(c1[i] + (c2[i] - c1[i]) * t)) for i in range(3)) + (c1[3],)


def lighten(c, t=0.2):
    return mix(c, (255, 255, 255, 255), t)


def darken(c, t=0.2):
    return mix(c, (0, 0, 0, 255), t)


class Img:
    def __init__(self, w, h):
        self.w, self.h = w, h
        self.p = [[None] * w for _ in range(h)]

    def set(self, x, y, c):
        if c is not None and 0 <= x < self.w and 0 <= y < self.h:
            self.p[y][x] = c

    def get(self, x, y):
        return self.p[y][x] if 0 <= x < self.w and 0 <= y < self.h else None

    def rect(self, x, y, w, h, c):
        for yy in range(y, y + h):
            for xx in range(x, x + w):
                self.set(xx, yy, c)

    def ellipse(self, cx, cy, rx, ry, c):
        for y in range(int(cy - ry - 1), int(cy + ry + 2)):
            for x in range(int(cx - rx - 1), int(cx + rx + 2)):
                if rx > 0 and ry > 0 and ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1:
                    self.set(x, y, c)

    def poly(self, pts, c):
        ys = [p[1] for p in pts]
        for y in range(int(min(ys)), int(max(ys)) + 1):
            yc = y + 0.5
            xs = []
            for i in range(len(pts)):
                (x1, y1), (x2, y2) = pts[i], pts[(i + 1) % len(pts)]
                if (y1 <= yc < y2) or (y2 <= yc < y1):
                    xs.append(x1 + (yc - y1) * (x2 - x1) / (y2 - y1))
            xs.sort()
            for i in range(0, len(xs) - 1, 2):
                for x in range(int(math.ceil(xs[i] - 0.5)), int(math.floor(xs[i + 1] - 0.5)) + 1):
                    self.set(x, y, c)

    def line(self, x0, y0, x1, y1, c):
        n = max(abs(x1 - x0), abs(y1 - y0), 1)
        for i in range(n + 1):
            self.set(int(round(x0 + (x1 - x0) * i / n)), int(round(y0 + (y1 - y0) * i / n)), c)

    def blit(self, other, ox, oy, flip=False):
        for y in range(other.h):
            for x in range(other.w):
                c = other.p[y][other.w - 1 - x if flip else x]
                if c is not None:
                    self.set(ox + x, oy + y, c)

    def copy(self):
        n = Img(self.w, self.h)
        n.p = [row[:] for row in self.p]
        return n

    def outline(self, c=OUTLINE):
        src = self.copy()
        for y in range(self.h):
            for x in range(self.w):
                if src.p[y][x] is None:
                    for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                        if src.get(x + dx, y + dy) is not None:
                            self.p[y][x] = c
                            break
        return self

    def shade(self, hi=0.18, lo=0.22):
        """가장자리 셰이딩: 위·왼쪽이 비어 있으면 밝게, 아래·오른쪽이 비어 있으면 어둡게"""
        src = self.copy()
        for y in range(self.h):
            for x in range(self.w):
                c = src.p[y][x]
                if c is None or c == OUTLINE:
                    continue
                if src.get(x + 1, y) is None or src.get(x, y + 1) is None:
                    self.p[y][x] = darken(c, lo)
                elif src.get(x - 1, y) is None or src.get(x, y - 1) is None:
                    self.p[y][x] = lighten(c, hi)
        return self


def save_png(img, path):
    raw = bytearray()
    for row in img.p:
        raw.append(0)
        for c in row:
            raw.extend(c if c else (0, 0, 0, 0))

    def chunk(t, d):
        return struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)

    data = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', img.w, img.h, 8, 6, 0, 0, 0)) \
        + chunk(b'IDAT', zlib.compress(bytes(raw), 9)) + chunk(b'IEND', b'')
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'wb') as f:
        f.write(data)


def scaled(img, k):
    out = Img(img.w * k, img.h * k)
    for y in range(img.h):
        for x in range(img.w):
            c = img.p[y][x]
            if c:
                out.rect(x * k, y * k, k, k, c)
    return out


# ------------------------------------------------------------------ 팔레트
C = {k: hexc(v) for k, v in {
    'grass': '#62b04e', 'grass_d': '#4a943c', 'grass_l': '#86cc63', 'grass_dd': '#3a7a31',
    'forest': '#3f8a3e', 'forest_d': '#2f6e30', 'forest_l': '#58a24f',
    'dirt': '#c9a46c', 'dirt_d': '#a8854f', 'dirt_l': '#dcbc88',
    'sand': '#e6d394', 'sand_d': '#cdb874',
    'water': '#3e86d6', 'water_d': '#2e69b6', 'water_l': '#77b6f0', 'foam': '#d7efff',
    'stone': '#9c9eac', 'stone_d': '#7a7c8b', 'stone_l': '#bdbfca',
    'wood': '#a5703e', 'wood_d': '#83562c', 'wood_l': '#c08851',
    'snow': '#eef3f9', 'snow_d': '#cfdbe8', 'snow_l': '#ffffff',
    'ice': '#b9e2f4', 'ice_d': '#93cbe6',
    'cave': '#6e5d4f', 'cave_d': '#574a3e', 'cave_l': '#857262',
    'dung': '#4b4560', 'dung_d': '#383349', 'dung_l': '#5e5778',
    'leaf': '#2f8a3c', 'leaf_d': '#226b2d', 'leaf_l': '#4fb05a', 'trunk': '#6e4a2a', 'trunk_d': '#523519',
    'roof': '#b6483b', 'roof_d': '#8d3329', 'roof_l': '#d0665a',
    'wall': '#eadbb5', 'wall_d': '#cdbb90', 'beam': '#7a5232',
    'glass': '#8fd6ff', 'door': '#6b4226', 'gold': '#f2c94c', 'gold_d': '#c79a2a',
    'castle': '#8e92a6', 'castle_d': '#6d7186', 'castle_l': '#adb1c2',
    'red': '#c0392b', 'red_d': '#8e2a20', 'carpet': '#a8243a', 'carpet_l': '#c94058',
    'marble': '#e4e1ea', 'marble_d': '#c9c4d4',
    'rock': '#8d8a93', 'rock_d': '#6b6873', 'rock_l': '#aeabb4',
    'cliff': '#8a7461', 'cliff_d': '#6a5848', 'cliff_l': '#a68e78',
    'purple': '#7d4bb5', 'purple_l': '#a77be0', 'cyan': '#5fe3ff', 'black': '#14121c',
}.items()}


def noise(im, colors, n, seed, size=1):
    r = random.Random(seed)
    for _ in range(n):
        x, y = r.randrange(im.w), r.randrange(im.h)
        im.rect(x, y, size, size, r.choice(colors))


def base(c):
    im = Img(T, T)
    im.rect(0, 0, T, T, c)
    return im


# ------------------------------------------------------------------ 지형 타일
def t_grass(seed=1, flowers=False):
    im = base(C['grass'])
    r = random.Random(seed)
    for _ in range(14):
        x, y = r.randrange(16), r.randrange(15)
        im.set(x, y, C['grass_d']); im.set(x, y + 1, C['grass_dd'] if r.random() < .4 else C['grass_d'])
    for _ in range(8):
        im.set(r.randrange(16), r.randrange(16), C['grass_l'])
    if flowers:
        for _ in range(4):
            x, y = r.randrange(1, 15), r.randrange(1, 15)
            col = r.choice([hexc('#ffffff'), hexc('#ffd84d'), hexc('#ff7aa8')])
            im.set(x, y, col); im.set(x - 1, y, col); im.set(x + 1, y, col); im.set(x, y - 1, col); im.set(x, y, hexc('#ffef9a'))
    return im


def t_forest(seed=2):
    im = base(C['forest'])
    noise(im, [C['forest_d'], C['forest_l'], C['trunk']], 30, seed)
    return im


def t_dirt(seed=3):
    im = base(C['dirt'])
    noise(im, [C['dirt_d'], C['dirt_l']], 26, seed)
    r = random.Random(seed + 9)
    for _ in range(3):
        x, y = r.randrange(1, 14), r.randrange(1, 14)
        im.rect(x, y, 2, 1, C['dirt_d']); im.set(x, y - 1, C['dirt_l'])
    return im


def t_sand(seed=4):
    im = base(C['sand'])
    noise(im, [C['sand_d'], lighten(C['sand'], .3)], 22, seed)
    return im


def t_water(phase=0):
    im = base(C['water'])
    noise(im, [C['water_d']], 10, 5 + phase)
    for row in (3, 9, 14):
        off = (row * 3 + phase * 4) % 16
        for i in range(5):
            im.set((off + i) % 16, row, C['water_l'])
        im.set((off + 2) % 16, row - 1, C['foam'])
    return im


def t_bridge():
    im = t_water()
    for y in range(0, 16, 4):
        im.rect(0, y, 16, 3, C['wood'])
        im.rect(0, y + 3, 16, 1, C['wood_d'])
        im.set(3, y + 1, C['wood_d']); im.set(11, y + 1, C['wood_d'])
    im.rect(0, 0, 1, 16, C['trunk_d']); im.rect(15, 0, 1, 16, C['trunk_d'])
    return im


def t_stone():
    im = base(C['stone'])
    for y in (0, 8):
        im.rect(0, y, 16, 1, C['stone_d'])
        off = 0 if y == 0 else 4
        im.rect(off + 4, y, 1, 8, C['stone_d']); im.rect((off + 12) % 16, y, 1, 8, C['stone_d'])
    noise(im, [C['stone_l']], 10, 7)
    return im


def t_cobble(seed=8):
    im = base(C['stone_d'])
    r = random.Random(seed)
    for cy in range(2, 16, 5):
        for cx in range(1 + (cy % 2) * 2, 18, 5):
            col = r.choice([C['stone'], C['stone_l'], mix(C['stone'], C['dirt'], .3)])
            im.ellipse(cx + .5, cy + .5, 2.3, 2, col)
            im.set(cx - 1, cy - 1, lighten(col, .2))
    return im


def t_wood():
    im = base(C['wood'])
    for x in (0, 5, 10, 15):
        im.rect(x, 0, 1, 16, C['wood_d'])
    for (x, y) in ((2, 4), (7, 11), (12, 2), (3, 13)):
        im.set(x, y, C['wood_d'])
    noise(im, [C['wood_l']], 8, 9)
    return im


def t_carpet():
    im = base(C['carpet'])
    for y in range(0, 16, 4):
        for x in range((y // 4) % 2 * 2, 16, 4):
            im.set(x, y, C['carpet_l'])
    im.rect(0, 0, 1, 16, C['gold']); im.rect(15, 0, 1, 16, C['gold'])
    return im


def t_marble():
    im = base(C['marble'])
    im.rect(0, 0, 8, 8, C['marble_d']); im.rect(8, 8, 8, 8, C['marble_d'])
    noise(im, [lighten(C['marble'], .4)], 6, 10)
    return im


def t_snow(seed=11):
    im = base(C['snow'])
    noise(im, [C['snow_d']], 14, seed)
    noise(im, [C['snow_l']], 8, seed + 1)
    return im


def t_ice():
    im = base(C['ice'])
    for i in range(3):
        im.line(2 + i * 5, 14, 6 + i * 5, 10, lighten(C['ice'], .6))
    noise(im, [C['ice_d']], 8, 12)
    return im


def t_cave(seed=13):
    im = base(C['cave'])
    noise(im, [C['cave_d'], C['cave_l']], 30, seed)
    return im


def t_dungeon():
    im = base(C['dung'])
    for y in (0, 8):
        im.rect(0, y, 16, 1, C['dung_d'])
        im.rect(0 if y == 0 else 8, y, 1, 8, C['dung_d'])
    noise(im, [C['dung_l']], 8, 14)
    return im


def t_void():
    return base(C['black'])


def t_cliff(seed=15):
    im = base(C['cliff'])
    r = random.Random(seed)
    for y in range(2, 16, 5):
        im.rect(0, y, 16, 1, C['cliff_d'])
        im.rect(0, y - 1, 16, 1, C['cliff_l'])
    for _ in range(5):
        x, y = r.randrange(16), r.randrange(16)
        im.line(x, y, x + r.randint(-2, 2), y + 3, C['cliff_d'])
    return im


def t_dwall():
    im = base(C['dung_d'])
    for y in range(0, 16, 4):
        im.rect(0, y, 16, 1, C['black'])
        off = 0 if (y // 4) % 2 == 0 else 4
        for x in range(off, 16, 8):
            im.rect(x, y, 1, 4, C['black'])
    noise(im, [C['dung']], 10, 16)
    return im


def t_snowcliff():
    im = t_cliff(17)
    for x in range(16):
        im.rect(x, 0, 1, 2 + (x * 7) % 3, C['snow'])
    return im


# ------------------------------------------------------------------ 오브젝트 (투명 배경)
def obj():
    return Img(T, T)


def o_tree(leaf='leaf', fruit=False, seed=20):
    im = obj()
    im.rect(7, 11, 3, 5, C['trunk']); im.rect(9, 11, 1, 5, C['trunk_d'])
    im.ellipse(8, 6.5, 7, 6, C[leaf])
    r = random.Random(seed)
    for _ in range(10):
        x, y = r.randrange(3, 13), r.randrange(2, 11)
        if im.get(x, y):
            im.set(x, y, C[leaf + '_d'] if r.random() < .6 else C[leaf + '_l'])
    if fruit:
        for (x, y) in ((5, 5), (10, 4), (9, 8), (4, 8)):
            im.set(x, y, hexc('#e8463c'))
    im.shade()
    return im.outline()


def o_pine(snowy=False):
    im = obj()
    im.rect(7, 13, 2, 3, C['trunk'])
    for i, (y, w) in enumerate(((1, 1), (3, 3), (6, 5), (9, 6))):
        im.poly([(8, y), (8 - w - .5, y + 4.5), (8 + w + .5, y + 4.5)], C['leaf_d'] if i % 2 else C['leaf'])
    im.shade()
    if snowy:
        for (y, w) in ((2, 1), (4, 2), (7, 3), (10, 4)):
            im.rect(8 - w, y, w * 2, 1, C['snow'])
    return im.outline()


def o_dead_tree():
    im = obj()
    im.rect(7, 6, 2, 10, C['trunk'])
    im.line(8, 8, 3, 3, C['trunk']); im.line(8, 7, 13, 2, C['trunk']); im.line(5, 5, 4, 1, C['trunk']); im.line(11, 4, 13, 6, C['trunk'])
    return im.outline()


def o_bush():
    im = obj()
    im.ellipse(8, 10, 6.5, 5, C['leaf'])
    noise_on(im, [C['leaf_d'], C['leaf_l']], 10, 21)
    im.shade()
    return im.outline()


def noise_on(im, colors, n, seed):
    r = random.Random(seed)
    for _ in range(n * 3):
        x, y = r.randrange(im.w), r.randrange(im.h)
        if im.get(x, y):
            im.set(x, y, r.choice(colors))
            n -= 1
            if n <= 0:
                break


def o_tall_grass():
    im = obj()
    r = random.Random(22)
    for i in range(9):
        x = 1 + i * 2 - r.randint(0, 1)
        h = r.randint(5, 9)
        im.line(x, 15, x + r.randint(-1, 1), 15 - h, C['grass_dd'] if i % 2 else C['grass_l'])
    return im


def o_flowers(col):
    im = obj()
    r = random.Random(23)
    for _ in range(5):
        x, y = r.randrange(2, 14), r.randrange(3, 14)
        im.set(x, y + 1, C['grass_dd'])
        for dx, dy in ((0, 0), (1, 0), (-1, 0), (0, -1)):
            im.set(x + dx, y + dy, hexc(col))
        im.set(x, y, hexc('#fff3a0'))
    return im


def o_rock(snow=False):
    im = obj()
    im.ellipse(8, 10, 6.5, 5, C['rock'])
    im.ellipse(6, 8, 2.5, 1.5, C['rock_l'])
    im.shade()
    if snow:
        im.ellipse(8, 7, 5, 2, C['snow'])
    return im.outline()


def o_fence(vertical=False):
    im = obj()
    if vertical:
        im.rect(7, 0, 2, 16, C['wood']); im.rect(8, 0, 1, 16, C['wood_d'])
        im.rect(6, 3, 4, 2, C['wood_l']); im.rect(6, 11, 4, 2, C['wood_l'])
    else:
        im.rect(0, 6, 16, 2, C['wood']); im.rect(0, 11, 16, 2, C['wood'])
        im.rect(1, 4, 2, 11, C['wood_d']); im.rect(13, 4, 2, 11, C['wood_d'])
    return im.outline()


def o_sign():
    im = obj()
    im.rect(7, 9, 2, 7, C['trunk'])
    im.rect(2, 3, 12, 7, C['wood']); im.rect(2, 9, 12, 1, C['wood_d'])
    im.rect(4, 5, 8, 1, C['wood_d']); im.rect(4, 7, 6, 1, C['wood_d'])
    return im.outline()


def o_chest(opened=False):
    im = obj()
    im.rect(2, 6, 12, 9, C['wood'])
    im.rect(2, 10, 12, 1, C['gold'])
    im.rect(7, 9, 2, 3, C['gold_d'])
    if opened:
        im.rect(2, 3, 12, 3, C['wood_d']); im.rect(3, 6, 10, 2, C['black'])
    else:
        im.rect(2, 5, 12, 2, C['wood_l'])
    im.shade()
    return im.outline()


def o_barrel():
    im = obj()
    im.ellipse(8, 9, 5.5, 6.5, C['wood'])
    im.rect(3, 5, 10, 1, C['stone_d']); im.rect(3, 12, 10, 1, C['stone_d'])
    im.shade()
    return im.outline()


def o_crate():
    im = obj()
    im.rect(2, 3, 12, 12, C['wood'])
    im.line(3, 4, 12, 13, C['wood_d']); im.line(12, 4, 3, 13, C['wood_d'])
    im.shade()
    return im.outline()


def o_well():
    im = obj()
    im.ellipse(8, 10, 7, 5, C['stone'])
    im.ellipse(8, 10, 4.5, 3, C['water_d'])
    im.rect(2, 1, 1, 9, C['trunk']); im.rect(13, 1, 1, 9, C['trunk'])
    im.rect(1, 0, 14, 2, C['roof'])
    return im.outline()


def o_roof(part):
    im = obj()
    im.rect(0, 0, 16, 16, C['roof'])
    for y in range(2, 16, 4):
        im.rect(0, y, 16, 1, C['roof_d'])
        for x in range((y // 4) % 2 * 4, 16, 8):
            im.rect(x, y - 3, 1, 3, C['roof_d'])
    im.rect(0, 0, 16, 1, C['roof_l'])
    if part == 'l':
        for y in range(16):
            for x in range(0, max(0, 6 - y // 2)):
                im.p[y][x] = None
        im.line(6, 0, 0, 12, C['roof_d'])
    if part == 'r':
        for y in range(16):
            for x in range(16 - max(0, 6 - y // 2), 16):
                im.p[y][x] = None
        im.line(9, 0, 15, 12, C['roof_d'])
    return im


def o_wall(kind):
    im = base(C['wall'])
    im.rect(0, 0, 16, 1, C['beam']); im.rect(0, 15, 16, 1, C['beam'])
    im.rect(0, 0, 1, 16, C['beam']); im.rect(15, 0, 1, 16, C['beam'])
    noise(im, [C['wall_d']], 6, 30)
    if kind == 'window':
        im.rect(4, 4, 8, 7, C['beam']); im.rect(5, 5, 6, 5, C['glass']); im.rect(7, 5, 1, 5, C['beam'])
        im.set(5, 5, lighten(C['glass'], .6))
    if kind == 'door':
        im.rect(4, 3, 8, 13, C['door']); im.rect(5, 4, 6, 12, darken(C['door'], .15))
        im.set(10, 10, C['gold'])
    return im


def o_castle_wall(top=False):
    im = base(C['castle'])
    for y in range(0, 16, 4):
        im.rect(0, y, 16, 1, C['castle_d'])
        off = 0 if (y // 4) % 2 == 0 else 4
        for x in range(off, 16, 8):
            im.rect(x, y, 1, 4, C['castle_d'])
    noise(im, [C['castle_l']], 6, 31)
    if top:
        for x in range(0, 16, 6):
            im.rect(x, 0, 3, 3, None) if False else None
        for x in (2, 10):
            for yy in range(0, 4):
                for xx in range(x, x + 4):
                    im.p[yy][xx] = None
    return im


def o_gate():
    im = o_castle_wall()
    im.ellipse(8, 8, 6, 6, C['black'])
    im.rect(2, 8, 12, 8, C['black'])
    for x in range(3, 14, 3):
        im.rect(x, 4, 1, 12, C['trunk_d'])
    return im


def o_banner():
    im = obj()
    im.rect(4, 1, 8, 12, C['red']); im.poly([(4, 12), (12, 12), (8, 15)], C['red'])
    im.rect(4, 1, 8, 1, C['gold']); im.ellipse(8, 7, 2.5, 2.5, C['gold'])
    return im.outline()


def o_pillar():
    im = obj()
    im.rect(4, 2, 8, 13, C['marble']); im.rect(10, 2, 2, 13, C['marble_d'])
    im.rect(3, 0, 10, 2, C['stone_l']); im.rect(3, 14, 10, 2, C['stone_l'])
    return im.outline()


def o_throne():
    im = obj()
    im.rect(3, 1, 10, 14, C['gold']); im.rect(5, 3, 6, 8, C['carpet']); im.rect(4, 11, 8, 3, C['carpet_l'])
    im.set(3, 0, C['gold']); im.set(12, 0, C['gold']); im.set(8, 0, C['gold'])
    im.shade()
    return im.outline()


def o_torch():
    im = obj()
    im.rect(7, 7, 2, 7, C['trunk'])
    im.ellipse(8, 5, 2.5, 3.5, hexc('#ff9b2f')); im.ellipse(8, 5.5, 1.2, 2, hexc('#ffe27a'))
    return im


def o_statue():
    im = obj()
    im.rect(4, 12, 8, 4, C['stone_d'])
    im.ellipse(8, 4, 2.5, 2.5, C['stone']); im.rect(6, 6, 4, 6, C['stone']); im.rect(10, 3, 1, 9, C['stone_l'])
    im.shade()
    return im.outline()


def o_counter():
    im = obj()
    im.rect(0, 5, 16, 10, C['wood']); im.rect(0, 5, 16, 2, C['wood_l']); im.rect(0, 14, 16, 1, C['wood_d'])
    return im


def o_shelf():
    im = obj()
    im.rect(1, 1, 14, 15, C['wood_d'])
    r = random.Random(32)
    for y in (2, 7, 12):
        im.rect(2, y + 3, 12, 1, C['wood'])
        x = 2
        while x < 14:
            w = r.randint(1, 2)
            im.rect(x, y, w, 3, r.choice([hexc('#c0392b'), hexc('#2e86de'), hexc('#27ae60'), hexc('#f1c40f')]))
            x += w + 0
    return im.outline()


def o_bed():
    im = obj()
    im.rect(2, 1, 12, 14, C['wood']); im.rect(3, 2, 10, 4, hexc('#ffffff')); im.rect(3, 6, 10, 8, hexc('#4f7fd8'))
    im.shade()
    return im.outline()


def o_table():
    im = obj()
    im.rect(1, 4, 14, 8, C['wood_l']); im.rect(1, 11, 14, 1, C['wood_d'])
    im.rect(2, 12, 2, 3, C['wood_d']); im.rect(12, 12, 2, 3, C['wood_d'])
    im.ellipse(8, 7, 2, 1.5, hexc('#ffffff'))
    return im.outline()


def o_pot():
    im = obj()
    im.ellipse(8, 10, 5, 5, hexc('#b66a3c')); im.rect(6, 4, 4, 2, hexc('#8d4f2a'))
    im.shade()
    return im.outline()


def o_stairs(down=True):
    im = obj()
    for i in range(4):
        col = darken(C['stone'], .15 * i) if down else lighten(C['stone'], .1 * (3 - i))
        im.rect(1, 1 + i * 4, 14, 3, col)
        im.rect(1, 4 + i * 4, 14, 1, C['black'] if down else C['stone_d'])
    return im.outline()


def o_cave_entrance():
    im = obj()
    im.ellipse(8, 10, 7, 8, C['cliff_d'])
    im.ellipse(8, 11, 5, 6, C['black'])
    im.rect(3, 11, 10, 5, C['black'])
    return im


def o_crystal(col='cyan'):
    im = obj()
    im.poly([(8, 1), (12, 7), (10, 15), (6, 15), (4, 7)], C[col] if col in C else hexc(col))
    im.line(8, 2, 8, 14, lighten(C['cyan'], .6))
    im.shade()
    return im.outline()


def o_portal():
    im = obj()
    for r_, col in ((7, C['purple']), (5, C['purple_l']), (3, hexc('#e6ccff')), (1.5, hexc('#ffffff'))):
        im.ellipse(8, 8, r_, r_ * .8, col)
    return im


def o_spring():
    im = obj()
    im.ellipse(8, 8, 7.5, 6, C['stone'])
    im.ellipse(8, 8, 5.5, 4, hexc('#56c9e8'))
    for (x, y) in ((6, 7), (9, 9), (10, 6)):
        im.set(x, y, hexc('#ffffff'))
    return im.outline()


def world_tree():
    im = Img(32, 32)
    im.rect(13, 18, 6, 14, C['trunk']); im.rect(17, 18, 2, 14, C['trunk_d'])
    im.poly([(13, 31), (9, 31), (13, 27)], C['trunk']); im.poly([(19, 31), (23, 31), (19, 27)], C['trunk'])
    im.ellipse(16, 11, 15, 11, C['leaf'])
    im.ellipse(9, 8, 6, 5, C['leaf_l']); im.ellipse(22, 9, 6, 5, C['leaf_l'])
    r = random.Random(40)
    for _ in range(40):
        x, y = r.randrange(2, 30), r.randrange(1, 21)
        if im.get(x, y):
            im.set(x, y, C['leaf_d'])
    for _ in range(9):
        x, y = r.randrange(4, 28), r.randrange(3, 18)
        if im.get(x, y):
            im.set(x, y, hexc('#d9ffb0'))
    im.shade()
    im.outline()
    parts = {}
    for name, (ox, oy) in (('tl', (0, 0)), ('tr', (16, 0)), ('bl', (0, 16)), ('br', (16, 16))):
        p = obj()
        for y in range(16):
            for x in range(16):
                p.p[y][x] = im.p[oy + y][ox + x]
        parts[name] = p
    return parts


# 타일 정의: (이름, 이미지, 속성). 인덱스 0 = 빈 칸
def build_tiles():
    wt = world_tree()
    G, O = 'ground', 'object'
    tiles = [
        ('empty', obj(), {'layer': O, 'walk': True}),
        # 지형
        ('grass', t_grass(1), {'layer': G, 'walk': True, 'enc': True, 'label': '풀밭'}),
        ('grass2', t_grass(7), {'layer': G, 'walk': True, 'enc': True, 'label': '풀밭 2'}),
        ('meadow', t_grass(3, flowers=True), {'layer': G, 'walk': True, 'enc': True, 'label': '꽃밭'}),
        ('forest_floor', t_forest(), {'layer': G, 'walk': True, 'enc': True, 'label': '숲 바닥'}),
        ('dirt', t_dirt(), {'layer': G, 'walk': True, 'label': '흙길'}),
        ('sand', t_sand(), {'layer': G, 'walk': True, 'label': '모래'}),
        ('water', t_water(0), {'layer': G, 'walk': False, 'anim': 'water2', 'label': '물'}),
        ('water2', t_water(1), {'layer': G, 'walk': False, 'anim': 'water', 'hidden': True}),
        ('bridge', t_bridge(), {'layer': G, 'walk': True, 'label': '다리'}),
        ('stone', t_stone(), {'layer': G, 'walk': True, 'label': '돌바닥'}),
        ('cobble', t_cobble(), {'layer': G, 'walk': True, 'label': '자갈길'}),
        ('wood', t_wood(), {'layer': G, 'walk': True, 'label': '나무 바닥'}),
        ('carpet', t_carpet(), {'layer': G, 'walk': True, 'label': '양탄자'}),
        ('marble', t_marble(), {'layer': G, 'walk': True, 'label': '대리석'}),
        ('snow', t_snow(11), {'layer': G, 'walk': True, 'enc': True, 'label': '눈밭'}),
        ('snow2', t_snow(19), {'layer': G, 'walk': True, 'enc': True, 'label': '눈밭 2'}),
        ('ice', t_ice(), {'layer': G, 'walk': True, 'enc': True, 'label': '얼음'}),
        ('cave', t_cave(), {'layer': G, 'walk': True, 'enc': True, 'label': '동굴 바닥'}),
        ('dungeon', t_dungeon(), {'layer': G, 'walk': True, 'enc': True, 'label': '요새 바닥'}),
        ('void', t_void(), {'layer': G, 'walk': False, 'label': '어둠'}),
        ('cliff', t_cliff(), {'layer': G, 'walk': False, 'label': '절벽'}),
        ('snow_cliff', t_snowcliff(), {'layer': G, 'walk': False, 'label': '눈 절벽'}),
        ('dwall', t_dwall(), {'layer': G, 'walk': False, 'label': '요새 벽'}),
        # 자연 오브젝트
        ('tree', o_tree(), {'layer': O, 'walk': False, 'label': '나무'}),
        ('fruit_tree', o_tree(fruit=True, seed=24), {'layer': O, 'walk': False, 'label': '열매나무'}),
        ('pine', o_pine(), {'layer': O, 'walk': False, 'label': '전나무'}),
        ('snow_pine', o_pine(True), {'layer': O, 'walk': False, 'label': '눈 덮인 전나무'}),
        ('dead_tree', o_dead_tree(), {'layer': O, 'walk': False, 'label': '고목'}),
        ('bush', o_bush(), {'layer': O, 'walk': False, 'label': '덤불'}),
        ('tall_grass', o_tall_grass(), {'layer': O, 'walk': True, 'label': '긴 풀'}),
        ('flowers_r', o_flowers('#ff6f91'), {'layer': O, 'walk': True, 'label': '분홍 꽃'}),
        ('flowers_y', o_flowers('#ffd84d'), {'layer': O, 'walk': True, 'label': '노란 꽃'}),
        ('rock', o_rock(), {'layer': O, 'walk': False, 'label': '바위'}),
        ('snow_rock', o_rock(True), {'layer': O, 'walk': False, 'label': '눈 바위'}),
        ('wtree_tl', wt['tl'], {'layer': O, 'walk': False, 'label': '세계수 (좌상)'}),
        ('wtree_tr', wt['tr'], {'layer': O, 'walk': False, 'label': '세계수 (우상)'}),
        ('wtree_bl', wt['bl'], {'layer': O, 'walk': False, 'label': '세계수 (좌하)'}),
        ('wtree_br', wt['br'], {'layer': O, 'walk': False, 'label': '세계수 (우하)'}),
        ('spring', o_spring(), {'layer': O, 'walk': False, 'label': '샘'}),
        ('crystal', o_crystal(), {'layer': O, 'walk': False, 'label': '수정'}),
        ('ice_crystal', o_crystal('#cfefff'), {'layer': O, 'walk': False, 'label': '얼음 수정'}),
        ('cave_entrance', o_cave_entrance(), {'layer': O, 'walk': True, 'label': '동굴 입구'}),
        # 마을
        ('fence_h', o_fence(), {'layer': O, 'walk': False, 'label': '울타리 (가로)'}),
        ('fence_v', o_fence(True), {'layer': O, 'walk': False, 'label': '울타리 (세로)'}),
        ('sign', o_sign(), {'layer': O, 'walk': False, 'label': '표지판'}),
        ('chest', o_chest(), {'layer': O, 'walk': False, 'label': '보물상자'}),
        ('chest_open', o_chest(True), {'layer': O, 'walk': False, 'label': '열린 상자'}),
        ('barrel', o_barrel(), {'layer': O, 'walk': False, 'label': '통'}),
        ('crate', o_crate(), {'layer': O, 'walk': False, 'label': '상자'}),
        ('well', o_well(), {'layer': O, 'walk': False, 'label': '우물'}),
        ('pot', o_pot(), {'layer': O, 'walk': False, 'label': '항아리'}),
        ('roof_l', o_roof('l'), {'layer': O, 'walk': False, 'label': '지붕 (왼쪽)'}),
        ('roof', o_roof('m'), {'layer': O, 'walk': False, 'label': '지붕'}),
        ('roof_r', o_roof('r'), {'layer': O, 'walk': False, 'label': '지붕 (오른쪽)'}),
        ('wall', o_wall('plain'), {'layer': O, 'walk': False, 'label': '벽'}),
        ('window', o_wall('window'), {'layer': O, 'walk': False, 'label': '창문 벽'}),
        ('door', o_wall('door'), {'layer': O, 'walk': True, 'label': '문'}),
        # 성·요새
        ('castle_wall', o_castle_wall(), {'layer': O, 'walk': False, 'label': '성벽'}),
        ('castle_top', o_castle_wall(True), {'layer': O, 'walk': False, 'label': '성벽 위'}),
        ('gate', o_gate(), {'layer': O, 'walk': True, 'label': '성문'}),
        ('banner', o_banner(), {'layer': O, 'walk': False, 'label': '깃발'}),
        ('pillar', o_pillar(), {'layer': O, 'walk': False, 'label': '기둥'}),
        ('throne', o_throne(), {'layer': O, 'walk': False, 'label': '옥좌'}),
        ('torch', o_torch(), {'layer': O, 'walk': False, 'label': '횃불'}),
        ('statue', o_statue(), {'layer': O, 'walk': False, 'label': '석상'}),
        ('portal', o_portal(), {'layer': O, 'walk': True, 'label': '차원문'}),
        # 실내
        ('counter', o_counter(), {'layer': O, 'walk': False, 'label': '계산대'}),
        ('shelf', o_shelf(), {'layer': O, 'walk': False, 'label': '책장'}),
        ('bed', o_bed(), {'layer': O, 'walk': False, 'label': '침대'}),
        ('table', o_table(), {'layer': O, 'walk': False, 'label': '탁자'}),
        ('stairs_down', o_stairs(True), {'layer': O, 'walk': True, 'label': '내려가는 계단'}),
        ('stairs_up', o_stairs(False), {'layer': O, 'walk': True, 'label': '올라가는 계단'}),
    ]
    return tiles


# ------------------------------------------------------------------ 캐릭터 (4방향 x 3프레임)
def draw_char(spec, direction, frame):
    """16x16 캐릭터 한 프레임. direction: down/left/right/up, frame: 0(왼발) 1(서기) 2(오른발)"""
    im = Img(16, 16)
    hair = hexc(spec['hair']); skin = hexc(spec.get('skin', '#f6c9a0'))
    cloth = hexc(spec['cloth']); acc = hexc(spec.get('accent', '#ffffff'))
    pants = hexc(spec.get('pants', '#3a3550')); boots = hexc(spec.get('boots', '#4a3020'))
    eye = hexc(spec.get('eye', '#1e1a28'))
    style = spec.get('style', 'short')
    robe = spec.get('robe', False)
    cape = hexc(spec['cape']) if spec.get('cape') else None
    helmet = hexc(spec['helmet']) if spec.get('helmet') else None
    beard = hexc(spec['beard']) if spec.get('beard') else None
    side = direction in ('left', 'right')
    bob = 0 if frame == 1 else -1  # 걸을 때 살짝 들썩임
    legc = cloth if robe else pants

    # 망토 (뒤)
    if cape and direction != 'up':
        if side:
            im.rect(4, 9 + bob, 2, 6, cape)
        else:
            im.rect(3, 9 + bob, 1, 5, cape); im.rect(12, 9 + bob, 1, 5, cape)

    # 다리·신발
    if robe:
        im.rect(4 if not side else 5, 12 + bob, 8 if not side else 6, 3, cloth)
        if frame == 1:
            im.rect(5 if not side else 6, 15, 2, 1, boots); im.rect(9 if not side else 8, 15, 2, 1, boots)
        elif frame == 0:
            im.rect(5 if not side else 8, 15, 2, 1, boots)
        else:
            im.rect(9 if not side else 5, 15, 2, 1, boots)
    elif not side:
        lx, rx = 5, 9
        if frame == 1:
            im.rect(lx, 13, 2, 2, legc); im.rect(rx, 13, 2, 2, legc)
            im.rect(lx, 15, 2, 1, boots); im.rect(rx, 15, 2, 1, boots)
        else:
            # frame 0: 왼발 디딤·오른발 들림 / frame 2: 반대
            plant, lift = (lx, rx) if frame == 0 else (rx, lx)
            im.rect(plant, 13, 2, 2, legc); im.rect(plant, 15, 2, 1, boots)
            im.rect(lift, 12, 2, 2, legc); im.rect(lift, 14, 2, 1, boots)
    else:
        if frame == 1:
            im.rect(6, 13, 4, 2, legc); im.rect(6, 15, 4, 1, boots)
        elif frame == 0:
            im.rect(8, 13 + bob, 2, 2, legc); im.rect(9, 15 + bob, 2, 1, boots)
            im.rect(5, 13 + bob, 2, 2, darken(legc, .2)); im.rect(4, 15 + bob, 2, 1, darken(boots, .2))
        else:
            im.rect(7, 13 + bob, 2, 3, legc); im.rect(7, 15, 3, 1, boots)

    # 몸통
    if side:
        im.rect(5, 9 + bob, 6, 4, cloth)
        im.rect(5, 12 + bob, 6, 1, acc if not robe else darken(cloth, .15))
        arm_dx = {0: 1, 1: 0, 2: -1}[frame]
        im.rect(7 + arm_dx, 10 + bob, 2, 3, darken(cloth, .15)); im.set(7 + arm_dx, 13 + bob, skin)
    else:
        im.rect(4, 9 + bob, 8, 4, cloth)
        im.rect(7, 9 + bob, 2, 2, acc)  # 옷깃
        im.rect(4, 12 + bob, 8, 1, darken(cloth, .25) if not robe else cloth)
        sw = {0: (1, 0), 1: (0, 0), 2: (0, 1)}[frame]
        im.rect(3, 10 + bob + sw[0], 1, 2, cloth); im.set(3, 12 + bob + sw[0], skin)
        im.rect(12, 10 + bob + sw[1], 1, 2, cloth); im.set(12, 12 + bob + sw[1], skin)
        if direction == 'up' and cape:
            im.rect(4, 9 + bob, 8, 6, cape)

    # 머리 (얼굴)
    hy = 2 + bob
    if direction == 'down':
        im.rect(5, hy, 6, 1, hair); im.rect(4, hy + 1, 8, 2, hair)
        im.rect(4, hy + 3, 8, 3, skin); im.rect(5, hy + 6, 6, 1, skin)
        im.set(4, hy + 3, hair); im.set(11, hy + 3, hair)
        im.set(6, hy + 4, eye); im.set(9, hy + 4, eye)
        im.set(7, hy + 6, darken(skin, .15))
    elif direction == 'up':
        im.rect(5, hy, 6, 1, hair); im.rect(4, hy + 1, 8, 5, hair); im.rect(5, hy + 6, 6, 1, skin)
    else:
        im.rect(6, hy, 5, 1, hair); im.rect(5, hy + 1, 7, 2, hair)
        im.rect(7, hy + 3, 5, 3, skin); im.rect(7, hy + 6, 4, 1, skin)
        im.rect(5, hy + 3, 2, 3, hair)
        im.set(10, hy + 4, eye); im.set(12, hy + 4, skin)

    # 머리 모양
    if style == 'long':
        if direction == 'down':
            im.rect(3, hy + 2, 1, 7, hair); im.rect(12, hy + 2, 1, 7, hair)
        elif direction == 'up':
            im.rect(4, hy + 6, 8, 3, hair)
        else:
            im.rect(4, hy + 2, 2, 7, hair)
    elif style == 'spiky':
        for x in (4, 7, 10):
            im.set(x + (0 if not side else 1), hy - 1, hair)
    elif style == 'ponytail':
        if direction == 'up':
            im.rect(7, hy + 6, 2, 3, hair)
        elif side:
            im.rect(3, hy + 2, 2, 4, hair)
    if spec.get('ears'):
        if direction == 'down':
            im.set(3, hy + 3, skin); im.set(12, hy + 3, skin); im.set(2, hy + 2, skin); im.set(13, hy + 2, skin)
        elif side:
            im.set(6, hy + 3, skin); im.set(5, hy + 2, skin)
    if beard:
        if direction == 'down':
            im.rect(5, hy + 5, 6, 3, beard); im.set(6, hy + 4, eye); im.set(9, hy + 4, eye)
        elif side:
            im.rect(8, hy + 5, 4, 3, beard)
    if helmet:
        if direction == 'down':
            im.rect(4, hy - 1, 8, 4, helmet); im.rect(4, hy + 3, 1, 2, helmet); im.rect(11, hy + 3, 1, 2, helmet)
            im.rect(7, hy - 2, 2, 1, acc)
        elif direction == 'up':
            im.rect(4, hy - 1, 8, 6, helmet)
        else:
            im.rect(5, hy - 1, 7, 4, helmet); im.rect(5, hy + 3, 2, 3, helmet); im.rect(7, hy - 2, 2, 1, acc)
    if spec.get('hood'):
        hc = hexc(spec['hood'])
        if direction == 'down':
            im.rect(4, hy - 1, 8, 3, hc); im.rect(3, hy + 1, 1, 6, hc); im.rect(12, hy + 1, 1, 6, hc)
        elif direction == 'up':
            im.rect(4, hy - 1, 8, 8, hc)
        else:
            im.rect(5, hy - 1, 7, 3, hc); im.rect(4, hy + 1, 3, 6, hc)
    if spec.get('crown'):
        g = C['gold']
        im.rect(5, hy - 1, 6, 1, g)
        for x in (5, 7, 10) if not side else (6, 8, 10):
            im.set(x, hy - 2, g)
    if spec.get('glow_eyes') and direction != 'up':
        ge = hexc(spec['glow_eyes'])
        if direction == 'down':
            im.set(6, hy + 4, ge); im.set(9, hy + 4, ge)
        else:
            im.set(10, hy + 4, ge)

    im.shade(.12, .18)
    im.outline()
    if direction == 'left':
        flipped = Img(16, 16)
        flipped.blit(im, 0, 0, flip=True)
        return flipped
    return im


CHARACTERS = [
    ('hero', '주인공', {'hair': '#5a3a22', 'cloth': '#3b6fd8', 'accent': '#f4f4f4', 'pants': '#2c3550', 'style': 'spiky'}),
    ('ria', '리아', {'hair': '#f2d36b', 'cloth': '#3f9a4f', 'accent': '#f2c94c', 'pants': '#7a5a3a', 'style': 'long', 'ears': True, 'boots': '#5a3d22'}),
    ('garen', '가렌', {'hair': '#c9ced8', 'cloth': '#8a93a6', 'accent': '#e0e4ec', 'pants': '#4a4f60', 'cape': '#b8322c', 'boots': '#2a2a33'}),
    ('villager_m', '마을 남자', {'hair': '#2a2420', 'cloth': '#c07a3a', 'accent': '#e8d8b0', 'pants': '#5a4a3a'}),
    ('villager_f', '마을 여자', {'hair': '#8a3b24', 'cloth': '#d76b8f', 'accent': '#ffffff', 'robe': True, 'style': 'long'}),
    ('elder', '촌장', {'hair': '#e8e8e8', 'cloth': '#6a4c93', 'accent': '#d8c8f0', 'robe': True, 'beard': '#f0f0f0'}),
    ('merchant', '상인', {'hair': '#3a2a1a', 'cloth': '#4f7d3a', 'accent': '#f4f0e0', 'pants': '#3a3020', 'style': 'ponytail'}),
    ('guard', '경비병', {'hair': '#3a2a1a', 'cloth': '#3f5a8a', 'accent': '#d0d6e0', 'pants': '#2a3044', 'helmet': '#a9b0c0'}),
    ('king', '국왕', {'hair': '#7a5a30', 'cloth': '#a3263a', 'accent': '#f2c94c', 'robe': True, 'beard': '#7a5a30', 'crown': True, 'cape': '#7a1a2a'}),
    ('child', '아이', {'hair': '#e0a030', 'cloth': '#f08a24', 'accent': '#ffffff', 'pants': '#3a5ab0'}),
    ('dwarf', '드워프', {'hair': '#d0682a', 'cloth': '#7a5a3a', 'accent': '#c0c0c0', 'pants': '#4a3a2a', 'beard': '#d0682a', 'helmet': '#9a9aa8'}),
    ('scout', '북부 정찰병', {'hair': '#3a2a1a', 'cloth': '#2f7f86', 'accent': '#e8e0d0', 'pants': '#2a3a40', 'hood': '#e8e4dc'}),
    ('sage', '엘프 현자', {'hair': '#f4f4ff', 'cloth': '#2f7a4f', 'accent': '#f2c94c', 'robe': True, 'style': 'long', 'ears': True}),
    ('orvel', '오르벨', {'hair': '#2a1a3a', 'cloth': '#3a2458', 'accent': '#f2c94c', 'robe': True, 'hood': '#4a2c70', 'glow_eyes': '#ff4fd8', 'cape': '#2a1a3a'}),
    ('captain', '흑기사 대장', {'hair': '#1a1a22', 'cloth': '#3a3a48', 'accent': '#c0392b', 'pants': '#22222c', 'helmet': '#4a4a5a', 'cape': '#8e1a1a', 'glow_eyes': '#ff3030'}),
    ('nun', '수녀', {'hair': '#3a2a1a', 'cloth': '#2a2a3a', 'accent': '#ffffff', 'robe': True, 'hood': '#2a2a3a'}),
    # 하젤 마을의 장난꾸러기 소년 (새 줄은 목록 끝에만 추가한다 — 행 번호가 sprites.json 의 row)
    ('tobi', '토비', {'hair': '#c0522a', 'cloth': '#4f9a3a', 'accent': '#f4e4b0', 'pants': '#7a5a3a', 'boots': '#4a3420', 'style': 'spiky'}),
]
DIRS = ['down', 'left', 'right', 'up']


def build_characters():
    sheet = Img(16 * 12, 16 * len(CHARACTERS))
    catalog = {}
    for row, (cid, label, spec) in enumerate(CHARACTERS):
        for di, d in enumerate(DIRS):
            for f in range(3):
                sheet.blit(draw_char(spec, d, f), (di * 3 + f) * 16, row * 16)
        catalog[cid] = {'label': label, 'row': row}
    return sheet, catalog


# ------------------------------------------------------------------ 몬스터
def m_slime(body, eye='#1e1a28'):
    im = Img(32, 32)
    b = hexc(body)
    im.ellipse(16, 21, 13, 10, b)
    im.ellipse(16, 15, 8, 7, b)
    im.shade(.25, .3)
    im.ellipse(10, 14, 3, 2, lighten(b, .55))
    im.rect(11, 18, 3, 4, hexc(eye)); im.rect(19, 18, 3, 4, hexc(eye))
    im.set(11, 18, hexc('#ffffff')); im.set(19, 18, hexc('#ffffff'))
    im.rect(14, 25, 5, 1, darken(b, .4))
    return im.outline()


def m_bat():
    im = Img(32, 32)
    b = hexc('#5a3a7a')
    im.poly([(15, 14), (2, 6), (5, 12), (1, 18), (8, 17), (11, 22)], darken(b, .1))
    im.poly([(17, 14), (30, 6), (27, 12), (31, 18), (24, 17), (21, 22)], darken(b, .1))
    im.ellipse(16, 17, 6, 7, b)
    im.poly([(11, 11), (13, 6), (15, 11)], b); im.poly([(17, 11), (19, 6), (21, 11)], b)
    im.shade(.2, .25)
    im.rect(13, 15, 2, 2, hexc('#ffdf3a')); im.rect(18, 15, 2, 2, hexc('#ffdf3a'))
    im.set(14, 21, hexc('#ffffff')); im.set(18, 21, hexc('#ffffff'))
    return im.outline()


def m_goblin():
    im = Img(32, 32)
    sk = hexc('#6cae4a'); cl = hexc('#7a5230')
    im.rect(11, 18, 10, 9, cl); im.rect(11, 26, 4, 4, darken(cl, .2)); im.rect(17, 26, 4, 4, darken(cl, .2))
    im.ellipse(16, 12, 7, 7, sk)
    im.poly([(9, 10), (2, 6), (9, 14)], sk); im.poly([(23, 10), (30, 6), (23, 14)], sk)
    im.rect(6, 18, 5, 3, sk); im.rect(21, 18, 5, 3, sk)
    im.rect(24, 8, 3, 14, hexc('#8a6a40')); im.ellipse(25.5, 8, 3, 3, hexc('#6a4a2a'))
    im.shade(.2, .25)
    im.rect(12, 11, 2, 2, hexc('#ff3b2f')); im.rect(18, 11, 2, 2, hexc('#ff3b2f'))
    im.rect(13, 15, 6, 1, hexc('#2a1a10')); im.set(14, 16, hexc('#ffffff')); im.set(17, 16, hexc('#ffffff'))
    return im.outline()


def m_wolf(fur):
    im = Img(32, 32)
    f = hexc(fur)
    im.ellipse(15, 18, 10, 6, f)
    im.rect(7, 21, 3, 8, darken(f, .1)); im.rect(12, 22, 3, 7, f); im.rect(18, 22, 3, 7, darken(f, .1)); im.rect(22, 21, 3, 8, f)
    im.ellipse(24, 12, 6, 5, f)
    im.poly([(28, 12), (31, 14), (27, 16)], f)
    im.poly([(20, 9), (21, 3), (24, 8)], f); im.poly([(24, 8), (27, 3), (28, 9)], f)
    im.poly([(6, 16), (0, 10), (3, 18)], f)
    im.shade(.2, .25)
    im.rect(25, 11, 2, 1, hexc('#ffd23a')); im.set(30, 13, hexc('#1e1a28'))
    im.rect(26, 16, 3, 1, hexc('#ffffff'))
    return im.outline()


def m_golem():
    im = Img(32, 32)
    r = hexc('#8f8476')
    im.rect(8, 10, 16, 14, r); im.rect(10, 3, 12, 9, r)
    im.rect(2, 11, 6, 12, darken(r, .1)); im.rect(24, 11, 6, 12, darken(r, .1))
    im.rect(9, 24, 6, 7, darken(r, .15)); im.rect(17, 24, 6, 7, darken(r, .15))
    for (x, y) in ((12, 14), (18, 18), (10, 20), (20, 12)):
        im.rect(x, y, 3, 1, darken(r, .35))
    im.rect(14, 16, 4, 3, hexc('#5fe3a0'))
    im.shade(.22, .3)
    im.rect(12, 6, 3, 2, hexc('#5fe3a0')); im.rect(17, 6, 3, 2, hexc('#5fe3a0'))
    return im.outline()


def m_wisp():
    im = Img(32, 32)
    c1 = hexc('#7fe0ff'); c2 = hexc('#d8f6ff')
    im.poly([(16, 2), (24, 12), (26, 22), (16, 30), (6, 22), (8, 12)], c1)
    im.poly([(16, 8), (21, 15), (21, 22), (16, 26), (11, 22), (11, 15)], c2)
    im.shade(.1, .2)
    im.rect(12, 16, 2, 3, hexc('#1a3a6a')); im.rect(18, 16, 2, 3, hexc('#1a3a6a'))
    return im.outline(hexc('#1a4a7a'))


def m_knight(armor, cape=None, eyes='#ff3030', big=False):
    s = 1.0
    im = Img(32, 32)
    a = hexc(armor)
    if cape:
        im.poly([(9, 11), (23, 11), (26, 29), (6, 29)], hexc(cape))
    im.rect(10, 11, 12, 11, a); im.rect(11, 22, 4, 8, darken(a, .15)); im.rect(17, 22, 4, 8, darken(a, .15))
    im.rect(7, 12, 3, 9, a); im.rect(22, 12, 3, 9, a)
    im.ellipse(16, 7, 5.5, 5.5, a); im.rect(14, 0, 4, 3, hexc('#c0392b'))
    im.rect(25, 2, 2, 20, hexc('#cfd6e0')); im.rect(23, 18, 6, 2, hexc('#8a6a40'))
    im.rect(3, 13, 5, 9, darken(a, .25)); im.rect(4, 15, 3, 4, hexc('#c0392b'))
    im.shade(.22, .3)
    im.rect(12, 6, 8, 2, hexc('#14121c')); im.rect(13, 6, 2, 2, hexc(eyes)); im.rect(17, 6, 2, 2, hexc(eyes))
    return im.outline()


def m_wraith():
    im = Img(32, 32)
    c = hexc('#4a3a6e')
    im.poly([(16, 2), (25, 10), (27, 28), (22, 24), (19, 30), (15, 25), (11, 30), (8, 24), (4, 28), (7, 10)], c)
    im.ellipse(16, 10, 7, 7, darken(c, .2))
    im.shade(.25, .25)
    im.ellipse(16, 11, 5, 5, hexc('#14121c'))
    im.rect(13, 10, 2, 2, hexc('#9dffcf')); im.rect(18, 10, 2, 2, hexc('#9dffcf'))
    im.rect(2, 14, 5, 2, c); im.rect(25, 14, 5, 2, c)
    return im.outline()


def m_orvel():
    im = Img(48, 48)
    robe = hexc('#3a2458'); gold = C['gold']
    im.poly([(24, 10), (38, 20), (44, 46), (4, 46), (10, 20)], robe)
    im.poly([(10, 20), (2, 34), (8, 36), (14, 26)], darken(robe, .1))
    im.poly([(38, 20), (46, 34), (40, 36), (34, 26)], darken(robe, .1))
    im.rect(22, 18, 4, 28, gold)
    im.ellipse(24, 12, 8, 8, hexc('#4a2c70'))
    im.poly([(17, 8), (12, 0), (19, 6)], hexc('#e8d8b0')); im.poly([(31, 8), (36, 0), (29, 6)], hexc('#e8d8b0'))
    im.rect(40, 4, 2, 40, hexc('#6a4a2a'))
    im.shade(.22, .28)
    im.ellipse(41, 5, 4, 4, hexc('#ff4fd8')); im.ellipse(41, 5, 2, 2, hexc('#ffd0f4'))
    im.ellipse(24, 13, 5.5, 5, hexc('#14121c'))
    im.rect(20, 12, 3, 2, hexc('#ff4fd8')); im.rect(26, 12, 3, 2, hexc('#ff4fd8'))
    for x in range(18, 31, 3):
        im.set(x, 5, gold)
    return im.outline()


MONSTER_SPRITES = [
    ('slime', '슬라임', lambda: m_slime('#5fc85a')),
    ('slime_poison', '독 슬라임', lambda: m_slime('#a35fd0')),
    ('slime_ice', '얼음 슬라임', lambda: m_slime('#7fd6f0')),
    ('bat', '박쥐', m_bat),
    ('goblin', '고블린', m_goblin),
    ('wolf', '늑대', lambda: m_wolf('#7d7a86')),
    ('snow_wolf', '설원 늑대', lambda: m_wolf('#e8eef6')),
    ('golem', '바위 골렘', m_golem),
    ('wisp', '서리 정령', m_wisp),
    ('dark_knight', '흑기사', lambda: m_knight('#4a4a5a')),
    ('wraith', '망령', m_wraith),
    ('captain', '흑기사 대장', lambda: m_knight('#3a3442', cape='#8e1a1a', eyes='#ffb000')),
    ('orvel', '오르벨', m_orvel),
]


def build_monsters():
    imgs = [(mid, label, fn()) for mid, label, fn in MONSTER_SPRITES]
    sheet = Img(48 * len(imgs), 48)
    catalog = {}
    for i, (mid, label, im) in enumerate(imgs):
        ox = i * 48 + (48 - im.w) // 2
        oy = 48 - im.h
        sheet.blit(im, ox, oy)
        catalog[mid] = {'label': label, 'x': ox, 'y': oy, 'w': im.w, 'h': im.h}
    return sheet, catalog


# ------------------------------------------------------------------ 전투 배경 (320x120)
def battle_bg(kind):
    W, H = 320, 120
    im = Img(W, H)
    pal = {
        'meadow':  ('#7fc4ff', '#c8ecff', '#6ab25a', '#4f9a45', '#3f8a3c'),
        'forest':  ('#5aa070', '#a8d8a0', '#2f6e30', '#3f8a3e', '#285a2a'),
        'town':    ('#8cc8ff', '#e8f4ff', '#c9a46c', '#b08850', '#9a7848'),
        'mountain':('#9ab8d8', '#e0ecf8', '#8a7461', '#6a5848', '#8d8a93'),
        'snow':    ('#a8c4e0', '#f0f6ff', '#dfe8f2', '#c4d2e2', '#b0c0d4'),
        'castle':  ('#3a3550', '#6a6480', '#8e92a6', '#6d7186', '#a8243a'),
        'dungeon': ('#1a1626', '#3a3050', '#4b4560', '#383349', '#2a2438'),
        'throne':  ('#2a0e3a', '#6a2a7a', '#3a2458', '#2a1a40', '#a8243a'),
    }[kind]
    sky1, sky2, g1, g2, g3 = [hexc(c) for c in pal]
    for y in range(H):
        t = y / 70
        col = mix(sky1, sky2, min(1, t)) if y < 70 else g1
        band = (y // 4) * 4  # 계단식 그라데이션 (도트 느낌)
        col = mix(sky1, sky2, min(1, band / 70)) if y < 70 else g1
        im.rect(0, y, W, 1, col)
    r = random.Random(hash(kind) & 0xffff)
    if kind in ('meadow', 'town', 'mountain', 'snow'):
        for i in range(4):  # 구름
            cx, cy = r.randrange(20, 300), r.randrange(8, 35)
            for j in range(4):
                im.ellipse(cx + j * 8, cy + (j % 2) * 2, 9, 5, hexc('#ffffff', 255))
    # 먼 산·언덕
    far = mix(sky2, g2, .5) if kind not in ('dungeon', 'castle', 'throne') else mix(sky1, g2, .5)
    pts = [(0, 70)]
    x = 0
    while x <= W:
        pts.append((x, 70 - r.randint(10, 35 if kind in ('mountain', 'snow') else 18)))
        x += r.randint(25, 45)
    pts += [(W, 70), (W, 70)]
    im.poly(pts + [(W, 75), (0, 75)], far)
    if kind == 'snow':
        for (px, py) in pts[1:-2]:
            im.ellipse(px, py + 3, 6, 3, hexc('#ffffff'))
    # 지면 줄무늬
    for y in range(70, H):
        if (y - 70) % 9 < 3:
            im.rect(0, y, W, 1, g2)
    # 소품
    if kind == 'forest':
        for i in range(9):
            x = i * 38 + r.randint(-6, 6)
            im.rect(x + 5, 40, 6, 32, hexc('#523519'))
            im.ellipse(x + 8, 38, 18, 16, g3)
    if kind in ('castle', 'throne', 'dungeon'):
        for i in range(0, W, 64):
            im.rect(i + 20, 10, 16, 62, g2 if kind != 'dungeon' else g3)
            im.rect(i + 18, 8, 20, 4, lighten(g2, .15))
        if kind in ('castle', 'throne'):
            im.rect(0, 92, W, 16, g3)
    if kind == 'mountain':
        for i in range(6):
            im.ellipse(r.randrange(W), 85 + r.randrange(25), 10, 5, g3)
    return im


BG_KINDS = ['meadow', 'forest', 'town', 'mountain', 'snow', 'castle', 'dungeon', 'throne']


# ------------------------------------------------------------------ 실행
def main():
    tiles = build_tiles()
    cols = 16
    rows = (len(tiles) + cols - 1) // cols
    sheet = Img(cols * T, rows * T)
    meta = []
    for i, (name, im, props) in enumerate(tiles):
        sheet.blit(im, (i % cols) * T, (i // cols) * T)
        meta.append(dict({'id': name}, **props))
    save_png(sheet, os.path.join(ROOT, 'assets/img/tiles.png'))
    with open(os.path.join(ROOT, 'data/tiles.json'), 'w', encoding='utf-8') as f:
        json.dump({'size': T, 'columns': cols, 'image': 'assets/img/tiles.png', 'tiles': meta}, f, ensure_ascii=False, indent=1)

    chars, char_cat = build_characters()
    save_png(chars, os.path.join(ROOT, 'assets/img/characters.png'))
    mons, mon_cat = build_monsters()
    save_png(mons, os.path.join(ROOT, 'assets/img/monsters.png'))
    for k in BG_KINDS:
        save_png(battle_bg(k), os.path.join(ROOT, f'assets/img/bg/{k}.png'))
    with open(os.path.join(ROOT, 'data/sprites.json'), 'w', encoding='utf-8') as f:
        json.dump({
            'characters': {'image': 'assets/img/characters.png', 'size': 16, 'frames': ['down', 'left', 'right', 'up'], 'list': char_cat},
            'monsters': {'image': 'assets/img/monsters.png', 'list': mon_cat},
            'battleBackgrounds': {k: f'assets/img/bg/{k}.png' for k in BG_KINDS}
        }, f, ensure_ascii=False, indent=1)

    # 미리보기 (검토용, 저장소 밖)
    prev = os.environ.get('PREVIEW_DIR')
    if prev:
        save_png(scaled(sheet, 3), os.path.join(prev, 'tiles_x3.png'))
        save_png(scaled(chars, 3), os.path.join(prev, 'chars_x3.png'))
        save_png(scaled(mons, 2), os.path.join(prev, 'monsters_x2.png'))
    print(f'tiles={len(tiles)} characters={len(CHARACTERS)} monsters={len(MONSTER_SPRITES)} bg={len(BG_KINDS)}')


if __name__ == '__main__':
    main()
