"""Inspect generated image files using only the Python standard library."""
import struct
import sys
import zlib

PNG_SIG = b"\x89PNG\r\n\x1a\n"
COLOR_TYPES = {0: "grayscale", 2: "truecolor RGB", 3: "indexed", 4: "grayscale+alpha", 6: "RGBA"}


def inspect_png(data):
    pos, ihdr, idat = 8, None, b""
    while pos < len(data):
        length, ctype = struct.unpack(">I4s", data[pos:pos + 8])
        body = data[pos + 8:pos + 8 + length]
        if ctype == b"IHDR":
            ihdr = struct.unpack(">IIBBBBB", body)
        elif ctype == b"IDAT":
            idat += body
        elif ctype == b"IEND":
            break
        pos += 12 + length
    w, h, depth, ct, _, _, interlace = ihdr
    has_alpha = ct in (4, 6)
    print(f"  format: PNG  width={w} height={h} bit_depth={depth} color_type={ct} ({COLOR_TYPES.get(ct)}) alpha={has_alpha}")
    if has_alpha and depth == 8 and interlace == 0:
        bpp = 4 if ct == 6 else 2
        raw = zlib.decompress(idat)
        stride = w * bpp
        rows, prev, i = [], bytearray(stride), 0
        for _ in range(h):
            f = raw[i]; line = bytearray(raw[i + 1:i + 1 + stride]); i += 1 + stride
            for x in range(stride):
                a = line[x - bpp] if x >= bpp else 0
                b = prev[x]
                c = prev[x - bpp] if x >= bpp else 0
                if f == 1: line[x] = (line[x] + a) & 255
                elif f == 2: line[x] = (line[x] + b) & 255
                elif f == 3: line[x] = (line[x] + (a + b) // 2) & 255
                elif f == 4:
                    p = a + b - c; pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
                    line[x] = (line[x] + (a if pa <= pb and pa <= pc else b if pb <= pc else c)) & 255
            rows.append(line); prev = line
        for name, (x, y) in {"TL": (0, 0), "TR": (w - 1, 0), "BL": (0, h - 1), "BR": (w - 1, h - 1)}.items():
            alpha = rows[y][x * bpp + bpp - 1]
            print(f"  corner {name}: alpha={alpha} transparent={alpha == 0}")


def inspect_jpeg(data):
    pos = 2
    while pos < len(data):
        marker = data[pos + 1]
        pos += 2
        if marker in (0xD8, 0x01) or 0xD0 <= marker <= 0xD7:
            continue
        seglen = struct.unpack(">H", data[pos:pos + 2])[0]
        if marker in (0xC0, 0xC1, 0xC2):
            precision, h, w, comps = struct.unpack(">BHHB", data[pos + 2:pos + 8])
            kind = {1: "grayscale", 3: "YCbCr (RGB)", 4: "CMYK"}.get(comps, "?")
            print(f"  format: JPEG (SOF{marker - 0xC0})  width={w} height={h} bit_depth={precision} components={comps} ({kind}) alpha=False")
            return
        pos += seglen


for path in sys.argv[1:]:
    with open(path, "rb") as fh:
        data = fh.read()
    print(f"{path}: size={len(data)} bytes")
    print(f"  png_signature_valid={data[:8] == PNG_SIG}  first_bytes={data[:8].hex()}")
    if data[:8] == PNG_SIG:
        inspect_png(data)
    elif data[:3] == b"\xff\xd8\xff":
        inspect_jpeg(data)
    else:
        print("  unknown format")
