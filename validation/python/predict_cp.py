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
ALC = "C-(H)(C)2(O) (alcohol)"
DIOL = "O-(H)(C) (diol)"
NEAR_ALPHA = ("a carbon bearing OH next to a carboxyl, C-(H)(C)(O)(CO), is a group the method does not have; it is "
              "counted as the secondary alcohol carbon C-(H)(C)2(O), its nearest group")
POLYOL = ("the authors note that their estimates for diols and 1,2,3-propanetriol are poor (part II, p. 641); for "
          "polyols the check below shows the prediction rising above the records with temperature")
ETHER_CH = "C-(H)(C)2(O) (ether, ester)"
LACTATE = ("the alpha carbon CH(OH)(COOR) is C-(H)(C)(O)(CO), a group the method does not have; it is counted as the "
           "secondary alcohol carbon C-(H)(C)2(O), its nearest group, as for lactic acid")
# a group used beyond the range where it was fitted, up to the temperature where checks on CHEPTA liquids with records
# hold it within the method's accuracy (ether_check below)
EXTENDED = {ETHER_CH: 380.0}
FURAN = ("the furan ring is counted as the authors count furan: ring carbons as CB groups, the ring oxygen as O-(CB)2, "
         "plus the furan ring strain correction (part II, Table 3)")
