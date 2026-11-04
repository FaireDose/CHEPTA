"""Add NRTL, UNIQUAC and Wilson parameters from the ChemSep databank (Artistic License 2.0, as shipped
with the open-source thermo library) for pairs that have no open experimental data to fit
(proposal 0004, step 3). Pairs that already have a set of that model are left alone.

    python validation/python/chemsep_pairs.py            # print, no changes
    python validation/python/chemsep_pairs.py --write    # add to src/data/binaries.json
    python validation/python/chemsep_pairs.py --all [--write]   # every ChemSep pair among
                                                         # the components that has no set yet
    python validation/python/chemsep_pairs.py --all --models WILSON [--write]   # one model only

Wilson (proposal 0016): ChemSep's form is Lambda_ij = (V_j / V_i) exp(-A_ij / RT), A_ij in cal/mol; the thermo
library ships it converted to Lambda_ij = exp(a_ij + b_ij / T), a_ij = ln(V_j / V_i), b_ij = -A_ij / R in K
(R = 1.98720 cal/mol/K; thermo.wilson.Wilson, "In ChemSep, the form of the Wilson lambda equation is ..."). That is
CHEPTA's form (src/thermo/activity/wilson.js), so a_ij and b_ij are taken as they are, a_ij included.

Then run make_sources.py (it names the sets "chemsep" and adds their source_ids).

Each entry of PAIRS lists where open data was searched; the reason is kept in the pair's
"data_wanted" so the interface and docs/DATA_WANTED.md can show it.
"""
import json
import sys
import warnings
from pathlib import Path

warnings.filterwarnings("ignore")
from thermo.interaction_parameters import IPDB  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
BIN_FILE = ROOT / "src" / "data" / "binaries.json"
COMPONENTS = json.loads((ROOT / "src" / "data" / "components.json").read_text())["components"]

PAIRS = [
    dict(pair=("ethanol", "cyclohexane"),
         wanted="open binary vapour-liquid data (isobaric T-x-y near 101.3 kPa or isothermal P-x-y) and liquid-liquid or miscibility data below 323 K. Searched: NIST TRC ThermoML Archive (ternary sets with water only: Gomis et al., Fluid Phase Equilib. 235 (2005) 7; Antosik et al., J. Chem. Eng. Data 49 (2004) 7; Cui et al., J. Chem. Eng. Data 49 (2004) 212), Crossref, open repositories. Open checks: the 1-atm azeotrope (64.9 degC, 69.5 wt % cyclohexane; validation/data/ethanol_cyclohexane_azeotrope_101kPa.json) and the excess enthalpy at 323.15 K, one liquid over the whole range (Lien et al., J. Chem. Eng. Data 48 (2003) 359; validation/data/ethanol_cyclohexane_HE_lien2003.json). A fit to these two alone predicts two liquids at 323 K, against the second; NRTL: the databank set passes both checks but predicts two liquids below about 315 K, not checked against data; UNIQUAC: the databank set predicts two liquids at 323-338 K (src/data/known-issues.json)"),
]


def cas(cid):
    return COMPONENTS[cid]["cas"]


TABLES = {"NRTL": "ChemSep NRTL", "UNIQUAC": "ChemSep UNIQUAC", "WILSON": "ChemSep Wilson"}
NAMES = {"NRTL": "NRTL", "UNIQUAC": "UNIQUAC", "WILSON": "Wilson"}


