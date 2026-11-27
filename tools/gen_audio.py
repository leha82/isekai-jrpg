#!/usr/bin/env python3
"""
음원 생성기 — 직접 작곡한 BGM과 효과음을 신디사이저로 합성해 MP3 로 저장한다.
필요: numpy, lameenc
실행: uv run --python 3.13 --with numpy,lameenc python tools/gen_audio.py

출력: assets/bgm/*.mp3, assets/sfx/*.mp3, data/audio.json
BGM 은 한 루프 길이로 렌더링하되, 두 번 연속 렌더링한 뒤 두 번째 구간을 잘라
잔향이 루프 시작 부분에 자연스럽게 이어지도록 한다. (게임이 loopStart/loopEnd 로 끊김 없이 반복)
"""
import json, math, os
import numpy as np
import lameenc

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SR = 44100
RNG = np.random.default_rng(7)
NOTE_INDEX = {'C': 0, 'C#': 1, 'Db': 1, 'D': 2, 'D#': 3, 'Eb': 3, 'E': 4, 'F': 5, 'F#': 6, 'Gb': 6,
              'G': 7, 'G#': 8, 'Ab': 8, 'A': 9, 'A#': 10, 'Bb': 10, 'B': 11}


def midi(name):
    n, o = (name[:-1], int(name[-1]))
    return 12 * (o + 1) + NOTE_INDEX[n]


def freq(m):
    return 440.0 * 2 ** ((m - 69) / 12)


# ------------------------------------------------------------------ 오실레이터 & 엔벌로프
def phase_of(f, n, vib=0.0, vib_rate=5.5):
    t = np.arange(n) / SR
    inst = f * (1 + vib * np.sin(2 * np.pi * vib_rate * t) * np.clip(t / 0.25, 0, 1))
    return np.cumsum(inst) / SR % 1.0


def osc(kind, f, n, duty=0.5, vib=0.0):
    ph = phase_of(f, n, vib)
    if kind == 'square':
        return np.where(ph < duty, 1.0, -1.0)
    if kind == 'tri':
        return 4 * np.abs(ph - 0.5) - 1
    if kind == 'saw':
        return 2 * ph - 1
    return np.sin(2 * np.pi * ph)


def env(n, a=0.01, d=0.08, s=0.7, r=0.08):
    e = np.ones(n) * s
    na, nd, nr = int(a * SR), int(d * SR), int(r * SR)
    na = min(na, n); e[:na] = np.linspace(0, 1, na, endpoint=False) if na else e[:na]
    if nd and na < n:
        k = min(nd, n - na); e[na:na + k] = np.linspace(1, s, k)
    if nr:
        k = min(nr, n); e[n - k:] *= np.linspace(1, 0, k)
    return e


def expdecay(n, tau):
    return np.exp(-np.arange(n) / SR / tau)


def lowpass(x, k):
    if k <= 1:
        return x
    return np.convolve(x, np.ones(k) / k, mode='same')


