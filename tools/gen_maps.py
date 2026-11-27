#!/usr/bin/env python3
"""
샘플 맵 생성기 — data/maps/*.json 을 만든다. (관리자 페이지 '맵 디자인'에서 이어서 편집 가능)
실행: python tools/gen_maps.py   (먼저 tools/gen_assets.py 로 data/tiles.json 생성)

맵 형식
  id, name, w, h, bgm, battleBg, encounter{rate, groups[{enemies[], weight}]} | null
  ground[h][w], objects[h][w]  (값 = data/tiles.json 인덱스, objects 0 = 비어 있음)
  warps[{x, y, to, tx, ty, dir, cond?, fail?}]  (cond: 시나리오 조건식, fail: 조건 불만족 시 실행할 장면)
"""
import json, os, random

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TILES = json.load(open(os.path.join(ROOT, 'data/tiles.json'), encoding='utf-8'))['tiles']
TI = {t['id']: i for i, t in enumerate(TILES)}


class Map:
    def __init__(self, mid, name, w, h, fill, bgm, battle_bg, seed):
        self.id, self.name, self.w, self.h = mid, name, w, h
        self.ground = [[TI[fill]] * w for _ in range(h)]
        self.objects = [[0] * w for _ in range(h)]
        self.bgm, self.battle_bg = bgm, battle_bg
        self.encounter = None
        self.warps = []
        self.r = random.Random(seed)
        self.marks = {}

    def inb(self, x, y):
        return 0 <= x < self.w and 0 <= y < self.h

    def g(self, x, y, t):
        if self.inb(x, y):
            self.ground[y][x] = TI[t]

    def o(self, x, y, t):
        if self.inb(x, y):
            self.objects[y][x] = TI[t] if t else 0

    def rg(self, x, y, w, h, t):
        for yy in range(y, y + h):
            for xx in range(x, x + w):
                self.g(xx, yy, t)

    def ro(self, x, y, w, h, t):
        for yy in range(y, y + h):
            for xx in range(x, x + w):
                self.o(xx, yy, t)

    def clear(self, x, y, w=1, h=1):
        self.ro(x, y, w, h, None)

    def border(self, t, thick=2, gaps=()):
        """가장자리를 오브젝트로 막고 gaps 위치만 비운다. gaps: [(x, y, w, h)]"""
        for y in range(self.h):
            for x in range(self.w):
                if x < thick or y < thick or x >= self.w - thick or y >= self.h - thick:
                    self.o(x, y, t)
        for (x, y, w, h) in gaps:
            self.clear(x, y, w, h)

    def path(self, pts, t='dirt', width=2):
        for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
            if x0 == x1:
                for y in range(min(y0, y1), max(y0, y1) + 1):
                    self.rg(x0, y, width, 1, t); self.clear(x0, y, width, 1)
            else:
                for x in range(min(x0, x1), max(x0, x1) + 1):
                    self.rg(x, y0, 1, width, t); self.clear(x, y0, 1, width)
            # 모서리 채우기
            self.rg(x1, y1, width, width, t); self.clear(x1, y1, width, width)

    def scatter(self, t, n, area=None, on=None, spacing=0):
        x0, y0, w, h = area or (0, 0, self.w, self.h)
        placed = 0
        tries = 0
        while placed < n and tries < n * 40:
            tries += 1
            x, y = self.r.randrange(x0, x0 + w), self.r.randrange(y0, y0 + h)
            if not self.inb(x, y) or self.objects[y][x]:
                continue
            gname = TILES[self.ground[y][x]]['id']
            if on and gname not in on:
                continue
            if spacing and any(self.objects[yy][xx] for yy in range(max(0, y - spacing), min(self.h, y + spacing + 1))
                               for xx in range(max(0, x - spacing), min(self.w, x + spacing + 1))):
                continue
            self.o(x, y, t)
            placed += 1

    def patch(self, t, cx, cy, rx, ry):
        for y in range(cy - ry, cy + ry + 1):
            for x in range(cx - rx, cx + rx + 1):
                if ((x - cx) / (rx + .5)) ** 2 + ((y - cy) / (ry + .5)) ** 2 <= 1:
                    self.g(x, y, t)

    def lake(self, cx, cy, rx, ry, rim='sand', water='water'):
        self.patch(rim, cx, cy, rx + 1, ry + 1)
        self.patch(water, cx, cy, rx, ry)
        for y in range(cy - ry - 1, cy + ry + 2):
            for x in range(cx - rx - 1, cx + rx + 2):
                if self.inb(x, y) and TILES[self.ground[y][x]]['id'] in (rim, water):
                    self.o(x, y, None)

    def house(self, x, y, w=5, door_dx=2, window=True):
        """지붕 2줄 + 벽 1줄. 문 좌표를 돌려준다."""
        self.o(x, y, 'roof_l'); self.ro(x + 1, y, w - 2, 1, 'roof'); self.o(x + w - 1, y, 'roof_r')
        self.o(x, y + 1, 'roof_l'); self.ro(x + 1, y + 1, w - 2, 1, 'roof'); self.o(x + w - 1, y + 1, 'roof_r')
        for i in range(w):
            self.o(x + i, y + 2, 'window' if window and i in (1, w - 2) and i != door_dx else 'wall')
        self.o(x + door_dx, y + 2, 'door')
        return (x + door_dx, y + 2)

    def world_tree(self, x, y):
        self.o(x, y, 'wtree_tl'); self.o(x + 1, y, 'wtree_tr'); self.o(x, y + 1, 'wtree_bl'); self.o(x + 1, y + 1, 'wtree_br')

    def warp(self, x, y, to, tx, ty, d='down', cond=None, fail=None, w=1, h=1, same=False):
        for yy in range(y, y + h):
            for xx in range(x, x + w):
                wp = {'x': xx, 'y': yy, 'to': to, 'tx': tx if same else tx + (xx - x), 'ty': ty if same else ty + (yy - y), 'dir': d}
                if cond:
                    wp['cond'] = cond
                if fail:
                    wp['fail'] = fail
                self.warps.append(wp)

    def to_json(self):
        return {'id': self.id, 'name': self.name, 'w': self.w, 'h': self.h, 'bgm': self.bgm, 'battleBg': self.battle_bg,
                'encounter': self.encounter, 'ground': self.ground, 'objects': self.objects, 'warps': self.warps}


