"""Liquid thermal conductivity of methyl oleate and methyl linoleate from the correlation of Perkins and Huber (2011).

R.A. Perkins, M.L. Huber, Measurement and Correlation of the Thermal Conductivities of Biodiesel Constituent Fluids:
Methyl Oleate and Methyl Linoleate, Energy Fuels 25 (2011) 2383-2388, doi:10.1021/ef200417x. A work of NIST, not
subject to U.S. copyright; free copy from NIST: https://tsapps.nist.gov/publication/get_pdf.cfm?pub_id=907397.

The authors measured 395 (methyl oleate) and 350 (methyl linoleate) liquid values with a transient hot wire,
302-508 K and 0.1-42 MPa, uncertainty below 1 % (k = 2), and fitted to them the correlation (their eqs 2-4)

    lambda = lambda0(T) + d_lambda_r(rho, T) [+ d_lambda_c, negligible below 500 K, as the article states]
    lambda0 = sum_{k=0..3} A_k (T/Tc)^k
    d_lambda_r = sum_{i=1..3} (B_i1 + B_i2 T/Tc) (rho/rho_c)^i

with the coefficients of their Tables 1 and 2, which agrees with their data within 2.5 % (95 % confidence). The
tabulated measurements are in the article's supporting information, which is not used here: the values written
below are calculated from the correlation at 101.325 kPa, 302.15-500 K (inside the measured range, where the
critical term can be left out), with the liquid density of the equation of state the authors used (Huber et al.
2009, as implemented in CoolProp 8.0.0). The script first reproduces the check values of their Table 3.

    python validation/python/perkins2011_conductivity.py          # check and print
    python validation/python/perkins2011_conductivity.py --write  # write article_<id>_perkins2011.json
"""
import argparse
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "validation" / "data" / "pure" / "measured"
DOI = "10.1021/ef200417x"

# Tables 1 and 2 of the article (signs read from the page images; the text layer of the PDF drops the minus signs),
# and the critical temperature and density of each fluid (section "Thermal conductivity correlation")
FLUIDS = {
    "methyl-oleate": {"coolprop": "MethylOleate", "Tc": 782.0, "rho_c": 241.0,
                      "A": [-0.000271250, 0.00259365, 0.0350241, -0.00902273],
                      "B": {(1, 1): -0.0410106, (1, 2): 0.0606657, (2, 1): 0.0328443, (2, 2): -0.0498407,
                            (3, 1): -0.00418506, (3, 2): 0.0121752},
                      # Table 3: (T/K, rho/(kg/m3), lambda/(W/m/K))
                      "check": [(450, 0.00792667, 0.0110996), (450, 764.716, 0.123794), (450, 787.080, 0.133856)]},
    "methyl-linoleate": {"coolprop": "MethylLinoleate", "Tc": 799.0, "rho_c": 238.05,
                         "A": [-0.000109042, 0.00240543, 0.0407364, -0.0105928],
                         "B": {(1, 1): -0.0713126, (1, 2): 0.0989415, (2, 1): 0.0466421, (2, 2): -0.0657850,
                               (3, 1): -0.00557406, (3, 2): 0.0128922},
                         "check": [(450, 0.00787223, 0.0122743), (450, 778.176, 0.122742), (450, 799.160, 0.131867)]},
}


def conductivity(f, T, rho):
    """lambda0 + d_lambda_r (W/m/K), without the critical enhancement."""
    tr, dr = T / f["Tc"], rho / f["rho_c"]
    lam0 = sum(a * tr ** k for k, a in enumerate(f["A"]))
    res = sum((f["B"][(i, 1)] + f["B"][(i, 2)] * tr) * dr ** i for i in (1, 2, 3))
    return lam0 + res


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--write", action="store_true")
    a = ap.parse_args()
    import CoolProp
    import CoolProp.CoolProp as CP
    if CoolProp.__version__ != "8.0.0":
        raise SystemExit("CoolProp 8.0.0 is required (found %s)" % CoolProp.__version__)
    for cid, f in FLUIDS.items():
        # the check values of Table 3 include the critical enhancement, which at 450 K is far below their last digit
        # in the liquid; the dilute gas value checks lambda0 alone
        for T, rho, lam in f["check"]:
            got = conductivity(f, T, rho)
            dev = got / lam - 1
            print("%-17s check %g K, %g kg/m3: %.6g against %.6g (Table 3), %+.4f %%" % (cid, T, rho, got, lam, 100 * dev))
            if abs(dev) > 2e-4:
                raise SystemExit("%s: the coded correlation does not reproduce Table 3" % cid)
        rows = []
        T = 302.15
        while T <= 500.0 + 1e-9:
            rho = CP.PropsSI("D", "T", T, "P", 101325.0, f["coolprop"])
            lam = conductivity(f, T, rho)
            rows.append({"property": "Thermal conductivity, W/m/K", "phases": ["Liquid"], "T_K": round(T, 2),
                         "P_kPa": 101.325, "value": round(lam, 6), "uncertainty": round(0.025 * lam, 6), "doi": DOI,
                         "set": "correlation, eqs 2-4, Tables 1-2", "binary_with": None})
            T += 10.0
        print("%-17s %d values, %.2f-%.2f K: %.4f-%.4f W/m/K" % (cid, len(rows), rows[0]["T_K"], rows[-1]["T_K"],
                                                                   rows[0]["value"], rows[-1]["value"]))
        if not a.write:
            continue
        doc = {
            "component": cid, "cas": {"methyl-oleate": "112-62-9", "methyl-linoleate": "112-63-0"}[cid],
            "about": ("Liquid thermal conductivity calculated from the correlation of Perkins and Huber (2011, eqs 2-4, "
                      "Tables 1-2), which they fitted to their measurements (transient hot wire, 302-508 K, uncertainty "
                      "below 1 %); at 101.325 kPa, with the liquid density of the equation of state of Huber et al. (2009) "
                      "as implemented in CoolProp 8.0.0, the one the authors used; without the critical enhancement, "
                      "negligible below 500 K as the article states. 'uncertainty' is the 2.5 % (95 % confidence) the "
                      "authors give for the correlation. Written by validation/python/perkins2011_conductivity.py, which "
                      "first reproduces the check values of the article's Table 3. The measured values themselves are in "
                      "the article's supporting information, not used here."),
            "source": {"citation": "R.A. Perkins, M.L. Huber, Measurement and Correlation of the Thermal Conductivities "
                                   "of Biodiesel Constituent Fluids: Methyl Oleate and Methyl Linoleate, Energy Fuels 25 "
                                   "(2011) 2383-2388",
                       "doi": DOI,
                       "open_copy": "https://tsapps.nist.gov/publication/get_pdf.cfm?pub_id=907397",
                       "access": "Open access: a work of NIST, not subject to U.S. copyright, free full text from NIST",
                       "tables": "eqs 2-4 and Tables 1-2 (correlation), Table 3 (check values); critical parameters in "
                                 "the text"},
            "articles": {DOI: {"authors": ["Perkins, R.A.", "Huber, M.L."],
                               "title": "Measurement and Correlation of the Thermal Conductivities of Biodiesel "
                                        "Constituent Fluids: Methyl Oleate and Methyl Linoleate",
                               "journal": "Energy Fuels", "volume": "25", "year": "2011", "pages": "2383-2388"}},
            "rows": rows,
        }
        path = OUT / ("article_%s_perkins2011.json" % cid)
        path.write_text(json.dumps(doc, indent=1, ensure_ascii=False) + "\n")
        print("written", path.relative_to(ROOT))


if __name__ == "__main__":
    main()
