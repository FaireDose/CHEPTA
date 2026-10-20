"""Modified UNIFAC 2.0: parameter file, group assignments of the components, and reference values for the tests.

Model and parameters: N. Hayer, H. Hasse, F. Jirasek, Modified UNIFAC 2.0 - A Group-Contribution Method Completed with
Machine Learning, Ind. Eng. Chem. Res. 64 (2025) 10304-10313, doi:10.1021/acs.iecr.5c00077; open copy arXiv:2412.12962
(https://arxiv.org/abs/2412.12962), CC BY 4.0. The three parameter files are the arXiv ancillary files, stored unchanged
in validation/data/unifac/mod-unifac-2.0/: subgroup size parameters R and Q (identical to the published modified UNIFAC
(Dortmund), the paper says) and the complete tables of the pair-interaction parameters a_nm (K) and b_nm (-) of the 63
main groups. The paper keeps the modified UNIFAC (Dortmund) equations with Psi_nm = exp(-(a_nm + b_nm T)/T) (its eq 1
with c_nm = 0).

Group assignments: each component's structure (SMILES of the chemicals library, MIT) is split into the modified UNIFAC
subgroups by the SMARTS patterns and priorities of the thermo library (MIT; thermo.unifac.DOUFSG, fragmented with RDKit).
Every assignment is checked twice:
  - against the published assignment of DDBST, as shipped with thermo (thermo.unifac DDBST_MODIFIED_UNIFAC_assignments):
    used as a check only; where the two differ the choice and its reason are stated below (CHOSEN);
  - by the atom balance: the subgroups must add up to the molecular formula.
A component without a DDBST assignment is accepted only after a check of its structure, stated below (REVIEWED). A
component the subgroups cannot describe (gases, maleic anhydride, ...) gets an explicit "not available" marker.

    python validation/python/mod_unifac_2.py            # assign and print
    python validation/python/mod_unifac_2.py --write    # write src/data/mod-unifac-2.json, the assignments into
                                                        # src/data/components.json, and the reference values
"""
import argparse
import csv
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "validation" / "data" / "unifac" / "mod-unifac-2.0"
OUT = ROOT / "src" / "data" / "mod-unifac-2.json"
COMP_FILE = ROOT / "src" / "data" / "components.json"
FIXTURES = ROOT / "validation" / "data" / "unifac" / "mod-unifac-2-fixtures.json"

CITATION = ("N. Hayer, H. Hasse, F. Jirasek, Modified UNIFAC 2.0 - A Group-Contribution Method Completed with Machine "
            "Learning, Ind. Eng. Chem. Res. 64 (2025) 10304-10313")
DOI = "10.1021/acs.iecr.5c00077"
OPEN_COPY = "https://arxiv.org/abs/2412.12962"
ACCESS = ("Open access: arXiv:2412.12962 and its parameter files (ancillary files) under CC BY 4.0; the authors "
          "confirmed the licence to the maintainer by e-mail (2026-10-13)")

# subgroup formulas where the thermo library's atom counts do not match the subgroup: THF is the ring ether
# CH2-O-CH2 (R = 1.7023, larger than CY-CH2O, R = 1.4046), as the assignments of tetrahydrofuran (THF + 2 CY-CH2) and
# 1,4-dioxane (2 THF) need
ATOMS_FIX = {27: {"C": 2, "H": 4, "O": 1}}

