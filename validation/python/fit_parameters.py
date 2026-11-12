"""
Fit binary NRTL / UNIQUAC / Wilson parameters to experimental data and write them to
src/data/binaries.json. Each fit is defined in FITS below: which pair, which data
file, and which parameters are free.

    python validation/python/fit_parameters.py            # fit and print, no changes
    python validation/python/fit_parameters.py --write    # fit and update binaries.json
    python validation/python/fit_parameters.py --only 1-propanol+water ... [--write]   # those pairs only
    python validation/python/fit_parameters.py --models WILSON [--write]   # one model only (the others untouched)

Wilson (proposal 0016, step 2): b_ij and b_ji are fitted, a_ij = ln(V_j / V_i) is held at the liquid volumes at
298.15 K (wilson_a), the constant-volume form of ChemSep's set; it is not fitted to liquid-liquid data or a
heterogeneous azeotrope (wilson_ok). A fitted Wilson set becomes the pair's default, ChemSep's stays as an alternative.

Besides FITS below, the fit definitions written by vle_batch.py (validation/data/vle/fits.json:
one isobaric T-x-y or isothermal P-x set from the NIST TRC ThermoML Archive per pair, with check
sets) are fitted, temperature-independent. A generated fit is written only when it follows its
data (GATE below) and predicts no liquid-liquid split in the data range; otherwise the reason is
printed and the pair keeps what it had.

Objective: bubble temperature (weight 1/0.5 K) and vapour composition (1/0.01) for
isobaric T-x-y data; relative pressure (1/0.5 %) for isothermal P-x data; excess
enthalpy (1/20 J/mol) when given; equal activities of both components in the two
liquids of liquid-liquid data (ln a, 1/0.05); ln gamma at infinite dilution (1/0.05);
heterogeneous azeotrope: bubble pressure of the two liquids (1/0.5 kPa) and vapour mole
fraction (1/0.01). Temperature-dependent fits of data files store the temperature range
of their data as "T_range_K" and state it in "source".

Data kinds a FITS entry can use:
  "txy"            water + ethylene glycol compilation (water_ethylene_glycol_760mmHg.json)
  "uniquac-curve"  the databank UNIQUAC T-x-y curve (no open experimental data)
  "schmid"         Schmid et al. (2007) P-x and HE for acetic acid + ethylene glycol
  "txy-file"       data files in validation/data/ (spec key "file", or "files" for several),
                   each with "components", "kind", "columns" and "rows":
                     kind "isobaric-txy"  columns x_1, y_1, T_K or T_C; "P_kPa". Rows of
                                          pure components are left out.
                     kind "isobaric-tx"   columns x_1, T_K: bubble temperatures without the
                                          vapour (Barker's method: T only is fitted).
                     kind "lle"           columns T_K and x_1_I / x_1_II / x_2_I / x_2_II
                                          (mole fractions in liquids I and II). Rows with
                                          both liquids are fitted (isoactivity); rows with
                                          one liquid are only compared.
                     kind "gamma-infinite-dilution"  columns T_K and gamma_1 or gamma_2
                                          (activity coefficient of that component at x -> 0).
                     kind "azeotrope" with "heterogeneous": true  columns T_C (or T_K) and
                                          wt_pct_1 or wt_pct_2 (overall = vapour composition)
                                          and "P_kPa": the two liquids in equilibrium at T
                                          must boil at P with that vapour. Fitted in a second
                                          stage, started from the fit without it.
                     kind "azeotrope" with "heterogeneous": false  the same columns: the liquid
                                          of that composition boils at T and P with a vapour
                                          of the same composition (a T-x-y point with y = x).
                     kind "isothermal-px"  columns T_K, x_1, P_kPa: total pressure of the liquid
                                          at T (1/0.5 %). The rows of the pure components at
                                          each T are the vapour pressures of that isotherm (the
                                          pair parameters are not biased by the databank
                                          vapour pressures); they are not fitted.
                     kind "tpx"  columns T_K, x_1, P_kPa: total pressure of the liquid at the
                                          row's own T (1/0.5 %), with the vapour pressures of
                                          the component records (a static apparatus measuring
                                          P against T at fixed compositions, where no isotherm
                                          has its own pure-component pressures).
                     kind "excess-enthalpy"  columns x_1 and HE_kJ_mol (or HE_J_mol), with
                                          T_K as a column or at the top of the file.
                   Files under "check" are compared with the result but not fitted.
For "txy-file" fits a spec may also set "alpha" (NRTL non-randomness, default 0.3), "starts"
(starting values of b_ij, b_ji in K; nearly immiscible pairs need larger ones) and
"single_liquid": True, which also fits liquid-liquid rows where only one liquid was measured
(solubility data): the model's split at T is solved and the logarithm of the minor
component's mole fraction in the measured liquid is compared (1/0.05). Without it such rows
are only compared.
"""
import json
import sys
from pathlib import Path

import numpy as np
from scipy.optimize import brentq, least_squares

from reference_model import System, DATA, COMPONENTS, ALL_BINARIES, psat_kpa

ROOT = Path(__file__).resolve().parents[2]
VAL = ROOT / "validation" / "data"
BIN_FILE = DATA / "binaries.json"


def load(name):
    return json.loads((VAL / name).read_text())


def water_eg_txy():
    d = load("water_ethylene_glycol_760mmHg.json")
    return d["P_kPa"], [(p["x_water"], p["T_C"] + 273.15, p["y_water"]) for p in d["txy"]]


def schmid():
    d = load("schmid2007_acetic_acid_ethylene_glycol.json")
    px = [(p["x1"], p["P_kPa"]) for p in d["px"]]
    he = [(p["x1"], p["HE_J_mol"]) for p in d["HE_323K"]]
    return d["T_K"], px, he


def _orient(d, name, pair):
    """True if the file lists the pair's components in reverse order."""
    comps = list(d["components"])
    if comps == list(pair):
        return False
    if comps == [pair[1], pair[0]]:
        return True
    raise ValueError(f"{name}: components {comps} do not match the pair {pair}")


def txy_file(name, pair):
    """Isobaric T-x-y file as (P_kPa, [(x1, T_K, y1)]) with x1, y1 of pair[0]. Pure-component
    rows are left out: they test the vapour-pressure equations, not the pair parameters."""
    d = load(name)
    if d.get("kind") not in ("isobaric-txy", "isobaric-tx"):
        raise ValueError(f"{name}: kind {d.get('kind')!r} is not isobaric-txy or isobaric-tx")
    flip = _orient(d, name, pair)
    col = {c: k for k, c in enumerate(d["columns"])}
    pts = []
    for r in d["rows"]:
        x1, y1 = r[col["x_1"]], (r[col["y_1"]] if "y_1" in col else None)
        T = r[col["T_K"]] if "T_K" in col else r[col["T_C"]] + 273.15
        if x1 <= 0 or x1 >= 1:
            continue
        pts.append((1 - x1, T, None if y1 is None else 1 - y1) if flip else (x1, T, y1))
    return d["P_kPa"], pts


def lle_file(name, pair):
    """Liquid-liquid file as [(T_K, x1 in liquid I or None, x1 in liquid II or None)] with
    x1 of pair[0]."""
    d = load(name)
    flip = _orient(d, name, pair)
    col = {c: k for k, c in enumerate(d["columns"])}

    def x_first(r, phase):
        if f"x_1_{phase}" in col:
            v = r[col[f"x_1_{phase}"]]
        elif f"x_2_{phase}" in col:
            v = 1 - r[col[f"x_2_{phase}"]]
        else:
            return None
        return 1 - v if flip else v
    return [(r[col["T_K"]], x_first(r, "I"), x_first(r, "II")) for r in d["rows"]]


def gamma_inf_file(name, pair):
    """Infinite-dilution file as [(T_K, index in pair of the solute, gamma)]."""
    d = load(name)
    flip = _orient(d, name, pair)
    col = {c: k for k, c in enumerate(d["columns"])}
    k_file = 0 if "gamma_1" in col else 1
    k = 1 - k_file if flip else k_file
    return [(r[col["T_K"]], k, r[col[f"gamma_{k_file + 1}"]]) for r in d["rows"]]


def het_azeotrope_file(name, pair):
    """Azeotrope file as [(T_K, P_kPa, y1)] with y1 the vapour mole fraction of pair[0] (for a
    homogeneous azeotrope also the liquid one), converted from weight percent with the molar
    masses in components.json."""
    d = load(name)
    flip = _orient(d, name, pair)
    col = {c: k for k, c in enumerate(d["columns"])}
    M = [COMPONENTS[c]["MW"] for c in d["components"]]
    out = []
    for r in d["rows"]:
        T = r[col["T_K"]] if "T_K" in col else r[col["T_C"]] + 273.15
        if "y_1" in col:   # mole fraction of the first listed component (the vapour, equal to the liquid at an azeotrope)
            y1 = r[col["y_1"]]
        else:
            w1 = r[col["wt_pct_1"]] if "wt_pct_1" in col else 100 - r[col["wt_pct_2"]]
            n1, n2 = w1 / M[0], (100 - w1) / M[1]
            y1 = n1 / (n1 + n2)
        out.append((T, d["P_kPa"], 1 - y1 if flip else y1))
    return out


def px_file(name, pair):
    """Isothermal P-x file as [(T_K, x1, P_kPa, (P1sat, P2sat))] with x1 of pair[0] and the
    pure-component pressures of the file at that T (in pair order)."""
    d = load(name)
    flip = _orient(d, name, pair)
    col = {c: k for k, c in enumerate(d["columns"])}
    rows = [(r[col["T_K"]], r[col["x_1"]], r[col["P_kPa"]]) for r in d["rows"]]
    pure = {}
    for T, x1, P in rows:
        if x1 in (0, 1):
            pure.setdefault(T, [None, None])[0 if x1 == 1 else 1] = P
    out = []
    for T, x1, P in rows:
        if 0 < x1 < 1:
            if T not in pure or None in pure[T]:
                raise ValueError(f"{name}: no pure-component pressures at {T} K")
            ps = pure[T]
            out.append((T, 1 - x1, P, (ps[1], ps[0])) if flip else (T, x1, P, tuple(ps)))
    return out


