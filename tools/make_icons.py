#!/usr/bin/env python3
"""Generuje ikony PNG dla PWA bez zewnętrznych bibliotek (tylko zlib/struct).
Uruchom: python3 tools/make_icons.py
Tworzy: icons/icon-192.png, icons/icon-512.png, icons/icon-maskable-512.png
"""
import math
import os
import struct
import zlib

OUT = os.path.join(os.path.dirname(__file__), '..', 'icons')
C1 = (0x3F, 0xB8, 0x83)   # jasna zieleń (lewy-górny)
C2 = (0x1F, 0x7A, 0x54)   # ciemna zieleń (prawy-dolny)
WHITE = (255, 255, 255)
SS = 3  # supersampling (antyaliasing)


def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def in_heart(x, y):
    # klasyczne serce: (x^2 + y^2 - 1)^3 - x^2 y^3 <= 0
    return (x * x + y * y - 1) ** 3 - x * x * y ** 3 <= 0


def in_rounded_rect(px, py, size, radius):
    x = min(px, size - 1 - px)
    y = min(py, size - 1 - py)
    if x >= radius or y >= radius:
        return True
    return (x - radius) ** 2 + (y - radius) ** 2 <= radius ** 2


def render(size, rounded, heart_scale):
    cx, cy = size / 2, size / 2 + size * 0.03
    r = size * heart_scale
    rows = []
    corner = size * 0.22 if rounded else 0
    for py in range(size):
        row = bytearray()
        for px in range(size):
            cover_bg = 0
            cover_heart = 0
            for sy in range(SS):
                for sx in range(SS):
                    fx = px + (sx + 0.5) / SS
                    fy = py + (sy + 0.5) / SS
                    if rounded and not in_rounded_rect(fx, fy, size, corner):
                        continue
                    cover_bg += 1
                    x = (fx - cx) / r
                    y = -(fy - cy) / r
                    if in_heart(x, y):
                        cover_heart += 1
            n = SS * SS
            if cover_bg == 0:
                row += bytes((0, 0, 0, 0))
                continue
            t = (px + py) / (2 * size)
            bg = lerp(C1, C2, t)
            h = cover_heart / cover_bg
            col = tuple(int(bg[i] * (1 - h) + WHITE[i] * h) for i in range(3))
            alpha = int(255 * cover_bg / n)
            row += bytes((*col, alpha))
        rows.append(bytes(row))
    return rows


def png(size, rows):
    raw = b''.join(b'\x00' + r for r in rows)

    def chunk(tag, data):
        return struct.pack('>I', len(data)) + tag + data + struct.pack('>I', zlib.crc32(tag + data) & 0xFFFFFFFF)

    return (b'\x89PNG\r\n\x1a\n'
            + chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 0))
            + chunk(b'IDAT', zlib.compress(raw, 9))
            + chunk(b'IEND', b''))


def main():
    os.makedirs(OUT, exist_ok=True)
    jobs = [
        ('icon-192.png', 192, True, 0.30),
        ('icon-512.png', 512, True, 0.30),
        ('icon-maskable-512.png', 512, False, 0.24),  # pełne tło, serce w bezpiecznej strefie
    ]
    for name, size, rounded, scale in jobs:
        data = png(size, render(size, rounded, scale))
        with open(os.path.join(OUT, name), 'wb') as f:
            f.write(data)
        print(f'{name}: {len(data)} B')


if __name__ == '__main__':
    main()
