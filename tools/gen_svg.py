#!/usr/bin/env python3
"""
벡터 그림(SVG) 리소스 생성기 — 초상화(도트 아님)와 UI 아이콘
출력: assets/img/portraits/*.svg, assets/img/icons/*.svg
실행: python tools/gen_svg.py
"""
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def portrait(p):
    """96x96 반신 초상화. p: 색·머리 모양 등 매개변수"""
    skin, skin_d = p['skin'], p['skin_d']
    hair, hair_d, hair_l = p['hair'], p['hair_d'], p['hair_l']
    eye = p['eye']
    bg1, bg2 = p['bg']
    parts = [f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96" width="96" height="96">
<defs>
 <radialGradient id="bg" cx="50%" cy="35%" r="75%"><stop offset="0" stop-color="{bg1}"/><stop offset="1" stop-color="{bg2}"/></radialGradient>
 <linearGradient id="skin" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="{skin}"/><stop offset="1" stop-color="{skin_d}"/></linearGradient>
 <linearGradient id="hair" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="{hair_l}"/><stop offset=".55" stop-color="{hair}"/><stop offset="1" stop-color="{hair_d}"/></linearGradient>
</defs>
<rect width="96" height="96" fill="url(#bg)"/>''']
    # 뒷머리
    if p.get('back_hair'):
        parts.append(f'<path d="{p["back_hair"]}" fill="url(#hair)" stroke="{hair_d}" stroke-width="1.2"/>')
    # 몸·옷
    parts.append(p['body'])
    # 목
    parts.append(f'<path d="M40 60 L40 70 Q48 74 56 70 L56 60 Z" fill="{skin_d}"/>')
    # 귀
    if p.get('elf'):
        parts.append(f'<path d="M27 42 L12 28 L30 50 Z" fill="url(#skin)" stroke="{skin_d}" stroke-width="1"/>'
                     f'<path d="M69 42 L84 28 L66 50 Z" fill="url(#skin)" stroke="{skin_d}" stroke-width="1"/>')
    else:
        parts.append(f'<ellipse cx="28" cy="46" rx="4" ry="6" fill="{skin_d}"/><ellipse cx="68" cy="46" rx="4" ry="6" fill="{skin_d}"/>')
    # 얼굴
    parts.append(f'<path d="M28 36 Q28 62 48 66 Q68 62 68 36 Q68 22 48 22 Q28 22 28 36 Z" fill="url(#skin)" stroke="{skin_d}" stroke-width="1"/>')
    # 볼 홍조
    parts.append('<ellipse cx="36" cy="52" rx="4" ry="2" fill="#ff9a9a" opacity=".35"/><ellipse cx="60" cy="52" rx="4" ry="2" fill="#ff9a9a" opacity=".35"/>')
    # 눈
    ey = p.get('eye_y', 45)
    if p.get('glow'):
        parts.append(f'<path d="M33 {ey} L43 {ey-3} L43 {ey+1} Z" fill="{eye}"/><path d="M63 {ey} L53 {ey-3} L53 {ey+1} Z" fill="{eye}"/>'
                     f'<circle cx="40" cy="{ey-1}" r="1.2" fill="#fff"/><circle cx="56" cy="{ey-1}" r="1.2" fill="#fff"/>')
    else:
        for cx in (39, 57):
            parts.append(f'<ellipse cx="{cx}" cy="{ey}" rx="4.2" ry="{p.get("eye_h", 5.2)}" fill="#fff"/>'
                         f'<ellipse cx="{cx}" cy="{ey+0.6}" rx="3.2" ry="{p.get("eye_h", 5.2)-0.8}" fill="{eye}"/>'
                         f'<ellipse cx="{cx}" cy="{ey+1.2}" rx="1.6" ry="2.2" fill="#14121c"/>'
                         f'<circle cx="{cx-1.4}" cy="{ey-1.6}" r="1.3" fill="#fff"/>')
        # 눈썹
        bt = p.get('brow_tilt', 0)
        parts.append(f'<path d="M34 {ey-8+bt} Q39 {ey-10} 44 {ey-8-bt}" stroke="{hair_d}" stroke-width="2" fill="none" stroke-linecap="round"/>'
                     f'<path d="M52 {ey-8-bt} Q57 {ey-10} 62 {ey-8+bt}" stroke="{hair_d}" stroke-width="2" fill="none" stroke-linecap="round"/>')
    # 코·입
    parts.append(f'<path d="M48 50 L47 54 L49 54" stroke="{skin_d}" stroke-width="1.2" fill="none"/>')
    parts.append(p.get('mouth', '<path d="M43 59 Q48 62 53 59" stroke="#a0524a" stroke-width="1.6" fill="none" stroke-linecap="round"/>'))
    if p.get('scar'):
        parts.append('<path d="M60 38 L64 50" stroke="#b07060" stroke-width="1.4"/>')
    # 앞머리
    parts.append(f'<path d="{p["front_hair"]}" fill="url(#hair)" stroke="{hair_d}" stroke-width="1.2" stroke-linejoin="round"/>')
    if p.get('extra'):
        parts.append(p['extra'])
    parts.append('</svg>')
    return '\n'.join(parts)


PORTRAITS = {
    'hero': dict(
        skin='#ffdcc0', skin_d='#e8b090', hair='#6a4228', hair_d='#3e2414', hair_l='#9a6a44', eye='#3a6ad8',
        bg=('#bfe0ff', '#4a78c8'),
        body='<path d="M14 96 Q16 72 34 68 L48 76 L62 68 Q80 72 82 96 Z" fill="#3b6fd8" stroke="#24468e" stroke-width="1.5"/>'
             '<path d="M34 68 L48 82 L62 68 L56 66 L48 74 L40 66 Z" fill="#f4f4f4"/>',
        front_hair='M26 40 Q22 16 46 12 Q72 10 72 38 L66 30 L62 38 L56 26 L50 36 L44 24 L38 36 L33 28 L30 40 Z',
        brow_tilt=1,
    ),
    'ria': dict(
        skin='#ffe4cf', skin_d='#eab898', hair='#f6d873', hair_d='#c9a23e', hair_l='#fff2b8', eye='#2f9a5a',
        bg=('#d8ffd8', '#3f8a52'), elf=True, eye_h=5.6,
        back_hair='M22 40 Q18 14 48 12 Q78 14 74 40 L80 90 L62 80 L66 56 L30 56 L34 80 L16 90 Z',
        body='<path d="M16 96 Q18 72 36 68 L48 74 L60 68 Q78 72 80 96 Z" fill="#3f9a4f" stroke="#256a32" stroke-width="1.5"/>'
             '<path d="M36 68 L48 78 L60 68" stroke="#f2c94c" stroke-width="2.5" fill="none"/>',
        front_hair='M27 42 Q24 18 48 15 Q72 18 69 42 Q64 30 56 26 Q50 34 44 26 Q34 30 27 42 Z',
        extra='<path d="M30 24 Q48 14 66 24" stroke="#3f9a4f" stroke-width="3" fill="none"/><circle cx="66" cy="24" r="2.5" fill="#f2c94c"/>',
        mouth='<path d="M44 59 Q48 61.5 52 59" stroke="#c0605a" stroke-width="1.6" fill="none" stroke-linecap="round"/>',
    ),
    'garen': dict(
        skin='#f2c8a4', skin_d='#cf9c78', hair='#c9ced8', hair_d='#8a90a0', hair_l='#f0f2f6', eye='#5a6a8a',
        bg=('#ffd6cf', '#8e2a20'), scar=True, eye_h=4.4, brow_tilt=2,
        body='<path d="M10 96 Q12 70 30 66 L48 72 L66 66 Q84 70 86 96 Z" fill="#b8322c"/>'
             '<path d="M18 96 Q20 74 36 70 L48 76 L60 70 Q76 74 78 96 Z" fill="#8a93a6" stroke="#5a6070" stroke-width="1.5"/>'
             '<ellipse cx="24" cy="76" rx="10" ry="7" fill="#a9b0c0" stroke="#5a6070" stroke-width="1.5"/>'
             '<ellipse cx="72" cy="76" rx="10" ry="7" fill="#a9b0c0" stroke="#5a6070" stroke-width="1.5"/>'
             '<path d="M44 80 L48 90 L52 80 Z" fill="#f2c94c"/>',
        front_hair='M26 38 Q26 16 48 14 Q70 16 70 38 L64 28 Q56 22 48 26 Q38 22 32 30 Z',
        mouth='<path d="M43 60 L53 60" stroke="#8a4a40" stroke-width="1.8" stroke-linecap="round"/>',
    ),
    'orvel': dict(
        skin='#d8c8e8', skin_d='#a890c0', hair='#4a2c70', hair_d='#24123a', hair_l='#7a4aa8', eye='#ff4fd8',
        bg=('#6a2a7a', '#12081c'), glow=True,
        back_hair='M14 60 Q10 10 48 6 Q86 10 82 60 L88 96 L8 96 Z',
        body='<path d="M12 96 Q16 70 34 66 L48 74 L62 66 Q80 70 84 96 Z" fill="#3a2458" stroke="#1a0e2a" stroke-width="1.5"/>'
             '<path d="M46 74 L48 96 L50 74" stroke="#f2c94c" stroke-width="3"/>',
        front_hair='M22 44 Q20 14 48 10 Q76 14 74 44 Q66 26 48 24 Q30 26 22 44 Z',
        extra='<path d="M30 16 L22 2 L36 12 Z M66 16 L74 2 L60 12 Z" fill="#e8d8b0" stroke="#8a7a50" stroke-width="1"/>',
        mouth='<path d="M42 60 Q48 57 54 60" stroke="#5a2a6a" stroke-width="1.6" fill="none" stroke-linecap="round"/>',
    ),
    'king': dict(
        skin='#f2c8a4', skin_d='#cf9c78', hair='#8a6236', hair_d='#5a3c1c', hair_l='#b08a5a', eye='#4a3a2a',
        bg=('#ffe9a8', '#a3263a'), eye_h=4.2,
        body='<path d="M12 96 Q16 70 34 66 L48 74 L62 66 Q80 70 84 96 Z" fill="#a3263a" stroke="#6a1424" stroke-width="1.5"/>'
             '<path d="M34 66 Q48 80 62 66" stroke="#f2f2f2" stroke-width="6" fill="none"/>',
        front_hair='M27 40 Q26 18 48 16 Q70 18 69 40 Q62 28 48 28 Q34 28 27 40 Z',
        extra='<path d="M30 20 L32 8 L39 16 L48 4 L57 16 L64 8 L66 20 Z" fill="#f2c94c" stroke="#b08a20" stroke-width="1.2"/>'
              '<path d="M34 56 Q48 76 62 56 Q60 66 48 70 Q36 66 34 56 Z" fill="#8a6236"/>',
        mouth='',
    ),
    'elder': dict(
        skin='#f0caa8', skin_d='#c89a78', hair='#e8e8ee', hair_d='#a8a8b4', hair_l='#ffffff', eye='#5a4a3a',
        bg=('#e8dcff', '#6a4c93'), eye_h=3.6,
        body='<path d="M14 96 Q16 72 34 68 L48 76 L62 68 Q80 72 82 96 Z" fill="#6a4c93" stroke="#432e62" stroke-width="1.5"/>',
        front_hair='M28 36 Q30 22 48 22 Q66 22 68 36 Q60 28 48 30 Q36 28 28 36 Z',
        extra='<path d="M32 54 Q48 90 64 54 Q60 62 48 64 Q36 62 32 54 Z" fill="#f4f4f8" stroke="#b8b8c4" stroke-width="1"/>',
        mouth='',
    ),
    'tobi': dict(
        skin='#ffd8b8', skin_d='#e8a888', hair='#c8582c', hair_d='#7a2e14', hair_l='#f08a4a', eye='#7a4a1a',
        bg=('#fff1b8', '#5a9a3a'), eye_h=5.8, brow_tilt=-1,
        body='<path d="M16 96 Q18 74 34 70 L48 78 L62 70 Q78 74 80 96 Z" fill="#4f9a3a" stroke="#2f6a22" stroke-width="1.5"/>'
             '<path d="M34 70 L48 82 L62 70" stroke="#f4e4b0" stroke-width="3" fill="none"/>'
             '<path d="M60 80 L70 92 M66 78 L64 94" stroke="#8a5a2a" stroke-width="2.5" stroke-linecap="round"/>',
        front_hair='M24 42 Q20 14 46 10 Q74 10 72 40 L68 30 L64 36 L60 24 L54 32 L48 20 L42 32 L36 22 L32 34 L28 28 Z',
        extra='<path d="M58 54 L62 56 M60 52 L60 58" stroke="#c0605a" stroke-width="1.2" stroke-linecap="round"/>'
              '<circle cx="34" cy="55" r=".9" fill="#c07050"/><circle cx="37" cy="56.5" r=".9" fill="#c07050"/><circle cx="35" cy="58" r=".9" fill="#c07050"/>',
        mouth='<path d="M42 58 Q48 64 55 58 Q48 61 42 58 Z" fill="#fff" stroke="#a0524a" stroke-width="1.4" stroke-linejoin="round"/>',
    ),
}


ICONS = {
    # 24x24, stroke 기반
    'party': '<circle cx="9" cy="8" r="3.2"/><circle cx="16.5" cy="9" r="2.6"/><path d="M3 20c0-4 3-6.5 6-6.5s6 2.5 6 6.5"/><path d="M14.5 14.2c3 .2 6 2 6 5.8"/>',
    'bag': '<path d="M6 8h12l1.5 12h-15z"/><path d="M9 8V6.5a3 3 0 0 1 6 0V8"/><path d="M9 12h6"/>',
    'skill': '<path d="M12 2l2.4 6.3L21 9l-5 4.4L17.4 21 12 17.6 6.6 21 8 13.4 3 9l6.6-.7z"/>',
    'quest': '<path d="M6 3h10l3 3v15H6z"/><path d="M16 3v3h3"/><path d="M9 10h7M9 13.5h7M9 17h4"/>',
    'settings': None,  # 톱니바퀴 — gear_icon() 으로 계산해 채운다
    'save': '<path d="M5 3h11l3 3v15H5z"/><path d="M8 3v5h8V3"/><rect x="8" y="13" width="8" height="6"/>',
    'load': '<path d="M3 7h6l2 2h10v11H3z"/><path d="M12 12v5M9.5 14.5L12 17l2.5-2.5"/>',
    'sound': '<path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a7.5 7.5 0 0 1 0 11"/>',
    'mute': '<path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M17 9l5 6M22 9l-5 6"/>',
    'login': '<path d="M14 3h6v18h-6"/><path d="M3 12h11M10 8l4 4-4 4"/>',
    'map': '<path d="M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3z"/><path d="M9 3v15M15 6v15"/>',
    'sword': '<path d="M19 3l-9.5 9.5M19 3h-4M19 3v4"/><path d="M7 11l6 6M5 19l3-3M4 15l5 5"/>',
    'heart': '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>',
    'coin': '<circle cx="12" cy="12" r="8"/><path d="M12 7v10M9.5 9.5h4a1.5 1.5 0 0 1 0 3h-3a1.5 1.5 0 0 0 0 3h4"/>',
    'equip': '<path d="M12 3l7 3v5c0 5-3.2 8.6-7 10-3.8-1.4-7-5-7-10V6z"/><path d="M12 7v10M8.5 11h7"/>',
    'copy': '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>',
}


# ------------------------------------------------------------------ 컬러 아이콘 (아이템·장비·스킬)
# 32x32, 진한 외곽선 + 단색 면 + 하이라이트. 게임 데이터의 icon 필드가 이 파일 경로를 가리킨다.
OL = '#1a1626'


def _o():
    return f'stroke="{OL}" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"'


def flask(liquid, light):
    shape = 'M13.5 6.5h5v6l6 5.5a8 8 0 1 1-17 0l6-5.5z'
    return (f'<rect x="12" y="2.5" width="8" height="4" rx="1" fill="#9a6a3a" {_o()}/>'
            f'<path d="{shape}" fill="#e8f2ff"/>'
            f'<path d="M8.6 19.5h14.8a7.6 7.6 0 1 1-14.8 0z" fill="{liquid}"/>'
            f'<ellipse cx="12.5" cy="21.5" rx="1.6" ry="2.6" fill="{light}" opacity=".9"/>'
            f'<path d="{shape}" fill="none" {_o()}/>')


def sword(blade='#dfe6f0', guard='#f2c94c', grip='#7a4a2a', wide=False):
    w = 3.4 if wide else 2.4
    return (f'<path d="M27 3 L{27 - w} 3 L10 17.5 L14.5 22 L29 {3 + w} L29 5 Z" fill="{blade}" {_o()}/>'
            f'<path d="M26 6 L12.5 19.5" stroke="#ffffff" stroke-width="1" opacity=".8"/>'
            f'<path d="M7 15 L17 25" stroke="{OL}" stroke-width="5" stroke-linecap="round"/>'
            f'<path d="M7 15 L17 25" stroke="{guard}" stroke-width="2.6" stroke-linecap="round"/>'
            f'<path d="M11 21 L5 27" stroke="{OL}" stroke-width="4.6" stroke-linecap="round"/>'
            f'<path d="M11 21 L5 27" stroke="{grip}" stroke-width="2.4" stroke-linecap="round"/>'
            f'<circle cx="4.2" cy="27.8" r="2" fill="{guard}" {_o()}/>')


def bow(wood='#9a6a3a', accent=None):
    a = accent or wood
    return (f'<path d="M8 3 Q30 16 8 29" fill="none" stroke="{OL}" stroke-width="4.4" stroke-linecap="round"/>'
            f'<path d="M8 3 Q30 16 8 29" fill="none" stroke="{wood}" stroke-width="2.4" stroke-linecap="round"/>'
            f'<path d="M8 3 L8 29" stroke="#f4f1e6" stroke-width="1"/>'
            f'<circle cx="19" cy="16" r="1.8" fill="{a}" {_o()}/>'
            f'<path d="M4 16 L27 16" stroke="{OL}" stroke-width="2.6"/><path d="M4 16 L27 16" stroke="#c9b48a" stroke-width="1.2"/>'
            f'<path d="M27 16 L23 13.5 L23 18.5 Z" fill="#cfd6e0" {_o()}/>')


def armor(body, trim, extra=''):
    return (f'<path d="M10 4 L13 6 Q16 8 19 6 L22 4 L28 8 L25 14 L23 13 L23 28 L9 28 L9 13 L7 14 L4 8 Z" fill="{body}" {_o()}/>'
            f'<path d="M13 6 Q16 10 19 6" fill="none" stroke="{trim}" stroke-width="2"/>'
            f'<path d="M9 22 L23 22" stroke="{trim}" stroke-width="2"/>' + extra)


def gem(cx, cy, r, color):
    return (f'<path d="M{cx} {cy - r} L{cx + r} {cy} L{cx} {cy + r} L{cx - r} {cy} Z" fill="{color}" {_o()}/>'
            f'<path d="M{cx - r * .4} {cy - r * .2} L{cx} {cy - r * .6}" stroke="#fff" stroke-width="1"/>')


def sparkle(x, y, color='#facc15'):
    return f'<path d="M{x} {y} l1 2.2 2.2 1 -2.2 1 -1 2.2 -1 -2.2 -2.2 -1 2.2 -1z" fill="{color}"/>'


def outlined_path(d, color, w=2.4):
    return (f'<path d="{d}" fill="none" stroke="{OL}" stroke-width="{w + 2}" stroke-linecap="round"/>'
            f'<path d="{d}" fill="none" stroke="{color}" stroke-width="{w}" stroke-linecap="round"/>')


def pebble(x, y, r):
    return f'<circle cx="{x}" cy="{y}" r="{r}" fill="#9a9aa6" {_o()}/><circle cx="{x - r * .3}" cy="{y - r * .3}" r="{r * .3}" fill="#e4e4ec"/>'


COLOR_ICONS = {
    # ---- 소모품·중요 아이템 (assets/img/icons/items)
    'items/potion': flask('#e2384a', '#ff9aa6'),
    'items/hi_potion': flask('#e84aa8', '#ffc2ea') + sparkle(24, 3),
    'items/ether': flask('#2f7de8', '#a8d4ff'),
    'items/herb': ('<path d="M16 29 Q15 18 17 8" fill="none" stroke="#3f7a2a" stroke-width="2"/>'
                   f'<path d="M16.5 14 Q6 12 5 4 Q14 4 16.5 14 Z" fill="#7fd36a" {_o()}/>'
                   f'<path d="M16.5 19 Q27 17 28 9 Q19 9 16.5 19 Z" fill="#c9f2d0" {_o()}/>'
                   f'<path d="M16 23 Q8 23 6 17 Q13 16 16 23 Z" fill="#7fd36a" {_o()}/>'),
    'items/pendant': ('<path d="M7 4 Q16 18 25 4" fill="none" stroke="#c9ced8" stroke-width="1.6" stroke-dasharray="1.5 1.2"/>'
                      f'<circle cx="16" cy="20" r="7" fill="#dfe6f0" {_o()}/>' + gem(16, 20, 4, '#7dd3fc')),
    # ---- 무기
    'items/short_sword': sword(),
    'items/steel_sword': sword('#b8c4d8', '#9aa6c0', '#3a3a4a'),
    'items/knight_sword': sword('#e8ecf4', '#c0392b', '#5a3a2a', wide=True),
    'items/hunting_bow': bow(),
    'items/elven_bow': bow('#3f9a4f', '#f2c94c'),
    'items/wood_slingshot': (outlined_path('M16 29 L16 18 M16 18 L8 6 M16 18 L24 6', '#a8743a', 3)
                             + '<path d="M8 6 Q16 15 24 6" fill="none" stroke="#c0392b" stroke-width="1.6"/>' + pebble(16, 11.5, 2.2)),
    'items/oak_staff': (outlined_path('M7 29 L21 11', '#8a5a2a', 2.6)
                        + f'<path d="M17 12 Q19 4 26 5 Q27 12 20 14" fill="#5a9a3a" {_o()}/>'
                        + f'<circle cx="22.5" cy="9" r="3.6" fill="#a855f7" {_o()}/><circle cx="21.4" cy="7.8" r="1.1" fill="#f0d8ff"/>'),
    # ---- 방어구
    'items/cloth_armor': armor('#c8a878', '#8a6a3a'),
    'items/leather_armor': armor('#9a6236', '#5a3418', '<circle cx="12" cy="17" r="1" fill="#f2c94c"/><circle cx="20" cy="17" r="1" fill="#f2c94c"/>'),
    'items/iron_armor': armor('#a9b0c0', '#5a6070', '<path d="M16 9 L16 27" stroke="#5a6070" stroke-width="1.4"/>'),
    'items/chain_mail': armor('#c9ced8', '#5a6070', ''.join(f'<circle cx="{x}" cy="{y}" r=".9" fill="#5a6070"/>' for y in (12, 15, 18, 25) for x in (12, 16, 20))),
    'items/elven_cloak': (f'<path d="M16 3 Q9 4 8 10 L4 28 Q16 31 28 28 L24 10 Q23 4 16 3 Z" fill="#3f9a4f" {_o()}/>'
                          '<path d="M11 10 Q16 14 21 10" fill="none" stroke="#256a32" stroke-width="1.8"/>'
                          '<path d="M16 13 L16 28" stroke="#256a32" stroke-width="1.4"/>' + gem(16, 11.5, 2.4, '#f2c94c')),
    # ---- 장신구
    'items/luck_charm': (''.join(f'<circle cx="{16 + dx}" cy="{14 + dy}" r="5" fill="#4ade80" {_o()}/>' for dx, dy in ((-4.5, 0), (4.5, 0), (0, -4.5), (0, 4.5)))
                         + '<path d="M16 18 Q18 25 22 29" fill="none" stroke="#2f6a22" stroke-width="2"/><circle cx="16" cy="14" r="2" fill="#bbf7d0"/>'),
    'items/power_ring': (f'<circle cx="16" cy="19" r="8.5" fill="none" stroke="{OL}" stroke-width="5.4"/>'
                         '<circle cx="16" cy="19" r="8.5" fill="none" stroke="#f2c94c" stroke-width="3"/>' + gem(16, 9, 4.6, '#ef4444')),
    'items/swift_anklet': (f'<ellipse cx="16" cy="22" rx="9" ry="4.5" fill="none" stroke="{OL}" stroke-width="4.4"/>'
                           '<ellipse cx="16" cy="22" rx="9" ry="4.5" fill="none" stroke="#7dd3fc" stroke-width="2.2"/>'
                           f'<path d="M8 18 Q4 8 14 5 Q11 11 15 14 Z" fill="#e0f2ff" {_o()}/><path d="M24 18 Q28 8 18 5 Q21 11 17 14 Z" fill="#e0f2ff" {_o()}/>'),
    'items/sage_pendant': ('<path d="M7 3 Q16 16 25 3" fill="none" stroke="#f2c94c" stroke-width="1.6"/>'
                           f'<path d="M16 11 L23 20 L16 29 L9 20 Z" fill="#a855f7" {_o()}/><path d="M16 11 L16 29 M9 20 L23 20" stroke="#e9d5ff" stroke-width="1"/>'),
    'items/guard_amulet': ('<path d="M7 3 Q16 12 25 3" fill="none" stroke="#c9ced8" stroke-width="1.6"/>'
                           f'<path d="M16 8 L25 11 Q25 23 16 29 Q7 23 7 11 Z" fill="#3b82f6" {_o()}/><path d="M16 12 L16 25 M11 16 L21 16" stroke="#dbeafe" stroke-width="2"/>'),
    # ---- 스킬 (assets/img/icons/skills)
    'skills/slash': (f'<path d="M5 26 Q10 8 27 4 Q14 12 9 27 Z" fill="#f4f8ff" {_o()}/>'
                     '<path d="M11 28 Q17 14 29 10" fill="none" stroke="#9cc3ff" stroke-width="2" stroke-linecap="round"/>'),
    'skills/fire': (f'<path d="M16 30 Q5 28 6 18 Q7 11 12 6 Q12 12 15 13 Q14 6 19 2 Q20 9 24 12 Q28 17 26 23 Q24 29 16 30 Z" fill="#ff8a2a" {_o()}/>'
                    '<path d="M16 28 Q10 27 11 21 Q12 17 15 15 Q16 19 18 19 Q21 21 21 24 Q20 28 16 28 Z" fill="#ffe27a"/>'),
    'skills/heal': (f'<path d="M12 4h8v8h8v8h-8v8h-8v-8H4v-8h8z" fill="#4ade80" {_o()}/>'
                    '<path d="M14 7h3v7" fill="none" stroke="#dcfce7" stroke-width="1.6"/>' + sparkle(27, 2, '#ffffff')),
    'skills/aimed_shot': (f'<circle cx="16" cy="16" r="11" fill="#fef3c7" {_o()}/><circle cx="16" cy="16" r="6.5" fill="#ef4444" {_o()}/>'
                          '<circle cx="16" cy="16" r="2.2" fill="#fef3c7"/>' + outlined_path('M29 3 L17 15', '#c9b48a', 1.4)),
    'skills/gale': (outlined_path('M4 9 Q18 4 24 9 Q28 13 22 14', '#86efac') + outlined_path('M3 17 Q20 13 27 18', '#d9fbe5')
                    + outlined_path('M6 25 Q16 21 21 24 Q24 27 19 28', '#4ade80')),
    'skills/heal_all': (f'<path d="M16 28 C10 24 4 19 4 12 A6 6 0 0 1 16 9.5 A6 6 0 0 1 28 12 C28 19 22 24 16 28 Z" fill="#22c55e" {_o()}/>'
                        '<path d="M14 11h4v4h4v4h-4v4h-4v-4h-4v-4h4z" fill="#f0fdf4"/>'),
    'skills/power_strike': (f'<path d="M16 2 L19 11 L28 9 L21 16 L28 23 L19 21 L16 30 L13 21 L4 23 L11 16 L4 9 L13 11 Z" fill="#fb923c" {_o()}/>'
                            '<path d="M16 9 L18 14 L23 15 L18 17 L16 23 L14 17 L9 15 L14 14 Z" fill="#fff7c2"/>'),
    'skills/royal_slash': sword('#fff7c2', '#f2c94c', '#a3263a', wide=True) + outlined_path('M21 14 L26 15 L22 20 L27 21', '#facc15', 1.6),
    'skills/guard': (f'<path d="M16 3 L27 7 Q27 22 16 29 Q5 22 5 7 Z" fill="#3b82f6" {_o()}/>'
                     '<path d="M16 7 L23 9.5 Q23 20 16 25 Z" fill="#93c5fd"/>'),
    'skills/slingshot': (pebble(21, 12, 5.5) + '<path d="M3 20 L13 16 M5 26 L14 20 M9 30 L16 24" stroke="#f4f1e6" stroke-width="1.8" stroke-linecap="round"/>'),
    'skills/pebble_rain': (''.join(pebble(x, y, r) for x, y, r in ((9, 9, 4), (22, 7, 3.4), (16, 18, 4.4), (7, 24, 3), (25, 22, 3.6)))
                           + '<path d="M14 2 L11 6 M27 1 L25 4" stroke="#f4f1e6" stroke-width="1.4" stroke-linecap="round"/>'),
    'skills/herb_toss': (f'<path d="M5 27 Q8 12 26 5 Q24 22 5 27 Z" fill="#7fd36a" {_o()}/>'
                         '<path d="M6 26 Q14 17 22 9" fill="none" stroke="#2f6a22" stroke-width="1.4"/>' + sparkle(26, 18)),
}


def color_icon_svg(body):
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32">{body}</svg>'


def gear_icon(teeth=8, r_out=10.2, r_in=7.6, r_hole=3.2):
    """톱니바퀴 아이콘: 바깥 톱니 teeth 개 + 가운데 구멍"""
    import math
    pts = []
    step = 2 * math.pi / teeth
    for i in range(teeth):
        a = i * step - math.pi / 2
        # 톱니 하나 = 안쪽 → 바깥 → 바깥 → 안쪽 (사다리꼴)
        for da, r in ((-0.30, r_in), (-0.17, r_out), (0.17, r_out), (0.30, r_in)):
            pts.append((12 + r * math.cos(a + da * step / 0.62 * 0.5), 12 + r * math.sin(a + da * step / 0.62 * 0.5)))
    d = 'M' + ' L'.join(f'{x:.2f} {y:.2f}' for x, y in pts) + ' Z'
    return f'<path d="{d}"/><circle cx="12" cy="12" r="{r_hole}"/>'


ICONS['settings'] = gear_icon()


def icon_svg(body):
    return ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" '
            'stroke="#f4f1e6" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + body + '</svg>')


def main():
    pdir = os.path.join(ROOT, 'assets/img/portraits')
    idir = os.path.join(ROOT, 'assets/img/icons')
    os.makedirs(pdir, exist_ok=True)
    os.makedirs(idir, exist_ok=True)
    for name, p in PORTRAITS.items():
        with open(os.path.join(pdir, f'{name}.svg'), 'w', encoding='utf-8') as f:
            f.write(portrait(p))
    for name, body in ICONS.items():
        with open(os.path.join(idir, f'{name}.svg'), 'w', encoding='utf-8') as f:
            f.write(icon_svg(body))
    for name, body in COLOR_ICONS.items():
        path = os.path.join(idir, f'{name}.svg')
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, 'w', encoding='utf-8') as f:
            f.write(color_icon_svg(body))
    print(f'portraits={len(PORTRAITS)} icons={len(ICONS)} color_icons={len(COLOR_ICONS)}')


if __name__ == '__main__':
    main()
