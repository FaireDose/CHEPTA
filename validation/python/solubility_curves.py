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
        "disputed": "Disputed: Sunsandee et al. 2013 is about 50 times lower; Takebayashi 2012 kept by the maintainer's "
                    "decision (2026-11-05), Su et al. 2024 (CC BY-NC-ND) to be used as an independent check when a person has "
                    "downloaded it (src/data/known-issues.json, disputed-data).",
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


# the automatic curves (2026-11-05, the maintainer: "at least 10-15-20 more"): every solid + solvent pair of
# validation/data/sle/ with at least MIN_POINTS points over MIN_SPAN_K, except the pairs of CURVES (chosen by hand) and the
# pairs that have an NRTL set fitted to the same solubilities (fit_sle.py: both would describe the same data). Several
# articles are pooled only when they agree: each article's median deviation from the pooled curve within AGREE (this
# project's choice, for the maintainer to confirm); otherwise the pair is held, with the articles' deviations listed.
MIN_POINTS, MIN_SPAN_K, AGREE = 5, 10.0, 0.10


def fit_weighted(arts):
    """The Apelblat form fitted to several articles, each with the same total weight (1/sqrt(n) per point)."""
    T = np.array([t for v in arts.values() for t, _ in v]); x = np.array([y for v in arts.values() for _, y in v])
    w = np.array([1 / np.sqrt(len(v)) for v in arts.values() for _ in v])
    M = np.column_stack([np.ones_like(T), 1 / T, np.log(T)])
    (A, B, C), *_ = np.linalg.lstsq(M * w[:, None], np.log(x) * w, rcond=None)
    per = {doi: [float(np.exp(A + B / t + C * np.log(t)) / y - 1) for t, y in v] for doi, v in arts.items()}
    return float(A), float(B), float(C), per, T


