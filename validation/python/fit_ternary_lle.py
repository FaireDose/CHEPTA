"""
Joint fits of a ternary's three NRTL / UNIQUAC pairs to liquid-liquid tie lines and to the binary data of each pair
(proposal 0015, Part I, section 6, item 1). Each fit is defined in TERNARY_FITS below. The result is written to
src/data/binaries.json as a further, non-default set of each of the three pairs, with the same set name, so a system
chooses the three together: createSystem({ components, model, sets: { "water+acetic-acid": NAME, ... } }). The
binary fits of fit_parameters.py stay the defaults.

    python validation/python/fit_ternary_lle.py            # fit and print, no changes
    python validation/python/fit_ternary_lle.py --write    # fit and update binaries.json and the fixture
    python validation/python/fit_ternary_lle.py --fixtures # the fixture only, from the sets in binaries.json

The fixture, validation/fixtures/ternary_lle.json, holds this model's two liquids at the midpoint of every tie line
with the written sets; test/ternary-lle.test.js compares the engine's liquid-liquid split with it.

Objective, the sum of:
  - each pair's own binary data, with the residuals and weights of fit_parameters.py (its FITS entry for the pair:
    the same files, so the set still follows the vapour-liquid, liquid-liquid, infinite-dilution and azeotrope data
    its binary fit follows);
  - every tie line of the ternary files: the two liquids are solved at the tie line's midpoint (successive
    substitution on K_i = gamma_i(I) / gamma_i(II) with Rachford-Rice, below; independent of the engine's splitLL)
    and the mole fractions the record measured ("measured" in the file) are compared with the data,
    each divided by the stated uncertainty of that liquid in the file (0.01 where none is stated). That is the
    maintainer's target for liquid-liquid fits (2026-10-29): the data's stated uncertainty, per system.

All three pairs are temperature-dependent, tau = a + b/T (UNIQUAC: tau = exp(a + b/T)), NRTL alpha as in the pair's
binary fit (0.3). The fit starts from the default sets. A set is written only when each pair still follows its binary
data within the limits of fit_parameters.py (GATE: 0.5 K, 0.012 in y, 1.5 % in P) and each binary predicts the number
of liquids its data show (check_phase_splits); otherwise the reason is printed and nothing is written.

Data file kind "ternary-lle" (validation/data/lle/): "components" (three ids), "columns" T_K, x_1_I, x_2_I, x_3_I,
x_1_II, x_2_II, x_3_II, u_I, u_II (mole fractions in liquids I and II; the stated uncertainty of each liquid's
measured mole fractions, or null); "measured": the columns the record holds (the others are 1 minus the rest), the ones
that are fitted. "check" files are compared, not fitted.
"""
import json
import sys
from pathlib import Path

import numpy as np
from scipy.optimize import brentq, least_squares

sys.path.insert(0, str(Path(__file__).resolve().parent))
import fit_parameters as F  # noqa: E402
import make_sources as MS  # noqa: E402
from reference_model import System, ALL_BINARIES, DATA  # noqa: E402

LLE = F.VAL / "lle"
BIN_FILE = DATA / "binaries.json"
RULES = MS.text_rules(MS.validation_sources())

TERNARY_FITS = [
    # Water + acetic acid + ethyl acetate, the extraction of acetic acid from water by ethyl acetate. The tie lines of
    # Roque et al. (2018) agree with the binary mutual solubilities of the water + ethyl acetate fit (Grande and
    # Marschoff 2005); those of Toikka et al. (2014) have an ester-rich liquid about 0.05 drier in water already on the
    # binary edge (0.142 against 0.1885 at 303.15 K), so they are a check, not fitted (DATA_RULES section 3: sets that
    # disagree are not pooled without a reason to prefer one; here the binary data decide).
    dict(components=("water", "acetic-acid", "ethyl-acetate"), set="fitted-lle-roque2018",
         files=["water_acetic-acid_ethyl-acetate_lle_roque2018.json"],
         check=["water_acetic-acid_ethyl-acetate_lle_toikka2014.json"],
         describe="Fitted jointly, with the other two pairs of water + acetic acid + ethyl acetate, to the 12 liquid-liquid "
                  "tie lines at 293.2 and 313.2 K of Roque, Pinto, de Oliveira, Rabelo, Fluid Phase Equilib. 463 (2018) 34 "
                  f"({F.MAC}; validation/data/lle/water_acetic-acid_ethyl-acetate_lle_roque2018.json), each liquid's mole "
                  "fractions weighted by their stated uncertainty, and to this pair's binary data of its default fit (the "
                  "same files and weights). Choose the three pairs' sets together (set name fitted-lle-roque2018) for "
                  "liquid-liquid extraction with this ternary; the default sets follow the binary data alone and miss "
                  "the ternary tie lines by up to 0.16 in mole fraction (NRTL)."),
]


