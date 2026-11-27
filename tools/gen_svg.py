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
}


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
    print(f'portraits={len(PORTRAITS)} icons={len(ICONS)}')


if __name__ == '__main__':
    main()