PREDICT = {
    "lactic-acid": {
        "groups": {"C-(H)3(C)": 1, ALC: 1, "O-(H)(C)": 1, "CO-(C)(O)": 1, "O-(H)(CO)": 1},
        "approximation": "the alpha carbon CH(OH)(COOH) is C-(H)(C)(O)(CO), a group the method does not have; it is "
                         "counted as the secondary alcohol carbon C-(H)(C)2(O), its nearest group",
    },
    "glucose": {
        "groups": {"CO-(H)(C)": 1, ALC: 4, "C-(H)2(C)(O)": 1, DIOL: 5},
        "approximation": "glucose is counted in its open-chain (aldehyde) form: in solution it is mostly the six-membered "
                         "ring, whose anomeric carbon C-(H)(C)(O)2 the method has no group for; the carbon next to the "
                         "aldehyde, C-(H)(C)(CO)(O), is counted as C-(H)(C)2(O); " + POLYOL,
    },
    "fructose": {
        "groups": {"CO-(C)2": 1, ALC: 3, "C-(H)2(C)(O)": 2, DIOL: 5},
        "approximation": "fructose is counted in its open-chain (ketone) form, for the reason given for glucose; the "
                         "carbon C-(H)2(CO)(O) next to the ketone is counted as C-(H)2(C)(O), and C-(H)(C)(CO)(O) as "
                         "C-(H)(C)2(O); " + POLYOL,
    },
    "sorbitol": {"groups": {"C-(H)2(C)(O)": 2, ALC: 4, DIOL: 6},
                 "approximation": "every group exists in the method; " + POLYOL},
    "xylose": {
        "groups": {"CO-(H)(C)": 1, ALC: 3, "C-(H)2(C)(O)": 1, DIOL: 4},
        "approximation": "xylose is counted in its open-chain (aldehyde) form, for the reason given for glucose; the "
                         "carbon next to the aldehyde, C-(H)(C)(CO)(O), is counted as C-(H)(C)2(O); " + POLYOL,
    },
    "muconic-acid": {
        "groups": {"Cd-(H)(CO)": 2, "Cd-(H)(C)": 2, "CO-(Cd)(O)": 2, "O-(H)(CO)": 2},
        "approximation": "the two inner carbons of the conjugated diene, Cd-(H)(Cd), are a group the method does not "
                         "have; they are counted as Cd-(H)(C), its nearest group; the method does not tell cis from trans",
    },
    "xylitol": {"groups": {"C-(H)2(C)(O)": 2, ALC: 3, DIOL: 5},
                "approximation": "every group exists in the method; " + POLYOL},
    "erythritol": {"groups": {"C-(H)2(C)(O)": 2, ALC: 2, DIOL: 4},
                   "approximation": "every group exists in the method; " + POLYOL},
    "succinic-acid": {"groups": {"C-(H)2(C)(CO)": 2, "CO-(C)(O)": 2, "O-(H)(CO)": 2},
                      "approximation": "every group exists in the method"},
    "itaconic-acid": {
        "groups": {"Cd-(H)2": 1, "Cd-(C)(CO)": 1, "C-(H)2(C)(CO)": 1, "CO-(Cd)(O)": 1, "CO-(C)(O)": 1, "O-(H)(CO)": 2},
        "approximation": "the CH2 between the double bond and the carboxyl, C-(H)2(Cd)(CO), is counted as C-(H)2(C)(CO)",
    },
    "fumaric-acid": {"groups": {"Cd-(H)(CO)": 2, "CO-(Cd)(O)": 2, "O-(H)(CO)": 2},
                     "approximation": "every group exists in the method (it does not tell cis from trans)"},
    "malic-acid": {"groups": {ALC: 1, "C-(H)2(C)(CO)": 1, "CO-(C)(O)": 2, "O-(H)(CO)": 2, "O-(H)(C)": 1},
                   "approximation": NEAR_ALPHA},
    "citric-acid": {
        "groups": {"C-(C)3(O) (alcohol)": 1, "C-(H)2(C)(CO)": 2, "CO-(C)(O)": 3, "O-(H)(CO)": 3, "O-(H)(C)": 1},
        "approximation": "the central carbon C-(C)2(CO)(O) is counted as the tertiary alcohol carbon C-(C)3(O), its "
                         "nearest group",
    },
    "glycolic-acid": {"groups": {"C-(H)2(C)(O)": 1, "CO-(C)(O)": 1, "O-(H)(CO)": 1, "O-(H)(C)": 1},
                      "approximation": "the carbon C-(H)2(CO)(O) is counted as C-(H)2(C)(O), its nearest group"},
    "glucaric-acid": {"groups": {ALC: 4, "CO-(C)(O)": 2, "O-(H)(CO)": 2, DIOL: 4},
                      "approximation": "the two carbons next to the carboxyls, C-(H)(C)(CO)(O), are counted as "
                                       "C-(H)(C)2(O); " + POLYOL},
    "3-hydroxypropionic-acid": {
        "groups": {"C-(H)2(C)(O)": 1, "C-(H)2(C)(CO)": 1, "CO-(C)(O)": 1, "O-(H)(CO)": 1, "O-(H)(C)": 1},
        "approximation": "every group exists in the method"},
    "fdca": {"groups": {"CB-(H)": 2, "CB-(CO)": 2, "O-(CB)2": 1, "furan rsc": 1, "CO-(CB)(O)": 2, "O-(H)(CO)": 2},
             "approximation": FURAN},
    "bhet": {"groups": {"CB-(H)": 4, "CB-(CO)": 2, "CO-(CB)(O)": 2, "O-(C)(CO)": 2, "C-(H)2(C)(O)": 4, DIOL: 2},
             "approximation": "every group exists in the method"},
    "diphenolic-acid": {
        "groups": {"CB-(H)": 8, "CB-(O)": 2, "O-(H)(CB)": 2, "CB-(C)": 2, "C-(C)4": 1, "C-(H)3(C)": 1, "C-(H)2(C)2": 1,
                   "C-(H)2(C)(CO)": 1, "CO-(C)(O)": 1, "O-(H)(CO)": 1},
        "approximation": "the quaternary carbon C-(C)2(CB)2 is counted as C-(C)4, its nearest group",
    },
    "hmf": {"groups": {"CB-(H)": 2, "CB-(C)": 1, "CB-(CO)": 1, "O-(CB)2": 1, "furan rsc": 1, "C-(H)2(CB)(O)": 1,
                       "O-(H)(C)": 1, "CO-(H)(Cd)": 1},
            "approximation": FURAN + "; the aldehyde CO-(H)(CB) is counted as CO-(H)(Cd), as the authors do (part II, "
                             "Table 2)"},
    # terephthalic acid: a liquid that does not evaporate up to an assumed melting temperature of 400 degC (the
    # maintainer, 2026-10-17: "assume the melting is at 400 and keep it liquid until then"; no open source has its
    # melting temperature)
    "p-terphenyl": {"groups": {"CB-(H)": 14, "CB-(C)": 4},
                    "approximation": "the four ring carbons bonded to another ring, CB-(CB), a group the method does not "
                                     "have, are counted as CB-(C), its nearest group (a ring carbon bonded to a carbon)"},
    "terephthalic-acid": {"groups": {"CB-(H)": 4, "CB-(CO)": 2, "CO-(CB)(O)": 2, "O-(H)(CO)": 2},
                          "approximation": "every group exists in the method",
                          "Tmax_K": 673.15,
                          "Tmax_why": "the maintainer's choice (2026-10-17): terephthalic acid is kept a liquid up to an "
                                      "assumed melting temperature of 400 degC (673.15 K), so the record runs to it, 73 K "
                                      "beyond the authors' 100 K extrapolation; the ECHA registration dossier (free to "
                                      "read) reports sublimation at 402-404 degC and melting at 427 degC in a sealed tube"},
    # the components of batches 1-3 without open measured heat capacities over a temperature range (2026-10-17)
    "furan": {"groups": {"CB-(H)": 4, "O-(CB)2": 1, "furan rsc": 1}, "approximation": FURAN},
    "2-methylfuran": {"groups": {"CB-(H)": 3, "CB-(C)": 1, "O-(CB)2": 1, "furan rsc": 1, "C-(H)3(C)": 1},
                      "approximation": FURAN + "; the methyl group C-(H)3(CB) is C-(H)3(C), an equivalence of the method "
                                               "(part I, Table 2)"},
    "furfuryl-alcohol": {"groups": {"CB-(H)": 3, "CB-(C)": 1, "O-(CB)2": 1, "furan rsc": 1, "C-(H)2(CB)(O)": 1, "O-(H)(C)": 1},
                         "approximation": FURAN},
    "thfa": {"groups": {"O-(C)2": 1, "C-(H)2(C)(O)": 2, "C-(H)2(C)2": 2, ETHER_CH: 1, "O-(H)(C)": 1, "tetrahydrofuran rsc": 1},
             "approximation": "the ring is counted as tetrahydrofuran with its ring strain correction (part II, Table 9)"},
    "cpme": {"groups": {"C-(H)3(C)": 1, "O-(C)2": 1, ETHER_CH: 1, "C-(H)2(C)2": 4, "cyclopentane (sub) rsc": 1},
             "approximation": "the methyl group C-(H)3(O) is C-(H)3(C), an equivalence of the method (part II, Table 2); the "
                              "ring is counted with the substituted cyclopentane ring strain correction (part I, Table 6)"},
    "methyl-lactate": {"groups": {"C-(H)3(C)": 2, ALC: 1, "O-(H)(C)": 1, "CO-(C)(O)": 1, "O-(C)(CO)": 1},
                       "approximation": LACTATE + "; the methoxy group C-(H)3(O) is C-(H)3(C), an equivalence of the method "
                                                  "(part II, Table 2)"},
    "ethyl-lactate": {"groups": {"C-(H)3(C)": 2, ALC: 1, "O-(H)(C)": 1, "CO-(C)(O)": 1, "O-(C)(CO)": 1, "C-(H)2(C)(O)": 1},
                      "approximation": LACTATE},
    "limonene": {"groups": {"Cd-(C)2": 2, "Cd-(H)(C)": 1, "Cd-(H)2": 1, "C-(H)2(C)(Cd)": 2, "C-(H)(C)2(Cd)": 1,
                            "C-(H)2(C)2": 1, "C-(H)3(C)": 2, "cyclohexene rsc": 1},
                 "approximation": "the methyl groups on double-bonded carbons, C-(H)3(Cd), are C-(H)3(C), an equivalence of "
                                  "the method (part I, Table 2); the ring is counted with the cyclohexene ring strain "
                                  "correction (part I, Table 6); the method does not tell the enantiomers apart"},
    "triolein": {"groups": {"C-(H)2(C)(O)": 2, ETHER_CH: 1, "O-(C)(CO)": 3, "CO-(C)(O)": 3, "C-(H)2(C)(CO)": 3,
                            "C-(H)2(C)2": 33, "C-(H)2(C)(Cd)": 6, "Cd-(H)(C)": 6, "C-(H)3(C)": 3},
                 "approximation": "every group exists in the method (it does not tell cis from trans)"},
    "tripalmitin": {"groups": {"C-(H)2(C)(O)": 2, ETHER_CH: 1, "O-(C)(CO)": 3, "CO-(C)(O)": 3, "C-(H)2(C)(CO)": 3,
                               "C-(H)2(C)2": 39, "C-(H)3(C)": 3},
                    "approximation": "every group exists in the method"},
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
    "diethylene-glycol": {"O-(C)2": 1, "C-(H)2(C)(O)": 4, "O-(H)(C) (diol)": 2},
    "furfural": {"CB-(H)": 3, "CB-(CO)": 1, "O-(CB)2": 1, "furan rsc": 1, "CO-(H)(Cd)": 1},
    "phenol": {"CB-(H)": 5, "CB-(O)": 1, "O-(H)(CB)": 1},
    "benzoic-acid": {"CB-(H)": 5, "CB-(CO)": 1, "CO-(CB)(O)": 1, "O-(H)(CO)": 1},
    "acrylic-acid": {"Cd-(H)2": 1, "Cd-(H)(CO)": 1, "CO-(Cd)(O)": 1, "O-(H)(CO)": 1},
}