# where the SMARTS fragmentation and DDBST's published assignment differ: the assignment used, and why
CHOSEN = {
    "tetrahydrofuran": ({27: 1, 78: 2}, "the method has a subgroup for the ring ether, THF (CH2-O-CH2 in a ring); the "
                                        "SMARTS match took a TRIOXAN group and three CY-CH2 instead. Used as DDBST assigns it"),
    "dioxane": ({27: 2}, "two THF subgroups (CH2-O-CH2 in a ring); the SMARTS match took TRIOXAN and CY-CH2 groups. Used "
                         "as DDBST assigns it"),
    "nmp": ({86: 1, 78: 3}, "the method has a subgroup for N-methylpyrrolidone's ring amide, NMP; the SMARTS match took "
                            "the open-chain amide AMCH3CH2. Used as DDBST assigns it"),
    # The maintainer (2026-10-14): Modified UNIFAC 2.0 is a prediction tool; a component gets groups whenever its
    # structure can be described, without waiting for a person to choose. Where the two assignments differ, DDBST's
    # published one is used: it is how the method's own data bank describes the molecule
    "2-methyltetrahydrofuran": ({1: 1, 27: 1, 78: 2}, "the ring ether CH-O-CH2 counted as the THF subgroup and the "
                                                      "methyl as CH3, as DDBST assigns it (the SMARTS match took a "
                                                      "TRIOXAN group, the subgroup of 1,3,5-trioxane)"),
    "thfa": ({2: 1, 14: 1, 27: 1, 78: 2}, "the ring ether CH-O-CH2 counted as the THF subgroup, with CH2 and a primary "
                                          "OH, as DDBST assigns it (the SMARTS match took a TRIOXAN group, the subgroup of "
                                          "1,3,5-trioxane)"),
    "gbl": ({22: 1, 78: 2}, "the lactone's ring ester O-C(=O)-CH2 as CH2COO and two ring CH2, as DDBST assigns it (the "
                            "SMARTS match took NEP, the subgroup of N-ethylpyrrolidone, for a molecule without nitrogen)"),
}
# components without a DDBST assignment whose structure-based assignment is wrong: the assignment used, and why
FROM_STRUCTURE = {
    "propylene-carbonate": ({1: 1, 113: 1}, "the cyclic carbonate subgroup (CH2)2CB, as for ethylene carbonate, and CH3 "
                                            "for the methyl on the ring (the SMARTS match took NEP, the subgroup of "
                                            "N-ethylpyrrolidone, for a molecule without nitrogen)"),
    # The method has no furan-ring subgroup (only furfural as one whole-molecule group). The maintainer (2026-10-14):
    # build the ring from the groups it has, C=C and the ether C-O. Ring O1-C2=C3-C4=C5: the ether O with C5-H as CHO,
    # the double bond C2=C3 as CH=CH (or CH=C where C2 carries a substituent), C4-H as a ring CH; the C4=C5 double bond
    # and the ring's aromatic character are not represented, so this is a rough prediction
    "furan": ({26: 1, 6: 1, 79: 1}, "built from the groups the method has (no furan-ring subgroup), as the maintainer "
                                     "decided: the ring ether CH-O as CHO, one ring double bond as CH=CH, the remaining "
                                     "ring CH as CY-CH; the second double bond and the aromatic character are not "
                                     "represented"),
    "2-methylfuran": ({26: 1, 8: 1, 79: 1, 1: 1}, "built from the groups the method has (no furan-ring subgroup), as the "
                                                  "maintainer decided: the ring ether CH-O as CHO, the substituted ring "
                                                  "double bond as CH=C, the remaining ring CH as CY-CH, and CH3; the "
                                                  "second double bond and the aromatic character are not represented"),
    "furfuryl-alcohol": ({26: 1, 8: 1, 79: 1, 2: 1, 14: 1}, "built from the groups the method has (no furan-ring "
                                                            "subgroup), as the maintainer decided: the ring ether CH-O as "
                                                            "CHO, the substituted ring double bond as CH=C, the remaining "
                                                            "ring CH as CY-CH, and CH2 with a primary OH; the second "
                                                            "double bond and the aromatic character are not represented"),
    "hmf": ({61: 1, 2: 1, 14: 1}, "the ring with its aldehyde as the method's FURFURAL subgroup, and the CH2OH as CH2 "
                                  "with a primary OH (the SMARTS match took the ether subgroup CH2O for the alcohol's "
                                  "CH2-O, leaving out the OH); the substituted ring carbon is counted in FURFURAL"),
}
# assignments that count a substituted ring carbon in the ring's subgroup (THF: CH2-O-CH2; (CH2)2CB: the ring of ethylene
# carbonate): their atom balance is one H above the formula, the way DDBST counts such rings
ONE_H_OVER = {"2-methyltetrahydrofuran", "thfa", "propylene-carbonate", "hmf"}
# components without a DDBST assignment whose structure-based assignment was checked (and passes the atom balance)
REVIEWED = {
    "glycerol": "two primary OH (P), one secondary OH (S), two CH2 and one CH",
    "methyl-linoleate": "ester CH2COO, the methyl ester's CH3 and the chain's CH3, two CH=CH, eleven CH2",
    "triolein": "per oleoyl chain one CH3, thirteen CH2, one CH=CH and one CH2COO; the glycerol backbone two CH2 and one CH",
    "ethylene-carbonate": "the whole molecule is the cyclic carbonate subgroup (CH2)2CB",
    "fructose": "the open-chain ketone form (as for glucose, which DDBST assigns open-chain): the C(=O) with C1 as "
                "CH2CO, C6 as CH2, three CH; two primary OH (P) and three secondary OH (S)",
    "xylose": "the open-chain aldehyde form (as for glucose, which DDBST assigns open-chain; structure from PubChem, "
              "aldehydo-D-xylose): the aldehyde CHO, three CH, one CH2; one primary OH (P) and three secondary OH (S)",
    "muconic-acid": "two COOH and two CH=CH (the subgroups do not tell cis from trans; structure from PubChem)",
    "cyrene": "the ring ketone C(=O) with its CH2 as CH2CO, the CH2-O of the bridge as TRIOXAN and the other ring ether "
              "CH-O as CHO, one ring CH2 and one ring CH",
}

