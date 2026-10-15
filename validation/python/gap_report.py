"""Which open source has which property, for the components of a batch, before anything is fitted.

For each component of a registry batch (validation/data/component_registry.json) or the ids given, and each property
the records need, the report shows what each source of AGENTS.md rule 1 offers:

  CoolProp 8.0.0     a fluid, and which property models it has (viscosity, thermal conductivity, surface tension)
  ChemSep            the file that has the compound (chemsep1.xml or chemsep2.xml), and the correlation's equation and
                     temperature range for each property
  NIST WebBook       the full compound page (Mask=FFFF): Antoine sets, enthalpies of vaporization, liquid and gas heat
                     capacities, melting data; and whether it is a WebBook fluid (transport tables)
  ThermoML Archive   the pure-component values in validation/data/pure/measured/thermoml_<id>.json, per property:
                     values and articles (fetched with --fetch here)

A property no source has is marked GAP: the open literature has to be searched for it, or the maintainer asked for an
article, before the batch is fitted. Values are not read here, only what exists and where.

    python validation/python/gap_report.py --batch 10 --chemsep chemsep1.xml chemsep2.xml --cache DIR
    python validation/python/gap_report.py triolein tripalmitin --chemsep ... --cache DIR --fetch --md report.md
    python validation/python/gap_report.py --new gvl:108-29-2 furan:110-00-9 --chemsep ... --cache DIR --fetch

--new ID:CAS: a component not in the registry yet (a batch being planned); its name and the ThermoML search names come
from the open `chemicals` library (name, IUPAC name), checked against the CAS number.

--open-copies: for each component, the articles behind its ThermoML values, with the legal free copy Unpaywall knows
for each (open_copy.py). The ThermoML values are open whatever the article's access; the article itself is what a
reviewer reads to check them, and may hold values the archive does not (other properties, uncertainties).
"""
import argparse
import html as H
import json
import re
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from registry import REG  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
MEASURED_DIR = ROOT / "validation" / "data" / "pure" / "measured"
PAGE = "https://webbook.nist.gov/cgi/cbook.cgi?ID={ID}&Mask=FFFF&Units=SI"
FLUIDS = "https://webbook.nist.gov/chemistry/fluid/"
PROPS = ["vapourPressure", "liquidDensity", "idealGasHeatCapacity", "liquidHeatCapacity", "heatOfVaporization",
         "liquidViscosity", "vapourViscosity", "liquidThermalConductivity", "vapourThermalConductivity", "surfaceTension",
         "melting"]
CHEMSEP_TAG = {"vapourPressure": "VaporPressure", "liquidDensity": "LiquidDensity",
               "idealGasHeatCapacity": "IdealGasHeatCapacityCp", "liquidHeatCapacity": "LiquidHeatCapacityCp",
               "heatOfVaporization": "HeatOfVaporization", "liquidViscosity": "LiquidViscosity",
               "vapourViscosity": "VaporViscosity", "liquidThermalConductivity": "LiquidThermalConductivity",
               "vapourThermalConductivity": "VaporThermalConductivity", "surfaceTension": "SurfaceTension"}
# the WebBook tables (by their aria-label) that bear on each property
WEBBOOK_TABLES = {"vapourPressure": ["Antoine Equation Parameters"],
                  "heatOfVaporization": ["Enthalpy of vaporization"],
                  "liquidHeatCapacity": ["Constant pressure heat capacity of liquid"],
                  "idealGasHeatCapacity": ["Constant pressure heat capacity of gas", "Gas Phase Heat Capacity (Shomate Equation)"],
                  "melting": ["Enthalpy of fusion"]}
THERMOML = {"Vapor or sublimation pressure, kPa": "vapourPressure", "Mass density, kg/m3": "liquidDensity",
            "Molar heat capacity at constant pressure, J/K/mol": "liquidHeatCapacity",
            "Molar enthalpy of vaporization or sublimation, kJ/mol": "heatOfVaporization",
            "Viscosity, Pa*s": "liquidViscosity", "Thermal conductivity, W/m/K": "liquidThermalConductivity",
            "Surface tension liquid-gas, N/m": "surfaceTension", "Normal melting temperature, K": "Tm",
            "Triple point temperature, K": "Tm", "Molar enthalpy of transition or fusion, kJ/mol": "dHfus"}