def coefficients(groups, extrapolate=False):
    """DIPPR 100 coefficients (J/(mol K)) and the range (K) where every group's parameters were fitted; with
    extrapolate, the upper end raised by the extrapolation the authors allow (part II, p. 620)."""
    R = GC["R"]
    a = sum(n * GC["groups"][g]["a"] for g, n in groups.items())
    b = sum(n * GC["groups"][g]["b"] for g, n in groups.items())
    d = sum(n * GC["groups"][g]["d"] for g, n in groups.items())
    lo = max(GC["groups"][g]["T_K"][0] for g in groups)
    others = [GC["groups"][g]["T_K"][1] for g in groups if g not in EXTENDED]
    hi = min(others) if others else min(EXTENDED[g] for g in groups)
    if extrapolate:
        hi += GC["extrapolation_K"]
    # a group of EXTENDED: up to the temperature where the checks hold it (ether_check), not its own range
    ext = [EXTENDED[g] for g in groups if g in EXTENDED]
    if ext:
        hi = min(hi, min(ext))
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


def accuracy():
    """The method's accuracy on the check set, in words, computed here (deviations from the records at 300, 350 and
    400 K, where both the record and the groups' range cover the temperature); and the furan-ring extrapolation check
    (furfural, from the end of the ring correction's range to 100 K above it)."""
    from fit_properties import ev
    comps = json.loads((ROOT / "src" / "data" / "components.json").read_text())["components"]
    dev = {}
    for cid, groups in CHECK.items():
        rec = comps[cid]["properties"]["liquidHeatCapacity"]
        _, (lo, hi) = coefficients(groups)
        for T in (300.0, 350.0, 400.0):
            if rec["Tmin_K"] <= T <= rec["Tmax_K"] and lo <= T <= hi:
                ref = ev(rec["equation"], rec["coefficients"], np.array([T]), rec.get("Tc_K"))[0]
                dev[(cid, T)] = 100 * (cp(groups, T) / ref - 1)
    alcohols = sorted({c for (c, T), v in dev.items() if T > 300 and v > 5})
    at300 = max(abs(v) for (c, T), v in dev.items() if T == 300)
    rest = max(abs(v) for (c, T), v in dev.items() if c not in alcohols)
    alc = ", ".join("%s %s" % (c, "/".join("%+.0f" % dev[(c, T)] for T in (300.0, 350.0, 400.0) if (c, T) in dev))
                    for c in alcohols)
    groups = CHECK["furfural"]
    rec = comps["furfural"]["properties"]["liquidHeatCapacity"]
    _, (lo, hi) = coefficients(groups)
    T = np.linspace(lo, hi + GC["extrapolation_K"], 40)
    furan = float(np.max(np.abs(100 * (cp(groups, T) / ev(rec["equation"], rec["coefficients"], T, rec.get("Tc_K")) - 1))))
    text = ("Accuracy of the method on %d CHEPTA liquids with a CoolProp or ChemSep record (validation/python/predict_cp.py): "
            "within %.1f %% of the records at 300 K for all of them, and within %.1f %% up to 400 K except alcohols and "
            "polyols, which it overpredicts more as the temperature rises (%s %% at 300/350/400 K)" % (
                len(CHECK), at300, rest, alc))
    return text, furan