def dump(m):
    d = m.to_json()
    lines = ['{']
    keys = list(d.keys())
    for i, k in enumerate(keys):
        comma = ',' if i < len(keys) - 1 else ''
        if k in ('ground', 'objects'):
            rows = ',\n'.join('  ' + json.dumps(r, separators=(',', ':')) for r in d[k])
            lines.append(f' "{k}": [\n{rows}\n ]{comma}')
        elif k == 'warps':
            rows = ',\n'.join('  ' + json.dumps(w, ensure_ascii=False) for w in d[k])
            lines.append(f' "{k}": [\n{rows}\n ]{comma}')
        else:
            lines.append(f' "{k}": {json.dumps(d[k], ensure_ascii=False)}{comma}')
    lines.append('}')
    with open(os.path.join(ROOT, f'data/maps/{m.id}.json'), 'w', encoding='utf-8') as f:
        f.write('\n'.join(lines) + '\n')


# ================================================================== 맵 정의
def meadow():
    m = Map('meadow', '바람결 초원', 40, 30, 'grass', 'field', 'meadow', 101)
    for _ in range(14):
        m.patch(m.r.choice(['grass2', 'meadow']), m.r.randrange(40), m.r.randrange(30), m.r.randint(1, 3), m.r.randint(1, 2))
    m.border('tree', 2, gaps=[(18, 0, 3, 2), (38, 14, 2, 2)])
    m.lake(28, 22, 4, 3)
    m.path([(8, 21), (8, 15), (19, 15), (19, 0)])
    m.path([(19, 15), (39, 15)])
    m.scatter('tree', 40, (2, 2, 36, 26), on=('grass', 'grass2'), spacing=1)
    m.scatter('bush', 14, (2, 2, 36, 26), on=('grass', 'grass2'))
    m.scatter('tall_grass', 30, (2, 2, 36, 26), on=('grass', 'grass2', 'meadow'))
    m.scatter('flowers_r', 10, (2, 2, 36, 26), on=('meadow', 'grass'))
    m.scatter('flowers_y', 10, (2, 2, 36, 26), on=('meadow', 'grass'))
    m.scatter('rock', 8, (2, 2, 36, 26), on=('grass', 'grass2'))
    m.clear(6, 19, 6, 6); m.rg(6, 21, 5, 3, 'meadow')  # 깨어나는 꽃밭
    m.clear(21, 13, 1, 1); m.o(21, 13, 'sign')
    m.warp(18, 0, 'hazel', 13, 20, 'up', w=3, same=True)
    m.warp(39, 14, 'forest_road', 1, 11, 'right', h=2)
    m.encounter = {'rate': 0.07, 'groups': [{'enemies': ['slime'], 'weight': 4}, {'enemies': ['slime', 'slime'], 'weight': 2}, {'enemies': ['bat'], 'weight': 2}]}
    m.marks = {'start': (8, 22), 'sign': (21, 13)}
    return m


