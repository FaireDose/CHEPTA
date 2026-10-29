"""
Independent reference for the drum and decanter sizes (src/sizing/sizing.js; proposal 0015, Part I section 4 and
contract 4; roadmap E1). The same open formulas, written anew here in plain Python, so that a slip in either is seen:

- vertical drum: M. Fermeglia, "Single stage thermal separation: flash", University of Trieste (2021), slides 83-88;
  M. Bagajewicz, ChE 4253, University of Oklahoma, "Flash drum design" (2013) and "Flash and tray design examples"
  (2018): K = exp(A + B ln F + C ln^2 F + D ln^3 F + E ln^4 F) in ft/s, v_perm = K sqrt((rhoL - rhoV)/rhoV),
  D = sqrt(4 QV / (pi f v_perm)), h_v = max(36 in + d/2, 48 in), h_f = 12 in + d/2, h_L = V_pool / (pi D^2/4),
  H = 3 D when H/D < 3; the feed line d at the lower nozzle velocity 60/sqrt(rho_mix [lb/ft3]) ft/s;
- horizontal drum: A. K. Coker, Oil & Gas Journal (10 May 1993): K_H = 1.25 K_V, the vapour in 20 % of the
  cross-section, a vapour space of at least max(0.2 D, 12 in), L at least 3 D;
- decanter: S. D. Al-Bayati, "Liquid-liquid separators", University of Baghdad: Stokes' law, capped at 4e-3 m/s,
  A_i = L_c / u_d, w = 2 sqrt(H_i D - H_i^2), the dispersion band 10 % of the height.

The segment of a horizontal drum is solved here by Newton's method on its angle (the engine bisects on the height).

Writes validation/fixtures/sizing.json: each case's inputs and the reference results.

Usage: python validation/python/reference_sizing.py
"""
import json
import math
from pathlib import Path

OUT = Path(__file__).resolve().parents[1] / "fixtures" / "sizing.json"
IN, FT, G = 0.0254, 0.3048, 9.80665
LB_FT3 = 0.45359237 / FT ** 3
FIT = (-1.877478, -0.814580, -0.187074, -0.014523, -0.001015)


def k_vertical(F):
    l = math.log(F)
    return math.exp(sum(c * l ** k for k, c in enumerate(FIT))) * FT


def segment_share_height(D, share):
    """Height of the circular segment holding `share` of the circle: area = r^2 (t - sin t)/2, t the central angle."""
    t = math.pi
    for _ in range(100):
        f = (t - math.sin(t)) / (2 * math.pi) - share
        t -= f / ((1 - math.cos(t)) / (2 * math.pi))
    return D / 2 * (1 - math.cos(t / 2))


def segment_area(D, h):
    r = D / 2
    t = 2 * math.acos((r - h) / r)
    return r * r * (t - math.sin(t)) / 2


def drum(c):
    WL, WV, rL, rV = c["WL_kg_s"], c["WV_kg_s"], c["rhoL"], c["rhoV"]
    o = c.get("options", {})
    f = o.get("fraction", 0.85)
    QL, QV = WL / rL, WV / rV
    F = WL / WV * math.sqrt(rV / rL)
    K = o.get("K_m_s") or k_vertical(F) * (1.25 if o.get("orientation") == "horizontal" else 1.0)
    u = f * K * math.sqrt((rL - rV) / rV)
    pool = o["holdup_m3"] if "holdup_m3" in o else QL * 60 * o.get("residence_min", 2)
    AV = QV / u
    if o.get("orientation", "vertical") == "vertical":
        D = math.sqrt(4 * AV / math.pi)
        A = math.pi * D ** 2 / 4
        rho_mix = (WL + WV) / (QL + QV)
        d = o["feedLine_m"] if "feedLine_m" in o else math.sqrt(4 * (QL + QV) / (math.pi * 60 / math.sqrt(rho_mix / LB_FT3) * FT))
        hv, hf = max(36 * IN + d / 2, 48 * IN), 12 * IN + d / 2
        hL = pool / A
        if (hv + hf + hL) / D < 3:
            hL = 3 * D - hv - hf
        return {"F": F, "K_m_s": K, "u_m_s": u, "D_m": D, "H_m": hv + hf + hL, "hL_m": hL, "feedLine_m": d}
    AT = AV / 0.2
    D = math.sqrt(4 * AT / math.pi)
    h = max(segment_share_height(D, 0.2), 0.2 * D, 12 * IN)
    L = max(pool / (AT - segment_area(D, h)), 3 * D)
    return {"F": F, "K_m_s": K, "u_m_s": u, "D_m": D, "L_m": L, "vapourSpace_m": h}


