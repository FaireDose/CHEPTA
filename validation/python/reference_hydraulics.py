"""
Independent reference for the column's tray hydraulics (src/units/columns/hydraulics.js; proposal 0015, Part I
section 2, step 6, milestone M2b). The same open method, written anew here with numpy, so that a slip in either is seen:

- M. Fermeglia, "Staged column design", University of Trieste (2021): Fair's chart (slide 37), read off the graph into
  validation/data/sizing/fair_chart_fermeglia2021.json; u_fl = K_fl K1 K2 K3 K4 sqrt((rhoL - rhoV)/rhoV) with
  K1 = (sigma/20)^0.2, K2 = (10 Ah/Aa)^0.44 below Ah/Aa = 0.1, K3 = 0.9 above 6 mm holes (slide 38); the flow parameter
  (W_L/W_V) sqrt(rhoV/rhoL) (slide 46); A_net = eta pi D^2/4 (slide 44); the turndown of slide 54 for weeping;
- the diameter from the largest required area, A_t,j = V_j / (f u_fl,j eta) (proposal 0015, Part I, section 2);
- the liquid's surface tension by Winterfeld, Scriven and Davis, sigma = (sum phi_i sqrt(sigma_i))^2 (the chemicals
  library, chemicals.interface.Winterfeld_Scriven_Davis, MIT).

Here the chart is interpolated with numpy.interp on log10 values (the engine walks its own table in natural logs):
first along each curve in F, then across the tray spacings in H.

Writes validation/fixtures/hydraulics.json: each case's inputs and the reference results.

Usage: python validation/python/reference_hydraulics.py
"""
import json
import math
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
CHART = json.loads((ROOT / "data" / "sizing" / "fair_chart_fermeglia2021.json").read_text())
OUT = ROOT / "fixtures" / "hydraulics.json"
TURNDOWN = {"sieve": 2, "valve": 4, "bubble-cap": 5}
DEFAULTS = {"tray_spacing_m": 0.6, "design_fraction": 0.8, "net_area_fraction": 0.9, "hole_area_ratio": 0.1,
            "hole_diameter_mm": 5, "foaming_factor": 1, "tray": "sieve", "diameter_m": None}
LB_FT3 = 0.45359237 / 0.3048 ** 3


def k_chart(F, H):
    lf = np.log10(CHART["F"])
    per_curve = [np.interp(math.log10(F), lf, np.log10(row)) for row in CHART["K_m_s"]]
    return 10 ** float(np.interp(math.log10(H), np.log10(CHART["H_m"]), per_curve))


def wsd(xs, sigmas, vms):
    """Winterfeld-Scriven-Davis: the double sum of x_i V_i x_j V_j sqrt(sigma_i sigma_j) / V^2."""
    v = sum(x * vm for x, vm in zip(xs, vms))
    return sum(xs[i] * vms[i] * xs[j] * vms[j] * math.sqrt(sigmas[i] * sigmas[j])
               for i in range(len(xs)) for j in range(len(xs))) / v ** 2


def hydraulics(trays, options):
    o = {**DEFAULTS, **options}
    f, eta = o["design_fraction"], o["net_area_fraction"]
    k2 = (10 * o["hole_area_ratio"]) ** 0.44 if o["hole_area_ratio"] < 0.1 else 1.0
    k3 = 0.9 if o["hole_diameter_mm"] > 6 else 1.0
    rows = []
    for t in trays:
        F = t["WL_kg_s"] / t["WV_kg_s"] * math.sqrt(t["rhoV"] / t["rhoL"])
        u_fl = (k_chart(F, o["tray_spacing_m"]) * (t["sigma_N_m"] * 1e3 / 20) ** 0.2 * k2 * k3 * o["foaming_factor"]
                * math.sqrt((t["rhoL"] - t["rhoV"]) / t["rhoV"]))
        qv = t["WV_kg_s"] / t["rhoV"]
        rows.append({"stage": t["stage"], "F": F, "u_flood_m_s": u_fl, "area_required_m2": qv / (f * u_fl) / eta, "QV": qv})
    gov = max(rows, key=lambda r: r["area_required_m2"])
    D = o["diameter_m"] if o["diameter_m"] is not None else math.sqrt(4 * gov["area_required_m2"] / math.pi)
    an = eta * math.pi * D ** 2 / 4
    for r in rows:
        r["fraction_of_flooding"] = r["QV"] / an / r["u_flood_m_s"]
    return {
        "D_m": D,
        "governing_stage": gov["stage"],
        "lowest_flooding_velocity_stage": min(rows, key=lambda r: r["u_flood_m_s"])["stage"],
        "flooding_stages": [r["stage"] for r in rows if r["fraction_of_flooding"] > f * (1 + 1e-9)],
        "weeping_stages": [r["stage"] for r in rows if r["fraction_of_flooding"] < 1 / TURNDOWN[o["tray"]]],
        "stages": [{k: r[k] for k in ("stage", "F", "u_flood_m_s", "area_required_m2", "fraction_of_flooding")} for r in rows],
    }