def hazel():
    m = Map('hazel', '하젤 마을', 28, 22, 'grass', 'town', 'town', 102)
    m.border('tree', 1, gaps=[(12, 21, 4, 1)])
    m.ro(1, 1, 26, 1, 'fence_h'); m.clear(1, 1, 26, 1)
    m.path([(13, 21), (13, 11)], 'cobble', 2)
    m.path([(3, 11), (24, 11)], 'cobble', 2)
    m.path([(6, 11), (6, 7)], 'cobble', 1)
    m.path([(21, 11), (21, 7)], 'cobble', 1)
    elder_door = m.house(4, 4, 5, 2)            # 촌장의 집
    shop_door = m.house(19, 4, 5, 2)            # 상점
    m.house(3, 15, 5, 2); m.house(19, 15, 5, 2, window=True)
    m.rg(12, 5, 4, 4, 'cobble'); m.o(13, 6, 'well')
    m.ro(17, 9, 3, 1, 'counter')                # 노점
    m.o(16, 9, 'barrel'); m.o(20, 9, 'crate'); m.o(10, 8, 'pot')
    m.ro(9, 15, 8, 1, 'fence_h'); m.rg(9, 16, 8, 3, 'dirt')
    m.scatter('flowers_r', 6, (8, 16, 9, 3)); m.scatter('flowers_y', 5, (8, 16, 9, 3))
    m.scatter('fruit_tree', 6, (1, 2, 26, 18), on=('grass',), spacing=2)
    m.scatter('flowers_y', 8, (1, 2, 26, 18), on=('grass',))
    m.o(15, 20, 'sign')
    m.warp(12, 21, 'meadow', 19, 1, 'down', w=4, same=True)  # 아래로 나가면 초원 북쪽
    m.warp(*elder_door, 'hazel_elder', 5, 8, 'up')
    m.marks = {'elder_door': elder_door, 'shop_door': shop_door, 'merchant': (18, 8), 'well_woman': (11, 7), 'child': (16, 13), 'guard': (11, 19), 'farmer': (12, 17), 'innkeeper': (23, 12), 'sign': (15, 20)}
    return m


def hazel_elder():
    m = Map('hazel_elder', '촌장의 집', 11, 10, 'wood', 'town', 'town', 103)
    m.ro(0, 0, 11, 2, 'wall'); m.ro(0, 0, 1, 10, 'wall'); m.ro(10, 0, 1, 10, 'wall'); m.ro(0, 9, 11, 1, 'wall')
    m.o(2, 1, 'window'); m.o(8, 1, 'window')
    m.o(1, 2, 'shelf'); m.o(2, 2, 'shelf'); m.o(9, 2, 'bed'); m.o(9, 3, 'bed')
    m.o(5, 4, 'table'); m.o(1, 7, 'pot'); m.o(9, 7, 'barrel')
    m.rg(4, 6, 3, 3, 'carpet')
    m.o(5, 9, 'door')
    m.warp(5, 9, 'hazel', 6, 7, 'down')
    m.marks = {'elder': (5, 3)}
    return m


