"""The list of what CHEPTA's databank still lacks, as a dated file: docs/MISSING_PROPERTIES_<date>.md.

Every update is a new file named with the day it was made; the earlier files stay as they are, so the gaps can be
followed over time (the maintainer, 2026-10-22: "make a new file with the day of today so we keep track. add this as a
rule"). The file lists, from src/data/components.json, each "no open data" marker (with what it blocks), the records
that are predicted only, the components without UNIQUAC r and q or Modified UNIFAC 2.0 groups, and what changed since
the previous file (`--since`, a git revision of components.json, for example the commit of the previous file). The
recommendation text that the maintainer is still to decide on is carried over from the previous file by hand.

    python validation/python/missing_properties.py --date 2026-10-22 --since 5c27db8 > docs/MISSING_PROPERTIES_2026-10-22.md
"""
import argparse
import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
COMP_FILE = ROOT / "src" / "data" / "components.json"
SEARCHES = ROOT / "validation" / "data" / "searches"

PROPS = [("vapourPressure", "vapour pressure"), ("critical", "critical constants (Tc, Pc, ω)"), ("Tb", "normal boiling point"),
         ("liquidDensity", "liquid density"), ("liquidHeatCapacity", "liquid heat capacity"),
         ("idealGasHeatCapacity", "ideal-gas heat capacity"), ("heatOfVaporization", "heat of vaporization"),
         ("surfaceTension", "surface tension"), ("liquidViscosity", "liquid viscosity"),
         ("liquidThermalConductivity", "liquid thermal conductivity"), ("vapourViscosity", "vapour viscosity"),
         ("vapourThermalConductivity", "vapour thermal conductivity"), ("fusion", "melting point and enthalpy of fusion"),
         ("formation", "enthalpy of formation"), ("formationG", "Gibbs energy of formation")]
BLOCKS = {
    "vapourPressure": "Everything with a vapour: bubble and dew points, flashes, diagrams, distillation. The worst gap.",
    "critical": "Peng–Robinson and SRK, for either phase. Activity models with an ideal-gas vapour still work.",
    "Tb": "Only where it is shown; the vapour-pressure record still works over its measured range.",
    "liquidDensity": "Volumes, pump work, velocities; mass-to-volume conversions.",
    "liquidHeatCapacity": "Energy balances: heaters, coolers, exchangers. Predicted values are within about 5 % at 300 K, worse for alcohols and polyols at higher temperature.",
    "idealGasHeatCapacity": "Covered for the volatile ones by Kirchhoff's path from the liquid records; missing outright for those without a vapour pressure.",
    "heatOfVaporization": "Energy balances with evaporation or condensation.",
    "surfaceTension": "Nothing in a calculation yet; column hydraulics later.",
    "liquidViscosity": "Nothing in a calculation yet (shown in Properties); pumps, pipes and film coefficients later.",
    "liquidThermalConductivity": "Nothing in a calculation yet; exchanger film coefficients from fluid properties later.",
    "vapourViscosity": "Nothing in a calculation yet.",
    "vapourThermalConductivity": "Nothing in a calculation yet.",
    "fusion": "Solid solubility, crystallization, freezing checks.",
    "formation": "Heats of reaction in the reactors (proposal 0010): a component without it can only be in a conversion or yield reactor with a given duty.",
    "formationG": "Equilibrium constants from formation data (equilibrium and Gibbs reactors); heats of reaction still work with the enthalpy alone.",
}