# ------------------------------------------------------------------ 악기
def inst_note(inst, f, dur):
    n = int(dur * SR)
    tail = int(0.35 * SR)
    m = n + tail
    if inst == 'square25':
        x = osc('square', f, m, 0.25, vib=0.004) * env(m, .005, .1, .55, .0)
        x[n:] *= np.linspace(1, 0, tail); return lowpass(x, 3) * 0.55
    if inst == 'square50':
        x = osc('square', f, m, 0.5, vib=0.003) * env(m, .005, .1, .5, 0)
        x[n:] *= np.linspace(1, 0, tail); return lowpass(x, 4) * 0.5
    if inst == 'tri':
        x = osc('tri', f, m, vib=0.004) * env(m, .01, .1, .8, 0)
        x[n:] *= np.linspace(1, 0, tail); return x * 0.9
    if inst == 'flute':
        x = (osc('sine', f, m, vib=0.008) + 0.25 * osc('sine', 2 * f, m)) * env(m, .06, .1, .85, 0)
        x[n:] *= np.linspace(1, 0, tail); return x * 0.7
    if inst == 'brass':
        x = osc('saw', f, m, vib=0.003) * env(m, .03, .12, .75, 0)
        x[n:] *= np.linspace(1, 0, tail); return lowpass(x, 9) * 0.5
    if inst == 'bell':
        m = n + int(1.2 * SR)
        t = np.arange(m) / SR
        x = (np.sin(2 * np.pi * f * t) + .45 * np.sin(2 * np.pi * f * 2.76 * t) * expdecay(m, .25)
             + .25 * np.sin(2 * np.pi * f * 5.4 * t) * expdecay(m, .12)) * expdecay(m, .9)
        return x * env(m, .002, .0, 1, .05) * 0.55
    if inst == 'pluck':
        m = n + int(0.6 * SR)
        x = (osc('tri', f, m) + .3 * osc('square', f, m, .3)) * expdecay(m, .32)
        return lowpass(x, 3) * env(m, .002, 0, 1, .03) * 0.6
    if inst == 'harp':
        m = n + int(1.0 * SR)
        t = np.arange(m) / SR
        x = (np.sin(2 * np.pi * f * t) + .3 * np.sin(4 * np.pi * f * t)) * expdecay(m, .6)
        return x * env(m, .003, 0, 1, .05) * 0.5
    raise ValueError(inst)


def bass_note(kind, f, dur):
    n = int(dur * SR)
    if kind == 'tri':
        return osc('tri', f, n) * env(n, .005, .05, .85, .03) * 0.9
    if kind == 'square':
        return lowpass(osc('square', f, n, .5), 6) * env(n, .005, .06, .7, .03) * 0.45
    return lowpass(osc('saw', f, n), 10) * env(n, .005, .08, .7, .03) * 0.55


def pad_chord(freqs, dur, dark=False):
    n = int(dur * SR) + int(.3 * SR)
    x = np.zeros(n)
    for f in freqs:
        for det in (-0.004, 0.0, 0.005):
            x += osc('saw', f * (1 + det), n)
    x = lowpass(x, 40 if dark else 22) / (len(freqs) * 3)
    return x * env(n, .25, .2, .8, .35) * 0.55


def kick():
    n = int(.28 * SR)
    t = np.arange(n) / SR
    f = 45 + 90 * np.exp(-t * 28)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * expdecay(n, .11) * 0.9


def snare():
    n = int(.2 * SR)
    noise = RNG.uniform(-1, 1, n)
    return (noise - lowpass(noise, 8)) * expdecay(n, .07) * .55 + osc('tri', 190, n) * expdecay(n, .05) * .35


def hat():
    n = int(.06 * SR)
    noise = RNG.uniform(-1, 1, n)
    return (noise - lowpass(noise, 3)) * expdecay(n, .015) * 0.25


# ------------------------------------------------------------------ 화음
QUAL = {'': (0, 4, 7), 'm': (0, 3, 7), 'dim': (0, 3, 6), '7': (0, 4, 7, 10), 'maj7': (0, 4, 7, 11), 'sus4': (0, 5, 7)}


def chord_notes(sym, octave=3):
    root = sym[:2] if len(sym) > 1 and sym[1] in '#b' else sym[:1]
    q = sym[len(root):]
    r = 12 * (octave + 1) + NOTE_INDEX[root]
    return [r + i for i in QUAL[q]]


def parse_melody(s):
    out = []
    for tok in s.split():
        if tok == '|':
            continue
        n, l = tok.split(':')
        out.append((None if n == 'r' else midi(n), int(l)))
    return out


# ------------------------------------------------------------------ 편곡·렌더링
def add(buf, x, start):
    s = int(start)
    if s >= len(buf):
        return
    e = min(len(buf), s + len(x))
    buf[s:e] += x[:e - s]


