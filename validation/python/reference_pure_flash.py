"""
Independent reference for the flash of one component with an equation of state (src/equilibrium/flash.js,
pureEosFlash): the saturation temperature at a given pressure and the enthalpy of vaporization there, from CoolProp's
own cubic backends ("PR::<fluid>", "SRK::<fluid>"; CoolProp 8.0.0, MIT), which share no code with the JavaScript
engine. The enthalpy of vaporization depends only on the residual (departure) enthalpies of the two phases, so it is
independent of the ideal-gas reference. The critical constants and acentric factors CoolProp uses are written with
the values, so the test can check that CHEPTA uses the same ones (src/data/components.json).

Writes validation/fixtures/pure-flash.json.

Usage: python validation/python/reference_pure_flash.py
"""
import json
from pathlib import Path

import CoolProp
import CoolProp.CoolProp as CP

OUT = Path(__file__).resolve().parents[1] / "fixtures" / "pure-flash.json"
CASES = [  # (CHEPTA id, CoolProp fluid, model, pressure in kPa)
    ("water", "Water", "PR", 101.325),
    ("water", "Water", "PR", 1000.0),
    ("n-butane", "n-Butane", "PR", 101.325),
    ("methane", "Methane", "SRK", 2000.0),
]


def main():
    out = []
    for cid, fluid, model, P in CASES:
        be = "%s::%s" % (model, fluid)
        T = CP.PropsSI("T", "P", P * 1000, "Q", 0, be)
        hL = CP.PropsSI("H", "P", P * 1000, "Q", 0, be)
        hV = CP.PropsSI("H", "P", P * 1000, "Q", 1, be)
        M = CP.PropsSI("M", be)
        out.append({"component": cid, "model": model, "P_kPa": P, "Tsat_K": round(T, 6),
                    "dHvap_J_mol": round((hV - hL) * M, 4),
                    "Tc_K": CP.PropsSI("Tcrit", be), "Pc_Pa": CP.PropsSI("pcrit", be), "omega": CP.PropsSI("acentric", be)})
    OUT.write_text(json.dumps({
        "_about": "Saturation temperature and enthalpy of vaporization of pure components with Peng-Robinson and SRK, "
                  "from CoolProp's cubic backends (validation/python/reference_pure_flash.py, CoolProp %s); for "
                  "test/pure-flowsheet.test.js." % CoolProp.__version__,
        "cases": out}, indent=1) + "\n")
    print("wrote %d cases to %s" % (len(out), OUT.relative_to(Path.cwd()) if OUT.is_relative_to(Path.cwd()) else OUT))


if __name__ == "__main__":
    main()
