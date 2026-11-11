"""Open evidence on the miscibility of the pairs whose activity-model sets predict two liquids (proposal 0019, step 1).

The pairs are:
  - the ChemSep NRTL and UNIQUAC sets of src/data/binaries.json whose record says "The set predicts two liquid
    phases" (chemsep_pairs.splits_note, 273.15-373.15 K);
  - the generated fits of validation/data/vle/fits.json that fit_parameters.py refused because the fitted set predicts
    a liquid-liquid split inside the range of its data (REFUSED below, from the run of 2026-11-04: the reason printed
    for each alpha tried; pairs refused only for the quality gate are not listed).

For each pair the NIST TRC ThermoML Archive's bulk file (ThermoML.v2020-09-30.tgz, doi 10.18434/mds2-2422, NIST open
license) is read once, and every binary data set of the pair is kept:
  - sets with two liquid phases ("Liquid mixture 1" and "Liquid mixture 2", with or without a gas): liquid-liquid
    equilibrium, mutual solubilities or vapour-liquid-liquid points. They show that the pair splits, at their
    temperatures;
  - sets of one liquid phase only (density, excess enthalpy, viscosity, speed of sound, surface tension, ...): each
    point is a liquid measured as one phase at its temperature and composition. A point strictly inside the split the
    set predicts at that temperature (by more than 0.01 in mole fraction on both sides) contradicts the prediction.
    Vapour-liquid sets are not used for this: a ThermoML vapour-liquid set may list the two liquids of a three-phase
    point as ordinary rows.

Each pair is then classed:
  partly miscible   the archive has two-liquid sets for it;
  miscible          no two-liquid set, and one-liquid points inside the predicted split (the prediction is
                    contradicted where those points lie; the classification says at which temperatures);
  not known         neither.

Run:
    python validation/python/two_liquid_survey.py --archive ThermoML.v2020-09-30.tgz [--markdown]
    python validation/python/two_liquid_survey.py --archive ThermoML.v2020-09-30.tgz --classes   # step 2

--classes (proposal 0019, step 2) also covers every pair of the generated fits (validation/data/vle/fits.json), so
that a pair whose sets predict one liquid where two were measured is found too, and writes:
  - validation/data/two_liquids/classes.json: per pair its class and a list of evidence entries, one per article and
    kind, { kind: "two-liquid" | "one-liquid", doi, citation, sets, T_K: [lo, hi], P_kPa: [lo, hi] or null,
    x: [lo, hi] } (x: mole fraction of the first component of the pair key; for "two-liquid", the range of both
    liquids). Class "miscible below the measured temperature, not known above it" (answer 3 of the maintainer,
    2026-11-05): no one-liquid point inside a predicted split, but one-liquid points over the composition range
    (x from 0.1 or less to 0.9 or more) at temperatures below those where a set predicts the split;
  - validation/data/two_liquids/lle/<pair>.json: the measured two liquids of each partly miscible pair (T, P, x in
    each liquid), read with vle_batch.two_liquid_points, with the records they come from, for the joint fits.

writes validation/data/two_liquids/survey.json; --markdown also prints the table of proposal 0019. The refused
fits are fitted again (alpha 0.3 for NRTL, the first alpha fit_parameters.py tries) to know where they split; that
takes some minutes.
"""
import argparse
import json
import sys
import tarfile
from collections import defaultdict
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
import thermoml_read  # noqa: E402
from measured_components import norm_inchi  # noqa: E402
from scan_archive import inchi_index  # noqa: E402
import fit_parameters as F  # noqa: E402
from reference_model import System  # noqa: E402
from vle_batch import two_liquid_points  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "validation" / "data" / "two_liquids" / "survey.json"
BIN = json.loads((ROOT / "src" / "data" / "binaries.json").read_text())["pairs"]

# Generated fits refused for a predicted split (fit_parameters.py, 2026-11-04, every alpha tried; NRTL at alpha 0.47
# passed for 1-butanol + water, methanol + n-heptane and gvl + water, and alpha 0.3 for o-xylene + sulfolane, but the
# others predicted a split). The Wilson sets of these pairs (PR #200) are noted where they exist.
REFUSED = ["1-butanol+water", "2-propanol+glycerol", "diethyl-carbonate+water", "dimethyl-carbonate+glycerol",
           "ethanol+n-decane", "furfural+water", "gvl+water", "methanol+n-heptane", "n-pentane+water",
           "o-xylene+sulfolane"]