def render_track(tr):
    bpm = tr['bpm']
    beat = 60 / bpm
    eighth = beat / 2
    bars = len(tr['chords'])
    loop_len = bars * 4 * beat
    total = int(loop_len * SR)
    lead = np.zeros(total * 2); acc = np.zeros(total * 2); drum = np.zeros(total * 2)
    mel = parse_melody(tr['melody'])
    style = tr['style']
    for rep in range(2):
        base = rep * loop_len
        # 멜로디
        t = 0
        for note, l in mel:
            if note is not None:
                add(lead, inst_note(style['lead'], freq(note), l * eighth * 0.95), (base + t * eighth) * SR)
            t += l
        # 반주
        for bi, sym in enumerate(tr['chords']):
            bt = base + bi * 4 * beat
            notes = chord_notes(sym)
            root = notes[0] - 12
            if style.get('pad'):
                add(acc, pad_chord([freq(n) for n in notes], 4 * beat, style['pad'] == 'dark') * style.get('pad_vol', 1), bt * SR)
            bp = style.get('bass_pattern', 'quarters')
            if bp == 'quarters':
                for k in range(4):
                    m = root + (12 if k % 2 else 0)
                    add(acc, bass_note(style['bass'], freq(m), beat * .9) * .6, (bt + k * beat) * SR)
            elif bp == 'eighths':
                for k in range(8):
                    m = root + (7 if k in (3, 7) else 0) + (12 if k % 2 else 0)
                    add(acc, bass_note(style['bass'], freq(m), eighth * .85) * .55, (bt + k * eighth) * SR)
            elif bp == 'whole':
                add(acc, bass_note(style['bass'], freq(root), 4 * beat * .95) * .6, bt * SR)
            elif bp == 'half':
                for k in range(2):
                    add(acc, bass_note(style['bass'], freq(root + (7 if k else 0)), 2 * beat * .9) * .6, (bt + k * 2 * beat) * SR)
            arp = style.get('arp')
            if arp:
                seq = [n + 12 for n in notes] + [notes[1] + 24 if len(notes) > 1 else notes[0] + 24]
                step = eighth if arp in ('up8', 'harp') else eighth / 2
                count = int(4 * beat / step)
                for k in range(count):
                    n = seq[k % len(seq)] if arp != 'harp' else (seq + seq[-2:0:-1])[k % (2 * len(seq) - 2)]
                    add(acc, inst_note('harp' if arp == 'harp' else 'pluck', freq(n), step * .9) * style.get('arp_vol', .35), (bt + k * step) * SR)
            dr = style.get('drums')
            if dr:
                for k in range(8):
                    tt = (bt + k * eighth) * SR
                    if dr in ('rock', 'fast'):
                        if k in (0, 3, 4) or (dr == 'fast' and k == 6):
                            add(drum, kick(), tt)
                        if k in (2, 6):
                            add(drum, snare(), tt)
                        add(drum, hat() * (1.2 if k % 2 == 0 else .7), tt)
                    elif dr == 'march':
                        if k in (0, 4):
                            add(drum, kick(), tt)
                        if k in (2, 6, 7):
                            add(drum, snare() * (.7 if k == 7 else 1), tt)
                    elif dr == 'light':
                        if k == 0:
                            add(drum, kick() * .7, tt)
                        if k == 4:
                            add(drum, snare() * .5, tt)
                        if k % 2 == 0:
                            add(drum, hat() * .7, tt)
    mix = lead * style.get('lead_vol', .5) + acc * .55 + drum * style.get('drum_vol', .6)
    # 간단한 공간감 (지연 탭)
    out = mix.copy()
    for d, g in ((0.12, .22), (0.27, .14), (0.41, .08)):
        k = int(d * SR)
        out[k:] += mix[:-k] * g
    seg = out[total:total * 2]
    return master(seg), loop_len


def master(x):
    x = np.tanh(x * 1.1)
    peak = np.max(np.abs(x)) or 1
    return x / peak * 0.89


def to_mp3(x, path, kbps=96):
    pcm = (np.clip(x, -1, 1) * 32767).astype('<i2').tobytes()
    enc = lameenc.Encoder()
    enc.set_bit_rate(kbps); enc.set_in_sample_rate(SR); enc.set_channels(1); enc.set_quality(2)
    data = enc.encode(pcm) + enc.flush()
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'wb') as f:
        f.write(data)
    return len(data)