def ternary_file(name):
    d = json.loads((LLE / name).read_text())
    if d.get("kind") != "ternary-lle":
        raise ValueError(f"{name}: kind {d.get('kind')!r} is not ternary-lle")
    col = {c: k for k, c in enumerate(d["columns"])}
    meas = d["measured"]
    kI = [int(c[2]) - 1 for c in meas if c.endswith("_I")]
    kII = [int(c[2]) - 1 for c in meas if c.endswith("_II")]
    out = []
    for r in d["rows"]:
        a = np.array([r[col[f"x_{k}_I"]] for k in (1, 2, 3)])
        b = np.array([r[col[f"x_{k}_II"]] for k in (1, 2, 3)])
        out.append((r[col["T_K"]], a, b, r[col["u_I"]] or 0.01, r[col["u_II"]] or 0.01, kI, kII))
    return d["components"], out


def split_ll(s, z, T, K):
    """Two liquids of feed z at T, from K (liquid II over liquid I). Returns (x_I, x_II) or None (one liquid)."""
    K = np.clip(np.asarray(K, float), 1e-8, 1e8)
    for _ in range(2000):
        if not np.all(np.isfinite(K)) or K.max() <= 1 or K.min() >= 1:
            return None
        rr = lambda b: np.sum(z * (K - 1) / (1 + b * (K - 1)))
        b = brentq(rr, 1 / (1 - K.max()) + 1e-12, 1 / (1 - K.min()) - 1e-12, xtol=1e-14)
        x1 = z / (1 + b * (K - 1))
        x2 = K * x1
        x1, x2 = x1 / x1.sum(), x2 / x2.sum()
        Kn = s.gamma(x1, T) / s.gamma(x2, T)
        if np.sum(np.log(Kn) ** 2) < 1e-10:
            return None
        if np.max(np.abs(np.log(Kn / K))) < 1e-11:
            return x1, x2
        K = Kn
    return None


def tie_line(s, T, a, b):
    """The model's two liquids at the midpoint of the measured tie line (a, b), ordered as the data (I is the liquid
    richer in the first component), or None."""
    o = split_ll(s, (a + b) / 2, T, np.maximum(b, 1e-4) / np.maximum(a, 1e-4))
    if o is None:
        return None
    x1, x2 = o
    return (x1, x2) if (x1[0] - x2[0]) * (a[0] - b[0]) > 0 else (x2, x1)


def pair_spec(i, j):
    for sp in F.FITS:
        if set(sp["pair"]) == {i, j} and sp.get("default", True) and sp["data"] == "txy-file":
            return sp
    raise ValueError(f"no binary fit of {i} + {j} in fit_parameters.FITS")


def setup(fit, model):
    ids = list(fit["components"])
    pairs = [(ids[0], ids[1]), (ids[0], ids[2]), (ids[1], ids[2])]
    specs = [pair_spec(i, j) for i, j in pairs]
    pairs = [tuple(sp["pair"]) for sp in specs]   # the orientation of the binary fit
    start = []
    for (i, j) in pairs:
        e = next(p for p in ALL_BINARIES if p["model"] == model and p["i"] == i and p["j"] == j and p.get("default", True))
        start += [e["b_ij"], e["b_ji"], e["a_ij"], e["a_ji"]]
    ties = []
    for name in fit["files"]:
        comps, rows = ternary_file(name)
        if comps != ids:
            raise ValueError(f"{name}: components {comps} are not {ids}")
        ties += rows
    return ids, pairs, specs, np.array(start), ties