def ether_check():
    """The group C-(H)(C)2(O) (ether, ester) was fitted at 130-170 K only (part II, Table 8). How it does far above
    that: the prediction against the liquid heat-capacity record of isopropyl acetate (the only CHEPTA liquid with a
    record and this group) every 20 K from the record's start to the cap of EXTENDED, and against the measured heat
    capacities of 2-methyltetrahydrofuran (NIST TRC ThermoML Archive, stated uncertainties 1.5-2 %). Returns the text."""
    from measured_components import ThermoML
    comps = json.loads((ROOT / "src" / "data" / "components.json").read_text())["components"]
    rec = comps["isopropyl-acetate"]["properties"]["liquidHeatCapacity"]
    groups = {"C-(H)3(C)": 3, "CO-(C)(O)": 1, "O-(C)(CO)": 1, ETHER_CH: 1}
    T = np.arange(20 * np.ceil(rec["Tmin_K"] / 20), EXTENDED[ETHER_CH] + 1, 20.0)
    dev = 100 * (cp(groups, T) / ev(rec["equation"], rec["coefficients"], T, rec.get("Tc_K")) - 1)
    mthf = {"C-(H)3(C)": 1, "O-(C)2": 1, "C-(H)2(C)(O)": 1, "C-(H)2(C)2": 2, "tetrahydrofuran rsc": 1, ETHER_CH: 1}
    pts = ThermoML("2-methyltetrahydrofuran").values("liquidHeatCapacity")
    d2 = [100 * (cp(mthf, p["T"]) / p["y"] - 1) for p in pts]
    return ("The group %s was fitted at %g-%g K only (part II, Table 8); it is used up to %g K, where it holds on the CHEPTA "
            "liquids that have it: on isopropyl acetate (ChemSep record) the prediction is %+.1f to %+.1f %% from the "
            "record at %g-%g K, and on 2-methyltetrahydrofuran %+.1f to %+.1f %% from %d measured values at %.0f-%.0f K "
            "(NIST TRC ThermoML Archive)" % (
                ETHER_CH, *GC["groups"][ETHER_CH]["T_K"], EXTENDED[ETHER_CH], min(dev), max(dev), T[0], T[-1],
                min(d2), max(d2), len(pts), min(p["T"] for p in pts), max(p["T"] for p in pts)))


