"""DI-ana tests: turns a rendered sheet page into a phone-camera-like picture: the page on a desk, seen at an angle, with uneven
light, a little blur, noise and JPEG. Used to test reading sheets from camera pictures (Odin's scanner and DI-ana)."""
import random
from PIL import Image, ImageDraw, ImageFilter, ImageChops
import numpy as np

def coeffs(dst, src):
    # PIL's PERSPECTIVE maps output (dst) points to input (src) points
    A, b = [], []
    for (x, y), (u, v) in zip(dst, src):
        A.append([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.append(u)
        A.append([0, 0, 0, x, y, 1, -v * x, -v * y]); b.append(v)
    return np.linalg.solve(np.array(A, float), np.array(b, float)).tolist()

def desk(out_w=720, out_h=1280, seed=0, bg=(92, 84, 76)):
    """Only the desk: what the camera sees between two sheets."""
    noise = (np.random.default_rng(seed).normal(0, 14, (out_h // 8, out_w // 8))).clip(-40, 40)
    tex = Image.fromarray((128 + noise).astype("uint8")).resize((out_w, out_h), Image.BILINEAR)
    return Image.merge("RGB", [ImageChops.add(c, tex, 1, -128) for c in Image.new("RGB", (out_w, out_h), bg).split()])


def y4m(frames, path, fps=10):
    """Frames (same size) as a Y4M video, which Chromium's pretend camera plays (--use-file-for-fake-video-capture)."""
    w, h = frames[0].size
    with open(path, "wb") as f:
        f.write(f"YUV4MPEG2 W{w} H{h} F{fps}:1 Ip A1:1 C420jpeg\n".encode())
        for im in frames:
            a = np.asarray(im.convert("RGB")).astype(float)
            y = (0.299 * a[..., 0] + 0.587 * a[..., 1] + 0.114 * a[..., 2]).clip(0, 255).astype("uint8")
            u = (128 - 0.168736 * a[..., 0] - 0.331264 * a[..., 1] + 0.5 * a[..., 2])[::2, ::2].clip(0, 255).astype("uint8")
            v = (128 + 0.5 * a[..., 0] - 0.418688 * a[..., 1] - 0.081312 * a[..., 2])[::2, ::2].clip(0, 255).astype("uint8")
            f.write(b"FRAME\n" + y.tobytes() + u.tobytes() + v.tobytes())


def photo(page, out_w=1080, out_h=1920, seed=0, fill=0.8, tilt=0.08, rot=0.0, shade=0.35, blur=0.8, bg=(92, 84, 76), upside=False, landscape=False):
    R = random.Random(seed)
    page = page.convert("L")
    if upside: page = page.rotate(180)
    if landscape: out_w, out_h = out_h, out_w
    pw, ph = page.size
    # where the page's corners land in the picture: centred, about `fill` of the shorter side, tilted in perspective
    scale = fill * min(out_w / pw, out_h / ph)
    cw, ch = pw * scale, ph * scale
    cx, cy = out_w / 2 + R.uniform(-0.04, 0.04) * out_w, out_h / 2 + R.uniform(-0.04, 0.04) * out_h
    import math
    a = math.radians(rot)
    pts = []
    for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
        x, y = sx * cw / 2, sy * ch / 2
        # perspective: the far edge (top) narrower
        x *= 1 - tilt * (-sy)
        x += R.uniform(-0.015, 0.015) * cw; y += R.uniform(-0.015, 0.015) * ch
        pts.append((cx + x * math.cos(a) - y * math.sin(a), cy + x * math.sin(a) + y * math.cos(a)))
    src = [(0, 0), (pw, 0), (pw, ph), (0, ph)]
    warped = page.transform((out_w, out_h), Image.PERSPECTIVE, coeffs(pts, src), resample=Image.BICUBIC, fillcolor=0)
    mask = Image.new("L", page.size, 255).transform((out_w, out_h), Image.PERSPECTIVE, coeffs(pts, src), resample=Image.BILINEAR, fillcolor=0)
    # a desk with some texture
    desk = Image.new("RGB", (out_w, out_h), bg)
    noise = (np.random.default_rng(seed).normal(0, 14, (out_h // 8, out_w // 8))).clip(-40, 40)
    tex = Image.fromarray((128 + noise).astype("uint8")).resize((out_w, out_h), Image.BILINEAR)
    desk = Image.merge("RGB", [ImageChops.add(c, tex, 1, -128) for c in desk.split()])
    paper = Image.merge("RGB", [warped.point(lambda v: v * 0.94 + 8), warped.point(lambda v: v * 0.93 + 6), warped.point(lambda v: v * 0.88 + 4)])
    img = Image.composite(paper, desk, mask)
    # uneven light: brighter at one corner, a soft shadow at another
    yy, xx = np.mgrid[0:out_h, 0:out_w]
    gx, gy = R.uniform(-1, 1), R.uniform(-1, 1)
    light = 1 - shade * (0.5 + 0.5 * ((xx / out_w - 0.5) * gx + (yy / out_h - 0.5) * gy))
    arr = np.asarray(img).astype(float) * light[..., None]
    arr += np.random.default_rng(seed + 1).normal(0, 5, arr.shape)
    img = Image.fromarray(arr.clip(0, 255).astype("uint8")).filter(ImageFilter.GaussianBlur(blur))
    return img, pts