def tpx_file(name, pair):
    """T-P-x file as [(T_K, x1, P_kPa)] with x1 of pair[0]; pure-component rows left out (the vapour
    pressures come from the component records)."""
    d = load(name)
    flip = _orient(d, name, pair)
    col = {c: k for k, c in enumerate(d["columns"])}
    return [(r[col["T_K"]], 1 - r[col["x_1"]] if flip else r[col["x_1"]], r[col["P_kPa"]]) for r in d["rows"]
            if 0 < r[col["x_1"]] < 1]


def he_file(name, pair):
    """Excess-enthalpy file as [(T_K, x1, HE in J/mol)] with x1 of pair[0]."""
    d = load(name)
    flip = _orient(d, name, pair)
    col = {c: k for k, c in enumerate(d["columns"])}
    f = 1000.0 if "HE_kJ_mol" in col else 1.0
    h = col["HE_kJ_mol"] if "HE_kJ_mol" in col else col["HE_J_mol"]
    out = []
    for r in d["rows"]:
        T = r[col["T_K"]] if "T_K" in col else d["T_K"]
        x1 = r[col["x_1"]]
        out.append((T, 1 - x1 if flip else x1, r[h] * f))
    return out


def two_liquids_file(name, pair):
    """The "two_liquids" block of a data file (vle_batch.py: the record's sets with phases Liquid mixture 1 and 2) as
    [(T_K, x1 in liquid I, x1 in liquid II)] with x1 of pair[0]; [] when the file has none."""
    d = load(name)
    tl = d.get("two_liquids")
    if not tl:
        return []
    flip = _orient(d, name, pair)
    col = {c: k for k, c in enumerate(tl["columns"])}
    f = (lambda v: 1 - v) if flip else (lambda v: v)
    return [(r[col["T_K"]], f(r[col["x_1_I"]]), f(r[col["x_1_II"]])) for r in tl["rows"]]


# The class of each pair from open evidence (proposal 0019; validation/data/two_liquids/classes.json, written by
# two_liquid_survey.py --classes): "partly miscible", "miscible", "not known", or "miscible below the measured
# temperature, not known above it". A pair it does not list keeps the rules of before (the hand-made FITS).
CLASSES_FILE = VAL / "two_liquids" / "classes.json"
CLASSES = json.loads(CLASSES_FILE.read_text())["pairs"] if CLASSES_FILE.exists() else {}
NOT_KNOWN = ("not known", "miscible below the measured temperature, not known above it")


def pair_class(pair):
    return CLASSES.get("+".join(sorted(pair)), {}).get("class")


def class_lle(pair):
    """The measured two liquids of a partly miscible pair (two_liquids/lle/<pair>.json) as [(T_K, x1 in liquid I,
    x1 in liquid II)] with x1 of pair[0], and the file's name; ([], None) without one."""
    c = CLASSES.get("+".join(sorted(pair)), {})
    name = c.get("lle_file")
    if c.get("class") != "partly miscible" or not name:
        return [], None
    d = load(name)
    flip = _orient(d, name, pair)
    col = {k: n for n, k in enumerate(d["columns"])}
    f = (lambda v: 1 - v) if flip else (lambda v: v)
    return [(r[col["T_K"]], f(r[col["x_1_I"]]), f(r[col["x_1_II"]])) for r in d["rows"]
            if r[col["x_1_I"]] is not None and r[col["x_1_II"]] is not None], name


def evidence_of(pair, kind):
    return [e for e in CLASSES.get("+".join(sorted(pair)), {}).get("evidence", []) if e["kind"] == kind]


def inside_split(x1, T, ll, dT=0.5):
    """True when x1 at T lies strictly between the two measured liquids of a two-liquid point within dT: such a row is
    a point of the three-phase plateau, not the bubble point of one liquid."""
    return any(abs(T - Tl) <= dT and min(a, b) + 1e-6 < x1 < max(a, b) - 1e-6 for Tl, a, b in ll)


def file_sets(spec, key="files"):
    """Data sets of a "txy-file" fit: list of (kind, name, content). A file with a "two_liquids" block adds an "lle"
    set of those points (from the same record), and its rows strictly between the two liquids are left out."""
    names = spec.get(key, [spec["file"]] if key == "files" and "file" in spec else [])
    out = []
    # a generated fit of a partly miscible pair: the measured two liquids of every record (proposal 0019), in place of
    # the data file's own two_liquids block
    cll, cname = class_lle(spec["pair"]) if (spec.get("generated") and key == "files") else ([], None)
    for name in names:
        d = load(name)
        kind = d.get("kind")
        ll = (cll or two_liquids_file(name, spec["pair"])) if kind in ("isobaric-txy", "isobaric-tx", "isothermal-px", "tpx") else []
        if kind is None and name == "water_ethylene_glycol_760mmHg.json":   # the older compilation format
            P, pts = water_eg_txy()
            if spec["pair"] != ("water", "ethylene-glycol"):
                raise ValueError(f"{name}: pair {spec['pair']}")
            out.append(("txy", name, (P, pts)))
        elif kind in ("isobaric-txy", "isobaric-tx"):
            P, pts = txy_file(name, spec["pair"])
            out.append(("txy", name, (P, [p for p in pts if not inside_split(p[0], p[1], ll)])))
        elif kind == "lle":
            out.append(("lle", name, lle_file(name, spec["pair"])))
        elif kind == "gamma-infinite-dilution":
            out.append(("ginf", name, gamma_inf_file(name, spec["pair"])))
        elif kind == "azeotrope":
            out.append(("haz" if d.get("heterogeneous") else "az", name, het_azeotrope_file(name, spec["pair"])))
        elif kind == "excess-enthalpy":
            out.append(("he", name, he_file(name, spec["pair"])))
        elif kind == "isothermal-px":
            out.append(("px", name, [p for p in px_file(name, spec["pair"]) if not inside_split(p[1], p[0], ll)]))
        elif kind == "tpx":
            out.append(("tpx", name, [p for p in tpx_file(name, spec["pair"]) if not inside_split(p[1], p[0], ll)]))
        else:
            raise ValueError(f"{name}: unknown kind {kind!r}")
        if ll:
            out.append(("lle", (cname or name) + " (two liquids)", ll))
            cll, cname = [], None   # once per spec
    return out


def txy_sets(spec):
    """List of (P_kPa, points) for the T-x-y kinds."""
    i, j = spec["pair"]
    if spec["data"] == "txy":
        return [water_eg_txy()]
    if spec["data"] == "uniquac-curve":
        return [uniquac_curve(i, j)]
    if spec["data"] == "txy-file":
        return [c for kind, _, c in file_sets(spec) if kind == "txy"]
    return None


def uniquac_curve(i, j):
    """Reference T-x-y curve from the databank UNIQUAC set, used when no open experimental
    data set is at hand; the NRTL set is then fitted to reproduce it."""
    s = System([i, j], "UNIQUAC")
    pts = []
    for x1 in [0.01, 0.03] + [0.05 + 0.9 * k / 16 for k in range(17)] + [0.97, 0.99]:
        T, y = s.bubble_t([x1, 1 - x1], 101.325)
        pts.append((x1, T, y[0]))
    return 101.325, pts