WILSON_PR200 = ["2-propanol+glycerol", "diethyl-carbonate+water", "ethanol+n-decane", "gvl+water", "o-xylene+sulfolane"]


def key(a, b):
    return "+".join(sorted((a, b)))


def chemsep_sets():
    """Pair key -> list of (model, record) of the databank sets whose record notes a predicted split."""
    out = defaultdict(list)
    for r in BIN:
        if r.get("tier") == "databank" and "predicts two liquid" in json.dumps(r):
            out[key(r["i"], r["j"])].append((r["model"], r))
    return out


def refused_sets():
    """Pair key -> list of (model, params, T range of the data) of the refused fits, fitted again."""
    out = defaultdict(list)
    for spec in F.GENERATED:
        k = key(*spec["pair"])
        if k not in REFUSED:
            continue
        for model in spec["models"]:
            try:
                params, _ = F.fit(spec, model)
            except (SystemExit, Exception) as e:
                print(f"  {k} {model}: no fit ({e})", file=sys.stderr)
                continue
            out[k].append((model, params, F.data_T_range(F.file_sets(spec))))
    return out


def citation_of(rec):
    from vle_batch import citation
    try:
        return citation(rec)
    except Exception:
        return rec["citation"].get("title") or rec["citation"]["doi"]


def scan(path, pairs, tie=None):
    """Binary data sets of the archive for the pairs: phases, properties, and per point T and the mole fraction of
    the first component of the key (alphabetical) in each phase given."""
    by_inchi = inchi_index()
    want = {c for k in pairs for c in k.split("+")}
    out = defaultdict(list)
    with tarfile.open(path, "r:gz") as tar:
        for m in tar:
            if not m.isfile() or not m.name.endswith(".xml"):
                continue
            try:
                rec = thermoml_read.parse(tar.extractfile(m).read())
            except Exception:
                continue
            ours = {n: by_inchi.get(norm_inchi(c["inchi"])) if c["inchi"] else None for n, c in rec["compounds"].items()}
            if not set(ours.values()) & want:
                continue
            for s in rec["sets"]:
                if len(s["components"]) != 2:
                    continue
                ca, cb = (ours.get(x) for x in s["components"])
                if not ca or not cb or ca == cb or key(ca, cb) not in pairs:
                    continue
                first = sorted((ca, cb))[0]
                num = next(n for n, v in ours.items() if v == first)
                Tc = [c["value"] for c in s["constraints"] if c["type"] and c["type"].startswith("Temperature")]
                xc = [(c["compound"], c["phase"], c["value"]) for c in s["constraints"]
                      if c["type"] and "mole fraction" in c["type"].lower()]
                pts = []
                for row in s["rows"]:
                    T = next((row["v" + vn] for vn, v in s["variables"].items()
                              if v["type"] and v["type"].startswith("Temperature") and "v" + vn in row), Tc[0] if Tc else None)
                    xs = []
                    for vn, v in s["variables"].items():
                        if v["type"] and "mole fraction" in v["type"].lower() and "v" + vn in row:
                            xs.append((v["phase"], row["v" + vn] if v["compound"] == num else 1 - row["v" + vn]))
                    for pn, p in s["properties"].items():
                        if p["name"] and "mole fraction" in p["name"].lower() and "p" + pn in row:
                            xs.append((p["phase"][0] if p["phase"] else None,
                                       row["p" + pn] if p["compound"] == num else 1 - row["p" + pn]))
                    for comp, ph, val in xc:
                        xs.append((ph, val if comp == num else 1 - val))
                    pts.append([T, xs])
                Pc = [c["value"] for c in s["constraints"] if c["type"] and c["type"].startswith("Pressure")]
                Ps = [row["v" + vn] for row in s["rows"] for vn, v in s["variables"].items()
                      if v["type"] and v["type"].startswith("Pressure") and "v" + vn in row] or Pc
                c = rec["citation"]
                out[key(ca, cb)].append(dict(
                    doi=c["doi"], year=c["year"], author=(c["authors"] or ["?"])[0], journal=c["journal"],
                    file=m.name, set=s["number"], phases=s["phases"],
                    props=sorted({p["name"] or "?" for p in s["properties"].values()}), pts=pts,
                    P=[min(Ps), max(Ps)] if Ps else None, citation=citation_of(rec)))
            if tie is not None:
                # the measured two liquids of the pairs of this record (vle_batch.two_liquid_points), per pair
                for k in {key(ours.get(x), ours.get(y)) for s in rec["sets"] if len(s["components"]) == 2
                          for x, y in [s["components"]] if ours.get(x) and ours.get(y) and ours.get(x) != ours.get(y)}:
                    if k not in pairs:
                        continue
                    first, second = k.split("+")
                    num = {n: ("a" if v == first else "b" if v == second else None) for n, v in ours.items()}
                    rows, used = two_liquid_points(rec, first, second, num=num)
                    if rows:
                        tie[k].append(dict(doi=rec["citation"]["doi"], citation=citation_of(rec), sets=used, rows=rows))
    return out