# reference mixtures for the tests: (components, temperatures in K, compositions)
REFERENCE = [
    (["ethanol", "water"], [298.15, 351.0], [[0.1, 0.9], [0.5, 0.5], [0.9, 0.1]]),
    (["acetone", "chloroform"], [298.15, 330.0], [[0.3, 0.7], [0.7, 0.3]]),
    (["methanol", "benzene"], [313.15], [[0.2, 0.8], [0.8, 0.2]]),
    (["tetrahydrofuran", "water"], [303.15, 343.15], [[0.2, 0.8], [0.8, 0.2]]),
    (["nmp", "water"], [323.15], [[0.5, 0.5]]),
    (["n-hexane", "acetonitrile"], [318.15], [[0.5, 0.5]]),
    (["triolein", "methanol"], [333.15], [[0.1, 0.9]]),
    (["glycerol", "water"], [373.15], [[0.3, 0.7]]),
    (["acetone", "methanol", "chloroform"], [330.0], [[0.3, 0.3, 0.4], [0.1, 0.6, 0.3]]),
    (["ethanol", "water", "ethyl-acetate"], [343.15], [[0.2, 0.3, 0.5]]),
    (["dioxane", "water", "toluene"], [353.15], [[0.3, 0.4, 0.3]]),
]


def read_size():
    rows = list(csv.reader((SRC / "Size_Parameters_modUNIFAC20.csv").read_text().splitlines(), delimiter=";"))
    out = {}
    for r in rows[1:]:
        out[int(r[0])] = {"name": r[1], "main": int(r[2]), "mainName": r[3], "R": float(r[4]), "Q": float(r[5])}
    return out


def read_matrix(name):
    rows = list(csv.reader((SRC / name).read_text().splitlines(), delimiter=";"))
    cols = [int(c) for c in rows[0][1:]]
    return {int(r[0]): {c: float(v) for c, v in zip(cols, r[1:])} for r in rows[1:]}


def tables():
    sub, a, b = read_size(), read_matrix("a_Parameters_modUNIFAC20.csv"), read_matrix("b_Parameters_modUNIFAC20.csv")
    main = sorted(a)
    if sorted(b) != main or any(sorted(a[m]) != main or sorted(b[m]) != main for m in main):
        raise SystemExit("the a and b tables do not cover the same main groups")
    missing = sorted({s["main"] for s in sub.values()} - set(main))
    return sub, main, a, b, missing


def atoms_of(groups, DOUFSG):
    tot = {}
    for g, n in groups.items():
        for el, k in ATOMS_FIX.get(g, DOUFSG[g].atoms).items():
            tot[el] = tot.get(el, 0) + n * k
    return tot


