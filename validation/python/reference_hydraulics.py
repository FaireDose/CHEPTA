"""
Independent reference for the column hydraulics cases (proposal 0015, Part I, section 2; milestone M2b; W7 for W4):
validation/data/columns/hydraulics/. Fair's flooding velocity and the diameter as M. Fermeglia, "Staged column design",
University of Trieste (2021), slides 35-38 and 44-47 give them, written anew in plain Python:

  F_lv = (W_L / W_V) (rho_V / rho_L)^0.5,  K = C_sb (sigma / 20)^0.2,  u_fl = K ((rho_L - rho_V) / rho_V)^0.5,
  A_j = Vdot_j / (f u_fl,j) (the net area of stage j), D = (4 max_j A_j / (pi eta))^0.5.

H1 reproduces the published worked example (slides 45-47) from its inputs; H2 gives the flooding velocities and the
required areas over C_sb, which is the same on every stage of that case (equal F_lv and spacing), so the ranking and the
ratios hold for any fitted form of Fair's chart.

Writes validation/fixtures/column_hydraulics.json, which test/benchmark-columns.test.js reads.
Usage: python validation/python/reference_hydraulics.py
"""
import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CASES = ROOT / "validation" / "data" / "columns" / "hydraulics"
OUT = ROOT / "validation" / "fixtures" / "column_hydraulics.json"


def h1(c):
    g = c["given"]
    rho_v = g["P_atm"] * g["MW_V"] / (g["R_atm_ft3_per_K_lbmol"] * g["T_K"])
    rho_l = g["liquid_specific_gravity_at_20C"] * g["water_density_lb_ft3"]
    flv = g["L_over_V"] * math.sqrt(rho_v / rho_l)            # W_L / W_V = L/V: the same molar mass at the top
    K = g["C_sb_ft_s"] * (g["sigma_dyn_cm"] / 20) ** 0.2
    u = K * math.sqrt((rho_l - rho_v) / rho_v)
    V = g["D_lbmol_h"] / (1 - g["L_over_V"])
    dia = math.sqrt(4 * V * g["MW_V"] / (math.pi * g["eta_net_over_total_area"] * rho_v * g["fraction_of_flooding"] * u * 3600))
    # the slide's last line, with u_flood rounded to 4.836 as printed, by the ideal-gas form
    dia_slide = math.sqrt(4 * V * g["R_atm_ft3_per_K_lbmol"] * g["T_K"] / (math.pi * g["eta_net_over_total_area"] * 3600 * g["P_atm"] * g["fraction_of_flooding"] * c["published"]["u_flood_ft_s"]))
    got = {"rho_V_lb_ft3": rho_v, "rho_L_lb_ft3": rho_l, "W_L_over_W_V": g["L_over_V"], "F_lv": flv, "K_ft_s": K,
           "u_flood_ft_s": u, "V_lbmol_h": V, "diameter_ft": dia}
    dev = {k: got[k] / v - 1 for k, v in c["published"].items() if k in got}
    return {"computed": got, "diameter_ft_from_printed_u_flood": dia_slide, "relative_deviation_from_published": dev}


def h2(c):
    f = c["design"]["fraction_of_flooding"]
    rows = []
    for s in c["stages"]:
        u_over_csb = (s["sigma_mN_m"] / 20) ** 0.2 * math.sqrt((s["rho_L_kg_m3"] - s["rho_V_kg_m3"]) / s["rho_V_kg_m3"])
        rows.append({"stage": s["stage"], "u_fl_over_C_sb": u_over_csb, "A_times_C_sb_m2_m_s": s["Vdot_m3_s"] / (f * u_over_csb)})
    slow = min(rows, key=lambda r: r["u_fl_over_C_sb"])
    big = max(rows, key=lambda r: r["A_times_C_sb_m2_m_s"])
    for r in rows:   # each stage's fraction of flooding at the diameter of the largest area
        r["fraction_of_flooding_at_diameter"] = f * r["A_times_C_sb_m2_m_s"] / big["A_times_C_sb_m2_m_s"]
    return {"stages": rows, "lowest_flooding_velocity_stage": slow["stage"], "largest_area_stage": big["stage"],
            "diameter_ratio_largest_over_slowest_stage": math.sqrt(big["A_times_C_sb_m2_m_s"] / slow["A_times_C_sb_m2_m_s"])}


def main():
    out = {"_about": "Written by validation/python/reference_hydraulics.py. The cases: validation/data/columns/hydraulics/.", "cases": {}}
    for p in sorted(CASES.glob("*.json")):
        c = json.loads(p.read_text())
        out["cases"][c["id"]] = h1(c) if c["id"].startswith("H1") else h2(c)
    OUT.write_text(json.dumps(out, indent=1) + "\n")
    print(json.dumps(out, indent=1))


if __name__ == "__main__":
    main()