def get(url, cache):
    f = cache / (re.sub(r"[^A-Za-z0-9]+", "_", url)[-120:] + ".html")
    if f.exists():
        return f.read_text()
    req = urllib.request.Request(url, headers={"User-Agent": "CHEPTA data script (https://github.com/FaireDose/CHEPTA)"})
    for attempt in range(6):  # the WebBook gateway sometimes times out (HTTP 502-504)
        try:
            with urllib.request.urlopen(req, timeout=120) as r:
                text = r.read().decode("utf-8", "replace")
            break
        except urllib.error.HTTPError as e:
            if e.code not in (502, 503, 504) or attempt == 5:
                raise
            time.sleep(5 * 2 ** attempt)
    cache.mkdir(parents=True, exist_ok=True)
    f.write_text(text)
    return text


def webbook(cas, cache):
    """{property: short text} of what the compound's WebBook page has."""
    t = get(PAGE.format(ID="C" + cas.replace("-", "")), cache)
    out = {}
    for prop, labels in WEBBOOK_TABLES.items():
        n = 0
        for lab in labels:
            for m in re.finditer(r'<table[^>]*aria-label="%s"[^>]*>(.*?)</table>' % re.escape(lab), t, re.S):
                n += max(0, len(re.findall(r"<tr[^>]*>", m.group(1))) - 1)
        if n:
            out[prop] = "%d row%s" % (n, "s" if n > 1 else "")
    one = []
    for m in re.finditer(r'<table[^>]*aria-label="One dimensional data"[^>]*>(.*?)</table>', t, re.S):
        for r in re.findall(r"<tr[^>]*>(.*?)</tr>", m.group(1), re.S):
            c = [H.unescape(re.sub(r"<[^>]+>", "", x)).strip() for x in re.findall(r"<t[dh][^>]*>(.*?)</t[dh]>", r, re.S)]
            if c:
                one.append(c[0])
    melt = [q for q in ("Tfus", "Ttriple") if q in one]
    if melt:
        out["melting"] = ", ".join(x for x in [out.get("melting") and "dHfus " + out["melting"], "/".join(melt)] if x)
    if "Tboil" in one:
        out["vapourPressure"] = ", ".join(x for x in [out.get("vapourPressure") and "Antoine " + out["vapourPressure"],
                                                      "Tboil"] if x)
    elif "vapourPressure" in out:
        out["vapourPressure"] = "Antoine " + out["vapourPressure"]
    if "Cp,liquid" in one or "Cp,liquid" in t:
        out.setdefault("liquidHeatCapacity", "one value")
    return out


def webbook_fluids(cache):
    t = get(FLUIDS, cache)
    return {H.unescape(re.sub(r"<[^>]+>", "", x)).strip().lower() for x in re.findall(r"<option[^>]*>(.*?)</option>", t, re.S)}


def thermoml(cid):
    f = MEASURED_DIR / ("thermoml_%s.json" % cid)
    if not f.exists():
        return None
    out = {}
    for r in json.loads(f.read_text())["rows"]:
        p = THERMOML.get(r["property"])
        if not p or r["binary_with"]:
            continue
        if p not in ("vapourPressure", "heatOfVaporization", "Tm", "dHfus") and ("Liquid" not in r["phases"] or "Gas" in r["phases"]):
            continue
        n, arts = out.get(p, (0, set()))
        out[p] = (n + 1, arts | {r["doi"]})
    txt = {p: "%d values, %d article%s" % (n, len(a), "s" if len(a) > 1 else "") for p, (n, a) in out.items()}
    # melting data: the enthalpy of fusion is what solid-liquid equilibrium needs with the melting temperature
    melt = ["%s %s" % (k, txt.pop(k)) for k in ("dHfus", "Tm") if k in txt]
    if melt:
        txt["melting"] = "; ".join(melt)
    return txt