def assign(comps, sub):
    from chemicals.elements import simple_formula_parser
    from pubchem import chemical as search_chemical  # PubChem where `chemicals` files the compound under another form
    from rdkit import Chem, RDLogger
    import thermo.unifac as u
    from thermo.group_contribution.group_contribution_base import smarts_fragment_priority
    RDLogger.DisableLog("rdApp.*")
    u.load_group_assignments_DDBST()
    cat = list(u.DOUFSG.values())
    out, log = {}, []
    for cid, c in comps.items():
        meta = search_chemical(c["cas"])
        mol = Chem.MolFromSmiles(meta.smiles)
        counts, _, _, success, status = smarts_fragment_priority(cat, rdkitmol=mol)
        smarts = dict(counts) if success else None
        ddbst = u.DDBST_MODIFIED_UNIFAC_assignments.get(meta.InChI_key)
        formula = {k: v for k, v in simple_formula_parser(meta.formula).items()}
        if cid in CHOSEN:
            groups, why = CHOSEN[cid]
            if ddbst != groups:
                raise SystemExit("%s: the chosen assignment is not DDBST's (%s)" % (cid, ddbst))
            how = "chosen: %s; structure-based (SMARTS) assignment %s" % (why, smarts)
        elif cid in FROM_STRUCTURE:
            if ddbst is not None:
                raise SystemExit("%s: DDBST now lists an assignment (%s); use CHOSEN" % (cid, ddbst))
            groups, why = FROM_STRUCTURE[cid]
            how = "chosen from the structure: %s; DDBST lists no assignment" % why
        elif smarts and ddbst is not None and smarts != ddbst:
            why = ("the structure-based assignment %s and DDBST's %s differ (atom balance: %s and %s against %s); not "
                   "used until a person chooses" % (smarts, ddbst, atoms_of(smarts, u.DOUFSG), atoms_of(ddbst, u.DOUFSG),
                                                    meta.formula))
            out[cid] = {"available": False, "note": "no Modified UNIFAC 2.0 groups: " + why}
            log.append("%-24s not available: %s" % (cid, why))
            continue
        elif smarts and ddbst is not None:
            groups, how = smarts, "assigned from the structure; the same as DDBST's published assignment"
        elif smarts and cid in REVIEWED:
            groups, how = smarts, "assigned from the structure and checked (%s); DDBST lists no assignment" % REVIEWED[cid]
        else:
            why = ("its structure cannot be split into the modified UNIFAC subgroups (%s)" % status if not success else
                   "no DDBST assignment to check the structure-based one (%s) against, and not checked yet" % smarts)
            out[cid] = {"available": False, "note": "no Modified UNIFAC 2.0 groups: " + why}
            log.append("%-24s not available: %s" % (cid, why))
            continue
        bad = [g for g in groups if g not in sub]
        if bad:
            raise SystemExit("%s: subgroups %s are not in Modified UNIFAC 2.0" % (cid, bad))
        expected = dict(formula, H=formula["H"] + 1) if cid in ONE_H_OVER else formula
        if cid in ONE_H_OVER:
            how += " (atom balance one H above %s: a substituted ring carbon counted in the ring's subgroup)" % meta.formula
        if atoms_of(groups, u.DOUFSG) != expected:
            raise SystemExit("%s: the subgroups %s give %s, not the formula %s" % (cid, groups, atoms_of(groups, u.DOUFSG), formula))
        out[cid] = {"groups": {str(g): n for g, n in sorted(groups.items())},
                    "source_ids": ["hayer2025-mod-unifac-2", "thermo-library"],
                    "source": "Modified UNIFAC 2.0 subgroups (%s): %s. %s" % (
                        ", ".join("%d %s" % (n, sub[g]["name"]) for g, n in sorted(groups.items())), how,
                        "Subgroup patterns: thermo library (MIT), RDKit; atom balance checked against %s" % meta.formula)}
        log.append("%-24s %s%s" % (cid, out[cid]["source"][:110], "" if cid not in CHOSEN else "  [chosen]"))
    return out, log