def forest_road():
    m = Map('forest_road', '속삭이는 숲길', 36, 24, 'forest_floor', 'field', 'forest', 104)
    m.ro(0, 0, 36, 24, 'tree')
    for _ in range(40):
        m.r.random()
    m.path([(0, 11), (10, 11), (10, 16), (24, 16), (24, 11), (35, 11)], 'dirt', 2)
    m.path([(17, 16), (17, 0)], 'dirt', 2)
    # 숲 속 공터
    for (cx, cy, rx, ry) in ((6, 5, 4, 3), (29, 19, 4, 2), (21, 6, 3, 2), (5, 18, 3, 2)):
        m.patch('grass', cx, cy, rx, ry)
        for y in range(cy - ry, cy + ry + 1):
            for x in range(cx - rx, cx + rx + 1):
                if TILES[m.ground[y][x]]['id'] == 'grass':
                    m.o(x, y, None)
    m.path([(6, 8), (6, 11)], 'grass', 1)
    m.path([(29, 13), (29, 17)], 'grass', 1)
    m.scatter('tall_grass', 25, on=('grass', 'forest_floor'))
    m.scatter('flowers_y', 6, (2, 2, 8, 6), on=('grass',))
    m.scatter('bush', 8, on=('grass', 'forest_floor'))
    m.scatter('pine', 12, (1, 1, 34, 22))
    m.o(29, 19, 'chest'); m.o(19, 12, 'sign')
    m.warp(0, 11, 'meadow', 38, 14, 'left', h=2)
    m.warp(35, 11, 'elbrea', 1, 15, 'right', h=2)
    m.warp(17, 0, 'lucen', 16, 26, 'up', cond='flag >= 1', fail='lucen_road_closed', w=2)
    m.encounter = {'rate': 0.09, 'groups': [{'enemies': ['goblin'], 'weight': 3}, {'enemies': ['slime_poison'], 'weight': 2},
                                            {'enemies': ['goblin', 'bat'], 'weight': 2}, {'enemies': ['slime_poison', 'slime_poison'], 'weight': 1}]}
    m.marks = {'herb': (6, 4), 'chest': (29, 19), 'sign': (19, 12)}
    return m


def elbrea():
    m = Map('elbrea', '세계수의 숲 엘브레아', 30, 30, 'forest_floor', 'forest', 'forest', 105)
    m.patch('grass', 15, 14, 11, 11)
    m.patch('meadow', 15, 13, 6, 5)
    m.border('tree', 2, gaps=[(0, 15, 2, 2)])
    m.path([(0, 15), (11, 15)], 'grass', 2)
    m.world_tree(14, 8)
    m.o(15, 12, 'spring')
    for (x, y) in ((10, 7), (20, 7), (9, 13), (21, 13), (12, 19), (18, 19)):
        m.o(x, y, 'crystal')
    m.scatter('pine', 20, (2, 2, 26, 26), on=('forest_floor',), spacing=1)
    m.scatter('tree', 14, (2, 2, 26, 26), on=('forest_floor', 'grass'), spacing=2)
    m.scatter('flowers_r', 14, (6, 6, 18, 16), on=('grass', 'meadow'))
    m.scatter('flowers_y', 14, (6, 6, 18, 16), on=('grass', 'meadow'))
    m.clear(12, 10, 7, 6); m.o(15, 12, 'spring'); m.world_tree(14, 8)
    m.warp(0, 15, 'forest_road', 34, 11, 'left', h=2)
    m.marks = {'ria': (17, 11), 'sage': (12, 12), 'spring': (15, 12)}
    return m