def record(model, i, j, wanted):
    table = TABLES[model]
    ci, cj = cas(i), cas(j)
    if not (IPDB.has_ip_specific(table, [ci, cj], "bij") or IPDB.has_ip_specific(table, [cj, ci], "bij")):
        raise SystemExit(f"{model} {i} + {j}: not in the ChemSep databank")
    b_ij = IPDB.get_ip_specific(table, [ci, cj], "bij")
    b_ji = IPDB.get_ip_specific(table, [cj, ci], "bij")
    if b_ij == 0 and b_ji == 0:
        raise SystemExit(f"{model} {i} + {j}: not in the ChemSep databank")
    a_ij = a_ji = 0.0
    if model == "WILSON":   # ln(V_j / V_i) of ChemSep's liquid volumes
        a_ij = float(IPDB.get_ip_specific(table, [ci, cj], "aij"))
        a_ji = float(IPDB.get_ip_specific(table, [cj, ci], "aij"))
    rec = {"model": model, "i": i, "j": j, "a_ij": a_ij, "a_ji": a_ji, "b_ij": float(b_ij), "b_ji": float(b_ji)}
    if model == "NRTL":
        rec["alpha"] = float(IPDB.get_ip_specific(table, [ci, cj], "alphaij"))
    rec["source"] = f"ChemSep {NAMES[model]} databank (via the open-source thermo library)."
    if model == "WILSON":
        rec["source"] += (" Lambda_ij = exp(a_ij + b_ij / T): a_ij = ln(V_j / V_i) of ChemSep's liquid molar volumes and"
                          " b_ij = -A_ij / R from its A_ij in cal/mol, as converted by thermo.")
    rec["tier"] = "databank"
    rec["data_wanted"] = wanted
    return rec


ALL_WANTED = "open experimental data to fit (proposal 0004 step 3; the databank set is used until then)."


def splits_note(rec):
    """Where the set predicts two liquids at 273.15-373.15 K (convex-hull test of
    fit_parameters.phase_splits), as a phrase for the record; empty when it predicts one."""
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from fit_parameters import phase_splits
    from reference_model import System
    s = System([rec["i"], rec["j"]], rec["model"], params=[rec])
    found = []
    for T in (273.15, 298.15, 323.15, 348.15, 373.15):
        sp = phase_splits(s, T)
        if sp:
            a, b = sp[0]
            found.append(f"{T:g} K: x({rec['i']}) {a:.3g}-{b:.3g}")
    return ("The set predicts two liquid phases (" + "; ".join(found) + "), not checked against data in this import.") if found else ""


def all_pairs(doc, models):
    """Every pair among the components that ChemSep has and CHEPTA lacks a set of one of the two models
    for, as PAIRS entries (main() then imports only the model the pair lacks: a pair with a fitted NRTL
    set can still take its UNIQUAC set from ChemSep)."""
    have = {}
    for r in doc["pairs"]:
        have.setdefault(frozenset((r["i"], r["j"])), set()).add(r["model"])
    ids = sorted(COMPONENTS)
    out = []
    for n, a in enumerate(ids):
        for b in ids[n + 1:]:
            if not set(models) <= have.get(frozenset((a, b)), set()):
                out.append(dict(pair=(a, b), wanted=ALL_WANTED))
    return out


def main(write):
    doc = json.loads(BIN_FILE.read_text())
    models = sys.argv[sys.argv.index("--models") + 1].upper().split(",") if "--models" in sys.argv else ["NRTL", "UNIQUAC"]
    pairs = all_pairs(doc, models) if "--all" in sys.argv else PAIRS
    added = 0
    for p in pairs:
        i, j = p["pair"]
        for model in models:
            if any(r["model"] == model and {r["i"], r["j"]} == {i, j} for r in doc["pairs"]):
                print(f"{model} {i} + {j}: already has a set, left alone")
                continue
            if model == "UNIQUAC" and any("uniquac" not in COMPONENTS[c] for c in (i, j)):
                continue   # no UNIQUAC r and q for a component (propylene glycol)
            try:
                rec = record(model, i, j, p["wanted"])
            except SystemExit:
                if "--all" in sys.argv:
                    continue   # not in the databank for this model
                raise
            if "--all" in sys.argv and model != "WILSON":   # Wilson never predicts two liquids
                note = splits_note(rec)
                if note:
                    rec["source"] += " " + note
            print({k: v for k, v in rec.items() if k not in ("source", "data_wanted")}, rec["source"][60:])
            doc["pairs"].append(rec)
            added += 1
    print(f"{added} sets added")
    if write:
        BIN_FILE.write_text(json.dumps(doc, indent=2) + "\n")
        print(f"updated {BIN_FILE}")


if __name__ == "__main__":
    main("--write" in sys.argv)