def decanter(c):
    lt, hv = c["light"], c["heavy"]
    o = c.get("options", {})
    disp = o.get("dispersed", "light" if lt["Q_m3_s"] <= hv["Q_m3_s"] else "heavy")
    dp, cp = (lt, hv) if disp == "light" else (hv, lt)
    d = o.get("droplet_um", 150) * 1e-6
    ud = min(G * d ** 2 * (hv["rho"] - lt["rho"]) / (18 * cp["mu"]), 4e-3)
    Ai = cp["Q_m3_s"] / ud
    if o.get("orientation", "vertical") == "vertical":
        r = o.get("ratio", 2)
        D = math.sqrt(4 * Ai / math.pi)
        H, L = r * D, None
    else:
        r, x = o.get("ratio", 4), o.get("interface", 0.5)
        # A_i = w L = 2 D sqrt(x - x^2) * r D
        D = math.sqrt(Ai / (2 * r * math.sqrt(x - x * x)))
        H, L = D, r * D
    out = {"settling_m_s": ud, "interfaceArea_m2": Ai, "D_m": D, "band_residence_s": 0.1 * H / ud,
           "entrainedDrop_m": math.sqrt(18 * dp["mu"] * (dp["Q_m3_s"] / Ai) / (G * (hv["rho"] - lt["rho"])))}
    out["L_m" if L is not None else "H_m"] = L if L is not None else H
    return out


DRUMS = {
    # Bagajewicz (2018), "Flash and tray design examples", with the example's own K = 0.2366 ft/s (0.2365 printed) (which it got with
    # log10 in place of ln in the fit; with ln, K = 0.347 ft/s), at v_perm itself, 2 min of liquid
    "ou-2018-example": {"WL_kg_s": 0.001179 * 999.552, "WV_kg_s": 0.14157 * 1.20139, "rhoL": 999.552, "rhoV": 1.20139,
                        "options": {"fraction": 1, "K_m_s": 0.2366 * 0.3048}},
    "vertical-defaults": {"WL_kg_s": 2.0, "WV_kg_s": 0.6, "rhoL": 780.0, "rhoV": 2.4},
    "vertical-deep-pool": {"WL_kg_s": 30.0, "WV_kg_s": 0.4, "rhoL": 950.0, "rhoV": 0.9, "options": {"residence_min": 5}},
    "vertical-given": {"WL_kg_s": 1.0, "WV_kg_s": 1.0, "rhoL": 700.0, "rhoV": 10.0,
                       "options": {"K_m_s": 0.07, "feedLine_m": 0.15, "holdup_m3": 2.0, "fraction": 0.8}},
    "horizontal-defaults": {"WL_kg_s": 2.0, "WV_kg_s": 0.6, "rhoL": 780.0, "rhoV": 2.4, "options": {"orientation": "horizontal"}},
    "horizontal-large": {"WL_kg_s": 40.0, "WV_kg_s": 12.0, "rhoL": 800.0, "rhoV": 3.0,
                         "options": {"orientation": "horizontal", "residence_min": 10}},
}
DECANTERS = {
    # Al-Bayati, examples 1 (vertical, H = 2D) and 2 (horizontal, L = 4D): light oil dispersed in water
    "albayati-ex1": {"light": {"Q_m3_s": 1000 / 900 / 3600, "rho": 900.0, "mu": 3e-3},
                     "heavy": {"Q_m3_s": 5000 / 1000 / 3600, "rho": 1000.0, "mu": 1e-3}, "options": {"dispersed": "light"}},
    "albayati-ex2": {"light": {"Q_m3_s": 5000 / 900 / 3600, "rho": 900.0, "mu": 3e-3},
                     "heavy": {"Q_m3_s": 25000 / 1000 / 3600, "rho": 1000.0, "mu": 1e-3},
                     "options": {"dispersed": "light", "orientation": "horizontal"}},
    "capped": {"light": {"Q_m3_s": 0.002, "rho": 700.0, "mu": 4e-4}, "heavy": {"Q_m3_s": 0.001, "rho": 1100.0, "mu": 6e-4},
               "options": {"droplet_um": 400}},
    "horizontal-low-interface": {"light": {"Q_m3_s": 0.01, "rho": 860.0, "mu": 1.1e-3}, "heavy": {"Q_m3_s": 0.004, "rho": 1150.0, "mu": 1.05e-3},
                                 "options": {"orientation": "horizontal", "interface": 0.3, "ratio": 5, "dispersed": "heavy"}},
}


def main():
    out = {"_about": "validation/python/reference_sizing.py: the drum and decanter formulas of src/sizing/sizing.js, written anew",
           "drums": {k: {"input": c, "result": drum(c)} for k, c in DRUMS.items()},
           "decanters": {k: {"input": c, "result": decanter(c)} for k, c in DECANTERS.items()}}
    OUT.write_text(json.dumps(out, indent=1) + "\n")
    print(f"wrote {OUT}")
    for k, v in out["drums"].items():
        print(k, {a: round(b, 5) for a, b in v["result"].items()})
    for k, v in out["decanters"].items():
        print(k, {a: round(b, 6) for a, b in v["result"].items()})


if __name__ == "__main__":
    main()