def lucen():
    m = Map('lucen', '왕도 루센', 34, 28, 'grass', 'castle', 'town', 106)
    m.rg(2, 4, 30, 23, 'cobble')
    m.ro(0, 0, 34, 3, 'castle_wall'); m.ro(0, 0, 34, 1, 'castle_top')
    m.ro(0, 0, 2, 28, 'castle_wall'); m.ro(32, 0, 2, 28, 'castle_wall'); m.ro(0, 27, 34, 1, 'castle_wall')
    m.clear(16, 27, 2, 1); m.g(16, 27, 'cobble'); m.g(17, 27, 'cobble')
    m.clear(32, 8, 2, 2); m.rg(32, 8, 2, 2, 'cobble')
    m.o(16, 2, 'gate'); m.o(17, 2, 'gate')
    m.o(14, 2, 'banner'); m.o(19, 2, 'banner'); m.o(15, 3, 'torch'); m.o(18, 3, 'torch')
    m.rg(16, 3, 2, 24, 'stone'); m.rg(2, 8, 32, 2, 'stone')
    smith = m.house(4, 4, 5, 2); market = m.house(25, 4, 5, 2)
    m.house(4, 13, 5, 2); m.house(25, 13, 5, 2); church = m.house(4, 20, 6, 3); m.house(25, 20, 5, 2)
    m.ro(6, 18, 1, 1, None)
    m.ro(5, 7, 3, 1, 'counter'); m.ro(26, 7, 3, 1, 'counter')
    m.o(4, 7, 'barrel'); m.o(8, 7, 'crate'); m.o(29, 7, 'barrel')
    m.clear(6, 7); m.clear(27, 7)  # 상인이 서는 자리
    m.rg(12, 14, 10, 6, 'marble'); m.o(16, 16, 'statue'); m.o(17, 16, 'statue')
    for (x, y) in ((12, 14), (21, 14), (12, 19), (21, 19)):
        m.o(x, y, 'fruit_tree')
    m.scatter('flowers_r', 6, (11, 13, 12, 8), on=('marble',))
    m.warp(16, 27, 'forest_road', 17, 1, 'down', w=2)
    m.warp(16, 2, 'lucen_castle', 8, 14, 'up', w=2)
    m.warp(33, 8, 'grom_pass', 11, 34, 'up', cond='flag >= 2', fail='north_gate_closed', h=2, same=True)
    m.marks = {'smith': (6, 7), 'market': (27, 7), 'gate_guard': (15, 4), 'nun': (7, 23), 'girl': (20, 22), 'dwarf': (29, 10), 'citizen': (10, 10), 'north_guard': (31, 7), 'church_door': church}
    return m


def lucen_castle():
    m = Map('lucen_castle', '루센 성 알현실', 18, 16, 'marble', 'castle', 'castle', 107)
    m.ro(0, 0, 18, 2, 'castle_wall'); m.ro(0, 0, 1, 16, 'castle_wall'); m.ro(17, 0, 1, 16, 'castle_wall'); m.ro(0, 15, 18, 1, 'castle_wall')
    m.clear(8, 15, 2, 1); m.g(8, 15, 'carpet'); m.g(9, 15, 'carpet')
    m.rg(8, 3, 2, 12, 'carpet'); m.rg(6, 2, 6, 3, 'carpet')
    m.o(8, 2, 'throne'); m.o(9, 2, 'throne')
    for y in (5, 8, 11):
        m.o(4, y, 'pillar'); m.o(13, y, 'pillar')
    for x in (3, 7, 10, 14):
        m.o(x, 1, 'banner')
    m.o(1, 2, 'torch'); m.o(16, 2, 'torch')
    m.warp(8, 15, 'lucen', 16, 3, 'down', w=2)
    m.marks = {'king': (8, 3), 'garen': (11, 6), 'guard_l': (6, 13), 'guard_r': (11, 13)}
    return m