# ------------------------------------------------------------------ 곡 목록 (모두 직접 작곡)
TRACKS = {
    'title': dict(title='타이틀 — 쐐기의 이방인', bpm=84,
        chords='C Am F G C Em F G Am F C G F G C C'.split(),
        melody='E5:4 G5:4 | A5:6 G5:2 | F5:4 A5:4 | G5:8 | E5:4 C6:4 | B5:6 G5:2 | A5:3 G5:1 F5:2 E5:2 | D5:8 | '
               'C5:4 E5:4 | F5:4 A5:4 | G5:3 E5:1 C5:4 | D5:8 | F5:4 A5:4 | B5:4 D6:4 | C6:8 | r:8',
        style=dict(lead='bell', lead_vol=.6, bass='tri', bass_pattern='whole', pad='soft', arp='harp', arp_vol=.25)),
    'field': dict(title='바람결 초원', bpm=120,
        chords='G D Em C G D C D Em C G D Em C Am D'.split(),
        melody='B4:2 D5:2 G5:3 F#5:1 | E5:2 D5:2 A4:4 | B4:2 E5:2 G5:2 F#5:2 | E5:6 r:2 | D5:2 G5:2 B5:3 A5:1 | G5:2 F#5:2 A5:4 | G5:2 E5:2 C5:2 E5:2 | D5:6 r:2 | '
               'E5:3 F#5:1 G5:2 B5:2 | A5:2 G5:2 E5:4 | D5:3 E5:1 G5:2 D5:2 | B4:2 A4:2 D5:4 | E5:2 G5:2 B5:2 E6:2 | D6:2 C6:2 G5:4 | A5:2 C6:2 B5:2 A5:2 | F#5:4 D5:4',
        style=dict(lead='square25', lead_vol=.45, bass='tri', bass_pattern='quarters', arp='up8', arp_vol=.22, drums='light', drum_vol=.5)),
    'town': dict(title='하젤 마을', bpm=100,
        chords='F C Dm Bb F C Bb C Dm Bb F C Bb C F F'.split(),
        melody='A4:2 C5:2 F5:2 E5:2 | D5:2 C5:2 G4:4 | A4:2 D5:2 F5:2 A5:2 | G5:4 F5:4 | A5:2 G5:2 F5:2 C5:2 | E5:2 G5:2 C5:4 | D5:2 F5:2 Bb5:2 A5:2 | G5:6 r:2 | '
               'F5:3 E5:1 D5:4 | D5:2 F5:2 Bb4:4 | C5:2 F5:2 A5:2 C6:2 | Bb5:2 A5:2 G5:4 | F5:2 D5:2 Bb4:2 D5:2 | E5:2 G5:2 C6:4 | A5:4 G5:2 E5:2 | F5:6 r:2',
        style=dict(lead='pluck', lead_vol=.7, bass='tri', bass_pattern='half', pad='soft', pad_vol=.6, drums='light', drum_vol=.35)),
    'forest': dict(title='세계수의 숲', bpm=88,
        chords='Dm G Dm G F C Dm Dm Bb F C G Dm C Dm Dm'.split(),
        melody='A4:4 D5:2 E5:2 | F5:4 E5:2 D5:2 | C5:2 D5:2 E5:4 | B4:8 | A4:2 C5:2 F5:2 A5:2 | G5:4 E5:4 | F5:2 E5:2 D5:2 C5:2 | D5:8 | '
               'D5:4 F5:2 A5:2 | C6:4 A5:4 | G5:2 E5:2 C5:4 | B4:4 D5:4 | A5:4 G5:2 F5:2 | E5:4 C5:4 | D5:6 E5:2 | D5:8',
        style=dict(lead='flute', lead_vol=.55, bass='tri', bass_pattern='whole', pad='soft', pad_vol=.7, arp='harp', arp_vol=.3)),
    'castle': dict(title='왕도 루센', bpm=104,
        chords='D G D A D G A D Bm G D A G A D D'.split(),
        melody='D5:3 D5:1 F#5:2 A5:2 | B5:4 A5:4 | F#5:3 F#5:1 E5:2 D5:2 | E5:8 | D5:3 D5:1 F#5:2 A5:2 | D6:4 B5:4 | A5:2 G5:2 F#5:2 E5:2 | D5:8 | '
               'F#5:2 G5:2 A5:2 B5:2 | B5:4 G5:4 | A5:3 F#5:1 D5:4 | E5:8 | B5:3 A5:1 G5:2 B5:2 | A5:2 F#5:2 E5:4 | D5:2 F#5:2 A5:2 D6:2 | D6:8',
        style=dict(lead='brass', lead_vol=.6, bass='square', bass_pattern='quarters', pad='soft', pad_vol=.5, drums='march', drum_vol=.55)),
    'snow': dict(title='서리 평원', bpm=76,
        chords='Am F C G Am F E E Dm Am F C Dm E Am Am'.split(),
        melody='E5:4 A5:4 | C6:6 B5:2 | G5:4 E5:4 | D5:8 | E5:4 A5:4 | C6:4 D6:4 | B5:8 | G#5:8 | '
               'F5:4 A5:4 | E5:4 C5:4 | A4:4 C5:2 E5:2 | G5:8 | F5:4 D5:4 | B4:4 G#5:4 | A5:8 | r:8',
        style=dict(lead='bell', lead_vol=.6, bass='tri', bass_pattern='whole', pad='dark', pad_vol=.8)),
    'mountain': dict(title='그롬 산길', bpm=96,
        chords='Em C G D Em C B B Am Em C G Am B Em Em'.split(),
        melody='E5:2 G5:2 B5:4 | C6:2 B5:2 G5:4 | D5:2 G5:2 B5:2 D6:2 | A5:8 | E5:2 G5:2 B5:4 | C6:2 E6:2 C6:4 | B5:4 D#6:4 | B5:8 | '
               'A5:2 C6:2 E6:4 | B5:2 G5:2 E5:4 | G5:2 C6:2 E5:4 | D5:4 G5:4 | C6:2 A5:2 E5:4 | F#5:2 A5:2 D#5:4 | E5:8 | r:8',
        style=dict(lead='square50', lead_vol=.4, bass='tri', bass_pattern='eighths', arp='up16', arp_vol=.18, drums='light', drum_vol=.45)),
    'dungeon': dict(title='녹턴 요새', bpm=92,
        chords='Em Em C B Em Em Am B Em C Am B Em C B B'.split(),
        melody='E5:2 r:2 G5:2 F#5:2 | E5:4 B4:4 | C5:2 E5:2 G5:2 A5:2 | F#5:8 | E5:2 r:2 G5:2 B5:2 | A5:4 G5:4 | F#5:2 E5:2 D#5:4 | B4:8 | '
               'G5:2 F#5:2 E5:4 | E5:2 G5:2 C6:4 | B5:2 A5:2 C6:2 B5:2 | F#5:8 | E5:4 G5:4 | B5:4 C6:4 | B5:2 A5:2 G5:2 F#5:2 | D#5:8',
        style=dict(lead='tri', lead_vol=.5, bass='saw', bass_pattern='eighths', pad='dark', pad_vol=.8, drums='light', drum_vol=.4)),
    'battle': dict(title='전투', bpm=150,
        chords='Am F G E Am F G E F G Am Am F G E E'.split(),
        melody='A5:2 E5:1 A5:1 C6:2 B5:2 | A5:2 F5:2 C5:4 | D5:2 G5:2 B5:2 D6:2 | B5:4 G#5:4 | A5:2 E5:1 A5:1 C6:2 E6:2 | D6:2 C6:2 A5:4 | B5:2 D6:2 G5:2 B5:2 | G#5:6 r:2 | '
               'F5:2 A5:2 C6:4 | D6:2 B5:2 G5:4 | E6:3 D6:1 C6:2 B5:2 | A5:8 | C6:2 A5:2 F5:4 | D6:2 B5:2 G5:4 | E5:2 G#5:2 B5:2 D6:2 | E6:8',
        style=dict(lead='square25', lead_vol=.45, bass='saw', bass_pattern='eighths', arp='up16', arp_vol=.15, drums='rock', drum_vol=.6)),
    'boss': dict(title='관리자 오르벨', bpm=160,
        chords='Cm Ab Bb G Cm Ab Fm G Ab Bb Cm Cm Fm G Cm G'.split(),
        melody='C5:1 C5:1 G5:2 Eb5:2 C6:2 | Ab5:4 Eb5:4 | Bb5:2 F5:2 D5:2 Bb4:2 | B4:4 D5:4 | C5:1 C5:1 G5:2 Eb6:2 D6:2 | C6:4 Ab5:4 | F5:2 Ab5:2 C6:2 F6:2 | D6:4 B5:4 | '
               'Ab5:2 C6:2 Eb6:4 | D6:2 Bb5:2 F5:4 | G5:2 C6:2 Eb6:2 G6:2 | F6:4 Eb6:4 | C6:2 Ab5:2 F5:4 | D6:2 B5:2 G5:4 | C6:3 B5:1 G5:2 Eb5:2 | D5:4 B4:4',
        style=dict(lead='brass', lead_vol=.55, bass='saw', bass_pattern='eighths', pad='dark', pad_vol=.6, drums='fast', drum_vol=.65)),
    'ending': dict(title='엔딩 — 새로운 순환', bpm=72,
        chords='C G Am Em F C Dm G C G Am Em F G C C'.split(),
        melody='E5:4 D5:2 C5:2 | D5:4 B4:4 | C5:4 E5:2 A5:2 | G5:8 | A5:4 G5:2 F5:2 | E5:4 C5:4 | D5:2 E5:2 F5:2 A5:2 | G5:8 | '
               'E5:4 D5:2 C5:2 | D5:4 G5:4 | A5:4 C6:2 B5:2 | G5:8 | A5:4 F5:2 A5:2 | G5:4 D5:4 | C5:8 | r:8',
        style=dict(lead='flute', lead_vol=.6, bass='tri', bass_pattern='half', pad='soft', pad_vol=.8, arp='harp', arp_vol=.22)),
}