def gaps(c):
    """{property key: "missing" | "predicted"} of a component."""
    out = {}
    if c.get("class") != "nonvolatile":
        if c.get("vapourPressure_missing") and not c.get("vapourPressure"):
            out["vapourPressure"] = "missing"
        if (c.get("critical") or {}).get("available") is False:
            out["critical"] = "missing"
        if c.get("Tb_K") is None and (c.get("Tb_note") or c.get("vapourPressure_missing")):
            out["Tb"] = "missing"   # (carbon dioxide has none on purpose: it sublimes at 1 atm)
    nonvol = c.get("class") == "nonvolatile"
    for key, _ in PROPS:
        r = (c.get("properties") or {}).get(key)
        if r is None:
            continue
        if nonvol and key in ("idealGasHeatCapacity", "heatOfVaporization", "vapourViscosity", "vapourThermalConductivity"):
            continue   # a nonvolatile component has no vapour (docs/DATA_RULES.md section 10)
        if r.get("available") is False:
            out[key] = "missing"
        elif r.get("tier") == "predicted":
            out[key] = "predicted"
    f = c.get("fusion")
    if not f or f.get("available") is False:
        out["fusion"] = "missing"
    fo = c.get("formation")
    if not fo or fo.get("available") is False:
        out["formation"] = "missing"
        out["formationG"] = "missing"
    elif fo.get("Gf_ig_J_mol", fo.get("Gf_J_mol")) is None:
        out["formationG"] = "missing"
    return out


def load(rev=None):
    if rev is None:
        return json.loads(COMP_FILE.read_text())["components"]
    text = subprocess.run(["git", "show", f"{rev}:src/data/components.json"], cwd=ROOT, check=True, capture_output=True, text=True).stdout
    return json.loads(text)["components"]


def search_section(rec, path, comps, label):
    """The record of a full-text search (validation/data/searches/<date>-fulltext.json, written after a person or an
    assistant has read the candidates of fulltext_search.py): what was screened and what the passages held."""
    L = ["", f"## The full-text search of {rec['date']}", "",
         f"`{path.relative_to(ROOT)}`, made with `validation/python/fulltext_search.py` (docs/DATA_RULES.md section 1, "
         "\"How to search for a missing number\", step 3). " + rec.get("summary", ""), ""]
    for idx, state in rec.get("indexes", {}).items():
        L.append(f"- {idx}: {state}")
    L += ["", "| Component | Property | Europe PMC: found, with a passage | OpenAlex: found, read, with a passage | What they held |",
          "|---|---|---|---|---|"]
    empty = []
    for cid, props in rec.get("gaps", {}).items():
        name = comps[cid]["name"] if cid in comps else cid
        for key, g in props.items():
            oa = g.get("openalex") or {}
            if not g.get("screened") and not oa.get("screened") and g.get("held", "-") == "-":
                empty.append(f"{name} ({label.get(key, key)})")
                continue
            oa_cell = f"{oa.get('hits') or 0}, {oa.get('fetched', 0)}, {oa.get('screened', 0)}" if oa else "not asked"
            L.append(f"| {name} | {label.get(key, key)} | {g.get('hits', 0)}, {g.get('screened', 0)} | {oa_cell} | "
                     f"{g.get('held', '-')} |")
    if empty:
        L += ["", f"No passage with a name and the property together, in the open full texts searched ({len(empty)}): "
              + "; ".join(empty) + "."]
    return L


