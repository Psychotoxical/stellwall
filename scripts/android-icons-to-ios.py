# The area icons for the iPhone app: the Android vector drawables (Solar Bold Duotone, CC BY 4.0) as
# template SVG image sets in ios/Stellwall/Assets.xcassets. Run from the repo root: python scripts/android-icons-to-ios.py
import json, os, re, xml.etree.ElementTree as ET

A = "{http://schemas.android.com/apk/res/android}"
SRC = "android/app/src/main/res/drawable"
DST = "ios/Stellwall/Assets.xcassets"
for f in sorted(os.listdir(SRC)):
    if not f.startswith("ic_") or "launcher" in f:
        continue
    root = ET.parse(os.path.join(SRC, f)).getroot()
    w, h = root.get(A + "viewportWidth"), root.get(A + "viewportHeight")
    paths = []
    for p in root.iter("path"):
        alpha = p.get(A + "fillAlpha")
        op = f' fill-opacity="{float(alpha)}"' if alpha else ""
        paths.append(f'<path d="{p.get(A + "pathData")}" fill="#000"{op}/>')
    svg = f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}">{"".join(paths)}</svg>\n'
    name = f[3:-4]
    d = os.path.join(DST, f"{name}.imageset")
    os.makedirs(d, exist_ok=True)
    open(os.path.join(d, f"{name}.svg"), "w", encoding="utf-8", newline="\n").write(svg)
    json.dump({"images": [{"filename": f"{name}.svg", "idiom": "universal"}], "info": {"author": "xcode", "version": 1},
               "properties": {"preserves-vector-representation": True, "template-rendering-intent": "template"}},
              open(os.path.join(d, "Contents.json"), "w", encoding="utf-8", newline="\n"), indent=2)
    print(name)