def thermoml_articles(cid):
    """{doi: set of properties} of the pure-component ThermoML values of a component."""
    out = {}
    for r in json.loads((MEASURED_DIR / ("thermoml_%s.json" % cid)).read_text())["rows"]:
        p = THERMOML.get(r["property"])
        if p and not r["binary_with"] and r.get("doi"):
            out.setdefault(r["doi"], set()).add(p)
    return dict(sorted(out.items()))


def coolprop(fluid):
    """{property: text} for a CoolProp fluid: the equation of state gives the thermodynamic properties; transport and
    surface tension only where CoolProp has a model."""
    import CoolProp.CoolProp as CP
    AS = CP.AbstractState("HEOS", fluid)
    AS.update(CP.QT_INPUTS, 0, 0.7 * AS.T_critical())
    out = {p: "EOS" for p in ("vapourPressure", "liquidDensity", "idealGasHeatCapacity", "liquidHeatCapacity",
                              "heatOfVaporization")}
    for fn, props in ((AS.viscosity, ["liquidViscosity", "vapourViscosity"]),
                      (AS.conductivity, ["liquidThermalConductivity", "vapourThermalConductivity"]),
                      (AS.surface_tension, ["surfaceTension"])):
        try:
            fn()
            for p in props:
                out[p] = "model"
        except ValueError:
            pass
    return out


def chemsep(paths):
    import xml.etree.ElementTree as ET
    by_cas = {}
    for i, path in enumerate(paths):
        for c in ET.parse(path).getroot():
            e = c.find("CAS")
            if e is not None and e.get("value") not in by_cas:
                by_cas[e.get("value")] = (i + 1, c)
    return by_cas