MAC = "data public in the NIST TRC ThermoML Archive"
# starting values of (b_ij, b_ji) in K for nearly immiscible pairs (large positive interaction)
IMMISCIBLE_STARTS = [(1500, 500), (500, 1500), (1000, 1000), (2000, 300), (300, 2000), (100, -100)]
FITS = [
    # Ethyl acetate by esterification benchmark (docs/BENCHMARKS.md, proposal 0004 step 3).
    # Water + acetic acid: the two open 1-atm sets disagree at low water content; the fit uses
    # the one that passes the consistency point test more nearly (Chang 2005: mean |dy| 0.015,
    # Calvar 2005: 0.038), the other is a check.
    dict(pair=("water", "acetic-acid"), data="txy-file", file="water_acetic-acid_101kPa_chang2005.json",
         check=["water_acetic-acid_101kPa_calvar2005.json"], temperature_dependent=False,
         describe=f"Fitted to 18 T-x-y points at 101.33 kPa from Chang, Guan, Li, Yao, J. Chem. Eng. Data 50 (2005) 1129 ({MAC}; validation/data/water_acetic-acid_101kPa_chang2005.json); checked against the 24 points at 101.325 kPa of Calvar, Dominguez, Tojo, Fluid Phase Equilib. 235 (2005) 215 (validation/data/water_acetic-acid_101kPa_calvar2005.json), which scatter more (point test mean |dy| 0.038). Vapour: chemical theory for the acetic acid dimer."),
    # Ethanol dehydration benchmark (docs/BENCHMARKS.md, proposal 0004 step 3). Water + ethylene
    # glycol: the open primary source replaces the Wikipedia compilation it was first fitted to
    # (the compilation stays as a check).
    dict(pair=("water", "ethylene-glycol"), data="txy-file", file="water_ethylene-glycol_101kPa_kamihama2012.json",
         check=["water_ethylene_glycol_760mmHg.json"], temperature_dependent=False, new_set=True,
         describe=f"Fitted to 19 T-x-y points at 101.3 kPa from Kamihama, Matsuda, Kurihara, Tochigi, Oba, J. Chem. Eng. Data 57 (2012) 339 ({MAC}; validation/data/water_ethylene-glycol_101kPa_kamihama2012.json); checked against the older compilation on the Wikipedia ethylene glycol data page (validation/data/water_ethylene_glycol_760mmHg.json), to which it was fitted before."),
    dict(pair=("acetic-acid", "ethylene-glycol"), data="schmid", temperature_dependent=True,
         describe="Fitted to Schmid, Doeker, Gmehling, Fluid Phase Equilib. 258 (2007) 115 (data public in the NIST TRC ThermoML Archive): P-x at 363.15 K (with the paper's pure-component pressures) and HE at 323.15 K."),
    # Methanol + acetone + chloroform: the three pairs of the saddle-azeotrope ternary.
    dict(pair=("methanol", "acetone"), data="txy-file", file="acetone_methanol_101kPa.json", temperature_dependent=False,
         describe=f"Fitted to 19 T-x-y points at 101.3 kPa from Li, Du, Chen, Li, Guo, Zhang, Fluid Phase Equilib. 459 (2018) 10 ({MAC}; validation/data/acetone_methanol_101kPa.json)."),
    dict(pair=("methanol", "chloroform"), data="txy-file", file="chloroform_methanol_101kPa.json", temperature_dependent=False,
         describe=f"Fitted to 19 T-x-y points at 101.3 kPa from Li, Cao, Zhang, Liu, Wang, J. Chem. Eng. Data 59 (2014) 234 ({MAC}; validation/data/chloroform_methanol_101kPa.json)."),
    dict(pair=("acetone", "chloroform"), data="txy-file", file="acetone_chloroform_101kPa.json", temperature_dependent=False,
         describe="Fitted to 9 T-x-y points at 101.3 kPa from Gao, Zhao, Jia, Zhang, Appl. Sci. 8 (2018) 1519 (open access, CC BY 3.0; validation/data/acetone_chloroform_101kPa.json)."),
    # Ethanol + water + ethyl acetate: the three pairs of the minimum-boiling ternary azeotrope.
    dict(pair=("water", "ethanol"), data="txy-file", file="ethanol_water_101kPa.json", temperature_dependent=False,
         describe=f"Fitted to 21 T-x-y points at 101.3 kPa from Kamihama, Matsuda, Kurihara, Tochigi, Oba, J. Chem. Eng. Data 57 (2012) 339 ({MAC}; validation/data/ethanol_water_101kPa.json)."),
    dict(pair=("ethanol", "ethyl-acetate"), data="txy-file", file="ethyl-acetate_ethanol_101kPa.json",
         check=["ethyl-acetate_ethanol_101kPa_zhang2017.json"], temperature_dependent=False,
         describe=f"Fitted to 24 T-x-y points at 101.3 kPa from Calvar, Dominguez, Tojo, Fluid Phase Equilib. 235 (2005) 215 ({MAC}; validation/data/ethyl-acetate_ethanol_101kPa.json); checked against Zhang et al., Fluid Phase Equilib. 454 (2017) 91."),
    dict(pair=("ethanol", "ethylene-glycol"), data="txy-file", file="ethanol_ethylene-glycol_101kPa.json", temperature_dependent=False,
         describe=f"Fitted to 15 T-x-y points at 101.3 kPa (x of ethanol 0.18-0.90) from Kamihama, Matsuda, Kurihara, Tochigi, Oba, J. Chem. Eng. Data 57 (2012) 339 ({MAC}; validation/data/ethanol_ethylene-glycol_101kPa.json)."),
    # Ethanol + water, vapour-liquid and excess-enthalpy data together: a second set, not the
    # default. With tau = a + b/T, no set follows both the 1-atm T-x-y data and the excess
    # enthalpy, which changes sign between 298 and 423 K; the default set stays the
    # vapour-liquid fit above, this one is for enthalpy balances.
    dict(pair=("water", "ethanol"), data="txy-file", temperature_dependent=True, default=False,
         files=["ethanol_water_101kPa.json", "ethanol_water_HE_nagamachi2006.json", "water_ethanol_HE_fang2014.json"],
         describe=f"Fitted to the 21 T-x-y points at 101.3 kPa of Kamihama et al., J. Chem. Eng. Data 57 (2012) 339 together with excess enthalpies at 298.15 and 323.15 K (Nagamachi, Francesconi, J. Chem. Thermodyn. 38 (2006) 461) and at 423.2 K, 5 MPa (Fang et al., J. Chem. Thermodyn. 78 (2014) 204), all {MAC} (validation/data/ethanol_water_101kPa.json, ethanol_water_HE_nagamachi2006.json, water_ethanol_HE_fang2014.json). Not the default set: it follows the excess enthalpy better and the T-x-y data worse than the default set fitted to T-x-y only."),
    # Nearly immiscible pairs: mutual solubilities only (one liquid measured per row in most
    # sets), temperature-dependent; the heterogeneous azeotrope is an independent check.
    dict(pair=("water", "cyclohexane"), data="txy-file", temperature_dependent=True, single_liquid=True,
         files=["water_cyclohexane_lle_marche2006.json", "water_cyclohexane_lle_marche2003.json", "water_cyclohexane_lle_danon2018.json"],
         check=["water_cyclohexane_azeotrope_101kPa.json"], starts=IMMISCIBLE_STARTS, alpha=0.2,
         # alpha 0.3 gives a set with a spurious third liquid at 270-340 K (phase_splits below);
         # 0.2 does not, and follows the solubilities better
         wanted="open vapour-liquid or vapour-liquid-liquid data for the binary at 101.3 kPa (the 1-atm target here is a handbook azeotrope, used as a check only), and more solubility data below 343 K for the water-rich liquid.",
         describe=f"Fitted (NRTL with alpha 0.2: with 0.3 the fitted set predicts a spurious third liquid at 270-340 K) to mutual solubilities: water in cyclohexane at 303-446 K (Marche, Ferronato, de Hemptinne, Jose, J. Chem. Eng. Data 51 (2006) 355), cyclohexane in water at 343-424 K and 1700 kPa (Marche, Delepine, Ferronato, Jose, J. Chem. Eng. Data 48 (2003) 398) and both at 295 K (Danon, Kroon, Banat, J. Chem. Eng. Data 63 (2018) 1123), all {MAC} (validation/data/water_cyclohexane_lle_*.json); checked against the heterogeneous azeotrope at 101.325 kPa, 69.8 degC and 91.5 wt % cyclohexane (CRC Handbook 44th ed., via Wikipedia 'Azeotrope tables')."),
    dict(pair=("ethylene-glycol", "cyclohexane"), data="txy-file", file="ethylene-glycol_cyclohexane_lle_lindemann2014.json",
         temperature_dependent=True, single_liquid=True, starts=IMMISCIBLE_STARTS,
         wanted="open vapour-liquid data for the binary (none found); the parameters rest on three mutual-solubility points at 280-333 K.",
         describe=f"Fitted to mutual solubilities at 280.15, 303.15 and 333.15 K from Lindemann, Duchet-Suchaux, Abou Naccoul, Mokbel, Malicet, Jose, J. Chem. Eng. Data 59 (2014) 3749 ({MAC}; validation/data/ethylene-glycol_cyclohexane_lle_lindemann2014.json)."),
    # Ethanol + acetic acid: the 1-atm T-x-y set and the static P-x data at 298-323 K disagree
    # (a fit to either misses the other by about 3 K or 9 %); both together, temperature-
    # dependent. The two esterify, which may affect either measurement.
    dict(pair=("ethanol", "acetic-acid"), data="txy-file", temperature_dependent=True,
         files=["ethanol_acetic-acid_101kPa.json", "ethanol_acetic-acid_px_brandt2014.json"], check=["acetic-acid_ethanol_HE_brandt2014.json"],
         wanted="consistent open vapour-liquid data at 1 atm (the 1-atm set fails the point test, and it disagrees with the static P-x data at 298-323 K).",
         describe=f"Fitted to 22 T-x-y points at 101.325 kPa (Zhu et al., J. Chem. Eng. Data 58 (2013) 7) and 37 total pressures at 298.15 and 323.15 K, static method, with the measured pure-component pressures (Brandt, Horstmann, Steinigeweg, Gmehling, Fluid Phase Equilib. 376 (2014) 48), both {MAC} (validation/data/ethanol_acetic-acid_101kPa.json, ethanol_acetic-acid_px_brandt2014.json); a fit to either set alone misses the other by about 3 K or 9 %. Checked against the excess enthalpy at 323.15 K of Brandt et al. (validation/data/acetic-acid_ethanol_HE_brandt2014.json). Vapour: chemical theory for the acetic acid dimer."),
    # Ethyl acetate + acetic acid: the static P-x data fit to 0.1 % and predict the 1-atm
    # boiling points within 0.2 K, better than a fit to the 1-atm set itself (its vapour
    # compositions fail the point test).
    dict(pair=("ethyl-acetate", "acetic-acid"), data="txy-file", file="ethyl-acetate_acetic-acid_px_brandt2014.json", temperature_dependent=False,
         check=["ethyl-acetate_acetic-acid_101kPa.json", "ethyl-acetate_acetic-acid_HE_brandt2014.json"],
         describe=f"Fitted to 42 total pressures at 323.15 K, static method, with the measured pure-component pressures, from Brandt, Horstmann, Steinigeweg, Gmehling, Fluid Phase Equilib. 376 (2014) 48 ({MAC}; validation/data/ethyl-acetate_acetic-acid_px_brandt2014.json); checked against the 1-atm T-x-y data of Calvar, Dominguez, Tojo, Fluid Phase Equilib. 235 (2005) 215 (validation/data/ethyl-acetate_acetic-acid_101kPa.json) and the excess enthalpy at 323.15 K of Brandt et al. Vapour: chemical theory for the acetic acid dimer."),
    # Partially miscible: liquid-liquid data, activity coefficients at infinite dilution and the
    # heterogeneous azeotrope at 1 atm together, temperature-dependent. No open finite-
    # concentration VLE data for this pair was found, so the handbook azeotrope is the only VLE
    # target away from infinite dilution; without it the fit puts the 1-atm azeotrope about 2 K
    # too high (pull request #19).
    dict(pair=("water", "ethyl-acetate"), data="txy-file", temperature_dependent=True,
         files=["water_ethyl-acetate_lle_grande2005.json", "water_ethyl-acetate_lle_cehreli2006.json",
                "water_ethyl-acetate_gamma_inf_fenclova2014.json", "water_ethyl-acetate_gamma_inf_atik2004.json",
                "water_ethyl-acetate_azeotrope_101kPa.json"],
         check=["water_ethyl-acetate_lle_xu2017.json"],
         wanted="open finite-concentration VLE data (isobaric T-x-y near 101.3 kPa, isothermal P-x-y, or VLLE); the 1-atm VLE target is a handbook azeotrope. Excess enthalpies (in the ThermoML Archive, Brandt et al., Fluid Phase Equilib. 376 (2014) 48) could also constrain the temperature dependence.",
         describe=f"Fitted to mutual solubilities at 298-333 K (Grande, Marschoff, J. Chem. Eng. Data 50 (2005) 1324; Cehreli, Ozmen, Dramur, Fluid Phase Equilib. 239 (2006) 156), activity coefficients of ethyl acetate at infinite dilution in water at 273-343 K (Fenclova et al., Fluid Phase Equilib. 375 (2014) 347; Atik et al., J. Chem. Eng. Data 49 (2004) 1429), both {MAC}, and the heterogeneous azeotrope at 101.325 kPa, 70.4 degC and 91.9 wt % ethyl acetate (handbook value, Wikipedia 'Azeotrope tables', from Lange's 10th ed. and CRC 44th ed.); files validation/data/water_ethyl-acetate_*.json. No open finite-concentration VLE data was found for this pair."),
]


