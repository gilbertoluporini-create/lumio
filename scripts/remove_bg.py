#!/usr/bin/env python3
"""
remove_bg.py — remove fundo xadrez/branco rasterizado de assets do ChatGPT.

Estratégia (do feedback_lumio_chatgpt_assets_no_alpha):
1. Detecta pixels neutros claros (R≈G≈B, luminância alta).
2. Restringe à componente conectada à BORDA da imagem (preserva brancos
   internos do mascote, ex: olhos, sorriso).
3. Erode 1px + Gaussian blur 0.8 pra suavizar anti-alias.
4. Salva back em RGBA com original guardado em _originals/.

Uso:
  python3 scripts/remove_bg.py public/illustrations/scene-funnel-summary.png
  python3 scripts/remove_bg.py --all  # roda em todas as PNGs com >5% xadrez
"""

import sys
import shutil
import argparse
from pathlib import Path
from PIL import Image, ImageFilter
import numpy as np
from scipy import ndimage


def detect_xadrez_pct(im: Image.Image) -> float:
    """Quantos pixels opacos parecem fundo neutro claro (% do total opaco)."""
    arr = np.array(im)
    rgb = arr[..., :3]
    a = arr[..., 3]
    mn = rgb.min(axis=-1)
    mx = rgb.max(axis=-1)
    opaque = a > 200
    neutral_light = (mn >= 220) & ((mx - mn) <= 18)
    target = opaque & neutral_light
    if not opaque.any():
        return 0.0
    return 100.0 * target.sum() / opaque.sum()


def remove_bg(img_path: Path, dry_run: bool = False) -> dict:
    im = Image.open(img_path).convert("RGBA")
    arr = np.array(im)
    rgb = arr[..., :3]
    a = arr[..., 3]
    h, w = a.shape

    # Máscara de candidatos a fundo: neutro claro
    mn = rgb.min(axis=-1)
    mx = rgb.max(axis=-1)
    bg_mask = (mn >= 228) & ((mx - mn) <= 16) & (a > 200)

    # Máscara do "objeto/mascote": pixels saturados OU coloridos OU escuros.
    # Tudo que claramente NÃO é xadrez.
    obj_mask = (
        (a > 200)
        & ~bg_mask
        & ((mx - mn) > 16) | (mn < 200)
    ) & (a > 0)
    # Dilata o objeto pra capturar brancos internos (olhos, sorriso, brilhos)
    # — qualquer pixel branco dentro de ~12px do objeto é mantido.
    obj_dilated = ndimage.binary_dilation(obj_mask, iterations=12)

    # bg_final = só pixels claros que NÃO estão perto do objeto.
    bg_final = bg_mask & ~obj_dilated

    # Cria alpha novo: onde é fundo → 0, resto mantém alpha
    new_alpha = a.copy()
    new_alpha[bg_final] = 0

    # Suaviza borda: erode 1px e blur leve
    alpha_im = Image.fromarray(new_alpha)
    alpha_im = alpha_im.filter(ImageFilter.MinFilter(3))
    alpha_im = alpha_im.filter(ImageFilter.GaussianBlur(0.8))
    new_alpha = np.array(alpha_im)

    # Reconstrói RGBA
    out_arr = arr.copy()
    out_arr[..., 3] = new_alpha
    out_im = Image.fromarray(out_arr, "RGBA")

    # Crop pra bbox + 2% padding
    bbox = out_im.getbbox()
    if bbox:
        x0, y0, x1, y1 = bbox
        pad = int(0.02 * max(w, h))
        x0 = max(0, x0 - pad)
        y0 = max(0, y0 - pad)
        x1 = min(w, x1 + pad)
        y1 = min(h, y1 + pad)
        out_im = out_im.crop((x0, y0, x1, y1))

    if dry_run:
        return {
            "path": str(img_path),
            "removed_pixels": int(bg_final.sum()),
        }

    # Backup original
    originals_dir = img_path.parent / "_originals"
    originals_dir.mkdir(exist_ok=True)
    backup = originals_dir / img_path.name
    if not backup.exists():
        shutil.copy2(img_path, backup)

    out_im.save(img_path, "PNG", optimize=True)
    return {
        "path": str(img_path),
        "removed_pixels": int(bg_final.sum()),
        "out_size": out_im.size,
        "backup": str(backup),
    }


def main():
    p = argparse.ArgumentParser()
    p.add_argument("targets", nargs="*", help="Arquivo(s) ou dir")
    p.add_argument("--all", action="store_true", help="Todas as PNG em public/illustrations/")
    p.add_argument(
        "--threshold",
        type=float,
        default=5.0,
        help="Só processa se %% xadrez detectado >= threshold (default 5)",
    )
    p.add_argument("--dry-run", action="store_true")
    args = p.parse_args()

    files: list[Path] = []
    if args.all:
        root = Path("public/illustrations")
        files = sorted(root.glob("*.png"))
    else:
        for t in args.targets:
            tp = Path(t)
            if tp.is_dir():
                files.extend(sorted(tp.glob("*.png")))
            else:
                files.append(tp)

    if not files:
        print("Nada pra processar.")
        return

    candidates = []
    for f in files:
        if "_originals" in f.parts:
            continue
        try:
            im = Image.open(f).convert("RGBA")
        except Exception as e:
            print(f"  skip {f.name}: {e}")
            continue
        pct = detect_xadrez_pct(im)
        if pct >= args.threshold:
            candidates.append((f, pct))

    print(f"{len(candidates)} arquivo(s) acima do threshold ({args.threshold}%):")
    for f, pct in candidates:
        print(f"  {pct:5.1f}%  {f.name}")

    if args.dry_run:
        print("\n[dry-run, nada modificado]")
        return

    for f, pct in candidates:
        res = remove_bg(f)
        print(f"  fixed {f.name}: removed {res['removed_pixels']:,} px, "
              f"out_size={res['out_size']}")

    print(f"\nDone. Originais em public/illustrations/_originals/")


if __name__ == "__main__":
    main()