def two_liquid(s):
    return sum("Liquid" in p for p in s["phases"]) >= 2


def one_liquid(s):
    return [p for p in s["phases"] if p != "Air at 1 atmosphere"] == ["Liquid"]


def classify(k, sets, predictions):
    """predictions: list of (label, System, T range or None)."""
    ll = [s for s in sets if two_liquid(s)]
    one = [s for s in sets if one_liquid(s)]
    res = dict(pair=k, predictions=[lab for lab, _, _ in predictions])
    if ll:
        Ts = [p[0] for s in ll for p in s["pts"] if p[0]]
        res["two_liquid_sets"] = dict(
            sets=len(ll), articles=sorted({f"{s['author']} {s['year']}, doi {s['doi']}" for s in ll}),
            T_K=[round(min(Ts), 2), round(max(Ts), 2)] if Ts else None)
    inside = defaultdict(list)
    cache = {}
    for s in one:
        for T, xs in s["pts"]:
            liq = [x for ph, x in xs if ph and ph.startswith("Liquid")] or [x for _, x in xs]
            if T is None or not liq or not 0 < liq[0] < 1:
                continue
            x = liq[0]
            for lab, sysm, rng in predictions:
                if rng and not (rng[0] - 5 <= T <= rng[1] + 5):
                    continue
                Tr = round(T, 0)
                if (lab, Tr) not in cache:
                    cache[(lab, Tr)] = F.phase_splits(sysm, Tr)
                if any(a + 0.01 < x < b - 0.01 for a, b in cache[(lab, Tr)]):
                    inside[lab].append((T, x, f"{s['author']} {s['year']}, doi {s['doi']}"))
    if inside:
        res["one_liquid_inside_predicted_split"] = {
            lab: dict(points=len(v), T_K=[round(min(t for t, _, _ in v), 2), round(max(t for t, _, _ in v), 2)],
                      articles=sorted({a for _, _, a in v})) for lab, v in inside.items()}
    res["one_liquid_sets"] = len(one)
    res["class"] = "partly miscible" if ll else ("miscible" if inside else "not known")
    return res


CLASSES = ROOT / "validation" / "data" / "two_liquids" / "classes.json"
LLE_DIR = ROOT / "validation" / "data" / "two_liquids" / "lle"
ACCESS = "The journal article may be subscription-only; the same data is public in the NIST TRC ThermoML Archive (NIST open license)."
SPAN = (0.1, 0.9)   # one-liquid points from x <= 0.1 to x >= 0.9: "over the composition range" (answer 3)


def rng(v, nd=4):
    v = [u for u in v if u is not None]
    return [round(min(v), nd), round(max(v), nd)] if v else None


