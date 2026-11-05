"""Gas + solvent phase-equilibrium data of the NIST TRC ThermoML Archive, for the Peng-Robinson and SRK k_ij of
validation/fit_kij_literature.mjs (the maintainer, 2026-11-04: "PR and SRK should be ok for now"; proposal 0018 is
postponed until these errors are known).

For each pair below, every record that validation/data/vle/archive_index.json lists (scan_archive.py, the archive's
whole bulk file) is opened (thermoml_read.py: values as stored, nothing rounded) and each binary liquid + gas set is
turned into equilibrium states (T, P, x_1, y_1), component 1 the gas:

  - a liquid mole fraction is taken as stored; a mass fraction or a molality (mol per kg of the solvent) of the
    gas is converted with the molar masses of src/data/components.json, exactly (x = n_gas / (n_gas + n_solvent));
    an amount concentration (mol/dm3) would need the liquid's density, which the record does not give: the set is
    left out and named;
  - a pressure that the record gives as the partial pressure of the gas ("Pressure, kPa" of the gas, in the gas
    phase) is kept as p_1_kPa, not as the total pressure; the fit compares it with y_1 P of the bubble point;
  - a set of vapour compositions only (dew states) is kept with x_1 null: it is not fitted (the fit takes bubble
    pressures at the measured liquid) and is listed for the record;
  - the stated expanded uncertainty of P (or of x where x is the measured property) is kept per row.

One file per article and pair: validation/data/eos/thermoml_<gas>_<solvent>_<doi>.json (kind "isothermal-pxy",
columns T_K, P_kPa, p_1_kPa, x_1, y_1, U_P_kPa, U_x_1), with its source block. A person still compares the rows with
the record (AGENTS.md rule 4).

    python validation/python/hp_gas_solubility.py --cache DIR [--write]
"""
import argparse
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from measured_components import norm_inchi  # noqa: E402
from vle_batch import ACCESS, COMPS, citation, inchi_of, record  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "validation" / "data" / "eos"
INDEX = json.loads((ROOT / "validation" / "data" / "vle" / "archive_index.json").read_text())["pairs"]

# gas first, as in src/data/kij.json
PAIRS = [("carbon-dioxide", "methanol"), ("carbon-dioxide", "water"), ("hydrogen", "methanol"),
         ("carbon-monoxide", "methanol"), ("methane", "methanol")]


def kind(t):
    return (t or "").split(",")[0]


