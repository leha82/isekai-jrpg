#!/usr/bin/env python3
"""
리소스 목록 생성기 — assets/ 아래 파일 목록과 크기를 data/assets.json 에 기록한다.
관리자 페이지 '리소스' 탭이 이 목록을 보여 준다. 리소스를 추가·생성한 뒤 다시 실행한다.
실행: python tools/gen_manifest.py
"""
import json, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def main():
    files = []
    for base, _, names in os.walk(os.path.join(ROOT, 'assets')):
        for n in sorted(names):
            p = os.path.join(base, n)
            rel = os.path.relpath(p, ROOT).replace(os.sep, '/')
            files.append({'path': rel, 'size': os.path.getsize(p)})
    files.sort(key=lambda f: f['path'])
    with open(os.path.join(ROOT, 'data/assets.json'), 'w', encoding='utf-8') as f:
        json.dump({'files': files}, f, ensure_ascii=False, indent=1)
        f.write('\n')
    print(f'assets: {len(files)} files, {sum(f["size"] for f in files) // 1024}KB')


if __name__ == '__main__':
    main()