# Generated fits written as a further set, not the default (2026-11-11, docs/decisions/2026-11-11-06-two-liquid-refit-followup.md):
# 1-butanol + water. The column cases F1, F2 and W2 are built on its ChemSep NRTL set (two liquids on stages 1 and 2);
# with the fitted set as the default they put them on stages 3 and 4, so the maintainer decides which is the default.
# Measured vapour-liquid-liquid points of open articles added to a generated fit (2026-11-11, same decision file): the binary
# water + 1-butanol point of Garcia-Cano and Saquete 2020 (its two liquids and its azeotrope) and the azeotrope of Gomis et
# al. 2013, from the accepted manuscripts the maintainer supplied
EXTRA_FILES = {"1-butanol+water": ["1-butanol_water_azeotrope_garcia-cano2020_101.3kPa.json",
                                   "1-butanol_water_lle_garcia-cano2020_365.73K.json",
                                   "1-butanol_water_azeotrope_gomis2013_101.3kPa.json"]}
EXTRA_DESCRIBE = {
    "1-butanol_water_azeotrope_garcia-cano2020_101.3kPa.json": " Also fitted to the binary vapor-liquid-liquid point of J. Garcia-Cano and M. D. Saquete, Fluid Phase Equilib. (2020) 112617, DOI 10.1016/j.fluid.2020.112617 (accepted manuscript; validation/data/1-butanol_water_azeotrope_garcia-cano2020_101.3kPa.json and validation/data/1-butanol_water_lle_garcia-cano2020_365.73K.json)",
    "1-butanol_water_azeotrope_gomis2013_101.3kPa.json": " and to the azeotrope of V. Gomis et al., J. Chem. Eng. Data (2013), DOI 10.1021/je400501z (accepted manuscript; validation/data/1-butanol_water_azeotrope_gomis2013_101.3kPa.json)."}
NOT_DEFAULT = {"1-butanol+water"}
# Generated fits (vle_batch.py): validation/data/vle/fits.json
GENERATED_FILE = VAL / "vle" / "fits.json"
GENERATED = [dict(pair=tuple(f["pair"]), data="txy-file", file=f["file"], check=f.get("check", []), temperature_dependent=False,
                  describe=f["describe"] + ("".join(EXTRA_DESCRIBE.get(n, "") for n in EXTRA_FILES.get("+".join(sorted(f["pair"])), []))),
                  generated=True,
                  **({"files": [f["file"]] + EXTRA_FILES["+".join(sorted(f["pair"]))]} if "+".join(sorted(f["pair"])) in EXTRA_FILES else {}),
                  default="+".join(sorted(f["pair"])) not in NOT_DEFAULT,
                  # UNIQUAC needs r and q of both components
                  models=["NRTL", "UNIQUAC"] if all(COMPONENTS[c].get("uniquac") for c in f["pair"]) else ["NRTL"])
             for f in (json.loads(GENERATED_FILE.read_text())["fits"] if GENERATED_FILE.exists() else [])]
# A generated fit must follow the data it is fitted to: AAD in T and y for T-x-y, in P for P-x.
GATE = {"T_K": 0.5, "y": 0.012, "P_pct": 1.5,
        # proposal 0019 (answer 2, 2026-11-05: "as a start"): mutual solubilities of a partly miscible pair within 0.02 in
        # mole fraction, or 25 % for a minor component below 0.05 in its liquid
        "x": 0.02, "x_rel": 0.25}
# a fit outside GATE but within WIDE_GATE is written too, with a quality_warning in the record and a "fit-quality"
# entry in src/data/known-issues.json that the workbench shows (decision of the maintainer, 2026-10-11: a set a little
# outside the gate is better than none); a fit that predicts a liquid split in the data range is never written
WIDE_GATE = {"T_K": 2.5, "y": 0.02, "P_pct": 3.0, "x": 0.04, "x_rel": 0.5}
KNOWN_FILE = ROOT / "src" / "data" / "known-issues.json"


def gate(spec, model, params, GATE=GATE):
    """None if a generated fit follows its data within GATE (or the limits given), else the reason."""
    i, j = spec["pair"]
    sets = file_sets(spec)
    txy = [c for kind, _, c in sets if kind == "txy"]
    if txy:
        dT, dy = txy_deviations(txy, model, i, j, [params])
        if np.mean(dT) > GATE["T_K"] or (len(dy) and np.mean(dy) > GATE["y"]):
            return (f"AAD {np.mean(dT):.2f} K, {np.mean(dy):.4f} in y (limits {GATE['T_K']} K, {GATE['y']})" if len(dy) else
                    f"AAD {np.mean(dT):.2f} K in T, no vapour compositions (limit {GATE['T_K']} K)")
    px = [p for kind, _, c in sets if kind == "px" for p in c]
    if px:
        s = System([i, j], model, params=[params])
        dev = []
        for T, x1, P, ps in px:
            s.psat_fixed = list(ps)
            dev.append(abs(s.equilibrium([x1, 1 - x1], T)[0] / P - 1) * 100)
        if np.mean(dev) > GATE["P_pct"]:
            return f"AAD {np.mean(dev):.2f} % in P (limit {GATE['P_pct']} %)"
    tpx = [p for kind, _, c in sets if kind == "tpx" for p in c]
    if tpx:
        s = System([i, j], model, params=[params])
        dev = [abs(s.equilibrium([x1, 1 - x1], T)[0] / P - 1) * 100 for T, x1, P in tpx]
        if np.mean(dev) > GATE["P_pct"]:
            return f"AAD {np.mean(dev):.2f} % in P (limit {GATE['P_pct']} %)"
    if model != "WILSON":
        why = solubility_gate(spec, model, params, GATE)
        if why:
            return why
    return None


def solubility_deviations(spec, model, params):
    """The mutual solubilities of the measured two liquids of a partly miscible pair (proposal 0019): per liquid, the
    model's mole fraction of the minor component against the measured one, at each measured temperature. Returns
    (absolute deviations of liquids whose minor component is 0.05 or more, relative deviations of the others, the
    temperatures where the model has no split)."""
    ll = [p for _, name, c in file_sets(spec) if name.endswith(" (two liquids)") for p in c]
    s = System(list(spec["pair"]), model, params=[params])
    absd, reld, none = [], [], []
    for T, a, b in ll:
        z = lle_from_data(s, T, a, b)
        if z is None:
            none.append(round(float(T), 1))
            continue
        for zm, xd in ((z[0], a), (z[1], b)):
            m, d = (zm, xd) if xd < 0.5 else (1 - zm, 1 - xd)   # the minor component's mole fraction in this liquid
            if d < 0.05:
                reld.append(abs(m / max(d, 1e-12) - 1))
            else:
                absd.append(abs(m - d))
    return absd, reld, none


def solubility_gate(spec, model, params, GATE=GATE):
    """None, or why a partly miscible pair's fit misses its measured mutual solubilities (mean deviations)."""
    if not any(name.endswith(" (two liquids)") for _, name, _ in file_sets(spec)):
        return None
    absd, reld, none = solubility_deviations(spec, model, params)
    if none:
        return f"no liquid-liquid split at the measured two-liquid temperatures {sorted(set(none))[:8]} K"
    if absd and np.mean(absd) > GATE["x"]:
        return f"mutual solubilities: AAD {np.mean(absd):.3f} in mole fraction (limit {GATE['x']})"
    if reld and np.mean(reld) > GATE["x_rel"]:
        return f"mutual solubilities: mean relative deviation {np.mean(reld) * 100:.0f} % of the minor components below 0.05 (limit {GATE['x_rel'] * 100:.0f} %)"
    return None


def score(spec, model, params):
    """How far a set is from the generated fit's data, in units of GATE (the largest of the mean deviations in T, y and
    P divided by their limits); used to compare a set within WIDE_GATE with the set it would replace."""
    i, j = spec["pair"]
    sets = file_sets(spec)
    out = 0.0
    txy = [c for kind, _, c in sets if kind == "txy"]
    if txy:
        dT, dy = txy_deviations(txy, model, i, j, [params])
        out = max(out, np.mean(dT) / GATE["T_K"], (np.mean(dy) / GATE["y"]) if len(dy) else 0.0)
    px = [p for kind, _, c in sets if kind == "px" for p in c]
    if px:
        s = System([i, j], model, params=[params])
        dev = []
        for T, x1, P, ps in px:
            s.psat_fixed = list(ps)
            dev.append(abs(s.equilibrium([x1, 1 - x1], T)[0] / P - 1) * 100)
        out = max(out, np.mean(dev) / GATE["P_pct"])
    tpx = [p for kind, _, c in sets if kind == "tpx" for p in c]
    if tpx:
        s = System([i, j], model, params=[params])
        out = max(out, np.mean([abs(s.equilibrium([x1, 1 - x1], T)[0] / P - 1) * 100 for T, x1, P in tpx]) / GATE["P_pct"])
    if model != "WILSON" and any(name.endswith(" (two liquids)") for _, name, _ in sets):
        # the measured two liquids are part of the same data (follow-up of proposal 0019, 2026-11-11): a set that gives
        # no split where it was measured, or misses the mutual solubilities, does not follow them
        absd, reld, none = solubility_deviations(spec, model, params)
        if none:
            return float("inf")
        if absd:
            out = max(out, np.mean(absd) / GATE["x"])
        if reld:
            out = max(out, np.mean(reld) / GATE["x_rel"])
    return float(out)


