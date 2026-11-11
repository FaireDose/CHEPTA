"""Labels of the predicted liquid splits, by the class of each pair (proposal 0019, sections 2 and 3; step 2).

    python validation/python/two_liquid_labels.py           # print what would change
    python validation/python/two_liquid_labels.py --write   # write src/data/binaries.json, known-issues.json, two-liquids.json

Reads validation/data/two_liquids/classes.json (two_liquid_survey.py --classes) and, for every NRTL, UNIQUAC and Wilson
set of src/data/binaries.json of a classed pair:

  - where the set splits, at 273.15-373.15 K and at the temperatures of the pair's two-liquid evidence (the convex-hull
    test of fit_parameters.phase_splits);
  - its label, the set's "two_liquids" field: { class, evidence, splits, sources }, evidence one of
      "measured"                  the pair is partly miscible (two-liquid data); whether a state is inside the measured
                                  split is decided by the engine against src/data/two-liquids.json;
      "predicted-unvalidated"     not known, or miscible below the measured temperature: "two liquids predicted, not
                                  checked against liquid-liquid data";
      "predicted-contradicted"    miscible: the pair was measured as one liquid where the set splits;
    a Wilson set (which cannot split) of a pair whose default NRTL or UNIQUAC set predicts a split gets the label of
    that prediction, with "wilson": true;
  - answer 5 of the maintainer (2026-11-05): a ChemSep set whose split is contradicted is no longer the default where
    the pair has another set of the same model (a fitted set); where none exists it stays the default, labelled;
  - a "phase-split" known issue per labelled set (origin "two_liquid_labels.py", replaced at every run).

src/data/two-liquids.json is what the engine reads (src/thermo/two-liquids.js): per pair its class, the evidence
entries (source DOIs, T, P and x ranges) and the measured tie lines of the partly miscible pairs.

Reproducible output (decision 2026-11-11-02). Two runs on different machines write the same three files:
  - nothing is random and nothing is solved iteratively: the splits come from a fixed composition grid (fit_parameters.
    phase_splits: 300 log-spaced points from 1e-9 to 0.1, 1500 from 0.1 to 0.9, 300 from 0.9 to 1 - 1e-9) and a
    fixed temperature list (273.15-373.15 K every 10 K, and the temperatures of the pair's two-liquid evidence);
  - the stored numbers are grid values: x rounded to 4 decimals (the grid step between 0.1 and 0.9 is 0.8/1499 =
    5.3e-4, so a split's ends are known to about one step, and 4 decimals hold the grid point without adding digits
    that a step does not resolve) and T to 0.01 K. A rounding difference in the activity coefficients (another numpy,
    another processor) changes a stored value only where it moves a hull point, which needs a change many orders above
    the rounding: test/two-liquid-labels.test.js recomputes every stored split with the engine's JavaScript activity
    coefficients and gets the same values, and g_mix perturbed by a relative 1e-12 left all of them unchanged;
  - the pairs are taken in sorted order, the sets in their order in binaries.json, and the known issues are written
    back where the earlier ones stood in known-issues.json (not appended), so a re-run without changes is no diff;
  - each known issue's source_ids are the set's own and "nist-thermoml-archive" (the evidence of classes.json), sorted;
  - what it depends on besides its inputs: the "default" flags of binaries.json, which this script itself changes
    (answer 5 and FITTED_DEMOTED), so a Wilson label follows the default the last run left. Run it after any change
    of binaries.json's NRTL, UNIQUAC or Wilson sets or of classes.json (DATA_RULES section 5).
Tested with numpy 2.5.3 and scipy 1.18.1 (validation/python/requirements.txt).
"""
import json
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
import fit_parameters as F  # noqa: E402
from reference_model import System, COMPONENTS  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
BIN_FILE = ROOT / "src" / "data" / "binaries.json"
KNOWN_FILE = ROOT / "src" / "data" / "known-issues.json"
ENGINE_FILE = ROOT / "src" / "data" / "two-liquids.json"
ORIGIN = "two_liquid_labels.py"
# Pairs whose contradicted FITTED default gives way to an uncontradicted set of the same model (answer 5 applied to a
# fitted set; the maintainer, 2026-11-10, #218 decision (c)). Only these pairs are changed; the others are listed.
FITTED_DEMOTED = {"benzene+methanol"}
TS = list(np.linspace(273.15, 373.15, 11))


def oriented(x, flip):
    return None if x is None else [round(1 - x[1], 4), round(1 - x[0], 4)] if flip else x


