"""
Independent reference for the property charts (src/equilibrium/charts.js, proposal 0013, step 7): the saturated liquid
and vapour of a pure fluid (the dome) and points of its isobars, with their enthalpy and entropy on CHEPTA's reference
state (each component as an ideal gas at 298.15 K and 101.325 kPa). Peng-Robinson as in reference_compressor.py: the
ideal gas from CoolProp 8.0.0's cp0 plus the departure functions of the thermo library (PR, PRMIX), with CHEPTA's Tc,
Pc and omega; no code shared with the JavaScript engine. CoolProp's reference equations ("HEOS::") are given for
information (enthalpy and entropy differences only: their reference state differs).

Writes validation/fixtures/charts.json.

Usage: python validation/python/reference_charts.py
"""
import json
import sys
from pathlib import Path

import CoolProp
import CoolProp.CoolProp as CP
from thermo.eos import PR

sys.path.insert(0, str(Path(__file__).resolve().parent))
from reference_compressor import COOLPROP, crit, gas, ideal  # noqa: E402

OUT = Path(__file__).resolve().parents[1] / "fixtures" / "charts.json"
# isobars (kPa) and the dome's temperatures as fractions of Tc (carbon dioxide from above its triple point, 216.6 K)
FLUIDS = {"propane": ([1000.0, 3000.0], (0.6, 0.7, 0.8, 0.9, 0.97)), "carbon-dioxide": ([1000.0, 5000.0], (0.72, 0.8, 0.9, 0.97))}


def main():
    out = {"_about": "Saturated liquid and vapour and isobar points of pure fluids, Peng-Robinson as CoolProp "
                     f"{CoolProp.__version__} cp0 plus thermo's departures (CHEPTA's Tc, Pc, omega), h in J/mol and s in "
                     "J/(mol K) relative to the ideal gas at 298.15 K and 101.325 kPa. Written by "
                     "validation/python/reference_charts.py.", "fluids": []}
    for cid, (isobars, fractions) in FLUIDS.items():
        Tc, Pc, w = (v[0] for v in crit([cid]))
        dome = []
        for f in fractions:
            T = f * Tc
            e = PR(Tc=Tc, Pc=Pc, omega=w, T=T, P=1e5)
            P = e.Psat(T)
            e = PR(Tc=Tc, Pc=Pc, omega=w, T=T, P=P)
            hI, sI = ideal([cid], [1.0], T, P)
            row = {"T_K": round(T, 6), "Psat_kPa": round(P / 1e3, 6),
                   "liquid": {"h_J_mol": round(hI + e.H_dep_l, 4), "s_J_molK": round(sI + e.S_dep_l, 6)},
                   "vapour": {"h_J_mol": round(hI + e.H_dep_g, 4), "s_J_molK": round(sI + e.S_dep_g, 6)}}
            AS = CP.AbstractState("HEOS", COOLPROP[cid])
            AS.update(CP.QT_INPUTS, 0, T)
            hL, sL = AS.hmolar(), AS.smolar()
            AS.update(CP.QT_INPUTS, 1, T)
            row["HEOS"] = {"Psat_kPa": round(AS.p() / 1e3, 4), "dh_vap_J_mol": round(AS.hmolar() - hL, 3), "ds_vap_J_molK": round(AS.smolar() - sL, 5)}
            dome.append(row)
        lines = []
        for P in isobars:
            pts = []
            for T in (1.1 * Tc, 1.3 * Tc, 1.6 * Tc):
                h, s = gas([cid], [1.0], T, P * 1e3)
                pts.append({"T_K": round(T, 6), "h_J_mol": round(h, 4), "s_J_molK": round(s, 6)})
            lines.append({"P_kPa": P, "points": pts})
        out["fluids"].append({"component": cid, "dome": dome, "isobars": lines})
        print(cid, dome[0], lines[0]["points"][0])
    OUT.write_text(json.dumps(out, indent=2) + "\n")


if __name__ == "__main__":
    main()