def params_of(model, pairs, specs, p):
    return [F.make_params(model, i, j, p[4 * k:4 * k + 4], sp.get("alpha", 0.3)) for k, ((i, j), sp) in enumerate(zip(pairs, specs))]


def fit(fit, model):
    ids, pairs, specs, p0, ties = setup(fit, model)
    bsets = [F.file_sets(sp) for sp in specs]
    start = params_of(model, pairs, specs, p0)
    nres = [len(F.file_residuals(System([i, j], model, params=start), sets, sp.get("single_liquid", False)))
            for (i, j), sp, sets in zip(pairs, specs, bsets)]

    def residuals(p):
        ps = params_of(model, pairs, specs, p)
        r = []
        for (i, j), sp, sets, nr in zip(pairs, specs, bsets, nres):
            try:
                r += F.file_residuals(System([i, j], model, params=ps), sets, sp.get("single_liquid", False))
            except (ValueError, FloatingPointError, OverflowError):
                r += [1e3] * nr   # a bubble point not found, far from the optimum
        s = System(ids, model, params=ps)
        for T, a, b, ua, ub, kI, kII in ties:
            try:
                o = tie_line(s, T, a, b)
            except (ValueError, FloatingPointError, OverflowError):
                o = None
            if o is None:
                r += [50.0] * (len(kI) + len(kII))
                continue
            r += list((o[0][kI] - a[kI]) / ua) + list((o[1][kII] - b[kII]) / ub)
        return np.nan_to_num(np.array(r), nan=1e3, posinf=1e3, neginf=-1e3)

    res = least_squares(residuals, p0, method="trf", x_scale="jac")
    return pairs, specs, params_of(model, pairs, specs, res.x)


def tie_deviations(s, ties):
    """Mean and largest absolute deviation of each mole fraction (liquid I: 1, 2, 3; liquid II: 1, 2, 3) and the number
    of tie lines without a predicted split."""
    dev, miss = [], 0
    for T, a, b, *_ in ties:
        o = tie_line(s, T, a, b)
        if o is None:
            miss += 1
            continue
        dev.append(np.abs(np.r_[o[0] - a, o[1] - b]))
    dev = np.array(dev)
    return dev.mean(0), dev.max(0), miss


def describe_ties(s, ids, files):
    out = []
    for name in files:
        _, ties = ternary_file(name)
        m, x, miss = tie_deviations(s, ties)
        ph = lambda k: ", ".join(f"{ids[c]} {m[3 * k + c]:.4f} (max {x[3 * k + c]:.4f})" for c in range(3))
        out.append(f"{name}: AAD in the {ids[0]}-rich liquid {ph(0)}; in the other liquid {ph(1)}"
                   + (f"; {miss} tie lines without a predicted split" if miss else ""))
    return out


def write_fixtures():
    """The two liquids of this model at every tie line's midpoint, with the sets in binaries.json."""
    binaries = json.loads(BIN_FILE.read_text())["pairs"]
    out = {"_about": "Written by validation/python/fit_ternary_lle.py from the independent Python model: the two liquids "
                     "at the midpoint z of each measured tie line, with the jointly fitted sets.", "cases": []}
    for tf in TERNARY_FITS:
        ids = list(tf["components"])
        for model in ("NRTL", "UNIQUAC"):
            ps = [p for p in binaries if p["model"] == model and p.get("set") == tf["set"]
                  and p["i"] in ids and p["j"] in ids]
            if len(ps) != 3:
                continue
            s = System(ids, model, params=ps)
            for name in tf["files"] + tf.get("check", []):
                for T, a, b, *_ in ternary_file(name)[1]:
                    o = tie_line(s, T, a, b)
                    out["cases"].append({"components": ids, "model": model, "set": tf["set"], "file": name, "T_K": T,
                                         "z": list((a + b) / 2), "K0": list(np.maximum(b, 1e-4) / np.maximum(a, 1e-4)), "x_I": None if o is None else list(o[0]),
                                         "x_II": None if o is None else list(o[1])})
    f = F.ROOT / "validation" / "fixtures" / "ternary_lle.json"
    f.write_text(json.dumps(out, indent=1) + "\n")
    print(f"wrote {f}")


