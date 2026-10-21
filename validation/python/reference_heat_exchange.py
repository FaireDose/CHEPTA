"""
Independent reference for the zone method of src/units/heat-exchange.js (proposal 0013, step 1): the duty, the
temperature-heat curves and the counterflow area of exchangers whose sides change phase, from CoolProp 8.0.0 (MIT):
its own Peng-Robinson backend ("PR::n-Butane") for the process stream and its IAPWS-IF97 backend ("IF97::Water") for
water and steam. CoolProp shares no code with the JavaScript engine. The duty is split into the same equal heat
steps as the engine; each side's temperature at each step comes from CoolProp's P-H state; each zone's area is
dQ / (U LMTD) (Lienhard and Lienhard, A Heat Transfer Textbook, 6th ed., eqn. 3.13).

Writes validation/fixtures/heat-exchange.json.

Usage: python validation/python/reference_heat_exchange.py
"""
import json
import math
from pathlib import Path

import CoolProp
import CoolProp.CoolProp as CP

OUT = Path(__file__).resolve().parents[1] / "fixtures" / "heat-exchange.json"
ZONES = 20


def lmtd(d1, d2):
    return (d1 + d2) / 2 if abs(d1 - d2) < 1e-9 * max(d1, d2) else (d1 - d2) / math.log(d1 / d2)


def T_of_h(backend, P, h):
    """T at P and h of a pure fluid: the saturation temperature inside the dome, else bisection on the single-phase
    enthalpy (the cubic backend's own P-H flash is not used)."""
    Ts = CP.PropsSI("T", "P", P, "Q", 0, backend)
    hL, hV = CP.PropsSI("H", "P", P, "Q", 0, backend), CP.PropsSI("H", "P", P, "Q", 1, backend)
    if hL <= h <= hV:
        return Ts
    lo, hi = (Ts + 1e-6, Ts + 400) if h > hV else (Ts - 250, Ts - 1e-6)
    for _ in range(200):
        mid = (lo + hi) / 2
        if CP.PropsSI("H", "T", mid, "P", P, backend) < h:
            lo = mid
        else:
            hi = mid
    return (lo + hi) / 2


def process(backend, MW, F_kmol_h, T_in, P_kPa, T_out=None, Q_out=None):
    """A process side at constant pressure: its inlet enthalpy flow, its outlet, and T at a heat q (kW) removed (q > 0)
    or added (q < 0)."""
    m = F_kmol_h * MW / 3600  # kg/s
    P = P_kPa * 1000
    h_in = CP.PropsSI("H", "T", T_in, "P", P, backend)
    if T_out is not None:
        h_out = CP.PropsSI("H", "T", T_out, "P", P, backend)
    else:
        h_out = CP.PropsSI("H", "P", P, "Q", Q_out, backend)
    Q = abs(h_in - h_out) * m / 1000  # kW
    sign = -1 if h_out < h_in else 1

    def T_at(q):
        return T_of_h(backend, P, h_in + sign * q * 1000 / m)
    return Q, T_at


def water(T_in, T_out, P_kPa):
    P = P_kPa * 1000
    h_in = CP.PropsSI("H", "T", T_in, "P", P, "IF97::Water")
    h_out = CP.PropsSI("H", "T", T_out, "P", P, "IF97::Water")

    def make(Q):
        dh = (h_out - h_in) / Q  # J/kg per kW

        def T_at(q):
            return CP.PropsSI("T", "P", P, "H", h_in + dh * q, "IF97::Water")
        return T_at, Q * 1000 / abs(h_out - h_in) * 3600  # kg/h
    return make


def counterflow(Q, Th, Tc, U):
    """Hot side curve Th(q removed), cold side curve Tc(q taken in); counterflow pairing as the engine does."""
    A = 0.0
    pts = []
    for k in range(ZONES + 1):
        q = Q * k / ZONES
        pts.append((q, Th(q), Tc(Q - q)))
    for k in range(ZONES):
        a, b = pts[k], pts[k + 1]
        A += (b[0] - a[0]) * 1000 / (U * lmtd(a[1] - a[2], b[1] - b[2]))
    return A, pts


def main():
    cases = []
    # 1. n-butane vapour at 500 kPa, superheated, condensed and subcooled by cooling water (Peng-Robinson)
    MWb = CP.PropsSI("M", "PR::n-Butane") * 1000
    Q, Th = process("PR::n-Butane", MWb, 10.0, 360.0, 500.0, T_out=300.0)
    Tc, mw = water(290.0, 305.0, 101.325)(Q)
    A, pts = counterflow(Q, Th, Tc, 800.0)
    cases.append({"name": "n-butane condenser", "component": "n-butane", "model": "PR", "flow_kmol_h": 10.0,
                  "T_in_K": 360.0, "P_kPa": 500.0, "T_out_K": 300.0,
                  "water": {"T_in_K": 290.0, "T_out_K": 305.0, "P_kPa": 101.325}, "U_W_m2K": 800.0,
                  "duty_kW": Q, "area_m2": A, "water_kg_h": mw,
                  "Th_K": [p[1] for p in pts], "Tc_K": [p[2] for p in pts],
                  "Tsat_K": CP.PropsSI("T", "P", 500e3, "Q", 0, "PR::n-Butane")})
    # 2. liquid n-butane at 1000 kPa boiled to a vapour fraction of 0.8 by saturated steam at 500 kPa (Peng-Robinson;
    #    steam from IAPWS-IF97). Water as the process stream is not used: CHEPTA's flash of water takes the vapour as an
    #    ideal gas (or Peng-Robinson), not IAPWS, so its latent heat differs from IF97 by about 1 % at 300 kPa
    #    (docs/decisions/2026-10-20-06-heat-exchangers.md); that is the property model, not the zone method.
    Q, Tcold = process("PR::n-Butane", MWb, 10.0, 300.0, 1000.0, Q_out=0.8)
    Tsat = CP.PropsSI("T", "P", 500e3, "Q", 0, "IF97::Water")
    hfg = CP.PropsSI("H", "P", 500e3, "Q", 1, "IF97::Water") - CP.PropsSI("H", "P", 500e3, "Q", 0, "IF97::Water")
    A, pts = counterflow(Q, lambda q: Tsat, Tcold, 1500.0)
    cases.append({"name": "n-butane boiled by steam", "component": "n-butane", "model": "PR", "flow_kmol_h": 10.0,
                  "T_in_K": 300.0, "P_kPa": 1000.0, "VF_out": 0.8, "steam_P_kPa": 500.0, "U_W_m2K": 1500.0,
                  "duty_kW": Q, "area_m2": A, "steam_kg_h": Q * 1000 / hfg * 3600,
                  "Tc_K": [p[2] for p in pts]})
    OUT.write_text(json.dumps({
        "_about": "Counterflow heat exchangers sized by %d equal heat steps from CoolProp %s (PR::n-Butane, IF97::Water); "
                  "validation/python/reference_heat_exchange.py, for test/heat-exchange.test.js." % (ZONES, CoolProp.__version__),
        "zones": ZONES, "cases": cases}, indent=1) + "\n")
    print("wrote %d cases to %s" % (len(cases), OUT))


if __name__ == "__main__":
    main()
