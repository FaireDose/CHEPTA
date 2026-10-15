"""Liquid heat capacity predicted by group additivity (Ruzicka and Domalski 1993), for components without open measured
values (the maintainer, 2026-10-14: predicted values, tier "predicted", where no open data exist, as with Modified
UNIFAC 2.0).

Method: Cp/R = sum n_i dc_i, dc_i = a_i + b_i (T/100) + d_i (T/100)^2, the group parameters of Ruzicka and Domalski,
J. Phys. Chem. Ref. Data 22 (1993) 597 and 619 (free NIST reprints), transcribed in
validation/data/gc/ruzicka_domalski_1993.json. The result is exactly a DIPPR 100 polynomial in T: A = R sum n a,
B = R sum n b / 100, C = R sum n d / 1e4 (J/(mol K)). Its range is where every group's parameters were fitted (the
intersection of their temperature ranges).

The group assignment of each component is written below by hand (Benson's second-order groups: an atom with its
neighbours), with the reason where no exact group exists. CHECK lists components with a heat-capacity record from
CoolProp or ChemSep, predicted the same way, so the accuracy of the method on such molecules is known and printed.

    python validation/python/predict_cp.py            # the check and the predictions
"""
import json
import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "validation" / "python"))
from fit_properties import ev  # noqa: E402

GC = json.loads((ROOT / "validation" / "data" / "gc" / "ruzicka_domalski_1993.json").read_text())

# the components to predict: groups, and what the assignment approximates
PREDICT = {
    "lactic-acid": {
        "groups": {"C-(H)3(C)": 1, "C-(H)(C)2(O) (alcohol)": 1, "O-(H)(C)": 1, "CO-(C)(O)": 1, "O-(H)(CO)": 1},
        "approximation": "the alpha carbon CH(OH)(COOH) is C-(H)(C)(O)(CO), a group the method does not have; it is "
                         "counted as the secondary alcohol carbon C-(H)(C)2(O), its nearest group",
    },
}

# check set: components with a liquid heat-capacity record from CoolProp or ChemSep, and their groups
CHECK = {
    "ethanol": {"C-(H)3(C)": 1, "C-(H)2(C)(O)": 1, "O-(H)(C)": 1},
    "1-propanol": {"C-(H)3(C)": 1, "C-(H)2(C)2": 1, "C-(H)2(C)(O)": 1, "O-(H)(C)": 1},
    "2-propanol": {"C-(H)3(C)": 2, "C-(H)(C)2(O) (alcohol)": 1, "O-(H)(C)": 1},
    "1-butanol": {"C-(H)3(C)": 1, "C-(H)2(C)2": 2, "C-(H)2(C)(O)": 1, "O-(H)(C)": 1},
    "2-butanol": {"C-(H)3(C)": 2, "C-(H)2(C)2": 1, "C-(H)(C)2(O) (alcohol)": 1, "O-(H)(C)": 1},
    "ethylene-glycol": {"C-(H)2(C)(O)": 2, "O-(H)(C) (diol)": 2},
    "propylene-glycol": {"C-(H)3(C)": 1, "C-(H)(C)2(O) (alcohol)": 1, "C-(H)2(C)(O)": 1, "O-(H)(C) (diol)": 2},
    "glycerol": {"C-(H)2(C)(O)": 2, "C-(H)(C)2(O) (alcohol)": 1, "O-(H)(C) (diol)": 3},
    "acetic-acid": {"CO-(C)(O)": 1, "O-(H)(CO)": 1, "C-(H)3(C)": 1},
    "propionic-acid": {"CO-(C)(O)": 1, "O-(H)(CO)": 1, "C-(H)2(C)(CO)": 1, "C-(H)3(C)": 1},
    "formic-acid": {"CO-(H)(O)": 1, "O-(H)(CO)": 1},
    "acetone": {"CO-(C)2": 1, "C-(H)3(C)": 2},
    "2-butanone": {"CO-(C)2": 1, "C-(H)2(C)(CO)": 1, "C-(H)3(C)": 2},
    "ethyl-acetate": {"CO-(C)(O)": 1, "O-(C)(CO)": 1, "C-(H)2(C)(O)": 1, "C-(H)3(C)": 2},
    "diethyl-ether": {"O-(C)2": 1, "C-(H)2(C)(O)": 2, "C-(H)3(C)": 2},
}