# ------------------------------------------------------------------ 효과음
def sfx_render(name):
    def seq(notes, step, inst='square25', vol=.6):
        out = np.zeros(int((len(notes) * step + .6) * SR))
        for i, n in enumerate(notes):
            add(out, inst_note(inst, freq(midi(n)), step * .9) * vol, i * step * SR)
        return out
    def noise(dur):
        return RNG.uniform(-1, 1, int(dur * SR))
    def sweep(f0, f1, dur, kind='square'):
        n = int(dur * SR)
        f = np.geomspace(f0, f1, n)
        ph = np.cumsum(f) / SR % 1
        return (np.where(ph < .5, 1., -1.) if kind == 'square' else np.sin(2 * np.pi * ph))

    if name == 'step':
        n = noise(.05); return lowpass(n, 12) * expdecay(len(n), .012) * .5
    if name == 'cursor':
        return seq(['E6'], .05, 'square25', .4)
    if name == 'confirm':
        return seq(['C6', 'G6'], .06, 'square25', .45)
    if name == 'cancel':
        return seq(['G5', 'C5'], .06, 'square25', .45)
    if name == 'error':
        x = osc('square', 110, int(.25 * SR), .5); return lowpass(x, 4) * env(len(x), .005, .05, .6, .05) * .5
    if name == 'hit':
        n = noise(.18); return (lowpass(n, 5) * expdecay(len(n), .05) + kick()[:len(n)] * .6) * .8
    if name == 'slash':
        n = noise(.25); s = sweep(3000, 400, .25, 'sine')
        return (n - lowpass(n, 4)) * expdecay(len(n), .07) * .8 + s * expdecay(len(s), .05) * .2
    if name == 'fire':
        n = noise(.7); return lowpass(n, 14) * env(len(n), .02, .2, .5, .3) * 1.2 + (n - lowpass(n, 2)) * (RNG.uniform(0, 1, len(n)) > .985) * .8
    if name == 'wind':
        n = noise(.9); x = lowpass(n, 6) * np.sin(np.linspace(0, np.pi, len(n))) ** 2
        return x * 1.2
    if name == 'heal':
        return seq(['C6', 'E6', 'G6', 'C7', 'E7'], .07, 'bell', .6)
    if name == 'guard':
        return inst_note('bell', freq(midi('A5')), .4) * .7 + inst_note('bell', freq(midi('E6')), .4) * .4
    if name == 'coin':
        return seq(['B6', 'E7'], .07, 'square25', .45)
    if name == 'levelup':
        return seq(['C5', 'E5', 'G5', 'C6', 'E6', 'G6', 'C7'], .07, 'square25', .45)
    if name == 'encounter':
        s = sweep(200, 1600, .35); return np.concatenate([s * env(len(s), .01, .1, .6, .05) * .35, snare() * .8])
    if name == 'door':
        k = kick() * .8; n = noise(.2); return np.concatenate([k, lowpass(n, 30) * expdecay(len(n), .08) * .5])
    if name == 'chest':
        return np.concatenate([lowpass(noise(.05), 8) * .5, seq(['G5', 'C6', 'E6', 'G6'], .06, 'bell', .6)])
    if name == 'warp':
        s = sweep(1200, 150, .6, 'sine'); return s * env(len(s), .02, .1, .7, .2) * .5
    if name == 'enemy_die':
        s = sweep(600, 60, .5); n = noise(.5)
        return (lowpass(s, 6) * .3 + lowpass(n, 8) * .4) * expdecay(len(s), .2)
    if name == 'item':
        return seq(['C6', 'G6', 'C7'], .05, 'bell', .6)
    if name == 'fanfare':
        x = seq(['C5', 'C5', 'C5', 'C5', 'Ab4', 'Bb4', 'C5', 'Bb4', 'C5'], .13, 'brass', .7)
        out = np.zeros(int(3.2 * SR)); add(out, x, 0)
        add(out, pad_chord([freq(midi(n)) for n in ('C4', 'E4', 'G4', 'C5')], 1.6) * 1.2, int(1.15 * SR))
        return out
    raise ValueError(name)