def evidence(sets, tie_recs):
    """Evidence entries of a pair, one per article and kind (proposal 0019, section 1)."""
    out = []
    by = defaultdict(list)
    for s in sets:
        if two_liquid(s):
            by[("two-liquid", s["doi"])].append(s)
        elif one_liquid(s):
            by[("one-liquid", s["doi"])].append(s)
    ties = {t["doi"]: t for t in tie_recs}
    for (kind, doi), ss in sorted(by.items(), key=lambda kv: (kv[0][0], kv[0][1] or "")):
        Ts = [p[0] for s in ss for p in s["pts"]]
        Ps = [v for s in ss if s["P"] for v in s["P"]]
        if kind == "two-liquid":
            xs = [x for r in ties.get(doi, {}).get("rows", []) for x in (r[2], r[3])]
        else:
            xs = [next((x for ph, x in p[1] if ph and ph.startswith("Liquid")), p[1][0][1] if p[1] else None) for s in ss for p in s["pts"]]
        out.append(dict(kind=kind, doi=doi, citation=ss[0]["citation"], sets=sorted({s["set"] for s in ss}),
                        T_K=rng(Ts, 2), P_kPa=rng(Ps, 3), x=rng(xs), points=sum(len(s["pts"]) for s in ss)))
    return out


def write_classes(rows, data, tie):
    """classes.json and the lle files (step 2)."""
    LLE_DIR.mkdir(parents=True, exist_ok=True)
    pairs = {}
    for r in rows:
        k = r["pair"]
        ev = evidence(data.get(k, []), tie.get(k, []))
        cls = r["class"]
        one = [e for e in ev if e["kind"] == "one-liquid" and e["x"]]
        if cls == "not known" and one and min(e["x"][0] for e in one) <= SPAN[0] and max(e["x"][1] for e in one) >= SPAN[1]:
            cls = "miscible below the measured temperature, not known above it"
        entry = dict(cls=cls, predictions=r["predictions"], evidence=ev)
        if "one_liquid_inside_predicted_split" in r:
            entry["contradicted"] = r["one_liquid_inside_predicted_split"]
        if cls == "miscible below the measured temperature, not known above it":
            entry["one_liquid_up_to_K"] = max(e["T_K"][1] for e in one if e["T_K"])
        pairs[k] = {"class": entry.pop("cls"), **entry}
        if tie.get(k):
            first, second = k.split("+")
            recs = sorted(tie[k], key=lambda t: t["doi"])
            lle = dict(_about=f"{first} (1) + {second} (2): the two liquids in equilibrium measured in the NIST TRC ThermoML "
                              "Archive's records (bulk file ThermoML.v2020-09-30.tgz), by validation/python/two_liquid_survey.py "
                              "--classes (proposal 0019, step 2). Rows: T in K, P in kPa (null where the record gives none), mole "
                              "fraction of component 1 in liquid I and in liquid II, index of the record in records.",
                       components=[first, second], kind="lle", columns=["T_K", "P_kPa", "x_1_I", "x_1_II", "record"],
                       rows=[row + [n] for n, t in enumerate(recs) for row in t["rows"]],
                       records=[dict(doi=t["doi"], citation=t["citation"], open_copy=f"https://trc.nist.gov/ThermoML/{t['doi']}.html",
                                     access=ACCESS, sets=f"PureOrMixtureData {', '.join(map(str, t['sets']))} (phases Liquid mixture 1 and 2)")
                                for t in recs],
                       notes="To be checked by a person against the records (AGENTS.md rule 4).")
            (LLE_DIR / f"{k.replace('+', '_')}.json").write_text(json.dumps(lle, indent=1, ensure_ascii=False) + "\n")
            pairs[k]["lle_file"] = f"two_liquids/lle/{k.replace('+', '_')}.json"
    CLASSES.write_text(json.dumps({
        "_about": "The class of each pair from open evidence (proposal 0019, section 1), by validation/python/two_liquid_survey.py "
                  "--classes from the NIST TRC ThermoML Archive's bulk file ThermoML.v2020-09-30.tgz (doi 10.18434/mds2-2422, "
                  "NIST open license). Each evidence entry names its article and sets and the T, P and composition range of its "
                  "points (x: mole fraction of the first component of the pair key); a class holds only there. A predicted split "
                  "is never recorded as measured. To be checked by a person against the records (AGENTS.md rule 4).",
        "pairs": pairs}, indent=1, ensure_ascii=False) + "\n")


