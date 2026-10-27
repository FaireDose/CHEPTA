"""How far a fitted vapour-pressure curve may be extended to the normal boiling point (the maintainer, 2026-10-25).

A component built from measured data (measured_components.py) has a vapour-pressure record over the measured
temperatures only. When the measured values stop short of 101.325 kPa, its normal boiling point needs the curve to go a
little beyond them. This script measures what such an extension costs, on curves whose answer is known:

- reference curves: CoolProp 8.0.0 (reference equations of state from the cited literature), 22 liquids of several
  families (water, alcohols, a ketone, ethers, aromatics, alkanes, siloxanes, methyl esters);
- for each, a "measured set" like the articles': 10 values spread evenly in 1/T over a factor of 30 in pressure, ending
  at a chosen last pressure, with 0.5 % or 1 % random scatter (the usual stated uncertainties), 200 times;
- each set fitted with CHEPTA's form, ln P = A + B/T + C ln T (DIPPR 101 with D = 0), extended to 101.325 kPa, and
  compared with CoolProp's normal boiling point.

The result, the 95th percentile of the error for each liquid, is written to
validation/data/pure/tb_extrapolation_check.json; measured_components.py reads it for the error it states. The rule
it supports (docs/DATA_RULES.md section 3): the curve is extended to 101.325 kPa only when the last measured value is
at 50 kPa or more, where the error stays within about 1-2.5 K; below 20 kPa it reaches several kelvin, and tens of
kelvin for some liquids.

    python validation/python/tb_extrapolation_check.py [--write]
"""
import argparse
import json
from pathlib import Path

import numpy as np
import CoolProp
import CoolProp.CoolProp as CP
from scipy.optimize import brentq

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "validation" / "data" / "pure" / "tb_extrapolation_check.json"
FLUIDS = ["Water", "Methanol", "Ethanol", "n-Propanol", "1-Butanol", "Acetone", "Benzene", "Toluene", "n-Hexane",
          "n-Octane", "n-Decane", "n-Dodecane", "Cyclohexane", "EthylBenzene", "m-Xylene", "DimethylEther",
          "MethylLinoleate", "MethylOleate", "Dichloroethane", "DiethylEther", "MD2M", "D4"]
LAST_KPA = (95, 80, 50, 20, 7, 3, 1)
SCATTER = (0.005, 0.01)
N_POINTS, SPAN, TRIALS = 10, 30.0, 200


def tsat(f, p_kpa):
    return CP.PropsSI("T", "P", p_kpa * 1e3, "Q", 0, f)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--write", action="store_true")
    a = ap.parse_args()
    rng = np.random.default_rng(1)
    rows, used = [], []
    for f in FLUIDS:
        try:
            Tb = tsat(f, 101.325)
            tsat(f, LAST_KPA[-1] / SPAN)
        except ValueError:
            continue   # the reference equation does not reach that low a pressure: left out
        used.append(f)
        for pend in LAST_KPA:
            T1, T2 = tsat(f, pend / SPAN), tsat(f, pend)
            T = 1 / np.linspace(1 / T1, 1 / T2, N_POINTS)
            P0 = np.array([CP.PropsSI("P", "T", t, "Q", 0, f) for t in T])
            X = np.c_[np.ones(N_POINTS), 1 / T, np.log(T)]
            for s in SCATTER:
                err = []
                for _ in range(TRIALS):
                    A, B, C = np.linalg.lstsq(X, np.log(P0 * (1 + s * rng.standard_normal(N_POINTS))), rcond=None)[0]
                    g = lambda t: A + B / t + C * np.log(t) - np.log(101325.0)  # noqa: E731
                    try:
                        err.append(brentq(g, T2, T2 + 400) - Tb)
                    except ValueError:
                        err.append(np.nan)   # the fitted curve does not reach 101.325 kPa within 400 K
                err = np.abs(np.array(err))
                miss = float(np.mean(np.isnan(err)))
                # more than 5 % of the trials without a boiling point: no 95th percentile (null)
                e95 = None if miss > 0.05 else round(float(np.nanpercentile(err, 95)), 2)
                rows.append({"fluid": f, "last_kPa": pend, "scatter": s, "K_below_Tb": round(Tb - T2, 2),
                             "error95_K": e95, "trials_without_Tb": round(miss, 3)})
    summary = []
    for pend in LAST_KPA:
        for s in SCATTER:
            r = [x for x in rows if x["last_kPa"] == pend and x["scatter"] == s]
            e = [np.inf if x["error95_K"] is None else x["error95_K"] for x in r]
            summary.append({"last_kPa": pend, "scatter": s,
                            "median_K_below_Tb": round(float(np.median([x["K_below_Tb"] for x in r])), 1),
                            "error95_K_median_fluid": round(float(np.median(e)), 2),
                            # null: for at least one liquid the extended curve often does not reach 101.325 kPa
                            "error95_K_worst_fluid": None if np.isinf(max(e)) else round(float(np.max(e)), 2)})
            print("last value at %3d kPa (%5.1f K below Tb), scatter %.1f %%: error %5.2f K (median fluid), "
                  "%5.2f K (worst)" % (pend, summary[-1]["median_K_below_Tb"], 100 * s,
                                       summary[-1]["error95_K_median_fluid"],
                                       summary[-1]["error95_K_worst_fluid"] or float("inf")))
    if a.write:
        OUT.write_text(json.dumps({
            "about": "Error of a normal boiling point taken from a vapour-pressure curve extended beyond the last "
                     "measured value (validation/python/tb_extrapolation_check.py; docs/DATA_RULES.md section 3). "
                     "error95_K: the 95th percentile of |Tb(fitted, extended) - Tb(CoolProp)| over %d trials." % TRIALS,
            "reference": "CoolProp %s" % CoolProp.__version__,
            "fluids": used, "points_per_set": N_POINTS, "pressure_span": SPAN,
            "summary": summary, "rows": rows}, indent=1) + "\n")
        print("written", OUT.relative_to(ROOT))


if __name__ == "__main__":
    main()