def report(comps, date, since=None):
    label = dict(PROPS)
    G = {cid: gaps(c) for cid, c in comps.items()}
    L = []
    L.append(f"# Missing pure-component properties ({date})")
    L.append("")
    L.append(f"What CHEPTA's databank still lacks besides vapour-liquid pairs, on {date} ({len(comps)} components). Made by "
             "`validation/python/missing_properties.py`; one file per update, named with its day, so the earlier files "
             "stay and the gaps can be followed over time (docs/DATA_RULES.md section 12). The pairs are in "
             "[DATA_WANTED.md](DATA_WANTED.md).")
    L.append("")
    L.append("Each gap is a \"no open data\" marker in `src/data/components.json` with the sources that were searched "
             "(`searched`). Start from that list before looking again, so the same sources are not searched twice.")
    L.append("")
    L.append("## Summary")
    L.append("")
    L.append("| Property | Missing | Predicted only | What it blocks today |")
    L.append("|---|---|---|---|")
    for key, name in PROPS:
        m = sum(1 for g in G.values() if g.get(key) == "missing")
        p = sum(1 for g in G.values() if g.get(key) == "predicted")
        if m or p:
            L.append(f"| {name[:1].upper() + name[1:]} | {m} | {p or '-'} | {BLOCKS[key]} |")
    uq = [c["name"] for c in comps.values() if c.get("uniquac_missing")]   # (the gases need none: no "uniquac_missing")
    mu = [c["name"] for c in comps.values() if not (c.get("modUnifac") or {}).get("groups")]
    L.append(f"| UNIQUAC r and q | {len(uq)} | - | UNIQUAC for those components (NRTL works). |")
    L.append(f"| Modified UNIFAC 2.0 groups | {len(mu)} | - | Prediction for those components; small gases and some rings cannot be described by the method. |")
    if since:
        old = load(since)
        Gold = {cid: gaps(c) for cid, c in old.items()}
        L.append("")
        L.append(f"## What changed since the previous file (components.json at `{since}`)")
        L.append("")
        new_c = [comps[c]["name"] for c in comps if c not in old]
        if new_c:
            L.append(f"- New components: {', '.join(new_c)}.")
        for key, name in PROPS:
            filled = [comps[c]["name"] for c in comps if c in old and Gold[c].get(key) == "missing" and G[c].get(key) != "missing"]
            if filled:
                L.append(f"- {name[:1].upper() + name[1:]} found for {len(filled)}" + (f": {', '.join(filled)}." if len(filled) <= 30 else
                         " (a new kind of record; the components still without it are listed below)."))
            newly = [comps[c]["name"] for c in comps if c in old and key in G[c] and G[c][key] == "missing" and key not in Gold[c]
                     and key in ("formation", "formationG")]
            if newly:
                L.append(f"- {name[:1].upper() + name[1:]}: new property, no open data for {len(newly)} (listed below).")
    for f in sorted(SEARCHES.glob("*-fulltext.json")):
        L.extend(search_section(json.loads(f.read_text()), f, comps, label))
    sections = [("A. No vapour pressure", lambda c, g: "vapourPressure" in g),
                ("B. No critical constants (with a vapour pressure)", lambda c, g: "critical" in g and "vapourPressure" not in g),
                ("C. Nonvolatile components", lambda c, g: c.get("class") == "nonvolatile"),
                ("D. Other components with gaps", lambda c, g: True)]
    done = set()
    L.append("")
    L.append("## The gaps, component by component")
    L.append("")
    L.append("\"Predicted only\" means a group-contribution prediction stands in (tier \"predicted\").")
    for title, pick in sections:
        rows = [(cid, c) for cid, c in comps.items() if cid not in done and G[cid] and pick(c, G[cid])]
        if not rows:
            continue
        L.append("")
        L.append(f"### {title} ({len(rows)})")
        L.append("")
        L.append("| Component | Missing (no open data found) | Predicted only |")
        L.append("|---|---|---|")
        for cid, c in rows:
            done.add(cid)
            g = G[cid]
            miss = ", ".join(label[k] for k, _ in PROPS if g.get(k) == "missing") or "-"
            pred = ", ".join(label[k] for k, _ in PROPS if g.get(k) == "predicted") or "-"
            L.append(f"| {c['name']} | {miss} | {pred} |")
    L.append("")
    L.append(f"### UNIQUAC r and q ({len(uq)})")
    L.append("")
    L.append(", ".join(uq) + ".")
    L.append("")
    L.append(f"### Modified UNIFAC 2.0 groups ({len(mu)})")
    L.append("")
    L.append(", ".join(mu) + ".")
    return "\n".join(L) + "\n"


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--date", required=True)
    ap.add_argument("--since", help="git revision of the previous file's components.json")
    a = ap.parse_args()
    print(report(load(), a.date, a.since), end="")


if __name__ == "__main__":
    main()