def grom_pass():
    m = Map('grom_pass', '그롬 산길', 24, 36, 'cliff', 'mountain', 'mountain', 108)
    m.path([(11, 35), (11, 28), (5, 28), (5, 20), (15, 20), (15, 12), (8, 12), (8, 5), (11, 5), (11, 0)], 'dirt', 2)
    for (cx, cy, rx, ry) in ((6, 24, 3, 2), (18, 16, 3, 3), (10, 8, 3, 2), (19, 7, 2, 2)):
        m.patch('cave', cx, cy, rx, ry)
    m.path([(16, 16), (19, 16), (19, 9)], 'cave', 2)
    m.scatter('rock', 22, on=('dirt', 'cave'))
    for y in range(36):
        for x in range(24):
            if TILES[m.ground[y][x]]['id'] in ('dirt', 'cave') and m.objects[y][x] == TI['rock']:
                # 길이 막히지 않도록 중앙 경로의 바위는 치운다
                if m.r.random() < .55:
                    m.o(x, y, None)
    m.scatter('dead_tree', 6, on=('dirt', 'cave'))
    m.clear(11, 26, 2, 10); m.clear(4, 19, 3, 10); m.clear(4, 19, 12, 3); m.clear(14, 11, 3, 10); m.clear(7, 11, 9, 3); m.clear(7, 4, 3, 9); m.clear(7, 4, 6, 3); m.clear(10, 0, 3, 6)
    m.o(19, 8, 'chest'); m.o(6, 23, 'cave_entrance')
    m.warp(11, 35, 'lucen', 31, 8, 'left', w=2, same=True)
    m.warp(11, 0, 'frost_plain', 19, 24, 'up', w=2)
    m.encounter = {'rate': 0.1, 'groups': [{'enemies': ['wolf'], 'weight': 3}, {'enemies': ['wolf', 'wolf'], 'weight': 2},
                                           {'enemies': ['golem'], 'weight': 2}, {'enemies': ['bat', 'bat'], 'weight': 1}]}
    m.marks = {'dwarf': (17, 15), 'chest': (19, 8)}
    return m


def frost_plain():
    m = Map('frost_plain', '서리 평원', 40, 26, 'snow', 'snow', 'snow', 109)
    for _ in range(16):
        m.patch('snow2', m.r.randrange(40), m.r.randrange(26), m.r.randint(1, 3), m.r.randint(1, 2))
    m.border('snow_pine', 2, gaps=[(19, 24, 2, 2), (38, 4, 2, 2)])
    m.lake(12, 14, 5, 3, rim='snow2', water='ice')
    m.path([(19, 25), (19, 18), (28, 18), (28, 5), (39, 5)], 'snow2', 2)
    m.scatter('snow_pine', 40, (2, 2, 36, 22), on=('snow', 'snow2'), spacing=1)
    m.scatter('snow_rock', 14, (2, 2, 36, 22), on=('snow', 'snow2'))
    m.scatter('ice_crystal', 6, (2, 2, 36, 22), on=('snow',))
    m.scatter('dead_tree', 6, (2, 2, 36, 22), on=('snow',))
    m.clear(5, 4, 3, 3); m.clear(20, 19, 3, 3)
    m.warp(19, 25, 'grom_pass', 11, 1, 'down', w=2)
    m.warp(39, 4, 'noct_gate', 1, 9, 'right', h=2)
    m.encounter = {'rate': 0.1, 'groups': [{'enemies': ['snow_wolf'], 'weight': 3}, {'enemies': ['wisp'], 'weight': 2},
                                           {'enemies': ['slime_ice', 'slime_ice'], 'weight': 2}, {'enemies': ['snow_wolf', 'wisp'], 'weight': 1}]}
    m.marks = {'scout': (21, 20), 'pendant': (6, 5)}
    return m


def noct_gate():
    m = Map('noct_gate', '녹턴 요새 외곽', 26, 20, 'snow2', 'dungeon', 'castle', 110)
    m.rg(6, 4, 14, 14, 'dungeon')
    m.ro(0, 0, 26, 4, 'castle_wall'); m.ro(0, 0, 26, 1, 'castle_top')
    m.o(12, 3, 'gate'); m.o(13, 3, 'gate')
    m.o(10, 3, 'torch'); m.o(15, 3, 'torch'); m.o(9, 3, 'banner'); m.o(16, 3, 'banner')
    m.border('snow_pine', 1, gaps=[(0, 9, 1, 2)])
    m.ro(0, 0, 26, 4, 'castle_wall'); m.ro(0, 0, 26, 1, 'castle_top'); m.o(12, 3, 'gate'); m.o(13, 3, 'gate')
    m.path([(0, 9), (12, 9), (12, 4)], 'dungeon', 2)
    m.scatter('dead_tree', 10, (1, 4, 24, 15), on=('snow2',))
    m.scatter('snow_rock', 8, (1, 4, 24, 15), on=('snow2',))
    for (x, y) in ((8, 6), (17, 6), (8, 14), (17, 14)):
        m.o(x, y, 'statue')
    m.warp(0, 9, 'frost_plain', 38, 4, 'left', h=2)
    m.warp(12, 3, 'noct_keep', 11, 22, 'up', cond='flag >= 3', fail='noct_gate_sealed', w=2)
    m.encounter = {'rate': 0.08, 'groups': [{'enemies': ['dark_knight'], 'weight': 3}, {'enemies': ['wraith'], 'weight': 2}]}
    m.marks = {'captain': (13, 6)}
    return m


