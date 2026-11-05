"""
Measured solubility curves (proposal 0015, Part I, section 5): x_sat(T) of a solid in a named solvent, used by the
engine in place of the melting-point equation of src/equilibrium/sle.js, only within the measured temperatures
(src/thermo/solubility-curve.js). A route for solids without open melting data (terephthalic acid).

Each curve in CURVES names the solid, the solvent, the measured set it is fitted to (validation/data/sle/<solid>.json,
NIST TRC ThermoML Archive, fetch_sle.py) and the sets left out, with the reason. The form is the one of Apelblat,

    ln x = A + B / T + C ln T,

fitted by linear least squares to ln x (each point equally weighted). Its slope gives the apparent enthalpy of
solution, dH_sol = -R d ln x / d(1/T) = R (C T - B), which the engine uses for the solid's enthalpy
(h_solid = h_liquid - dH_sol; docs/models/crystallizer.md). The record states the largest and the mean deviation
|x_fit / x_meas - 1| and the deviations of the sets left out.

    python validation/python/solubility_curves.py            # fit and print
    python validation/python/solubility_curves.py --write    # also write the curves into src/data/components.json
"""
import argparse
import json
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
COMP_FILE = ROOT / "src" / "data" / "components.json"
SLE_DIR = ROOT / "validation" / "data" / "sle"
R = 8.314462618

CURVES = [
    {
        "solid": "terephthalic-acid", "solvent": "water", "use": "10.1021/je300263z",
        "leave_out": {
            "10.1016/j.fluid.2012.11.023": "far below the chosen set at every temperature both measured: the fit to the chosen set is "
                                          "50 times above it (median of its 13 points in range; 1.63e-5 against 1.77e-3 measured at "
                                          "473 K); held for the maintainer's decision. "
                                          "Su, Zheng, Suga, Watanabe, J. Supercrit. Fluids 218 (2024) 106497 "
                                          "(doi:10.1016/j.supflu.2024.106497, open access CC BY-NC-ND, 423-623 K) would "
                                          "decide: its table could not be fetched by script (docs/missing-properties/TO_DOWNLOAD.md)",
        },
        "why": "The only set measured where the liquid is kept liquid above 373 K (10 MPa) over the range of hot-water "
               "purification; chosen provisionally until Su et al. 2024 is read",
    },
]


def fit(rows):
    T = np.array([r["T_K"] for r in rows]); x = np.array([r["x_solute"] for r in rows])
    M = np.column_stack([np.ones_like(T), 1 / T, np.log(T)])
    (A, B, C), *_ = np.linalg.lstsq(M, np.log(x), rcond=None)
    dev = np.exp(M @ [A, B, C]) / x - 1
    return float(A), float(B), float(C), dev, T


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--write", action="store_true")
    a = ap.parse_args()
    doc = json.loads(COMP_FILE.read_text())
    for c in CURVES:
        data = json.loads((SLE_DIR / f"{c['solid']}.json").read_text())
        sets = [s for s in data["sets"] if s["solvent"] == c["solvent"]]
        chosen = [s for s in sets if s["doi"] == c["use"]]
        assert len(chosen) == 1, c
        rows = chosen[0]["rows"]
        A, B, C, dev, T = fit(rows)
        art = data["articles"][c["use"]]
        Ps = sorted({r.get("P_kPa") for r in rows if r.get("P_kPa") is not None})
        left = []
        for s in sets:
            if s["doi"] == c["use"]:
                continue
            inside = [r for r in s["rows"] if T.min() <= r["T_K"] <= T.max()]
            d = [np.exp(A + B / r["T_K"] + C * np.log(r["T_K"])) / r["x_solute"] - 1 for r in inside]
            left.append({"doi": s["doi"], "points": len(s["rows"]), "points_in_range": len(inside),
                         "median_ratio_fit_over_measured": float(np.median([1 + v for v in d])) if d else None,
                         "reason": c["leave_out"].get(s["doi"], "not stated")})
        rec = {
            "solvent": c["solvent"], "equation": "apelblat", "A": round(A, 6), "B": round(B, 4), "C": round(C, 6),
            "Tmin_K": float(T.min()), "Tmax_K": float(T.max()), "x_range": [min(r["x_solute"] for r in rows), max(r["x_solute"] for r in rows)],
            **({"P_kPa": Ps[0]} if len(Ps) == 1 else {}),
            "tier": "fitted",
            "source": (f"Apelblat form ln x = A + B/T + C ln T fitted to the {len(rows)} measured solubilities of "
                       f"{art['authors'][0].split(',')[0]} et al., {art['journal']} {art['volume']} ({art['year']}), doi:{c['use']} "
                       f"(data public in the NIST TRC ThermoML Archive; validation/data/sle/{c['solid']}.json), "
                       f"{T.min():.1f}-{T.max():.1f} K" + (f" at {Ps[0] / 1000:g} MPa" if len(Ps) == 1 else "") +
                       f"; largest deviation {100 * np.max(np.abs(dev)):.1f} %, mean {100 * np.mean(np.abs(dev)):.1f} % "
                       "(validation/python/solubility_curves.py). " + c["why"] + ". Used only inside the measured "
                       "temperatures; the pressure is not modelled."),
            "left_out": left,
            "source_ids": ["nist-thermoml-archive"],
        }
        print(json.dumps(rec, indent=1))
        if a.write:
            comp = doc["components"][c["solid"]]
            curves = [r for r in comp.get("solubility", []) if r["solvent"] != c["solvent"]] + [rec]
            comp["solubility"] = curves
    if a.write:
        COMP_FILE.write_text(json.dumps(doc, indent=2, ensure_ascii=False) + "\n")
        print("wrote", COMP_FILE.relative_to(ROOT))


if __name__ == "__main__":
    main()