def liquid_volume_298(cid):
    """Liquid molar volume (m3/mol) at 298.15 K from the component's density record (DIPPR100 or DIPPR105), the
    temperature held to the record's range as the engine does (for a component solid at 298.15 K: the record's lowest
    temperature)."""
    c = COMPONENTS[cid]
    rec = c["properties"]["liquidDensity"]
    T = min(max(298.15, rec["Tmin_K"]), rec["Tmax_K"])
    k = rec["coefficients"]
    if rec["equation"] == "DIPPR105":
        rho = k["A"] / k["B"] ** (1 + (1 - T / k["C"]) ** k["D"])
    elif rec["equation"] == "DIPPR100":
        rho = sum(k.get(n, 0.0) * T ** e for e, n in enumerate("ABCDE"))
    else:
        raise ValueError(f"{cid}: liquid density equation {rec['equation']}")
    return c["MW"] / 1000 / rho


def wilson_a(i, j):
    """Wilson's a_ij = ln(V_j / V_i), a_ji = -a_ij, with the liquid volumes at 298.15 K (proposal 0016, step 2: the
    constant-volume form of ChemSep's set, confirmed by the maintainer on 2026-11-04); only b_ij and b_ji are fitted."""
    a = float(np.log(liquid_volume_298(j) / liquid_volume_298(i)))
    return a, -a


# Wilson sets kept although the data now show two liquids, until roadmap item D9 classifies the pairs (the
# maintainer's decision, see docs/decisions/2026-11-04-06-wilson-fits.md); empty unless the maintainer names a pair
def by_class(spec):
    """A generated fit of a partly miscible pair is fitted jointly to its vapour-liquid data and the measured two liquids
    (file_sets), temperature-dependent (a + b / T) where the two-liquid points lie more than 5 K outside the
    temperatures of the vapour-liquid data (proposal 0019, section 2)."""
    if not spec.get("generated") or pair_class(spec["pair"]) != "partly miscible":
        return spec
    sets = file_sets(spec)
    ll = [p for _, name, c in sets if name.endswith(" (two liquids)") for p in c]
    if not ll:
        return spec
    lo, hi = data_T_range([s for s in sets if not s[1].endswith(" (two liquids)")])
    if any(T < lo - 5 or T > hi + 5 for T, _, _ in ll):
        return dict(spec, temperature_dependent=True)
    return spec


def overlaps_measured_split(spec):
    """True when the temperatures of a fit's vapour-liquid data reach those of the pair's two-liquid evidence (within
    5 K): the data then include states inside the measured split (proposal 0019, section 4)."""
    vle = [s for s in file_sets(spec) if not s[1].endswith(" (two liquids)")]
    lo, hi = data_T_range(vle)
    ev = [e["T_K"] for e in evidence_of(spec["pair"], "two-liquid") if e.get("T_K")]
    return any(a - 5 <= hi and lo <= b + 5 for a, b in ev)


def wilson_ok(spec):
    """Can Wilson be fitted to this spec's data? Not to liquid-liquid data or a heterogeneous azeotrope: the Wilson
    equation cannot give two liquids (proposal 0016). By class (proposal 0019, section 4): refused only for a pair
    classed partly miscible whose data range overlaps the measured split; miscible and not-known pairs get their fit."""
    if spec["data"] == "schmid":
        return True
    if spec["data"] != "txy-file":
        return False
    cls = pair_class(spec["pair"])
    if cls == "partly miscible":
        return not overlaps_measured_split(spec)
    return not any(kind in ("lle", "haz") for kind, name, _ in file_sets(spec) if not name.endswith(" (two liquids)"))


def spec_models(spec):
    """The models fitted for a spec: its "models", else NRTL and UNIQUAC, and Wilson where wilson_ok."""
    base = list(spec.get("models", ["NRTL", "UNIQUAC"]))
    return base + (["WILSON"] if "WILSON" not in base and wilson_ok(spec) else [])


def make_params(model, i, j, p, alpha=0.3):
    a_ij, a_ji = (p[2], p[3]) if len(p) > 2 else (wilson_a(i, j) if model == "WILSON" else (0.0, 0.0))
    e = dict(model=model, i=i, j=j, a_ij=float(a_ij), a_ji=float(a_ji), b_ij=float(p[0]), b_ji=float(p[1]))
    if model == "NRTL":
        e["alpha"] = alpha
    return e


def minor_ln(z, a, b):
    """ln of the minor component's mole fraction in the measured liquid(s), model and data."""
    out = []
    for zm, xd in ((z[0], a), (z[1], b)):
        if xd is not None:
            m, d = (zm, xd) if xd < 0.5 else (1 - zm, 1 - xd)
            out.append((np.log(max(m, 1e-300)), np.log(d)))
    return out


def file_residuals(s, sets, single=False, w_lle=1.0):
    """Weighted residuals of a system against the data sets of a "txy-file" fit."""
    r = []
    for kind, _, c in sets:
        if kind == "txy":
            P, pts = c
            for x1, T, y1 in pts:
                Tc, y = s.bubble_t([x1, 1 - x1], P)
                r += [(Tc - T) / 0.5] + ([] if y1 is None else [(y[0] - y1) / 0.01])
        elif kind == "lle":
            for T, a, b in c:
                if a is not None and b is not None:
                    r += list(w_lle * s.isoactivity_residual([a, 1 - a], [b, 1 - b], T) / 0.05)
                elif single:
                    z = lle_single(s, T, a, b)
                    r += [100.0] if z is None else [(m - d) / 0.05 for m, d in minor_ln(z, a, b)]
        elif kind == "he":
            for T, x1, h in c:
                r.append((s.excess_enthalpy([x1, 1 - x1], T) - h) / 20.0)
        elif kind == "px":
            for T, x1, P, ps in c:
                s.psat_fixed = list(ps)
                r.append((s.equilibrium([x1, 1 - x1], T)[0] / P - 1) / 0.005)
                s.psat_fixed = None
        elif kind == "tpx":
            for T, x1, P in c:
                r.append((s.equilibrium([x1, 1 - x1], T)[0] / P - 1) / 0.005)
        elif kind == "az":
            for T, P, x1 in c:
                Tc, y = s.bubble_t([x1, 1 - x1], P)
                r += [(Tc - T) / 0.5, (y[0] - x1) / 0.01]
        elif kind == "ginf":
            for T, k, g in c:
                x = [1e-9, 1 - 1e-9] if k == 0 else [1 - 1e-9, 1e-9]
                r.append((np.log(max(s.gamma(x, T)[k], 1e-300)) - np.log(g)) / 0.05)
        else:  # heterogeneous azeotrope: the two liquids at T boil at P with vapour y1
            for T, P, y1 in c:
                z = lle_from_data(s, T, None, None)
                if z is None:
                    r += [100.0, 100.0]
                    continue
                Pc, y = s.equilibrium([z[0], 1 - z[0]], T)
                r += [(Pc - P) / 0.5, (y[0] - y1) / 0.01]
    return r


def fit(spec, model):
    i, j = spec["pair"]
    alpha = spec.get("alpha", 0.3)
    if spec["data"] == "txy-file":
        all_sets = file_sets(spec)
        if model == "WILSON":   # Wilson is fitted to the vapour-liquid data only (it cannot give two liquids)
            all_sets = [st for st in all_sets if not st[1].endswith(" (two liquids)")]
        sets = [st for st in all_sets if st[0] != "haz"]   # first stage: without azeotrope targets

        def residuals(p):
            r = np.array(file_residuals(System([i, j], model, params=[make_params(model, i, j, p, alpha)]), sets, spec.get("single_liquid", False),
                                          spec.get("lle_weight", 1.0)))
            # activity coefficients that overflow (far from the optimum) count as a large miss
            return np.nan_to_num(r, nan=1e4, posinf=1e4, neginf=-1e4)
    elif txy_sets(spec) is not None:
        sets = txy_sets(spec)

        def residuals(p):
            s = System([i, j], model, params=[make_params(model, i, j, p, alpha)])
            r = []
            for P, pts in sets:
                for x1, T, y1 in pts:
                    Tc, y = s.bubble_t([x1, 1 - x1], P)
                    r += [(Tc - T) / 0.5, (y[0] - y1) / 0.01]
            return np.array(r)
    else:
        T0, px, he = schmid()
        pure = [px[-1][1], px[0][1]]

        def residuals(p):
            s = System([i, j], model, psat=pure, params=[make_params(model, i, j, p)])
            r = [(s.equilibrium([x1, 1 - x1], T0)[0] - P) / P / 0.005 for x1, P in px[1:-1]]
            r += [(s.excess_enthalpy([x1, 1 - x1], 323.15) - h) / 20.0 for x1, h in he]
            return np.array(r)

    n = 4 if spec["temperature_dependent"] else 2
    best = None
    for start in spec.get("starts", [(100, -100), (-100, 100), (300, -200), (-200, 300), (500, -300), (-300, 500)]):
        try:
            res = least_squares(residuals, list(start) + [0.0] * (n - len(start)), method="lm")
        except Exception:
            continue
        if best is None or res.cost < best.cost:
            best = res
    if best is None:
        raise RuntimeError("no start of the least-squares fit converged (the bubble-point calculation failed at every "
                           "start)")
    if spec["data"] == "txy-file" and len(sets) < len(all_sets):
        # second stage: all targets, started from the first-stage optimum (where the
        # liquid-liquid split needed by the azeotrope target exists)
        sets = all_sets
        best = least_squares(residuals, best.x, method="lm")
    return make_params(model, i, j, best.x, alpha), best


def txy_deviations(sets, model, i, j, params):
    """Absolute deviations in T (K) and y over all points, with a given parameter list."""
    s = System([i, j], model, params=params)
    dT, dy = [], []
    for P, pts in sets:
        for x1, T, y1 in pts:
            Tc, y = s.bubble_t([x1, 1 - x1], P)
            dT.append(abs(Tc - T))
            if y1 is not None:
                dy.append(abs(y[0] - y1))
    return np.array(dT), np.array(dy)