def current_sets(k):
    """The NRTL and UNIQUAC sets of src/data/binaries.json for a pair, as (label, record)."""
    i, j = k.split("+")
    return [(f"{r.get('set', 'default')} {r['model']}", r) for r in BIN if r["model"] in ("NRTL", "UNIQUAC") and {r["i"], r["j"]} == {i, j}]


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--archive", required=True)
    ap.add_argument("--markdown", action="store_true")
    ap.add_argument("--classes", action="store_true")
    a = ap.parse_args()
    if a.classes:
        cs, rf = chemsep_sets(), refused_sets()
        gen = {key(*s["pair"]) for s in F.GENERATED}
        pairs = sorted(set(cs) | set(REFUSED) | gen)
        tie = defaultdict(list)
        data = scan(a.archive, set(pairs), tie)
        rows = []
        for k in pairs:
            i, j = k.split("+")
            preds = [(lab, System([i, j], r["model"], params=[r]), None) for lab, r in current_sets(k)
                     if r["model"] != "UNIQUAC" or all(F.COMPONENTS[c].get("uniquac") for c in (i, j))]
            preds += [(f"refused fit {m}", System([i, j], m, params=[p]), rg) for m, p, rg in rf.get(k, [])]
            rows.append(classify(k, data.get(k, []), preds))
        write_classes(rows, data, tie)
        n = defaultdict(int)
        for r in json.loads(CLASSES.read_text())["pairs"].values():
            n[r["class"]] += 1
        print(dict(n), f"{len(list(LLE_DIR.glob('*.json')))} lle files")
        return
    cs, rf = chemsep_sets(), refused_sets()
    pairs = sorted(set(cs) | set(REFUSED))
    data = scan(a.archive, set(pairs))
    rows = []
    for k in pairs:
        i, j = k.split("+")
        preds = [(f"ChemSep {m}", System([i, j], m, params=[r]), None) for m, r in cs.get(k, [])]
        preds += [(f"refused fit {m}", System([i, j], m, params=[p]), rng) for m, p, rng in rf.get(k, [])]
        r = classify(k, data.get(k, []), preds)
        r["refused_fit"] = k in REFUSED
        r["wilson_pr200"] = k in WILSON_PR200
        rows.append(r)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({
        "_about": "Open evidence on the miscibility of the pairs whose NRTL or UNIQUAC sets predict two liquids, from "
                  "the NIST TRC ThermoML Archive (bulk file ThermoML.v2020-09-30.tgz, doi 10.18434/mds2-2422, NIST open "
                  "license), by validation/python/two_liquid_survey.py (proposal 0019, step 1). Mole fractions are of "
                  "the first component of the pair key. A person checks the classes against the records before they "
                  "are used (AGENTS.md rule 4).",
        "pairs": rows}, indent=1) + "\n")
    if a.markdown:
        print("| Pair | Sets that predict a split | Class | Evidence |\n|---|---|---|---|")
        for r in rows:
            ev = []
            if "two_liquid_sets" in r:
                t = r["two_liquid_sets"]
                ev.append(f"two-liquid data, {t['sets']} sets of {len(t['articles'])} articles"
                          + (f", {t['T_K'][0]:.0f}-{t['T_K'][1]:.0f} K" if t["T_K"] else ""))
            for lab, v in r.get("one_liquid_inside_predicted_split", {}).items():
                ev.append(f"one liquid measured inside the split of {lab}: {v['points']} points of "
                          f"{len(v['articles'])} articles, {v['T_K'][0]:.0f}-{v['T_K'][1]:.0f} K")
            if not ev:
                ev.append(f"none ({r['one_liquid_sets']} one-liquid sets, none inside the split)")
            print(f"| {r['pair'].replace('+', ' + ')} | {', '.join(r['predictions'])}"
                  f"{' (Wilson set in PR #200)' if r['wilson_pr200'] else ''} | {r['class']} | {'; '.join(ev)} |")


if __name__ == "__main__":
    main()