def predicted_record(cid, why_no_data):
    """The liquid heat-capacity record of a component of PREDICT, tier "predicted", with the method's accuracy on the
    check set stated. The range is where every group was fitted, raised by the 100 K the authors allow (part II,
    p. 620), except for polyols: on the check set the polyol groups drift far beyond their range (glycerol)."""
    p = PREDICT[cid]
    polyol = p["groups"].get(DIOL, 0) >= 2
    c, (lo, hi) = coefficients(p["groups"], extrapolate=not polyol)
    _, (lo0, hi0) = coefficients(p["groups"])
    # a nonvolatile component's liquid enthalpy is the integral of cp from 298.15 K, so the record must reach it: the
    # lower end is lowered to 298.15 K where that is within the authors' 100 K (HMF and FDCA: O-(CB)2 starts at 300 K)
    low = 298.15 < lo <= 298.15 + GC["extrapolation_K"]
    if low:
        lo = 298.15
    acc, furan = accuracy()
    s = GC["sources"]
    ext = [g for g in p["groups"] if g in EXTENDED]
    if ext:
        # the range where the other groups were fitted; the extended group is stated below
        hi0 = min(GC["groups"][g]["T_K"][1] for g in p["groups"] if g not in EXTENDED)
    rng = ("where every group's parameters were fitted (%g-%g K)" % (lo0, hi0) if polyol else
           "where every group's parameters were fitted (%g-%g K), raised by %g K, the extrapolation the authors find "
           "has no significant effect on the error (part II, p. 620)" % (lo0, hi0, GC["extrapolation_K"]))
    if polyol:
        rng += "; not raised for a polyol, as the check shows the polyol groups drifting beyond their range"
    if low:
        rng += "; lower end taken down to 298.15 K, the reference temperature of the liquid enthalpy"
    if ext:
        rng = rng.replace("where every group's", "where every other group's") + "; at most %g K, for the group %s" % (
            EXTENDED[ext[0]], ext[0])
    if p.get("Tmax_K"):
        hi = p["Tmax_K"]
        rng += "; upper end %g K: %s" % (hi, p["Tmax_why"])
    notes = "%s. %s. %s." % (why_no_data, p["approximation"][0].upper() + p["approximation"][1:], acc)
    if "furan rsc" in p["groups"]:
        notes += (" The furan ring correction was fitted to 305 K only; on furfural the prediction stays within %.1f %% "
                  "of its record from %g to %g K." % (furan, GC["groups"]["furan rsc"]["T_K"][1] - 5,
                                                         GC["groups"]["furan rsc"]["T_K"][1] + GC["extrapolation_K"]))
    if ext:
        notes += " " + ether_check() + "."
    single = [g for g in p["groups"] if GC["groups"][g].get("single_compound")]
    if single:
        notes += (" The parameters of %s were calculated by the authors from the heat capacities of a single compound "
                  "(their footnote b)." % " and ".join(single))
    return {
        "equation": "DIPPR100", "coefficients": {k: float("%.10g" % v) for k, v in c.items()}, "units": "J/mol/K",
        "Tmin_K": float(lo), "Tmax_K": float(hi), "tier": "predicted",
        "source": {
            "name": "Predicted by group additivity (Ruzicka and Domalski 1993): no open measured values",
            "reference": "%s, doi:%s; %s, doi:%s" % (s["part1"]["citation"], s["part1"]["doi"], s["part2"]["citation"], s["part2"]["doi"]),
            "access": "%s (%s; %s)" % (s["part2"]["access"], s["part1"]["open_copy"], s["part2"]["open_copy"]),
            "groups": ", ".join("%d %s" % (n, g) for g, n in p["groups"].items()),
            "fit": "Cp/R = sum n_i (a_i + b_i T/100 + d_i (T/100)^2) with the groups above (%s of part I, Tables 8 "
                   "and 9 of part II; validation/data/gc/ruzicka_domalski_1993.json); range: %s" % (
                       "Tables 5 and 6" if any(GC["groups"][g]["from"] == "part1-rsc" for g in p["groups"]) else "Table 5", rng),
            "notes": notes,
        },
    }
