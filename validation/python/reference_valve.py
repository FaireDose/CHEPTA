"""
Independent reference for the valve of the flowsheet (src/units/units.js, proposal 0013, step 5) as a throttle: an
adiabatic valve keeps the enthalpy, so the outlet is the P-H state at the lower pressure (a gas cools by the
Joule-Thomson effect; a liquid at saturation partly flashes). From CoolProp 8.0.0 (MIT), which shares no code with
the JavaScript engine: its Peng-Robinson backend ("PR::Methane", the same equation of state as the engine) for the
values compared, and its reference equations of state ("HEOS::", as cited by CoolProp) for information: the
difference between the two is Peng-Robinson's own. The P-H state is found here by bisection on the single-phase
enthalpy and, inside the dome of a pure fluid, from the saturated enthalpies (the cubic backend's own P-H flash is not
used, as in reference_heat_exchange.py).

Writes validation/fixtures/valve.json.

Usage: python validation/python/reference_valve.py
"""
import json
from pathlib import Path

import CoolProp
import CoolProp.CoolProp as CP

OUT = Path(__file__).resolve().parents[1] / "fixtures" / "valve.json"
# (CHEPTA id, CoolProp name, inlet T in K, inlet P in kPa, outlet P in kPa)
CASES = [
    ("methane", "Methane", 300.0, 5000.0, 1000.0),
    ("propane", "Propane", 300.0, 1500.0, 200.0),
    ("n-butane", "n-Butane", 300.0, 1000.0, 150.0),
]


def ph_state(backend, P, h):
    """(T, vapour fraction) of a pure fluid at P (Pa) and h (J/kg)."""
    try:
        hL, hV = CP.PropsSI("H", "P", P, "Q", 0, backend), CP.PropsSI("H", "P", P, "Q", 1, backend)
        Ts = CP.PropsSI("T", "P", P, "Q", 0, backend)
    except ValueError:   # above the critical pressure
        hL = hV = Ts = None
    if hL is not None and hL <= h <= hV:
        return Ts, (h - hL) / (hV - hL)
    lo, hi = (Ts + 1e-6, Ts + 400) if hL is not None and h > hV else ((Ts - 250, Ts - 1e-6) if hL is not None else (100, 800))
    for _ in range(200):
        mid = (lo + hi) / 2
        if CP.PropsSI("H", "T", mid, "P", P, backend) < h:
            lo = mid
        else:
            hi = mid
    T = (lo + hi) / 2
    return T, (1.0 if hL is not None and h > hV else 0.0)


def main():
    out = {"_about": "Adiabatic valve (throttle): outlet T and vapour fraction at the inlet enthalpy, CoolProp "
                     f"{CoolProp.__version__}; PR:: the values compared, HEOS:: the reference equation of state for "
                     "information. Written by validation/python/reference_valve.py.", "cases": []}
    for cid, name, T, P1, P2 in CASES:
        row = {"component": cid, "T_in_K": T, "P_in_kPa": P1, "P_out_kPa": P2}
        for be in ("PR", "HEOS"):
            h = CP.PropsSI("H", "T", T, "P", P1 * 1e3, f"{be}::{name}")
            T2, q = ph_state(f"{be}::{name}", P2 * 1e3, h)
            row[be] = {"T_out_K": round(T2, 6), "VF_out": round(q, 6)}
        out["cases"].append(row)
        print(row)
    OUT.write_text(json.dumps(out, indent=2) + "\n")


if __name__ == "__main__":
    main()