def main(write):
    binaries = json.loads(BIN_FILE.read_text())
    recs = binaries["pairs"]
    for tf in TERNARY_FITS:
        ids = list(tf["components"])
        for model in ("NRTL", "UNIQUAC"):
            pairs, specs, ps = fit(tf, model)
            s = System(ids, model, params=ps)
            ties_q = describe_ties(s, ids, tf["files"])
            check_q = describe_ties(s, ids, tf.get("check", []))
            ok, lines = True, []
            for (i, j), sp, p in zip(pairs, specs, ps):
                why = F.gate(dict(sp, generated=False), model, p)
                try:
                    F.check_phase_splits(sp, model, p)
                except SystemExit as e:
                    why = (why + "; " if why else "") + str(e)
                if why:
                    ok = False
                    print(f"NOT WRITTEN {model} {tf['set']}: {i} + {j} leaves its binary data: {why}")
                lines.append((i, j, sp, p, F.describe_fit(F.file_sets(sp), model, i, j, [p], sp.get("single_liquid", False))))
            start = System(ids, model)
            print(f"{model} {tf['set']}: default sets: " + " | ".join(describe_ties(start, ids, tf["files"])))
            print(f"{model} {tf['set']}: joint fit: " + " | ".join(ties_q + [f"check {q}" for q in check_q]))
            for i, j, _, p, q in lines:
                print(f"  {i} + {j}: {q}; {dict((k, round(v, 3)) for k, v in p.items() if isinstance(v, float))}")
            if not (ok and write):
                continue
            Ts = [T for T, *_ in ternary_file(tf["files"][0])[1]]
            for i, j, sp, p, q in lines:
                rng = F.data_T_range(F.file_sets(sp))
                rng = [min(rng[0], min(Ts)), max(rng[1], max(Ts))]
                rec = {"model": model, "i": i, "j": j, "set": tf["set"], "default": False,
                       **{k: v for k, v in p.items() if k not in ("model", "i", "j")},
                       "source": f"{tf['describe']} Ternary tie lines: {'; '.join(ties_q)}." +
                                 "".join(f" Check against {c}." for c in check_q) +
                                 f" This pair's binary data ({', '.join('validation/data/' + n for _, n, _ in F.file_sets(sp))}): {q}. Temperature range of the data: {rng[0]}-{rng[1]} K; "
                                 "outside it the parameters are extrapolated.",
                       "tier": "fitted", "T_range_K": rng}
                # the sources named in this record (make_sources.py's rules), then those of the pair's default fit,
                # whose binary data are fitted here too (its handbook azeotrope, for example, is named only there)
                base = next(r for r in recs if r["model"] == model and {r["i"], r["j"]} == {i, j} and r.get("default"))
                rec["source_ids"] = list(dict.fromkeys(MS.ids_in(rec["source"], RULES) + base.get("source_ids", [])))
                same = lambda r: r["model"] == model and {r["i"], r["j"]} == {i, j}
                k = next((k for k, r in enumerate(recs) if same(r) and r.get("set") == tf["set"]), None)
                if k is not None:
                    recs[k] = rec
                else:
                    recs.insert(max(k for k, r in enumerate(recs) if same(r)) + 1, rec)
    if write:
        BIN_FILE.write_text(json.dumps(binaries, indent=2) + "\n")
        print(f"updated {BIN_FILE}; run make_sources.py next")


if __name__ == "__main__":
    if "--fixtures" in sys.argv[1:]:
        write_fixtures()
    else:
        main("--write" in sys.argv[1:])
        if "--write" in sys.argv[1:]:
            write_fixtures()