def auto_curves(doc, report):
    binaries = json.loads((ROOT / "src" / "data" / "binaries.json").read_text())["pairs"]
    sle_sets = {(p["i"], p["j"]) for p in binaries if p.get("set") == "fitted-sle-thermoml"}
    manual = {(c["solid"], c["solvent"]) for c in CURVES}
    out = {}
    for f in sorted(SLE_DIR.glob("*.json")):
        data = json.loads(f.read_text())
        solid = data["solid"]
        by = {}
        for st in data["sets"]:
            for r in st["rows"]:
                by.setdefault(st["solvent"], {}).setdefault(st["doi"], []).append((r["T_K"], r["x_solute"]))
        for solvent, arts in sorted(by.items()):
            n = sum(len(v) for v in arts.values()); Ts = [t for v in arts.values() for t, _ in v]
            key = (solid, solvent)
            if key in manual:
                continue
            if key in sle_sets:
                report.append(f"| {solid} | {solvent} | {n} ({len(arts)}) | {min(Ts):.1f}-{max(Ts):.1f} | | not written: an NRTL set fitted to the same solubilities (fit_sle.py) describes it |")
                continue
            if n < MIN_POINTS or max(Ts) - min(Ts) < MIN_SPAN_K:
                report.append(f"| {solid} | {solvent} | {n} ({len(arts)}) | {min(Ts):.1f}-{max(Ts):.1f} | | too few data ({n} points over {max(Ts) - min(Ts):.1f} K) |")
                continue
            # articles with one point and others with series: the single points are kept as checks, not fitted
            series = {d: v for d, v in arts.items() if len(v) >= 3} or arts
            A, B, C, per, T = fit_weighted(series)
            med = {d: float(np.median(np.abs(v))) for d, v in per.items()}
            if len(series) > 1 and max(med.values()) > AGREE:
                report.append(f"| {solid} | {solvent} | {n} ({len(arts)}) | {min(Ts):.1f}-{max(Ts):.1f} | {', '.join(f'{d}: {100 * m:.0f} %' for d, m in med.items())} | held: the articles disagree (a median deviation above {100 * AGREE:.0f} % from the pooled curve) |")
                continue
            allv = [abs(v) for d in per.values() for v in d]
            checks = {d: [float(np.exp(A + B / t + C * np.log(t)) / y - 1) for t, y in v if T.min() <= t <= T.max()] for d, v in arts.items() if d not in series}
            refs = []
            for d in series:
                c = data["articles"].get(d, {})
                refs.append("%s, %s %s (%s), doi:%s" % ((c.get("authors") or ["?"])[0].split(",")[0], c.get("journal", ""), c.get("volume", ""), c.get("year", ""), d))
            rec = {"solvent": solvent, "equation": "apelblat", "A": round(A, 6), "B": round(B, 4), "C": round(C, 6),
                   "Tmin_K": float(T.min()), "Tmax_K": float(T.max()), "tier": "fitted",
                   "source": (f"Apelblat form ln x = A + B/T + C ln T fitted to {sum(len(v) for v in series.values())} measured solubilities of "
                              f"{len(series)} article{'s' if len(series) > 1 else ''} (data public in the NIST TRC ThermoML Archive; "
                              f"validation/data/sle/{solid}.json), {T.min():.1f}-{T.max():.1f} K, each article with the same weight: "
                              + "; ".join(refs) + f". Largest deviation {100 * max(allv):.1f} %, median {100 * float(np.median(allv)):.1f} %"
                              + ("; the articles agree (each within %d %% of the pooled curve)" % round(100 * AGREE) if len(series) > 1 else "; one article only")
                              + " (validation/python/solubility_curves.py). Used only inside the measured temperatures."),
                   **({"checks": {d: (float(np.median(v)) if v else None) for d, v in checks.items()}} if checks else {}),
                   "solution_enthalpy": "the apparent enthalpy of solution from the curve's slope, R (C T - B), for the solid's enthalpy (the maintainer, 2026-11-05)",
                   "source_ids": ["nist-thermoml-archive"]}
            out.setdefault(solid, []).append(rec)
            report.append(f"| {solid} | {solvent} | {n} ({len(arts)}) | {T.min():.1f}-{T.max():.1f} | largest {100 * max(allv):.1f} %, median {100 * float(np.median(allv)):.1f} % | written |")
    return out


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
                       "temperatures; the pressure is not modelled" + (f": measured at {Ps[0] / 1000:g} MPa, used at every pressure." if len(Ps) == 1 else ".")),
            "left_out": left,
            **({"disputed": c["disputed"]} if c.get("disputed") else {}),
            "solution_enthalpy": "the apparent enthalpy of solution from the curve's slope, R (C T - B), for the solid's enthalpy "
                                 "(the maintainer, 2026-11-05)",
            "pressure_note": (f"measured at {Ps[0] / 1000:g} MPa and used at every pressure (the maintainer, 2026-11-05)" if len(Ps) == 1 else None),
            "source_ids": ["nist-thermoml-archive"],
        }
        print(json.dumps(rec, indent=1))
        if a.write:
            comp = doc["components"][c["solid"]]
            curves = [r for r in comp.get("solubility", []) if r["solvent"] != c["solvent"]] + [rec]
            comp["solubility"] = curves
    report = ["# Measured solubility curves", "", "Generated by `validation/python/solubility_curves.py` (proposal 0015, section 5): the Apelblat "
              "curves of solids in named solvents from the measured solubilities of the NIST TRC ThermoML Archive "
              "(`validation/data/sle/`), used in place of the melting-point equation inside their measured temperatures. "
              "Terephthalic acid in water is chosen by hand (the maintainer, 2026-11-05; docs/models/solids.md).", "",
              "| Solid | Solvent | Points (articles) | T range, K | Deviation | Result |", "|---|---|---|---|---|---|"]
    auto = auto_curves(doc, report)
    report += ["", f"{sum(len(v) for v in auto.values())} curves written automatically, for {len(auto)} solids.", ""]
    print("\n".join(report))
    if a.write:
        for solid, recs in auto.items():
            comp = doc["components"][solid]
            keep = [r for r in comp.get("solubility", []) if (solid, r["solvent"]) in {(c["solid"], c["solvent"]) for c in CURVES}]
            comp["solubility"] = keep + recs
        # a solid whose automatic curves all went (data or rules changed) keeps only its hand-chosen ones
        for solid, comp in doc["components"].items():
            if comp.get("solubility") and solid not in auto:
                comp["solubility"] = [r for r in comp["solubility"] if (solid, r["solvent"]) in {(c["solid"], c["solvent"]) for c in CURVES}]
                if not comp["solubility"]:
                    del comp["solubility"]
        (ROOT / "docs" / "SOLUBILITY_CURVES.md").write_text("\n".join(report))
        COMP_FILE.write_text(json.dumps(doc, indent=2, ensure_ascii=False) + "\n")
        print("wrote", COMP_FILE.relative_to(ROOT))


if __name__ == "__main__":
    main()