def chemsep_props(entry):
    if not entry:
        return {}
    f, c = entry
    out = {}
    for p, tag in CHEMSEP_TAG.items():
        x = c.find(tag)
        if x is None:
            continue
        eq, lo, hi = x.find("eqno"), x.find("Tmin"), x.find("Tmax")
        out[p] = "file %d, eq %s, %s-%s K" % (f, eq.get("value") if eq is not None else "?",
                                             lo.get("value") if lo is not None else "?", hi.get("value") if hi is not None else "?")
    if c.find("HeatOfFusionAtMeltingPoint") is not None:
        out["melting"] = "file %d, Tm and dHfus" % f
    elif c.find("NormalMeltingPointTemperature") is not None or c.find("TriplePointTemperature") is not None:
        out["melting"] = "file %d, Tm only" % f
    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("ids", nargs="*", help="components (registry ids); or --batch")
    ap.add_argument("--batch", type=int, help="all components of this registry batch")
    ap.add_argument("--chemsep", required=True, nargs="+", help="chemsep1.xml and chemsep2.xml")
    ap.add_argument("--cache", type=Path, required=True, help="directory for the downloaded WebBook pages and ThermoML records")
    ap.add_argument("--fetch", action="store_true", help="fetch the ThermoML values first")
    ap.add_argument("--md", type=Path, help="also write the report as Markdown")
    ap.add_argument("--new", nargs="+", default=[], metavar="ID:CAS", help="components not in the registry yet")
    ap.add_argument("--open-copies", action="store_true", help="list the ThermoML articles with their legal free copies (Unpaywall)")
    a = ap.parse_args()
    ids = ([c[0] for c in REG.batch(a.batch)] if a.batch else list(a.ids))
    entries = {c["id"]: c for c in REG.all}
    for spec in a.new:
        cid, cas = spec.split(":")
        from chemicals.identifiers import search_chemical
        meta = search_chemical(cas)
        if meta.CASs != cas:
            raise SystemExit("%s: CAS %s not found in the chemicals library (%s)" % (cid, cas, meta.CASs))
        names = [n for n in dict.fromkeys([meta.common_name, meta.iupac_name]) if n]
        entries[cid] = {"id": cid, "name": names[0][:1].upper() + names[0][1:], "coolprop": None, "cas": cas,
                        "thermoml": names}
        ids.append(cid)
    if not ids:
        raise SystemExit("give component ids, --batch or --new")
    unknown = [i for i in ids if i not in entries]
    if unknown:
        raise SystemExit("not in validation/data/component_registry.json: %s" % ", ".join(unknown))
    comps = json.loads((ROOT / "src" / "data" / "components.json").read_text())["components"]
    cs = chemsep(a.chemsep)
    fluids = webbook_fluids(a.cache)
    if a.fetch:
        from measured_components import fetch_thermoml
        for cid in ids:
            if entries[cid].get("thermoml"):
                fetch_thermoml(cid, a.cache / "thermoml", {"cas": cas_of(cid, entries, comps),
                                                           "thermoml_queries": entries[cid]["thermoml"]})
    lines = ["# Sources per property", "",
             "Generated by `validation/python/gap_report.py`. **GAP**: no source of AGENTS.md rule 1 has the property "
             "(CoolProp, ChemSep, NIST WebBook, ThermoML Archive); search the open literature, or ask for an article. "
             "WebBook: the full compound page (Mask=FFFF); 'fluid' marks a WebBook fluid (transport tables).", ""]
    gaps = {}
    for cid in ids:
        e = entries[cid]
        cas = cas_of(cid, entries, comps)
        cp = coolprop(e["coolprop"]) if e.get("coolprop") else {}
        ch = chemsep_props(cs.get(cas))
        wb = webbook(cas, a.cache)
        name = e.get("name") or comps.get(cid, {}).get("name", cid)
        is_fluid = name.lower() in fluids
        tm = thermoml(cid)
        lines += ["## %s (%s, CAS %s)" % (name, cid, cas), "",
                  "CoolProp: %s. ChemSep: %s. WebBook fluid: %s. ThermoML: %s." % (
                      e["coolprop"] or "not a fluid", "file %d" % cs[cas][0] if cas in cs else "not included",
                      "yes" if is_fluid else "no", "not fetched" if tm is None else "fetched"), "",
                  "| Property | CoolProp | ChemSep | WebBook | ThermoML | |", "|---|---|---|---|---|---|"]
        for p in PROPS:
            w = wb.get(p, "")
            if is_fluid and p in ("liquidViscosity", "vapourViscosity", "liquidThermalConductivity",
                                  "vapourThermalConductivity", "surfaceTension"):
                w = "fluid tables"
            t = (tm or {}).get(p, "")
            have = cp.get(p) or ch.get(p) or w or t
            if p == "melting":  # covered only with an enthalpy of fusion
                have = any("dHfus" in x for x in (ch.get(p, ""), w, t))
            if not have:
                gaps.setdefault(cid, []).append(p)
            lines.append("| %s | %s | %s | %s | %s | %s |" % (p, cp.get(p, ""), ch.get(p, ""), w, t, "" if have else "**GAP**"))
        lines.append("")
        if a.open_copies and tm is not None:
            from open_copy import describe
            arts = thermoml_articles(cid)
            lines += ["Articles of the ThermoML values, and their legal free copies (Unpaywall):", ""]
            lines += ["- %s (%s): %s" % (doi, ", ".join(sorted(ps)), describe(doi, a.cache)) for doi, ps in arts.items()]
            lines.append("")
    lines += ["## Gaps", ""] + (["- %s: %s" % (cid, ", ".join(ps)) for cid, ps in gaps.items()] or ["none"]) + [""]
    text = "\n".join(lines)
    print(text)
    if a.md:
        a.md.write_text(text)


def cas_of(cid, entries, comps):
    e = entries[cid]
    if e.get("cas"):
        return e["cas"]
    if cid in comps:
        return comps[cid]["cas"]
    import CoolProp.CoolProp as CP
    return CP.get_fluid_param_string(e["coolprop"], "CAS")


if __name__ == "__main__":
    main()