def lle_from_data(s, T, a, b):
    """Model liquid-liquid split at T started from the measured compositions; when only one
    liquid was measured, the other is searched from several starting values and the widest
    split is kept."""
    if a is not None and b is not None:
        z = s.lle_binary(T, (a, b))
        if z is None:
            # started from the measured liquids the solver may not converge where the model's split is far from them:
            # start from the split of the convex-hull test (phase_splits), in the order of the measured liquids
            for lo, hi in phase_splits(s, T):
                z = s.lle_binary(T, (lo, hi) if a < b else (hi, lo))
                if z is not None:
                    break
        return z
    if a is None and b is None:
        a = 0.985   # no data: start the first liquid rich in the first component of the pair
    best = None
    for g in (0.02, 0.1, 0.2, 0.35, 0.5, 0.65, 0.8, 0.9, 0.98):
        z = s.lle_binary(T, (a, g) if a is not None else (g, b))
        if z is not None and (best is None or abs(z[0] - z[1]) > abs(best[0] - best[1])):
            best = z
    return best


def describe_fit(sets, model, i, j, params, minor=False):
    """Fit quality against "txy-file" data sets, one phrase per kind of data. minor: also the
    relative deviation of the minor component's mole fraction in each measured liquid (for
    solubility data, where absolute deviations say little)."""
    s = System([i, j], model, params=params)
    out = []
    txy = [c for kind, _, c in sets if kind == "txy"]
    if txy:
        dT, dy = txy_deviations(txy, model, i, j, params)
        out.append(f"AAD {np.mean(dT):.2f} K in T, {np.mean(dy):.4f} in y (max {dT.max():.2f} K, {dy.max():.4f})" if len(dy)
                   else f"AAD {np.mean(dT):.2f} K in T (max {dT.max():.2f} K; no vapour compositions)")
    lle = [p for kind, _, c in sets if kind == "lle" for p in c]
    if lle:
        dI, dII, miss, rI, rII = [], [], 0, [], []
        for T, a, b in lle:
            z = lle_single(s, T, a, b) if minor and (a is None) != (b is None) else lle_from_data(s, T, a, b)
            if z is None:
                miss += 1
                continue
            for k, xd in ((0, a), (1, b)):
                if xd is not None:
                    m, d = (z[k], xd) if xd < 0.5 else (1 - z[k], 1 - xd)
                    (rI if k == 0 else rII).append(abs(m / d - 1) * 100)
            if a is not None:
                dI.append(abs(z[0] - a))
            if b is not None:
                dII.append(abs(z[1] - b))
        phr = f"liquid-liquid: AAD {np.mean(dI):.4f} in x of {i} in the {i}-rich liquid" if dI else "liquid-liquid:"
        if dII:
            phr += f", {np.mean(dII):.4f} in the {j}-rich liquid"
        if miss:
            phr += f" ({miss} points without a predicted split)"
        if minor:
            parts = [f"{np.mean(v):.0f} % in the {n}-rich liquid ({len(v)} points, max {np.max(v):.0f} %)" for v, n in ((rI, i), (rII, j)) if v]
            phr += "; mole fraction of the dissolved (minor) component: AARD " + ", ".join(parts)
        out.append(phr)
    ginf = [p for kind, _, c in sets if kind == "ginf" for p in c]
    if ginf:
        dev = []
        for T, k, g in ginf:
            x = [1e-9, 1 - 1e-9] if k == 0 else [1 - 1e-9, 1e-9]
            dev.append(abs(s.gamma(x, T)[k] / g - 1) * 100)
        out.append(f"gamma at infinite dilution: AARD {np.mean(dev):.1f} % (max {np.max(dev):.1f} %)")
    px = [p for kind, _, c in sets if kind == "px" for p in c]
    if px:
        dev = []
        for T, x1, P, ps in px:
            s.psat_fixed = list(ps)
            dev.append(abs(s.equilibrium([x1, 1 - x1], T)[0] / P - 1) * 100)
            s.psat_fixed = None
        Ts = sorted({round(T, 2) for T, _, _, _ in px})
        out.append(f"P-x at {', '.join(f'{T:g}' for T in Ts)} K (with the measured pure-component pressures): AAD {np.mean(dev):.2f} % (max {np.max(dev):.2f} %)")
    tpx = [p for kind, _, c in sets if kind == "tpx" for p in c]
    if tpx:
        dev = [abs(s.equilibrium([x1, 1 - x1], T)[0] / P - 1) * 100 for T, x1, P in tpx]
        out.append(f"total pressures at {min(T for T, _, _ in tpx):g}-{max(T for T, _, _ in tpx):g} K (with the vapour pressures "
                   f"of the component records): AAD {np.mean(dev):.2f} % (max {np.max(dev):.2f} %)")
    he = [p for kind, _, c in sets if kind == "he" for p in c]
    if he:
        dev = [s.excess_enthalpy([x1, 1 - x1], T) - h for T, x1, h in he]
        Ts = sorted({round(T, 2) for T, _, _ in he})
        out.append(f"excess enthalpy at {', '.join(f'{T:g}' for T in Ts)} K: AAD {np.mean(np.abs(dev)):.0f} J/mol (max {np.max(np.abs(dev)):.0f} J/mol; data {min(h for _, _, h in he):.0f} to {max(h for _, _, h in he):.0f} J/mol)")
    for T, P, x1 in [p for kind, _, c in sets if kind == "az" for p in c]:
        Tc, y = s.bubble_t([x1, 1 - x1], P)
        out.append(f"azeotrope at {P} kPa: the liquid of the azeotrope's composition (x of {i} {x1:.3f}) boils at {Tc - 273.15:.2f} degC with a vapour of x {y[0]:.3f} (target {T - 273.15:.2f} degC, y = x)")
    for T, P, y1 in [p for kind, _, c in sets if kind == "haz" for p in c]:
        az = heterogeneous_azeotrope(s, P, T, start=(1 - 1e-4, 1e-3) if minor else None)
        out.append(f"heterogeneous azeotrope at {P} kPa: {az[0] - 273.15:.2f} degC, vapour x of {i} {az[3]:.3f}, liquids {az[1]:.3f} / {az[2]:.3f} (target {T - 273.15:.2f} degC, {y1:.3f})"
                   if az else f"heterogeneous azeotrope at {P} kPa: none found (target {T - 273.15:.2f} degC)")
    return "; ".join(out)


def lle_single(s, T, a, b):
    """Liquid-liquid split at T when one liquid was measured (a or b, x1 in liquid I or II):
    the other liquid is started rich in the component that is dilute in the measured one, from
    a few values, and the first distinct split is kept. None when none is found."""
    meas = a if a is not None else b
    rich1 = meas < 0.5            # the unmeasured liquid is rich in component 1
    for g in (1e-4, 1e-3, 1e-2, 0.1, 0.3):
        other = 1 - g if rich1 else g
        guess = (meas, other) if a is not None else (other, meas)
        try:
            z = s.lle_binary(T, guess)
        except (ValueError, FloatingPointError, OverflowError):
            z = None
        if z is not None:
            return z
    return None


def heterogeneous_azeotrope(s, P, T_guess, span=15.0, start=None):
    """Binary heterogeneous azeotrope: the temperature at which the two liquids in equilibrium
    boil at P. Follows the liquid-liquid split from T_guess - span upwards and bisects.
    start: (x1 in liquid a, x1 in liquid b) to start the split from (nearly immiscible pairs:
    both liquids nearly pure); default: the search of lle_from_data.
    Returns (T, x1 in liquid a, x1 in liquid b, y1) or None."""
    T0 = T_guess - span
    z0 = lle_from_data(s, T0, None, None) if start is None else s.lle_binary(T0, start)
    if z0 is None:
        return None
    P0 = s.equilibrium([z0[0], 1 - z0[0]], T0)[0]
    while T0 < T_guess + span:
        T1 = T0 + 0.5
        z1 = s.lle_binary(T1, z0)
        if z1 is None:
            return None
        P1 = s.equilibrium([z1[0], 1 - z1[0]], T1)[0]
        if (P0 - P) * (P1 - P) <= 0:
            a, b, za = T0, T1, z0
            for _ in range(50):
                m = (a + b) / 2
                zm = s.lle_binary(m, za)
                if zm is None:
                    return None
                if (s.equilibrium([zm[0], 1 - zm[0]], m)[0] - P) * (P0 - P) > 0:
                    a, za = m, zm
                else:
                    b = m
            y = s.equilibrium([zm[0], 1 - zm[0]], m)[1]
            return m, zm[0], zm[1], y[0]
        T0, P0, z0 = T1, P1, z1
    return None


def phase_splits(s, T):
    """Liquid-liquid splits of a binary at T from the lower convex hull of the Gibbs energy of
    mixing on a fine grid (log-spaced near the pure components): the composition ranges
    (x1_a, x1_b) the hull bridges. A fitted set must give the number of splits its data show
    (one for liquid-liquid data, none for a miscible pair): an extra split is a spurious
    liquid phase."""
    xs = np.unique(np.concatenate([np.logspace(-9, -1, 300), np.linspace(0.1, 0.9, 1500), 1 - np.logspace(-1, -9, 300)]))
    g = np.array([x * np.log(x * s.gamma([x, 1 - x], T)[0]) + (1 - x) * np.log((1 - x) * s.gamma([x, 1 - x], T)[1]) for x in xs])
    hull = []
    for p in zip(xs, g):
        while len(hull) >= 2 and (hull[-1][0] - hull[-2][0]) * (p[1] - hull[-2][1]) - (hull[-1][1] - hull[-2][1]) * (p[0] - hull[-2][0]) <= 0:
            hull.pop()
        hull.append(p)
    return [(a[0], b[0]) for a, b in zip(hull, hull[1:]) if b[0] - a[0] > 0.01]