def states(rec, gas, solv):
    """Equilibrium states of the pair in a record: ([row dicts], [(set number, reason left out)], [set numbers used])."""
    ig, isv = inchi_of(gas), inchi_of(solv)
    role = {n: ("g" if norm_inchi(c["inchi"]) == ig else "s" if norm_inchi(c["inchi"]) == isv else None) for n, c in rec["compounds"].items()}
    Mg, Ms = COMPS[gas]["MW"], COMPS[solv]["MW"]
    rows, left, used = [], [], []
    for s in rec["sets"]:
        if len(s["components"]) != 2 or {role.get(n) for n in s["components"]} != {"g", "s"} or set(s["phases"]) != {"Liquid", "Gas"}:
            continue
        # every quantity of the set: (source, key) -> (type, role of its compound, phase)
        q = {}
        for vn, v in s["variables"].items():
            q[("v", vn)] = (kind(v["type"]), role.get(v["compound"]), v["phase"])
        for pn, p in s["properties"].items():
            q[("p", pn)] = (kind(p["name"]), role.get(p["compound"]), (p["phase"] or [None])[0])
        types = {t for t, _, _ in q.values()} | {kind(c["type"]) for c in s["constraints"]}
        if "Amount concentration (molarity)" in types:
            left.append((s["number"], "composition as an amount concentration (mol/dm3): converting it needs the liquid density, which the record does not give"))
            continue
        bad = [t for t in types if t not in ("Temperature", "Pressure", "Mole fraction", "Mass fraction", "Molality", "Vapor or sublimation pressure", "Boiling temperature at pressure P")]
        if bad:
            left.append((s["number"], f"quantities {bad} are not an equilibrium state"))
            continue
        if any(ro is None and t in ("Mole fraction", "Mass fraction", "Molality") for t, ro, _ in q.values()):
            left.append((s["number"], "a composition whose compound the record does not name"))
            continue
        n_used = 0
        for r in s["rows"]:
            st = dict(T=None, P=None, p1=None, x=None, y=None, UP=None, Ux=None)
            items = [((t, ro, ph), r.get(src + k), r.get(src + k + "_unc"), src) for (src, k), (t, ro, ph) in q.items()]
            for c in s["constraints"]:
                items.append(((kind(c["type"]), role.get(c["compound"]), c["phase"]), c["value"], None, "c"))
            for (t, ro, ph), val, unc, src in items:
                if val is None:
                    continue
                if t == "Temperature" or t == "Boiling temperature at pressure P":
                    st["T"] = val
                elif t in ("Pressure", "Vapor or sublimation pressure"):
                    if t == "Pressure" and ro == "g" and ph == "Gas":
                        st["p1"] = val
                    elif t == "Pressure" and ro == "s":
                        raise SystemExit(f"{rec['citation']['doi']} set {s['number']}: a partial pressure of the solvent")
                    else:
                        st["P"] = val
                    if src == "p" and unc is not None:
                        st["UP"] = unc
                elif t in ("Mole fraction", "Mass fraction", "Molality"):
                    if ro is None:
                        raise SystemExit(f"{rec['citation']['doi']} set {s['number']}: a composition without its compound")
                    if t == "Mole fraction":
                        f, uf = (val, unc) if ro == "g" else (1 - val, unc)
                    elif t == "Mass fraction":
                        w = val if ro == "g" else 1 - val
                        f, uf = (w / Mg) / (w / Mg + (1 - w) / Ms), None
                    else:
                        if ro != "g":
                            raise SystemExit(f"{rec['citation']['doi']} set {s['number']}: a molality of the solvent")
                        f, uf = val / (val + 1000 / Ms), None
                    if ph == "Gas":
                        st["y"] = f
                    else:
                        st["x"] = f
                        if src == "p":
                            st["Ux"] = uf
            if st["T"] is None or (st["P"] is None and st["p1"] is None) or (st["x"] is None and st["y"] is None):
                continue
            rows.append(st)
            n_used += 1
        if n_used:
            used.append(s["number"])
    return rows, left, used


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", required=True)
    ap.add_argument("--write", action="store_true")
    a = ap.parse_args()
    cache = Path(a.cache)
    cache.mkdir(parents=True, exist_ok=True)
    for gas, solv in PAIRS:
        print(f"== {gas} + {solv}")
        for art in INDEX["+".join(sorted((gas, solv)))]:
            rec = record(cache, art["doi"])
            rows, left, used = states(rec, gas, solv)
            for n, why in left:
                print(f"   {art['doi']} set {n} left out: {why}")
            if not rows:
                continue
            Ts = [r["T"] for r in rows]
            Ps = [r["P"] if r["P"] is not None else r["p1"] for r in rows]
            nx = sum(r["x"] is not None for r in rows)
            print(f"   {art['doi']} sets {used}: {len(rows)} states ({nx} with x), T {min(Ts):g}-{max(Ts):g} K, P {min(Ps):g}-{max(Ps):g} kPa"
                  + (" (partial pressure of the gas)" if any(r["p1"] is not None for r in rows) else ""))
            if not a.write:
                continue
            tag = re.sub(r"[^a-z0-9]+", "-", art["doi"].lower()).strip("-")
            ng, ns = COMPS[gas]["name"], COMPS[solv]["name"]
            conv = sorted({kind(v["type"]) for s in rec["sets"] if s["number"] in used for v in list(s["variables"].values())} |
                          {kind(p["name"]) for s in rec["sets"] if s["number"] in used for p in s["properties"].values()})
            notes = ["Read with validation/python/hp_gas_solubility.py."]
            if "Mass fraction" in conv:
                notes.append(f"The record gives mass fractions; x_1 = (w_1/M_1) / (w_1/M_1 + w_2/M_2) with M_1 = {COMPS[gas]['MW']}, M_2 = {COMPS[solv]['MW']} g/mol.")
            if "Molality" in conv:
                notes.append(f"The record gives the molality m of {ng.lower()} (mol per kg of {ns.lower()}); x_1 = m / (m + 1000/M_2), M_2 = {COMPS[solv]['MW']} g/mol.")
            if any(r["p1"] is not None for r in rows):
                notes.append(f"The record gives the partial pressure of {ng.lower()} (p_1_kPa), not the total pressure.")
            if any(r["x"] is None for r in rows):
                notes.append("Rows with x_1 null are vapour compositions (dew states): not fitted.")
            notes.append("To be checked by a person against the record (AGENTS.md rule 4).")
            d = dict(
                _about=f"{ng} (1) + {ns} (2): equilibrium states (T, P, x, y), {min(Ts):g}-{max(Ts):g} K, as stored in the ThermoML Archive record, "
                       "compositions of the other component converted with x_1 = 1 - x_2.",
                components=[gas, solv], kind="isothermal-pxy",
                source=dict(citation=citation(rec), doi=art["doi"], open_copy=f"https://trc.nist.gov/ThermoML/{art['doi']}.html", access=ACCESS,
                            tables=f"ThermoML record, PureOrMixtureData {', '.join(map(str, used))}. The table number in the article was not checked."
                                   + "".join(f" Set {n} left out: {why}." for n, why in left),
                            transcription="Read from the ThermoML XML by validation/python/hp_gas_solubility.py; values as stored. The person checking compares each row with the record."),
                columns=["T_K", "P_kPa", "p_1_kPa", "x_1", "y_1", "U_P_kPa", "U_x_1"],
                rows=[[r["T"], r["P"], r["p1"], None if r["x"] is None else round(r["x"], 8), None if r["y"] is None else round(r["y"], 8), r["UP"],
                       None if r["Ux"] is None else round(r["Ux"], 8)] for r in rows],
                notes=" ".join(notes))
            (OUT / f"thermoml_{gas}_{solv}_{tag}.json").write_text(json.dumps(d, indent=1, ensure_ascii=False) + "\n")


if __name__ == "__main__":
    main()