def trieste_example():
    """Fermeglia (2021), slides 45-47: n-hexane at 342 K, 1 atm, L/V = 0.8, V = 2500 lbmol/h, sigma 13.2 dyn/cm."""
    wv = 2500 * 0.45359237 / 3600 * 86.17
    return [{"stage": 2, "WL_kg_s": 0.8 * wv, "WV_kg_s": wv, "rhoL": 41.12 * LB_FT3, "rhoV": 0.1917 * LB_FT3, "sigma_N_m": 0.0132}]


def cases():
    two = [  # stage 2: dense vapour, low flooding velocity, little vapour; stage 3: lighter vapour, more of it
        {"stage": 2, "WL_kg_s": 4.0, "WV_kg_s": 5.0, "rhoL": 700.0, "rhoV": 4.0, "sigma_N_m": 0.018},
        {"stage": 3, "WL_kg_s": 9.0, "WV_kg_s": 7.0, "rhoL": 760.0, "rhoV": 2.0, "sigma_N_m": 0.022},
    ]
    span = [  # flow parameters across the chart, from 0.011 to 1.7
        {"stage": k + 2, "WL_kg_s": wl, "WV_kg_s": 2.0, "rhoL": 800.0, "rhoV": 3.0, "sigma_N_m": 0.02 + 0.002 * k}
        for k, wl in enumerate([0.34, 1.2, 4.0, 12.0, 30.0, 52.0])
    ]
    return {
        "trieste-example": {"trays": trieste_example(), "options": {"design_fraction": 0.75, "net_area_fraction": 0.9,
                                                                     "tray_spacing_m": 0.6096}},
        "slowest-does-not-set": {"trays": two, "options": {}},
        "span-defaults": {"trays": span, "options": {}},
        "span-between-spacings": {"trays": span, "options": {"tray_spacing_m": 0.5, "hole_area_ratio": 0.07,
                                                             "hole_diameter_mm": 8, "foaming_factor": 0.85}},
        "checked-flooding": {"trays": two, "options": {"diameter_m": 1.5, "tray_spacing_m": 0.45}},
        "checked-weeping-valve": {"trays": span, "options": {"diameter_m": 6.0, "tray": "valve", "tray_spacing_m": 0.3}},
    }


def main():
    out = {"generated_by": "validation/python/reference_hydraulics.py",
           "chart": "validation/data/sizing/fair_chart_fermeglia2021.json", "cases": {},
           "surface_tension": {"input": {"xs": [0.1606, 0.8394], "sigmas": [0.01547, 0.02877], "rhoms": [8610.0, 15530.0]}}}
    st = out["surface_tension"]["input"]
    out["surface_tension"]["sigma_N_m"] = wsd(st["xs"], st["sigmas"], [1 / r for r in st["rhoms"]])
    for cid, c in cases().items():
        out["cases"][cid] = {**c, "result": hydraulics(c["trays"], c["options"])}
    OUT.write_text(json.dumps(out, indent=1) + "\n")
    print(f"wrote {OUT}")
    for cid, c in out["cases"].items():
        r = c["result"]
        print(f"{cid}: D = {r['D_m']:.4f} m, governing {r['governing_stage']}, slowest {r['lowest_flooding_velocity_stage']},"
              f" flooding {r['flooding_stages']}, weeping {r['weeping_stages']}")
    print("surface tension", out["surface_tension"]["sigma_N_m"])


if __name__ == "__main__":
    main()