def splits_of(rec, temps):
    i, j = rec["i"], rec["j"]
    if rec["model"] == "UNIQUAC" and not all(COMPONENTS[c].get("uniquac") for c in (i, j)):
        return []
    s = System([i, j], rec["model"], params=[rec])
    out = []
    for T in sorted(set(round(float(t), 2) for t in temps)):
        try:
            sp = F.phase_splits(s, T)
        except Exception:
            continue
        out += [[T, round(float(a), 4), round(float(b), 4)] for a, b in sp]
    return out


def contradicted_by(splits, entry, flip):
    """True when one of the splits (x of the record's i) covers part of a one-liquid entry's composition range at a
    temperature within its range."""
    if not entry.get("T_K") or not entry.get("x"):
        return False
    x0, x1 = oriented(entry["x"], flip)
    return any(entry["T_K"][0] - 1 <= T <= entry["T_K"][1] + 1 and a < x1 - 0.01 and b > x0 + 0.01 for T, a, b in splits)


def main(write):
    doc = json.loads(BIN_FILE.read_text())
    K = json.loads(KNOWN_FILE.read_text())
    # the script's issues are written back where the earlier ones stood (the first of them), else at the end
    others = [k for k in K["issues"] if k.get("origin") != ORIGIN]
    at = next((n for n, k in enumerate(K["issues"]) if k.get("origin") == ORIGIN), len(K["issues"]))
    n_before = sum(1 for k in K["issues"][:at] if k.get("origin") != ORIGIN)
    issues, rest = others[:n_before], others[n_before:]
    have_unchecked = {(tuple(sorted(k["components"])), k["model"]) for k in others if k.get("kind") == "miscibility-unchecked"}
    engine = {}
    counts = {}
    demoted = []
    listed = []
    for key, c in sorted(F.CLASSES.items()):
        first, second = key.split("+")
        cls = c["class"]
        ev2 = [e for e in c["evidence"] if e["kind"] == "two-liquid"]
        ev1 = [e for e in c["evidence"] if e["kind"] == "one-liquid"]
        temps = TS + [t for e in ev2 if e.get("T_K") for t in e["T_K"]]
        recs = [r for r in doc["pairs"] if r["model"] in ("NRTL", "UNIQUAC", "WILSON") and {r["i"], r["j"]} == {first, second}]
        labelled = {}
        for r in recs:
            r.pop("two_liquids", None)
            if r["model"] == "WILSON":
                continue
            flip = r["i"] != first
            sp = splits_of(r, temps)
            if not sp:
                continue
            if cls == "partly miscible":
                evidence, sources = "measured", sorted({e["doi"] for e in ev2})
            elif cls == "miscible" and any(contradicted_by(sp, e, flip) for e in ev1):
                evidence, sources = "predicted-contradicted", sorted({e["doi"] for e in ev1 if contradicted_by(sp, e, flip)})
            else:
                evidence, sources = "predicted-unvalidated", []
            r["two_liquids"] = {"class": cls, "evidence": evidence, "splits": sp, "sources": sources,
                                "fitted": r.get("tier") == "fitted" and "liquid-liquid:" in r.get("source", "")}
            labelled[id(r)] = r
            counts[evidence] = counts.get(evidence, 0) + 1
        # answer 5: a contradicted ChemSep set is not the default where the pair has another set of the same model
        for model in ("NRTL", "UNIQUAC"):
            ms = [r for r in recs if r["model"] == model]
            for r in ms:
                if (r.get("tier") == "databank" and r.get("default", True)
                        and r.get("two_liquids", {}).get("evidence") == "predicted-contradicted"):
                    other = [o for o in ms if o is not r and o.get("two_liquids", {}).get("evidence") != "predicted-contradicted"]
                    if other:
                        r["default"] = False
                        other[0]["default"] = True
                        demoted.append((key, model, r.get("set"), other[0].get("set")))
        # the same for a contradicted fitted default, for the pairs named in FITTED_DEMOTED only; the others are listed
        for model in ("NRTL", "UNIQUAC"):
            ms = [r for r in recs if r["model"] == model]
            for r in ms:
                if (r.get("tier") == "fitted" and r.get("default", True)
                        and r.get("two_liquids", {}).get("evidence") == "predicted-contradicted"):
                    other = [o for o in ms if o is not r and o.get("two_liquids", {}).get("evidence") != "predicted-contradicted"]
                    if other and key in FITTED_DEMOTED:
                        r["default"] = False
                        other[0]["default"] = True
                        demoted.append((key, model, r.get("set"), other[0].get("set")))
                    elif other:
                        listed.append((key, model, r.get("set"), other[0].get("set")))
        # Wilson: the label of the prediction of the pair's default NRTL (else UNIQUAC) set
        pred = next((r for m in ("NRTL", "UNIQUAC") for r in recs if r["model"] == m and r.get("default", True) and "two_liquids" in r), None)
        for r in recs:
            if r["model"] == "WILSON" and pred is not None:
                flip = r["i"] != pred["i"]
                sp = [[T, round(1 - b, 4), round(1 - a, 4)] if flip else [T, a, b] for T, a, b in pred["two_liquids"]["splits"]]
                r["two_liquids"] = dict(pred["two_liquids"], splits=sp, wilson=True, predicted_by=f"{pred['model']} set \"{pred.get('set', 'default')}\"")
        # the known issues
        for r in recs:
            tl = r.get("two_liquids")
            if not tl:
                continue
            comps = [r["i"], r["j"]]
            if r["model"] == "WILSON" and (tuple(sorted(comps)), "WILSON") in have_unchecked:
                continue   # the note of proposal 0019, answer 4, stays
            Tl = sorted({s[0] for s in tl["splits"]})
            where = f"{Tl[0]:g}-{Tl[-1]:g} K" if Tl else ""
            who = (f"The {r['model']} set \"{r.get('set', 'default')}\"" if r["model"] != "WILSON"
                   else f"Wilson cannot show two liquids, but the {tl['predicted_by']}")
            if tl["evidence"] == "measured":
                fitted = r.get("tier") == "fitted" and "liquid-liquid:" in r.get("source", "")
                msg = (f"{who} predicts two liquids ({where}); two liquids are measured for this pair ({len(tl['sources'])} "
                       f"articles of the ThermoML Archive, validation/data/two_liquids/classes.json). "
                       + ("The set is fitted to them." if fitted and r["model"] != "WILSON" else
                          "The set is not fitted to them, so its split may be misplaced." if r["model"] != "WILSON" else
                          "Use NRTL or UNIQUAC where the two liquids form."))
            elif tl["evidence"] == "predicted-contradicted":
                msg = (f"{who} predicts two liquids ({where}) where the pair was measured as one liquid "
                       f"({', '.join('doi ' + d for d in tl['sources'][:4])}{', ...' if len(tl['sources']) > 4 else ''}): the split "
                       "is probably wrong; choose another set or another model.")
            else:
                msg = (f"{who} predicts two liquids ({where}), not checked against liquid-liquid data"
                       + (f" ({cls}: one liquid measured up to {c.get('one_liquid_up_to_K')} K)" if cls != "not known" else
                          " (no open liquid-liquid data found)") + ".")
            issues.append({"components": comps, "model": r["model"], "kind": "phase-split", "message": msg,
                           "reference": "validation/data/two_liquids/classes.json (proposal 0019): the evidence of the pair, "
                                        "from the NIST TRC ThermoML Archive",
                           "source_ids": sorted(set(r.get("source_ids", [])) | {"nist-thermoml-archive"}), "origin": ORIGIN})
        # what the engine reads
        if cls != "not known" or any("two_liquids" in r for r in recs):
            entry = {"class": cls, "evidence": [{k: e[k] for k in ("kind", "doi", "T_K", "P_kPa", "x")} for e in c["evidence"]]}
            if c.get("lle_file"):
                d = F.load(c["lle_file"])
                col = {k: n for n, k in enumerate(d["columns"])}
                entry["tie_lines"] = [[r[col["T_K"]], r[col["x_1_I"]], r[col["x_1_II"]]] for r in d["rows"]
                                      if r[col["x_1_I"]] is not None and r[col["x_1_II"]] is not None]
            engine[key] = entry
    print("labels:", counts, "| demoted ChemSep defaults:", len(demoted))
    for d in demoted:
        print("  demoted", d)
    for d in listed:
        print("  contradicted fitted default, uncontradicted set exists (not changed)", d)
    if write:
        BIN_FILE.write_text(json.dumps(doc, indent=2) + "\n")
        K["issues"] = issues + rest
        KNOWN_FILE.write_text(json.dumps(K, indent=2, ensure_ascii=False) + "\n")
        ENGINE_FILE.write_text(json.dumps({
            "_about": "The class of each pair from open evidence (proposal 0019), for the engine (src/thermo/two-liquids.js): "
                      "class, evidence entries (kind, doi, T_K, P_kPa, x of the first component of the key) and, for partly "
                      "miscible pairs, the measured tie lines [T_K, x in liquid I, x in liquid II]. Written by "
                      "validation/python/two_liquid_labels.py from validation/data/two_liquids/classes.json.",
            "pairs": engine}, separators=(",", ":")) + "\n")
        print(f"updated {BIN_FILE.name}, {KNOWN_FILE.name}, {ENGINE_FILE.name}")


if __name__ == "__main__":
    main("--write" in sys.argv)