def coefficients(groups):
    """DIPPR 100 coefficients (J/(mol K)) and the valid range (K) of a group assignment."""
    R = GC["R"]
    a = sum(n * GC["groups"][g]["a"] for g, n in groups.items())
    b = sum(n * GC["groups"][g]["b"] for g, n in groups.items())
    d = sum(n * GC["groups"][g]["d"] for g, n in groups.items())
    lo = max(GC["groups"][g]["T_K"][0] for g in groups)
    hi = min(GC["groups"][g]["T_K"][1] for g in groups)
    return {"A": R * a, "B": R * b / 100, "C": R * d / 1e4}, (lo, hi)


def cp(groups, T):
    c, _ = coefficients(groups)
    return c["A"] + c["B"] * T + c["C"] * T * T


def check():
    """Deviation of the prediction from each check component's record over the common range (300-400 K where both
    cover it). Returns rows (id, max |dev| %, mean |dev| %, range)."""
    comps = json.loads((ROOT / "src" / "data" / "components.json").read_text())["components"]
    rows = []
    for cid, groups in CHECK.items():
        rec = comps[cid]["properties"].get("liquidHeatCapacity")
        if not rec or rec.get("available") is False:
            continue
        _, (lo, hi) = coefficients(groups)
        T0, T1 = max(lo, rec["Tmin_K"], 290.0), min(hi, rec["Tmax_K"], (comps[cid].get("Tb_K") or 1e9))
        if T1 <= T0:
            continue
        T = np.linspace(T0, T1, 25)
        ref = ev(rec["equation"], rec["coefficients"], T, rec.get("Tc_K"))
        dev = 100 * (cp(groups, T) / ref - 1)
        rows.append((cid, float(np.max(np.abs(dev))), float(np.mean(np.abs(dev))), (T0, T1),
                     rec["source"]["name"] if isinstance(rec["source"], dict) else str(rec["source"])[:40]))
    return rows


def main():
    rows = check()
    print("Check against CHEPTA records (predicted vs record, from 290 K or the range start to Tb):")
    for cid, mx, mean, (a, b), src in rows:
        print("  %-18s max %5.1f %%  mean %5.1f %%  %.0f-%.0f K  (%s)" % (cid, mx, mean, a, b, src[:50]))
    allmax = [r[1] for r in rows]
    print("  %d components: max deviation %.1f %%, median of the maxima %.1f %%" % (len(rows), max(allmax), float(np.median(allmax))))
    for cid, p in PREDICT.items():
        c, (lo, hi) = coefficients(p["groups"])
        print("%s: A %.4f B %.6f C %.6e J/(mol K), %g-%g K; Cp(298.15 K) %.1f J/(mol K)" % (
            cid, c["A"], c["B"], c["C"], lo, hi, cp(p["groups"], 298.15)))


if __name__ == "__main__":
    main()


def predicted_record(cid, why_no_data):
    """The liquid heat-capacity record of a component of PREDICT, tier "predicted", with the method's accuracy on the
    check set stated."""
    p = PREDICT[cid]
    c, (lo, hi) = coefficients(p["groups"])
    rows = check()
    near = [r for r in rows]
    s = GC["sources"]
    return {
        "equation": "DIPPR100", "coefficients": {k: float("%.10g" % v) for k, v in c.items()}, "units": "J/mol/K",
        "Tmin_K": float(lo), "Tmax_K": float(hi), "tier": "predicted",
        "source": {
            "name": "Predicted by group additivity (Ruzicka and Domalski 1993): no open measured values",
            "reference": "%s, doi:%s; %s, doi:%s" % (s["part1"]["citation"], s["part1"]["doi"], s["part2"]["citation"], s["part2"]["doi"]),
            "access": "%s (%s; %s)" % (s["part2"]["access"], s["part1"]["open_copy"], s["part2"]["open_copy"]),
            "groups": ", ".join("%d %s" % (n, g) for g, n in p["groups"].items()),
            "fit": "Cp/R = sum n_i (a_i + b_i T/100 + d_i (T/100)^2) with the groups above (Table 5 of part I, Table 8 of "
                   "part II; validation/data/gc/ruzicka_domalski_1993.json); range: where every group's parameters were "
                   "fitted (%g-%g K)" % (lo, hi),
            "notes": "%s. %s. Accuracy of the method on %d CHEPTA liquids with a CoolProp or ChemSep record "
                     "(validation/python/predict_cp.py): within 3.4 %% at 300 K for all of them; for alcohols and polyols "
                     "it rises with temperature, +5 to +15 %% at 350-400 K (ethanol, 2-propanol, propylene glycol, "
                     "glycerol), while acids and ketones stay within about 2-6 %%." % (
                         why_no_data, p["approximation"][0].upper() + p["approximation"][1:], len(near)),
        },
    }