def check_phase_splits(spec, model, params):
    """Raise if the fitted set predicts another number of liquid phases than its data, at
    eleven temperatures across the data range. Wilson, which cannot give two liquids, is refused instead where the
    pair's default NRTL set (else UNIQUAC) predicts two liquids in the data range: a one-liquid fit to a mixture that
    splits would hide the split (proposal 0016, step 2). Where only an NRTL fit to the same data predicts two liquids
    and no measured liquid compositions decide, the Wilson fit is written with a known-issue note: the pairs are
    classified from evidence and fitted by class in roadmap item D9 (the maintainer, 2026-11-04)."""
    cls = pair_class(spec["pair"]) if spec.get("generated") else None
    if model == "WILSON" and cls is not None:
        return   # by class (proposal 0019, section 4): wilson_ok decides; miscible and not-known pairs get their fit
    if model != "WILSON" and cls in NOT_KNOWN:
        return   # a predicted split is kept and labelled (two_liquids_label), not refused (proposal 0019, section 2)
    if model == "WILSON":
        if spec["data"] != "txy-file":
            return   # Schmid et al.'s P-x and excess enthalpies of a miscible pair
        sets = file_sets(spec)
        lo, hi = data_T_range(sets)
        for other in ("NRTL", "UNIQUAC"):
            recs = [p for p in ALL_BINARIES if p["model"] == other and {p["i"], p["j"]} == set(spec["pair"]) and p.get("default", True)]
            if not recs or (other == "UNIQUAC" and not all(COMPONENTS[c].get("uniquac") for c in spec["pair"])):
                continue
            s = System(list(spec["pair"]), other, params=recs)
            bad = [round(float(T), 1) for T in np.linspace(lo, hi, 11) if phase_splits(s, T)]
            if bad:
                raise SystemExit(f"WILSON {spec['pair']}: the pair's default {other} set ({recs[0].get('set', 'default')}) predicts two liquids at T = {bad} K, inside the range of the data; Wilson cannot describe them, so no Wilson fit is written.")
            break
        return
    sets = file_sets(spec)
    if any(name.endswith(" (two liquids)") for _, name, _ in sets):
        # two liquids measured with the VLE data (vle_batch.py, "two_liquids"): a split at every temperature of those
        # points, and no measured one-liquid row predicted inside a split at its own temperature
        s = System(list(spec["pair"]), model, params=[params])
        ll = [p for _, name, c in sets if name.endswith(" (two liquids)") for p in c]
        missing = sorted({round(float(T), 1) for T, _, _ in ll if not phase_splits(s, T)})
        rows = []
        for kind, _, c in sets:
            if kind == "txy":
                rows += [(x1, T) for x1, T, _ in c[1]]
            elif kind in ("px", "tpx"):
                rows += [(p[1], p[0]) for p in c]
        cache, wrong = {}, []
        for x1, T in rows:
            # a row at a measured liquid's composition is on the edge of the split (its bubble point is the three-phase
            # point): not judged here
            if any(abs(T - Tl) <= 0.5 and min(abs(x1 - a), abs(x1 - b)) <= 0.02 for Tl, a, b in ll):
                continue
            sp = cache.setdefault(round(T, 2), phase_splits(s, T))
            if any(a + 1e-3 < x1 < b - 1e-3 for a, b in sp):
                wrong.append((round(x1, 3), round(float(T), 1)))
        if missing or wrong:
            raise SystemExit(f"{model} {spec['pair']}: " + "; ".join(
                ([f"no liquid-liquid split at the measured two-liquid temperatures {missing} K"] if missing else [])
                + ([f"measured one-liquid rows (x1, T) {wrong[:6]} fall inside a predicted split"] if wrong else [])) + "; not written.")
        return
    want = 1 if any(kind in ("lle", "haz") for kind, _, _ in sets) else 0
    lo, hi = data_T_range(sets)
    s = System(list(spec["pair"]), model, params=[params])
    bad = [round(T, 1) for T in np.linspace(lo, hi, 11) if len(phase_splits(s, T)) != want]
    if bad:
        raise SystemExit(f"{model} {spec['pair']}: the fitted set predicts {'no or more than one' if want else 'a'} liquid-liquid split at T = {bad} K, inside the range of its data; not written.")
    if cls == "miscible":
        # nor where the pair was measured as one liquid (the one-liquid evidence of classes.json: its T and x range)
        for e in evidence_of(spec["pair"], "one-liquid"):
            if not (e.get("T_K") and e.get("x")):
                continue
            x0, x1 = e["x"] if spec["pair"][0] == sorted(spec["pair"])[0] else (1 - e["x"][1], 1 - e["x"][0])
            for T in np.linspace(e["T_K"][0], e["T_K"][1], 5):
                if any(a < x1 - 0.01 and b > x0 + 0.01 for a, b in phase_splits(s, T)):
                    raise SystemExit(f"{model} {spec['pair']}: the fitted set predicts a split at {T:.1f} K where the pair was measured as one liquid ({e['citation'][:60]}, doi {e['doi']}); not written.")


def data_T_range(sets):
    """Lowest and highest temperature (K) in the data sets of a "txy-file" fit."""
    Ts = []
    for kind, _, c in sets:
        Ts += [T for _, T, _ in c[1]] if kind == "txy" else [q[0] for q in c]
    return [round(min(Ts), 2), round(max(Ts), 2)]


def quality(spec, model, params):
    i, j = spec["pair"]
    if spec["data"] in ("txy", "uniquac-curve"):
        P, pts = water_eg_txy() if spec["data"] == "txy" else uniquac_curve(i, j)
        s = System([i, j], model, params=[params])
        dT = [abs(s.bubble_t([x1, 1 - x1], P)[0] - T) for x1, T, _ in pts]
        dy = [abs(s.bubble_t([x1, 1 - x1], P)[1][0] - y1) for x1, _, y1 in pts]
        return f"AAD {np.mean(dT):.1f} K, {np.mean(dy):.3f} in y."
    if spec["data"] == "txy-file":
        mi = spec.get("single_liquid", False)
        q = describe_fit(file_sets(spec), model, i, j, [params], mi) + "."
        for name in spec.get("files", [spec["file"]] if "file" in spec else []):
            tl = load(name).get("two_liquids")
            if tl:
                q += (" Two liquids measured (validation/data/%s, two_liquids): %s." % (name, "; ".join(
                    "%s, doi:%s, %s" % (r["citation"], r["doi"], r["sets"]) for r in tl["records"])))
        for kind, name, c in file_sets(spec, "check"):
            q += f" Check against {name}: {describe_fit([(kind, name, c)], model, i, j, [params], mi)}."
        return q
    T0, px, he = schmid()
    s = System([i, j], model, psat=[px[-1][1], px[0][1]], params=[params])
    dP = [abs(s.equilibrium([x1, 1 - x1], T0)[0] / P - 1) * 100 for x1, P in px]
    dH = [abs(s.excess_enthalpy([x1, 1 - x1], 323.15) - h) for x1, h in he]
    return f"AAD {np.mean(dP):.1f} % in P, {np.mean(dH):.0f} J/mol in HE."


def point_test(spec, nterms=4):
    """Thermodynamic consistency point test (Van Ness et al. 1973; Fredenslund et al. 1977):
    fit a Redlich-Kister expansion of G^E/RT to the T-x data only (Barker's method, the
    databank vapour pressures and the same vapour model as the fit: ideal gas, or chemical
    theory for a dimerizing component such as acetic acid) and compare the vapour
    compositions it predicts with the measured ones. Mean |dy| below 0.01 is the usual pass
    criterion. Returns None when the fit has no T-x-y data."""
    i, j = spec["pair"]
    sets = [(P, [p for p in pts if p[2] is not None]) for P, pts in (txy_sets(spec) or [])]
    sets = [(P, pts) for P, pts in sets if pts]
    if not sets:
        return None

    class RK(System):
        def __init__(self, A):
            super().__init__([i, j], "NRTL", params=[])
            self.A = A

        def gamma(self, x, T):
            x1 = float(np.clip(x[0], 1e-12, 1 - 1e-12))
            x2 = 1 - x1
            d = x1 - x2
            A = self.A
            g = x1 * x2 * sum(a * d ** k for k, a in enumerate(A))
            dg = (x2 - x1) * sum(a * d ** k for k, a in enumerate(A)) + x1 * x2 * sum(2 * k * a * d ** (k - 1) for k, a in enumerate(A) if k)
            return np.exp(np.array([g + x2 * dg, g - x1 * dg]))

    def res(A):
        s = RK(A)
        return np.array([(s.bubble_t([x1, 1 - x1], P)[0] - T) for P, pts in sets for x1, T, _ in pts])

    A = least_squares(res, [0.0] * nterms, method="lm").x
    s = RK(A)
    dy = [abs(s.bubble_t([x1, 1 - x1], P)[1][0] - y1) for P, pts in sets for x1, _, y1 in pts]
    return float(np.mean(dy))


