"""
Independent reference for the browser fit of the user's own points (src/thermo/user-fit.js, proposal 0012 step 3).

The same least-squares problems, solved with numpy (np.linalg.lstsq, by the singular value decomposition) instead of
the Householder QR of the JavaScript code:
  - DIPPR100 on relative deviations: rows (T/Tmax)^k / y, right-hand side 1;
  - DIPPR101 on ln y: columns 1, 1/T, ln T, (T/Tmax)^E.
The points are the databank's own records (src/data/components.json) evaluated at a few temperatures and rounded to
six significant digits, so that the fits are not exact; no new data.

Writes validation/fixtures/user-fit.json. Usage: python validation/python/reference_user_fit.py
"""
import json
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
COMP = json.loads((ROOT / "src" / "data" / "components.json").read_text())["components"]
OUT = ROOT / "validation" / "fixtures" / "user-fit.json"

# (component, property, temperatures in K, equation, terms, E)
CASES = [
    ("ethanol", "liquidDensity", [280, 293.15, 300, 313.15, 325, 340, 355], "DIPPR100", 2, None),
    ("ethanol", "liquidDensity", [280, 293.15, 300, 313.15, 325, 340, 355], "DIPPR100", 3, None),
    ("benzene", "liquidHeatCapacity", [290, 300, 320, 340, 360, 380, 400], "DIPPR100", 3, None),
    ("ethanol", "heatOfVaporization", [300, 320, 340, 360, 380, 400], "DIPPR100", 3, None),
    ("toluene", "liquidThermalConductivity", [200, 250, 300, 350, 400, 450], "DIPPR100", 4, None),
    ("toluene", "vapourPressure", [300, 315, 330, 345, 360, 375, 380], "DIPPR101", 2, None),
    ("toluene", "vapourPressure", [300, 315, 330, 345, 360, 375, 380], "DIPPR101", 3, None),
    ("toluene", "vapourPressure", [300, 315, 330, 345, 360, 375, 380], "DIPPR101", 4, 2.0),
    ("benzene", "liquidViscosity", [290, 300, 310, 320, 335, 350], "DIPPR101", 3, None),
]


def ev(rec, T):
    c = {k: rec.get("coefficients", rec).get(k, 0.0) for k in "ABCDE"}
    A, B, C, D, E = (c[k] for k in "ABCDE")
    eq = rec["equation"]
    if eq == "DIPPR100":
        return A + T * (B + T * (C + T * (D + T * E)))
    if eq == "DIPPR101":
        return np.exp(A + B / T + C * np.log(T) + D * T ** E)
    if eq == "DIPPR105":
        return A / B ** (1 + (1 - T / C) ** D)
    if eq == "DIPPR106":
        r = T / rec["Tc_K"]
        return A * (1 - r) ** (B + r * (C + r * (D + r * E)))
    raise ValueError(eq)


def record(cid, prop):
    c = COMP[cid]
    if prop == "vapourPressure":
        return c["vapourPressure"]
    r = dict(c["properties"][prop])
    if r["equation"] == "DIPPR106":
        r["Tc_K"] = c["Tc_K"]
    return r


def fit(T, y, eq, terms, E):
    Tmax = T.max()
    if eq == "DIPPR100":
        M = np.vstack([(T / Tmax) ** k / y for k in range(terms)]).T
        x = np.linalg.lstsq(M, np.ones_like(T), rcond=None)[0]
        return {"ABCDE"[k]: float(x[k] / Tmax ** k) for k in range(terms)}
    cols = [np.ones_like(T), 1 / T, np.log(T), (T / Tmax) ** (E or 1)][:terms]
    x = np.linalg.lstsq(np.vstack(cols).T, np.log(y), rcond=None)[0]
    out = {"ABCD"[k]: float(x[k]) for k in range(min(terms, 3))}
    if terms == 4:
        out["D"] = float(x[3] / Tmax ** E)
        out["E"] = float(E)
    return out


def main():
    cases = []
    for cid, prop, Ts, eq, terms, E in CASES:
        T = np.array(Ts, dtype=float)
        y = np.array([float("%.6g" % v) for v in ev(record(cid, prop), T)])
        c = fit(T, y, eq, terms, E)
        dev = ev({"equation": eq, "coefficients": c}, T) / y - 1
        cases.append({"component": cid, "property": prop, "equation": eq, "terms": terms, **({"E": E} if E else {}),
                      "points": [[float(a), float(b)] for a, b in zip(T, y)], "coefficients": c,
                      "maxDev": float(np.abs(dev).max())})
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({"generator": "validation/python/reference_user_fit.py (numpy lstsq)", "cases": cases}, indent=1) + "\n")
    print(f"wrote {OUT.relative_to(ROOT)}: {len(cases)} cases")


if __name__ == "__main__":
    main()