def reference_values(comps, assigned, sub, main, a, b):
    """ln gamma from the thermo library's modified UNIFAC (Dortmund) implementation (UNIFAC version 1), with the
    Modified UNIFAC 2.0 tables: the independent calculation the engine is tested against."""
    import thermo.unifac as u
    ip = {m: {n: (a[m][n], b[m][n], 0.0) for n in main} for m in main}
    out = []
    for ids, Ts, xs in REFERENCE:
        groups = [{int(g): n for g, n in assigned[i]["groups"].items()} for i in ids]
        for T in Ts:
            for x in xs:
                g = u.UNIFAC.from_subgroups(T=T, xs=x, chemgroups=groups, version=1, interaction_data=ip,
                                            subgroups=u.DOUFSG)
                out.append({"components": ids, "T_K": T, "x": x, "lnGamma": [float(v) for v in __import__("numpy").log(g.gammas())]})
    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--write", action="store_true")
    args = ap.parse_args()
    sub, main_groups, a, b, missing = tables()
    print("Modified UNIFAC 2.0: %d subgroups, %d main groups, %d x %d a and b; subgroups of main groups without "
          "interaction parameters: %s" % (len(sub), len(main_groups), len(main_groups), len(main_groups),
                                          [g for g, s in sub.items() if s["main"] in missing]))
    doc = json.loads(COMP_FILE.read_text())
    assigned, log = assign(doc["components"], sub)
    print("\n".join(log))
    n_ok = sum(1 for v in assigned.values() if "groups" in v)
    print("%d of %d components have groups" % (n_ok, len(assigned)))
    ref = reference_values(doc["components"], assigned, sub, main_groups, a, b)
    print("%d reference values (thermo)" % len(ref))
    if not args.write:
        return
    usable = [g for g, s in sub.items() if s["main"] in main_groups]
    # the atoms of each subgroup, for the atom balance of groups a person chooses (proposal 0012, step 5): the thermo
    # library's (MIT; thermo.unifac.DOUFSG) with the corrections of ATOMS_FIX; null where it has none (BTI-)
    import thermo.unifac as u
    atoms = {g: (atoms_of({g: 1}, u.DOUFSG) if g in u.DOUFSG else None) for g in usable}
    data = {
        "_about": ("Modified UNIFAC 2.0 (%s; %s), CC BY 4.0. Subgroups with R, Q and main group; the a (K) and b (-) "
                   "tables of the main groups, a[i][j] and b[i][j] for main groups main[i] and main[j], "
                   "Psi = exp(-(a + b T)/T). Written by validation/python/mod_unifac_2.py from the arXiv files in "
                   "validation/data/unifac/mod-unifac-2.0/ (unchanged). The atoms of each subgroup (for the atom "
                   "balance) are the thermo library's (MIT; thermo.unifac.DOUFSG), with the corrections of "
                   "mod_unifac_2.py; null where it has none." % (CITATION, OPEN_COPY)),
        "source": {"citation": CITATION, "doi": DOI, "open_copy": OPEN_COPY, "access": ACCESS,
                   "tables": "ancillary files Size_Parameters_modUNIFAC20.csv, a_Parameters_modUNIFAC20.csv, "
                             "b_Parameters_modUNIFAC20.csv"},
        "subgroups": {str(g): {"name": s["name"], "main": s["main"], "R": s["R"], "Q": s["Q"], "atoms": atoms[g]} for g, s in sub.items() if g in usable},
        "mainGroups": {str(s["main"]): s["mainName"] for s in sub.values()},
        "main": main_groups,
        "a": [[a[m][n] for n in main_groups] for m in main_groups],
        "b": [[b[m][n] for n in main_groups] for m in main_groups],
    }
    OUT.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")) + "\n")
    for cid, rec in assigned.items():
        doc["components"][cid]["modUnifac"] = rec
    COMP_FILE.write_text(json.dumps(doc, indent=2, ensure_ascii=False) + "\n")
    FIXTURES.write_text(json.dumps({
        "_about": "ln gamma of Modified UNIFAC 2.0 from the thermo library (MIT; thermo.unifac.UNIFAC, version 1, the "
                  "modified UNIFAC (Dortmund) equations) with the parameter tables of src/data/mod-unifac-2.json and "
                  "the group assignments of src/data/components.json; written by validation/python/mod_unifac_2.py, "
                  "read by test/mod-unifac.test.js.",
        "thermo_version": __import__("thermo").__version__, "values": ref}, indent=1) + "\n")
    print("written %s, the assignments in %s, %s" % (OUT.relative_to(ROOT), COMP_FILE.relative_to(ROOT), FIXTURES.relative_to(ROOT)))


if __name__ == "__main__":
    sys.exit(main())
