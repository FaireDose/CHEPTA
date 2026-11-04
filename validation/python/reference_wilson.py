"""Reference values for the Wilson activity model (proposal 0016), written to validation/fixtures/wilson.json.

    python validation/python/reference_wilson.py

Two independent calculations, sharing no code with src/thermo/activity/wilson.js:
  1. the thermo library's Wilson class (thermo.wilson.Wilson, MIT licence) with ChemSep's Wilson parameters read
     straight from thermo's copy of the databank (IPDB "ChemSep Wilson"), not from src/data/binaries.json: activity
     coefficients of binaries and a ternary; and thermo's own documented example (ethanol + water, 70 degC);
  2. reference_model.System (this repository's Python model, numpy): the bubble temperatures and vapour compositions
     at 101.3 kPa of the open isobaric data sets in validation/data/ that have a ChemSep Wilson set, and their mean
     deviations from the measured values.
"""
import json
import sys
import warnings
from pathlib import Path

import numpy as np

warnings.filterwarnings("ignore")
sys.path.insert(0, str(Path(__file__).resolve().parent))
from thermo.wilson import Wilson  # noqa: E402
from thermo.interaction_parameters import IPDB  # noqa: E402
import thermo  # noqa: E402
from reference_model import System, COMPONENTS  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "validation" / "fixtures" / "wilson.json"

GAMMA_CASES = [
    (["ethanol", "water"], [[0.252, 0.748], [0.05, 0.95], [0.9, 0.1]], [298.15, 343.15, 363.15]),
    (["acetone", "methanol"], [[0.3, 0.7], [0.7, 0.3]], [300.0, 330.0]),
    (["methanol", "water"], [[0.1, 0.9], [0.5, 0.5]], [310.0, 350.0]),
    (["benzene", "toluene"], [[0.4, 0.6]], [360.0]),
    (["acetone", "methanol", "water"], [[0.2, 0.3, 0.5], [0.6, 0.3, 0.1]], [320.0, 340.0]),
]
# open isobaric T-x-y sets (ThermoML Archive) whose pair has a ChemSep Wilson set
VLE_FILES = ["ethanol_water_101kPa.json", "acetone_methanol_101kPa.json", "acetone_chloroform_101kPa.json",
             "chloroform_methanol_101kPa.json", "ethyl-acetate_ethanol_101kPa.json", "ethanol_ethylene-glycol_101kPa.json"]


def thermo_gammas(ids, x, T):
    cas = [COMPONENTS[i]["cas"] for i in ids]
    a = IPDB.get_ip_asymmetric_matrix(name="ChemSep Wilson", CASs=cas, ip="aij")
    b = IPDB.get_ip_asymmetric_matrix(name="ChemSep Wilson", CASs=cas, ip="bij")
    return Wilson(T=T, xs=x, lambda_as=a, lambda_bs=b).gammas()


def main():
    gamma = []
    for ids, xs, Ts in GAMMA_CASES:
        for x in xs:
            for T in Ts:
                gamma.append({"components": ids, "x": x, "T_K": T, "gamma": [float(g) for g in thermo_gammas(ids, x, T)]})
    vle = []
    for f in VLE_FILES:
        d = json.loads((ROOT / "validation" / "data" / f).read_text())
        s = System(d["components"], "WILSON")
        rows = []
        for r in d["rows"]:
            row = dict(zip(d["columns"], r))
            x1 = row["x_1"]
            if not 0 < x1 < 1:
                continue
            T, y = s.bubble_t([x1, 1 - x1], d["P_kPa"])
            rows.append({"x_1": x1, "T_K_data": row["T_K"], "y_1_data": row["y_1"], "T_K": float(T), "y_1": float(y[0])})
        dT = float(np.mean([abs(r["T_K"] - r["T_K_data"]) for r in rows]))
        dy = float(np.mean([abs(r["y_1"] - r["y_1_data"]) for r in rows]))
        vle.append({"file": f, "components": d["components"], "P_kPa": d["P_kPa"], "rows": rows,
                    "mean_abs_dT_K": dT, "mean_abs_dy": dy})
        print(f"{f}: Wilson (ChemSep set) mean |dT| {dT:.3f} K, mean |dy| {dy:.4f}, {len(rows)} points")
    doc = {
        "_about": "Reference values for the Wilson model (proposal 0016), from validation/python/reference_wilson.py. "
                  "gamma: thermo.wilson.Wilson with ChemSep's Wilson set read from thermo's IPDB (thermo " + thermo.__version__ + "). "
                  "thermo_doc_example: the example of thermo's Wilson documentation (ethanol + water, 343.15 K, ChemSep set). "
                  "vle: bubble temperatures and vapour fractions of reference_model.System (model WILSON, binaries.json) at the "
                  "liquid compositions of open isobaric data sets, with the measured values.",
        "thermo_doc_example": {"components": ["ethanol", "water"], "x": [0.252, 0.748], "T_K": 343.15,
                               "gamma_printed": [1.95733110, 1.1600677]},
        "gamma": gamma,
        "vle": vle,
    }
    OUT.write_text(json.dumps(doc, indent=1) + "\n")
    print(f"wrote {OUT}")


if __name__ == "__main__":
    main()