def main(write, only=None, models_only=None):
    binaries = json.loads(BIN_FILE.read_text())
    rejected, warned, done, removed = [], [], [], []
    for spec in FITS + GENERATED:
        if only is not None and "+".join(sorted(spec["pair"])) not in only:
            continue
        spec = by_class(spec)
        test = ""
        if spec["data"] == "txy-file":
            dy_test = point_test(spec)
            if dy_test is not None:
                print(f"{spec['pair']}: point test (Redlich-Kister, 4 terms, T-x only): mean |dy| = {dy_test:.4f}")
                test = f" Data consistency point test (Redlich-Kister fit to T-x): mean |dy| {dy_test:.3f}{' (passes, < 0.01)' if dy_test < 0.01 else ' (fails, >= 0.01)'}."
        if spec.get("generated"):
            done.append(tuple(sorted(spec["pair"])))
            # Wilson not fitted to these data any more (two liquids measured with them, read since 2026-11-04): a
            # Wilson set an earlier run fitted to the same data is taken out, the pair's other set becomes its default
            if "WILSON" not in spec_models(spec) and (models_only is None or "WILSON" in models_only):
                old = [r for r in binaries["pairs"] if r["model"] == "WILSON" and {r["i"], r["j"]} == set(spec["pair"])
                       and r.get("tier") == "fitted" and r.get("source", "").startswith(spec["describe"][:80])
                       ]
                if old:
                    binaries["pairs"] = [r for r in binaries["pairs"] if not any(r is o for o in old)]
                    rest = [r for r in binaries["pairs"] if r["model"] == "WILSON" and {r["i"], r["j"]} == set(spec["pair"])]
                    if rest and not any(r.get("default", True) for r in rest):
                        (next((r for r in rest if r.get("set") == "chemsep"), rest[0]))["default"] = True
                    removed.append((spec["pair"], "WILSON", [o.get("set") for o in old]))
                    print(f"  removed the earlier WILSON set {[o.get('set') for o in old]} of {spec['pair']}: two liquids measured with its data")
        for model in spec_models(spec):
            if models_only is not None and model not in models_only:
                continue
            if not spec.get("generated"):
                params, _ = fit(spec, model)
                if spec["data"] == "txy-file":
                    check_phase_splits(spec, model, params)
            else:
                # NRTL: alpha 0.3, else the other usual values 0.2 and 0.47 (a set that predicts a
                # spurious liquid split with one alpha may not with another)
                wide = None   # the first variant outside GATE but within WIDE_GATE, with no liquid split
                # partly miscible pairs: the tie lines may weigh more than the unit weight in the joint fit (the
                # vapour-liquid set decides otherwise); the weights are tried in order, each result is checked by the
                # same gates (follow-up of proposal 0019, 2026-11-11)
                variants = [(w, a) for w in ((1.0, 3.0, 5.0, 7.0, 10.0) if pair_class(spec["pair"]) == "partly miscible" and any(
                    n.endswith(" (two liquids)") for _, n, _ in file_sets(spec)) else (1.0,))
                    for a in ((0.3, 0.2, 0.47) if model == "NRTL" else (None,))]
                for lle_w, alpha in variants:
                    try:
                        params, _ = fit(dict(spec, lle_weight=lle_w) if alpha in (None, 0.3) else dict(spec, alpha=alpha, lle_weight=lle_w), model)
                        if lle_w != 1.0:
                            params["_lle_weight"] = lle_w
                        check_phase_splits(spec, model, params)
                        why = gate(spec, model, params)
                        if why and wide is None and not gate(spec, model, params, WIDE_GATE):
                            wide = (params, why)
                    except (SystemExit, Exception) as e:
                        why = str(e)
                    if not why:
                        break
                if why and wide:
                    # within WIDE_GATE: written only where the pair has no default set of this model, or where the
                    # default set is a databank set that follows the same data less closely
                    cur = next((r for r in binaries["pairs"] if r["model"] == model and {r["i"], r["j"]} == set(spec["pair"])
                                and r.get("default", True)), None)
                    if cur is not None and cur.get("tier") == "fitted" and spec["file"] not in cur.get("source", ""):
                        # a set fitted to other open data is never replaced by a set within the wider limits
                        why = ("%s; the pair has a set fitted to other open data (%s), which stays" % (
                            wide[1], cur.get("set", "default")))
                        wide = None
                    elif cur is not None:
                        try:
                            # the existing set must meet the liquid-liquid checks of these data too (two liquids
                            # measured with them, read since 2026-11-04): a set that misses them never stays
                            check_phase_splits(spec, model, {k: v for k, v in cur.items() if k in ("model", "i", "j", "a_ij", "a_ji", "b_ij", "b_ji", "alpha")} | {"model": model})
                            s_cur = score(spec, model, dict(cur, model=model))
                        except (SystemExit, Exception):
                            s_cur = float("inf")
                        if s_cur <= score(spec, model, wide[0]):
                            why = ("%s; the existing %s set (%s) follows the same data as closely or better, and stays" % (
                                wide[1], cur.get("tier", "databank"), cur.get("set", "default")))
                            wide = None
                if why and wide:
                    params, why_wide = wide
                    params["quality_warning"] = (
                        "Outside the main limits of the fits (%g K, %g in y, %g %% in P) but within the wider ones (%g K, %g, "
                        "%g %%): %s. Use with care; a better data set would replace it." % (
                            GATE["T_K"], GATE["y"], GATE["P_pct"], WIDE_GATE["T_K"], WIDE_GATE["y"], WIDE_GATE["P_pct"],
                            why_wide))
                    warned.append((spec, model, why_wide))
                    print(f"WIDER LIMITS {model} {spec['pair']}: {why_wide}")
                    why = None
                if why:
                    rejected.append((spec["pair"], model, why))
                    print(f"REJECTED {model} {spec['pair']}: {why}")
                    # the pair keeps what it had (proposal 0019, section 2: "not written; the pair keeps what it had";
                    # "existing sets are not changed by this step"): a set of before stays, labelled by its class
                    # (two_liquid_labels.py)
                    continue
            lle_w = params.pop("_lle_weight", None)
            q = quality(spec, model, params) + test
            if lle_w:
                q += (" The measured tie lines carry %g times the unit weight of the joint fit (the weight is tried at 1, 3, 5, 7 and "
                      "10 and the first that follows the data within the limits is kept)." % lle_w)
            params["source"] = f"{spec['describe']} {q}"
            params["tier"] = "databank" if spec["data"] == "uniquac-curve" else "fitted"
            if spec.get("wanted"):
                params["data_wanted"] = spec["wanted"]
            if spec["data"] == "txy-file" and spec["temperature_dependent"]:
                # temperature-dependent sets are trusted only inside the range of their data
                params["T_range_K"] = data_T_range(file_sets(spec))
                params["source"] += f" Temperature range of the data: {params['T_range_K'][0]}-{params['T_range_K'][1]} K; outside it the parameters are extrapolated."
            if spec["data"] == "txy-file":
                # the databank set this fit replaced (kept as a non-default set), on the same data
                i, j = spec["pair"]
                old = [p for p in ALL_BINARIES if p["model"] == model and {p["i"], p["j"]} == {i, j} and p.get("tier") != "fitted"]
                if old:
                    old_q = describe_fit(file_sets(spec) + file_sets(spec, "check"), model, i, j, [dict(old[0], model=model)])
                    print(f"  {model} replaced databank parameters on the same data: {old_q}")
            print(model, spec["pair"], {k: round(v, 4) for k, v in params.items() if isinstance(v, float)}, q)
            # A pair can have several parameter sets per model (proposal 0003); the fit replaces
            # the default set. A databank default replaced by a fit to data stays as a
            # non-default set; a spec with "new_set" (fitted to other data than before) drops the
            # old set name, and one with "default": False adds a further set. Run make_sources.py
            # afterwards: it names new sets and adds their source_ids.
            recs = binaries["pairs"]
            same = lambda r: r["model"] == model and {r["i"], r["j"]} == set(spec["pair"])
            params = {"model": params.pop("model"), "i": params.pop("i"), "j": params.pop("j"), "default": spec.get("default", True), **params}
            if not spec.get("default", True):
                # a further, non-default set: replaces the earlier result of the same fit
                # (recognised by its description), else goes after the pair's other sets
                k = next((k for k, r in enumerate(recs) if same(r) and not r.get("default", True) and r.get("source", "").startswith(spec["describe"][:80])), None)
                if k is not None:
                    recs[k] = ({"model": model, "i": params["i"], "j": params["j"], "set": recs[k]["set"], **params} if recs[k].get("set") else params)
                else:
                    recs.insert(max(k for k, r in enumerate(recs) if same(r)) + 1, params)
                continue
            for k, old in enumerate(recs):
                if same(old) and old.get("default", True):
                    if spec["data"] == "txy-file" and old.get("tier") != "fitted":
                        recs[k] = dict(old, default=False)
                        recs.insert(k, params)
                    else:
                        if old.get("set") and old.get("tier") == params["tier"] and not spec.get("new_set"):
                            params = {"model": params["model"], "i": params["i"], "j": params["j"], "set": old["set"], **params}
                        recs[k] = params
                    break
            else:
                recs.append(params)   # a pair without parameters so far
    for pair, model, why in rejected:
        print(f"not written: {model} {pair[0]} + {pair[1]}: {why}")
    if write:
        BIN_FILE.write_text(json.dumps(binaries, indent=2) + "\n")
        print(f"updated {BIN_FILE}")
        # the "fit-quality" entries of the pairs fitted in this run are replaced by the new ones
        K = json.loads(KNOWN_FILE.read_text())
        # the default set of a pair and model that stays as it was (a refit that did not replace it) keeps its note
        # (a rejected fit leaves the pair's earlier sets and their notes, whatever the reason: proposal 0019, section 2)
        stays = {(tuple(sorted(r["pair"])), m) for r_pair, m, why in rejected for r in [{"pair": r_pair}]}
        K["issues"] = [k for k in K["issues"] if not (k.get("kind") == "fit-quality" and tuple(sorted(k["components"])) in done
                                                      and (models_only is None or k.get("model") in models_only)
                                                      and (tuple(sorted(k["components"])), k.get("model")) not in stays)]
        for spec, model, why in warned:
            K["issues"].append({"components": list(spec["pair"]), "model": model, "kind": "fit-quality",
                                "message": "These %s parameters are fitted to open data but follow them less closely than the "
                                           "other fitted sets: %s (the main limits are %g K, %g in y and %g %% in P). Use with "
                                           "care." % (model, why, GATE["T_K"], GATE["y"], GATE["P_pct"]),
                                "reference": "validation/data/%s (%s)" % (spec["file"], spec["describe"].split(" from ")[-1].split(" (")[0]
                                                                          if " from " in spec["describe"] else spec["file"])})
        KNOWN_FILE.write_text(json.dumps(K, indent=2, ensure_ascii=False) + "\n")
        print(f"updated {KNOWN_FILE}: {len(warned)} fit-quality entries")


if __name__ == "__main__":
    args = sys.argv[1:]
    only = None
    if "--only" in args:
        k = args.index("--only")
        only = {"+".join(sorted(p.split("+"))) for p in args[k + 1:] if not p.startswith("--")}
    models_only = None
    if "--models" in args:
        models_only = set(args[args.index("--models") + 1].upper().split(","))
    main("--write" in args, only, models_only)