def noct_keep():
    m = Map('noct_keep', '녹턴 요새 내부', 24, 24, 'dungeon', 'dungeon', 'dungeon', 111)
    m.ro(0, 0, 24, 24, None)
    m.rg(0, 0, 24, 24, 'dwall')
    rooms = [(9, 18, 6, 5), (2, 12, 7, 6), (15, 12, 7, 6), (8, 6, 8, 5), (10, 1, 4, 3), (2, 2, 5, 5), (18, 2, 4, 5)]
    for (x, y, w, h) in rooms:
        m.rg(x, y, w, h, 'dungeon')
    for pts in ([(11, 23), (11, 18)], [(9, 20), (5, 20), (5, 17)], [(14, 20), (18, 20), (18, 17)], [(5, 12), (5, 9), (8, 9)],
                [(18, 12), (18, 9), (15, 9)], [(11, 6), (11, 3)], [(4, 7), (4, 9)], [(19, 7), (19, 9)]):
        m.path(pts, 'dungeon', 2)
    for (x, y) in ((9, 18), (14, 18), (2, 12), (8, 12), (15, 12), (21, 12), (8, 6), (15, 6)):
        m.o(x, y, 'torch') if TILES[m.ground[y][x]]['id'] == 'dungeon' else None
    m.o(3, 3, 'chest'); m.o(20, 3, 'chest'); m.o(3, 16, 'pot'); m.o(20, 16, 'barrel')
    m.o(11, 1, 'stairs_up'); m.o(12, 1, 'stairs_up')
    m.warp(11, 23, 'noct_gate', 12, 4, 'down', w=2)
    m.warp(11, 1, 'orvel_throne', 7, 12, 'up', w=2)
    m.encounter = {'rate': 0.1, 'groups': [{'enemies': ['wraith'], 'weight': 3}, {'enemies': ['dark_knight'], 'weight': 2}, {'enemies': ['dark_knight', 'wraith'], 'weight': 2}]}
    m.marks = {'chest_l': (3, 3), 'chest_r': (20, 3)}
    return m


def orvel_throne():
    m = Map('orvel_throne', '관리자의 옥좌', 16, 14, 'dungeon', 'dungeon', 'throne', 112)
    m.ro(0, 0, 16, 2, 'dwall'); m.rg(0, 0, 16, 14, 'dungeon')
    for x in range(16):
        m.g(x, 0, 'dwall'); m.g(x, 1, 'dwall')
    for y in range(14):
        m.g(0, y, 'dwall'); m.g(15, y, 'dwall')
    m.g(0, 13, 'dwall')
    m.rg(7, 2, 2, 12, 'carpet')
    m.o(7, 2, 'throne'); m.o(8, 2, 'throne')
    m.o(4, 3, 'portal'); m.o(11, 3, 'portal')
    for (x, y) in ((3, 6), (12, 6), (3, 10), (12, 10)):
        m.o(x, y, 'crystal')
    m.o(2, 2, 'torch'); m.o(13, 2, 'torch')
    m.o(7, 13, 'stairs_down'); m.o(8, 13, 'stairs_down')
    m.warp(7, 13, 'noct_keep', 11, 2, 'down', w=2)
    m.marks = {'orvel': (7, 5)}
    return m


MAPS = [meadow, hazel, hazel_elder, forest_road, elbrea, lucen, lucen_castle, grom_pass, frost_plain, noct_gate, noct_keep, orvel_throne]


def main():
    os.makedirs(os.path.join(ROOT, 'data/maps'), exist_ok=True)
    ids = []
    for fn in MAPS:
        m = fn()
        dump(m)
        ids.append(m.id)
        print(f'{m.id:14s} {m.w}x{m.h}  warps={len(m.warps)}  marks={m.marks}')
    print('maps:', ids)


if __name__ == '__main__':
    main()