SFX = {
    'step': '발걸음', 'cursor': '커서 이동', 'confirm': '확인', 'cancel': '취소', 'error': '오류',
    'hit': '타격', 'slash': '베기', 'fire': '화염 마법', 'wind': '바람 마법', 'heal': '회복',
    'guard': '방어', 'coin': '동전', 'levelup': '레벨 업', 'encounter': '적 조우', 'door': '문',
    'chest': '상자 열기', 'warp': '이동(워프)', 'enemy_die': '적 소멸', 'item': '아이템 사용', 'fanfare': '승리 팡파르',
}


def main():
    meta = {'sampleRate': SR, 'bgm': {}, 'sfx': {}}
    total = 0
    for tid, tr in TRACKS.items():
        x, loop = render_track(tr)
        size = to_mp3(x, os.path.join(ROOT, f'assets/bgm/{tid}.mp3'))
        total += size
        meta['bgm'][tid] = {'file': f'assets/bgm/{tid}.mp3', 'title': tr['title'], 'loop': round(loop, 6), 'bpm': tr['bpm']}
        print(f'bgm {tid:9s} {loop:5.1f}s {size // 1024}KB')
    for sid, label in SFX.items():
        x = master(sfx_render(sid)) * .9
        size = to_mp3(x, os.path.join(ROOT, f'assets/sfx/{sid}.mp3'), 96)
        total += size
        meta['sfx'][sid] = {'file': f'assets/sfx/{sid}.mp3', 'title': label}
    # 디코더가 앞에 붙이는 지연(샘플). 게임이 루프 지점을 계산할 때 쓴다. (tools/measure 로 측정한 값)
    meta['decoderDelay'] = int(os.environ.get('MP3_DELAY', '1105'))
    with open(os.path.join(ROOT, 'data/audio.json'), 'w', encoding='utf-8') as f:
        json.dump(meta, f, ensure_ascii=False, indent=1)
    print(f'total {total // 1024}KB')


if __name__ == '__main__':
    main()
