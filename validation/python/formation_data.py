"""Enthalpy and Gibbs energy of formation of every component (proposal 0010, step 1: reactions).

The record each component gets, `formation` in src/data/components.json (read by src/thermo/pure.js):

1. A compound of the ChemSep databank (chemsep1.xml v8.3, else chemsep2.xml v8.31 data 2; Artistic License 2.0):
   Hf_ig_J_mol and Gf_ig_J_mol, the ideal gas at 298.15 K ("IG heat of formation", "IG Gibbs energy of formation"),
   taken as ChemSep prints them (the maintainer, 2026-10-22: "ChemSep as is", by the rule of 2026-10-14 in
   docs/DATA_RULES.md: a ChemSep record is not compared with other sources or refitted). The elements in their
   reference state (hydrogen, oxygen, nitrogen, argon, helium) are zero, as ChemSep has them.

2. A component ChemSep does not have: its measured values (the maintainer, 2026-10-22: "search everything now"),
   stored as found in validation/data/pure/formation/measured.json by `--fetch` (the NIST Chemistry WebBook page of
   the compound) and `--fetch-thermoml ARCHIVE` (the combustion reactions and entropies of the NIST TRC ThermoML
   Archive, bulk file ThermoML.v2020-09-30.tgz, doi 10.18434/mds2-2422), and chosen by this rule:

   - the values: the enthalpy of formation of the condensed state measured, at 298.15 K: a WebBook "ΔfH°liquid" or
     "ΔfH°solid" row; else a WebBook "ΔcH°" row, or a ThermoML energy of combustion at constant volume at 298.15 K
     (taken as the standard energy of combustion the article reports), turned into one by the combustion cycle,
         ΔcH° = ΔcU° + Δn(gas) R T,   ΔfH° = a ΔfH°(CO2, g) + (b/2) ΔfH°(H2O, l) − ΔcH°   (CaHbOcNd, products CO2 (g),
     H2O (l), N2 (g); Δn(gas) = c/2 + d/2 − b/4), with the CODATA key values (Cox, Wagman and Medvedev 1989, the
     open table at https://www.codata.info/resources/databases/key1.html). One value per article: an article that
     the WebBook and the ThermoML Archive both list counts once (the WebBook's ΔfH° row, else the ThermoML value);
   - the form: a value for a liquid or a gas may come from either enantiomer or the racemate (mirror images have
     the same properties, docs/DATA_RULES.md section 3); a value for a crystal only from the crystal the component's
     own records refer to (its CAS number, or the crystal its melting data name: D-alpha-glucose), because a racemic
     crystal and an enantiopure one, or two anomers, are different solids. ThermoML entries matched only without
     their stereo layers, and not named as the component, are left out (they may be another diastereomer);
   - the state of the record: the one the component is in at 298.15 K, the crystal ("solid") when its melting
     temperature (its `fusion` record) is above 298.15 K, else the liquid; values of the other condensed state are
     left out and named (the WebBook labels a few values of crystalline polyols and acids "liquid": xylitol,
     erythritol, fumaric acid). Without melting data, or without a value for that state: the liquid if a value
     exists, else the crystal, else the gas;
   - the value: the median of the articles' values for that state; their number and spread are stored;
   - the Gibbs energy of formation, where an open standard entropy of the same state and form at 298.15 K exists
     (a WebBook S° row, or a ThermoML entropy at 298.15 K): ΔfG° = ΔfH° − T (S° − Σ elements' S°), with the CODATA
     key entropies of the elements; else Gf_J_mol is null.

   The record keeps the state measured (Hf_J_mol, Gf_J_mol with state "liquid" or "solid"); turning it into the ideal
   gas or into the liquid of a nonvolatile component is the reactor step's (proposal 0010, step 3), with the
   component's own records (heat of vaporization, melting data).

3. Otherwise `{available: false, searched}`, the sources searched ("no open data", AGENTS.md rule 1).

    python validation/python/formation_data.py --fetch --fetch-thermoml ThermoML.v2020-09-30.tgz --chemsep chemsep1.xml chemsep2.xml
    python validation/python/formation_data.py --chemsep chemsep1.xml chemsep2.xml --write
"""
import argparse
import html as H
import json
import re
import statistics
import sys
import tarfile
import time
import xml.etree.ElementTree as ET
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from add_components import ChemSep  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
COMP_FILE = ROOT / "src" / "data" / "components.json"
MEASURED_FILE = ROOT / "validation" / "data" / "pure" / "formation" / "measured.json"
T_REF_K = 298.15
R = 8.314462618
WEBBOOK = "https://webbook.nist.gov/cgi/cbook.cgi?ID={ID}&Mask=FFFF&Units=SI"
CODATA_URL = "https://www.codata.info/resources/databases/key1.html"
# CODATA key values (Cox, Wagman and Medvedev, CODATA Key Values for Thermodynamics, Hemisphere, 1989), as the open
# table at CODATA_URL prints them; standard pressure 1 bar. The person compares them with the table.
CODATA = {"dHf_CO2_g_J_mol": -393510.0, "dHf_H2O_l_J_mol": -285830.0,
          "S_J_molK": {"C": 5.74, "H2": 130.680, "O2": 205.152, "N2": 191.609, "Cl2": 223.081}}
# other pages of the same molecule: (CAS, what it is, whether a crystal value from it is the component's crystal)
OTHER_FORMS = {
    "glucose": [("492-62-6", "alpha-D-glucopyranose", True)],   # its melting data are those of D-alpha-glucose (Chua 2022)
    "lactic-acid": [("79-33-4", "L-lactic acid", False)],
    "malic-acid": [("97-67-6", "L-malic acid", False), ("636-61-3", "D-malic acid", False)],
    "limonene": [("5989-27-5", "(R)-(+)-limonene", False)],
    # the WebBook's DL-lactide page holds the same crystal as the component's own page (both: ΔfH°solid -792.1 +- 1.7 kJ/mol,
    # Lebedev et al.; DL-lactide melts at 397 K, the component's melting data 397.5 K) and adds its standard entropy
    # (2026-10-27, from the supplement audit of 2026-10-27)
    "lactide": [("615-95-2", "DL-lactide", True)],
}
# held for the maintainer: the open values disagree and nothing open decides between them
HOLD = {
    "xylitol": ("two crystal energies of combustion in the ThermoML Archive disagree by about 100 kJ/mol (doi:10.1016/j.tca.2007.02.022, "
                "-2463.2 kJ/mol with a stated uncertainty of 100 kJ/mol; doi:10.1016/j.tca.2009.11.011, -16833.39 J/g, recorded for "
                "'SRS-1,2,3,4,5-pentanepentol', which may be another pentitol), and the WebBook's value (Oberemok-Yakubova and "
                "Balandin, 1963, -1118.6 kJ/mol) is labelled liquid for a compound that is crystalline at 298.15 K"),
}
SEARCHED = ["ChemSep v8.3 and v8.31 data 2 (compound not included)", "NIST Chemistry WebBook (no enthalpy of formation or combustion)",
            "NIST TRC ThermoML Archive, bulk file ThermoML.v2020-09-30.tgz (no combustion reaction of the compound)"]


def chemsep_record(cs, cas):
    """The ChemSep formation record of a compound, or None when ChemSep does not have it."""
    try:
        cs.compound(cas)
    except SystemExit:
        return None
    Hf, Gf = cs.value(cas, "HeatOfFormation"), cs.value(cas, "GibbsEnergyOfFormation")
    if Hf is None or Gf is None:
        return None
    name, sid = cs.name(cas)
    return {"state": "ideal gas", "T_K": T_REF_K, "Hf_ig_J_mol": Hf / 1000, "Gf_ig_J_mol": Gf / 1000, "tier": "databank",
            "source": {"name": name, "reference": "Kooijman and Taylor, ChemSep pure-component database "
                       "(HeatOfFormation, 'IG heat of formation'; GibbsEnergyOfFormation, 'IG Gibbs energy of formation'), "
                       "taken as printed (J/kmol, divided by 1000)", "access": "Artistic License 2.0"},
            "source_ids": [sid]}


# ChemSep records replaced by the WebBook's measured gas values, by the maintainer's decision, each with the reason
# (2026-10-22: formic acid; docs/decisions/2026-10-22-05-reactions.md)
WEBBOOK_GAS_OVER_CHEMSEP = {
    "formic-acid": "ChemSep's ideal-gas enthalpy of formation (-393.6 kJ/mol) is 15 kJ/mol below the measured gas values "
                   "of the WebBook (Guthrie 1974, Lebedeva 1964, Sinke 1959), which Chao and Zwolinski (J. Phys. Chem. Ref. "
                   "Data 7 (1978) 363) also take; with ChemSep's value and the dimers of the vapour, the liquid's enthalpy of "
                   "formation would be 16.6 kJ/mol off the measured liquid values (the maintainer, 2026-10-22: the WebBook "
                   "gas value)",
}


def webbook_gas_record(cid, c, cache, why):
    """The ideal-gas formation record from the WebBook's measured gas values: the median ΔfH°(gas) of the rows, and
    ΔfG° from the median S°(gas) with the CODATA entropies of the elements."""
    rows = [r for r in webbook_rows(c["cas"], cache) if r["state"] == "gas"]
    hs = sorted(r["value"] * 1000 for r in rows if r["quantity"] == "ΔfH°")
    ss = sorted(r["value"] for r in rows if r["quantity"] == "S°")
    if not hs or not ss:
        raise SystemExit(f"{cid}: the WebBook page has no gas ΔfH° or S°")
    med = lambda v: v[len(v) // 2] if len(v) % 2 else (v[len(v) // 2 - 1] + v[len(v) // 2]) / 2
    H, S = med(hs), med(ss)
    G = H - T_REF_K * (S - elements_entropy(formula(c["formula"])))
    refs = "; ".join(f"ΔfH°gas {r['value']} kJ/mol, {r['reference']}" for r in rows if r["quantity"] == "ΔfH°")
    sref = "; ".join(f"S°gas {r['value']} J/(mol K), {r['reference']}" for r in rows if r["quantity"] == "S°")
    return {"state": "ideal gas", "T_K": T_REF_K, "Hf_ig_J_mol": round(H, 1), "Gf_ig_J_mol": round(G, 1), "tier": "databank",
            "source": {"name": "Measured gas values: NIST Chemistry WebBook (SRD 69), in place of ChemSep's",
                       "access": "Free to read online (WebBook, SRD 69); CODATA key values, open table",
                       "reference": f"{refs}; {sref}",
                       "selection": f"median of {len(hs)} ΔfH° values and of {len(ss)} S° value(s); ΔfG° = ΔfH° - T (S° - "
                                    f"Σ S°(elements)), the elements' entropies the CODATA key values ({CODATA_URL})",
                       "why": why},
            "source_ids": ["nist-webbook", "codata-key-values"]}


# ---------------------------------------------------------------------------------------
# fetching: the WebBook page and the ThermoML Archive, stored as found

def get(url, cache):
    import urllib.request
    f = cache / (re.sub(r"[^A-Za-z0-9]+", "_", url)[-120:] + ".html")
    if f.exists():
        return f.read_text()
    req = urllib.request.Request(url, headers={"User-Agent": "CHEPTA data script (https://github.com/FaireDose/CHEPTA)"})
    for attempt in range(6):
        try:
            with urllib.request.urlopen(req, timeout=120) as r:
                text = r.read().decode("utf-8", "replace")
            break
        except Exception:
            if attempt == 5:
                raise
            time.sleep(5 * 2 ** attempt)
    cache.mkdir(parents=True, exist_ok=True)
    f.write_text(text)
    return text


WB_QUANTITIES = re.compile(r"^(ΔfH°|ΔcH°|S°)(gas|liquid|solid)(,1 bar)?$")


def webbook_rows(cas, cache):
    t = get(WEBBOOK.format(ID="C" + cas.replace("-", "")), cache)
    rows = []
    for m in re.finditer(r'<table[^>]*aria-label="One dimensional data"[^>]*>(.*?)</table>', t, re.S):
        for r in re.findall(r"<tr[^>]*>(.*?)</tr>", m.group(1), re.S):
            c = [H.unescape(re.sub(r"<[^>]+>", "", x)).strip() for x in re.findall(r"<t[dh][^>]*>(.*?)</t[dh]>", r, re.S)]
            if len(c) < 5 or not WB_QUANTITIES.match(c[0]):
                continue
            q = WB_QUANTITIES.match(c[0])
            v = re.match(r"^(-?\d+\.?\d*)\s*(?:±\s*(\d+\.?\d*))?$", c[1])
            if not v:   # an empty value ("uncertain value" in the comment) is not used
                continue
            rows.append({"quantity": q.group(1), "state": q.group(2), "value": float(v.group(1)),
                         "uncertainty": float(v.group(2)) if v.group(2) else None, "units": c[2], "method": c[3],
                         "reference": c[4], "comment": c[5] if len(c) > 5 else ""})
    return rows


def fetch_webbook(comps, todo, cache, measured):
    for cid in todo:
        c = comps[cid]
        forms = [(c["cas"], "the component", True)] + OTHER_FORMS.get(cid, [])
        out = []
        for cas, what, crystal_ok in forms:
            for r in webbook_rows(cas, cache):
                out.append({"cas": cas, "form": what, "crystal_is_components": crystal_ok,
                            "url": WEBBOOK.format(ID="C" + cas.replace("-", "")), **r})
            time.sleep(0.3)
        measured.setdefault(cid, {})["webbook"] = out


NS = {"t": "http://www.iupac.org/namespaces/ThermoML"}


def _t(el, p):
    e = el.find(p, NS)
    return None if e is None else e.text


def _first(el, tags):
    for e in el.iter():
        if e.tag.split("}")[-1] in tags:
            return e.text


def fetch_thermoml(comps, todo, archive, measured):
    from measured_components import norm_inchi
    from pubchem import chemical
    nostereo = lambda i: "/".join(p for p in (i or "").split("/") if p[:1] not in ("b", "t", "m", "s"))
    exact, loose = {}, {}
    for cid in todo:
        i = norm_inchi(chemical(comps[cid]["cas"]).InChI)
        exact[i] = cid
        loose.setdefault(nostereo(i), cid)
    for cid in todo:
        measured.setdefault(cid, {})["thermoml"] = []
    with tarfile.open(archive, "r:gz") as tar:
        for m in tar:
            if not m.isfile() or not m.name.endswith(".xml"):
                continue
            raw = tar.extractfile(m).read()
            if b"ReactionData" not in raw and b"Molar entropy" not in raw:
                continue
            try:
                root = ET.fromstring(raw)
            except ET.ParseError:
                continue
            cit = root.find("t:Citation", NS)
            ref = {"doi": _t(cit, "t:sDOI"), "year": _t(cit, "t:yrPubYr"), "authors": [a.text for a in cit.findall("t:sAuthor", NS)],
                   "title": _t(cit, "t:sTitle"), "journal": _t(cit, "t:sPubName"), "file": m.name}
            comp = {}
            for c in root.findall("t:Compound", NS):
                comp[_t(c, "t:RegNum/t:nOrgNum")] = (norm_inchi(_t(c, "t:sStandardInChI")), _t(c, "t:sCommonName") or "")

            def ours(org):
                i, nm = comp.get(org, ("", ""))
                if i in exact:
                    return exact[i], True, nm
                cid = loose.get(nostereo(i))
                return (cid, False, nm) if cid else (None, False, nm)
            for d in root.findall("t:ReactionData", NS):
                if (_t(d, "t:eReactionType") or "") != "Combustion with oxygen":
                    continue
                for p in d.findall("t:Participant", NS):
                    cid, ex, nm = ours(_t(p, "t:RegNum/t:nOrgNum"))
                    if not cid or float(_t(p, "t:nStoichiometricCoef")) >= 0:
                        continue
                    props = {_t(q, "t:nPropNumber"): (_first(q, {"ePropName"}), _first(q, {"eMethodName"}), _t(q, "t:nTemperature-K"))
                             for q in d.findall("t:Property", NS)}
                    for nv in d.findall("t:NumValues", NS):
                        for pv in nv.findall("t:PropertyValue", NS):
                            name, method, T = props.get(_t(pv, "t:nPropNumber"), (None, None, None))
                            u = _first(pv, {"nCombExpandUncertValue", "nExpandUncertValue", "nCombStdUncertValue", "nStdUncertValue"})
                            measured[cid]["thermoml"].append({"kind": "combustion", "compound_name": nm, "exact_inchi": ex,
                                "phase": _t(p, "t:ePhase"), "property": name, "method": method, "T_K": float(T) if T else None,
                                "value": float(_t(pv, "t:nPropValue")), "uncertainty": float(u) if u else None, **ref})
            for d in root.findall("t:PureOrMixtureData", NS):
                members = [_t(c, "t:RegNum/t:nOrgNum") for c in d.findall("t:Component", NS)]
                if len(members) != 1:
                    continue
                cid, ex, nm = ours(members[0])
                if not cid:
                    continue
                for q in d.findall("t:Property", NS):
                    if (_first(q, {"ePropName"}) or "") != "Molar entropy, J/K/mol":
                        continue
                    pn = _t(q, "t:nPropNumber")
                    phase = [e.text for e in q.findall("t:PropPhaseID/t:ePropPhase", NS)]
                    for nv in d.findall("t:NumValues", NS):
                        T = None
                        for v in nv.findall("t:VariableValue", NS):
                            T = float(_t(v, "t:nVarValue"))
                        for pv in nv.findall("t:PropertyValue", NS):
                            if _t(pv, "t:nPropNumber") == pn and T is not None and abs(T - T_REF_K) < 0.01:
                                measured[cid]["thermoml"].append({"kind": "entropy", "compound_name": nm, "exact_inchi": ex,
                                    "phase": phase[0] if phase else None, "T_K": T, "value": float(_t(pv, "t:nPropValue")), **ref})


# ---------------------------------------------------------------------------------------
# the rule

def formula(f):
    out = {}
    for el, n in re.findall(r"([A-Z][a-z]?)(\d*)", f):
        out[el] = out.get(el, 0) + int(n or 1)
    return out


def from_combustion(dcH_J_mol, f):
    """ΔfH° of the compound from its standard enthalpy of combustion (CO2 g, H2O l, N2 g)."""
    return f.get("C", 0) * CODATA["dHf_CO2_g_J_mol"] + f.get("H", 0) / 2 * CODATA["dHf_H2O_l_J_mol"] - dcH_J_mol


def dn_gas(f):
    return f.get("O", 0) / 2 + f.get("N", 0) / 2 - f.get("H", 0) / 4


def elements_entropy(f):
    S = CODATA["S_J_molK"]
    return (f.get("C", 0) * S["C"] + f.get("H", 0) / 2 * S["H2"] + f.get("O", 0) / 2 * S["O2"] + f.get("N", 0) / 2 * S["N2"]
            + f.get("Cl", 0) / 2 * S["Cl2"])


STATE = {"liquid": "liquid", "Liquid": "liquid", "solid": "solid", "gas": "gas"}


def tml_state(phase):
    if not phase:
        return None
    if phase.startswith("Crystal"):
        return "solid"
    return STATE.get(phase)


def author_year(ref):
    """('surname', 'year') of a WebBook reference text such as 'Zaheeruddin and Lodhi, 1991' or 'Guthrie, Scott, et al., 1952'."""
    m = re.match(r"^\s*([^,\s]+)[^0-9]*?(\d{4})", ref or "")
    return (m.group(1).lower(), m.group(2)) if m else (None, None)


def build_measured(cid, c, m):
    """(record or None, report line) of a component from its measured values."""
    if cid in HOLD:
        return None, "held: " + HOLD[cid]
    f = formula(c["formula"])
    chon = not (set(f) - {"C", "H", "O", "N"})
    vals = {"liquid": {}, "solid": {}, "gas": {}}   # state -> article key -> (value J/mol, description)
    ent = {"liquid": [], "solid": [], "gas": []}
    left = []
    for r in m.get("webbook", []):
        st = r["state"]
        if st == "solid" and not r["crystal_is_components"]:
            left.append("%s %s (%s): the crystal of another form" % (r["quantity"], r["reference"], r["form"]))
            continue
        key = author_year(r["reference"])
        desc = "%s (WebBook%s)" % (r["reference"], "" if r["form"] == "the component" else ", " + r["form"])
        if r["quantity"] == "ΔfH°":
            vals[st][key] = (r["value"] * 1000, "ΔfH°%s %s kJ/mol, %s" % (st, r["value"], desc), {"nist-webbook"})
        elif r["quantity"] == "ΔcH°" and chon and st != "gas" and key not in vals[st]:
            vals[st].setdefault(key, (from_combustion(r["value"] * 1000, f), "ΔcH°%s %s kJ/mol, %s" % (st, r["value"], desc),
                                      {"nist-webbook", "codata-key-values"}))
        elif r["quantity"] == "S°":
            ent[st].append((r["value"], "S°%s %s J/(mol K), %s" % (st, r["value"], desc), {"nist-webbook"}))
    for r in m.get("thermoml", []):
        st = tml_state(r["phase"])
        named = (r.get("compound_name") or "").lower().replace("-", " ") == c["name"].lower().replace("-", " ")
        loose_ok = st in ("liquid", "gas") or named
        if not r["exact_inchi"] and not loose_ok:
            left.append("%s %s (%s, '%s'): matched only without stereo layers" % (r["kind"], r["doi"], r["phase"], r["compound_name"]))
            continue
        if st == "solid" and not r["exact_inchi"] and not named:
            continue
        surname = (r["authors"][0] if r["authors"] else "").split(",")[0].strip().lower()
        key = (surname, r["year"])
        cite = "%s %s, doi:%s (ThermoML Archive)" % (", ".join(a.split(",")[0] for a in r["authors"][:2]) + (" et al." if len(r["authors"]) > 2 else ""), r["year"], r["doi"])
        if r["kind"] == "entropy":
            ent[st].append((r["value"], "S°%s %s J/(mol K) at 298.15 K, %s" % (st, r["value"], cite), {"nist-thermoml-archive"}))
            continue
        if not chon or r["T_K"] is None or abs(r["T_K"] - T_REF_K) > 0.01:
            left.append("combustion %s at %s K: not at 298.15 K" % (r["doi"], r["T_K"]))
            continue
        if "Specific internal energy" in (r["property"] or ""):
            dcU = r["value"] * c["MW"]
        elif "Molar internal energy" in (r["property"] or ""):
            dcU = r["value"] * 1000
        else:
            left.append("combustion %s: %s not used" % (r["doi"], r["property"]))
            continue
        dcH = dcU + dn_gas(f) * R * T_REF_K
        if key in vals[st]:
            continue   # the same article on the WebBook already
        vals[st][key] = (from_combustion(dcH, f), "ΔcU° %s %s at 298.15 K (%s), %s" % (r["value"], r["property"].split(",")[-1].strip(), r["method"], cite),
                         {"nist-thermoml-archive", "codata-key-values"})
    # measured values printed in open articles and theses (validation/data/pure/formation/article_<id>_*.json; DATA_RULES
    # section 1, "Measured values in articles"): the open source read, with the original measurement it names
    arts = set()
    for af in sorted((ROOT / "validation" / "data" / "pure" / "formation").glob("article_%s_*.json" % cid)):
        a = json.loads(af.read_text())
        for e in a["formation"]:
            key = tuple(e["key"])
            if key in vals[e["state"]] or e["quantity"] != "ΔfH°":
                continue
            vals[e["state"]][key] = (e["value"] * 1000, "ΔfH°%s %s +- %s kJ/mol, %s" % (e["state"], e["value"], e["uncertainty"], e["reference"]), set())
            arts.add((e["state"], key, a["source"]["access"]))
    Tm = (c.get("fusion") or {}).get("Tm_K")
    stable = None if Tm is None else ("solid" if Tm > T_REF_K else "liquid")
    if stable and vals[stable]:
        state = stable
        other = "liquid" if stable == "solid" else "solid"
        for _, d, _ in vals[other].values():
            left.append("%s: the component is %s at 298.15 K (melting temperature %.1f K)" % (d, "a crystal" if stable == "solid" else "a liquid", Tm))
    elif Tm is None and vals["liquid"] and vals["solid"]:
        # no melting data (fumaric acid sublimes): the condensed state with more articles
        state = "solid" if len(vals["solid"]) > len(vals["liquid"]) else "liquid"
    else:
        state = next((s for s in ("liquid", "solid", "gas") if vals[s]), None)
    if state is None:
        return None, "no open data" + ("; left out: " + "; ".join(left) if left else "")
    xs = sorted(v for v, _, _ in vals[state].values())
    sids = set().union(*(k for _, _, k in vals[state].values()))
    Hf = statistics.median(xs)
    uncertain = xs[-1] - xs[0] > 10000
    Gf, sdesc = None, None
    if ent[state]:
        S = statistics.median(v for v, _, _ in ent[state])
        Gf = Hf - T_REF_K * (S - elements_entropy(f))
        sdesc = "; ".join(d for _, d, _ in ent[state])
        sids |= set().union(*(k for _, _, k in ent[state])) | {"codata-key-values"}
    rec = {"state": state, "T_K": T_REF_K, "Hf_J_mol": round(Hf, 1), "Gf_J_mol": round(Gf, 1) if Gf is not None else None,
           "values": len(xs), "spread_J_mol": round(xs[-1] - xs[0], 1), "tier": "databank",
           "source": {"name": "Measured values: NIST Chemistry WebBook (SRD 69) and the NIST TRC ThermoML Archive",
                      "access": "Free to read online (WebBook, SRD 69); NIST open license (ThermoML Archive); CODATA key values, open table",
                      "reference": "; ".join(d for _, d, _ in vals[state].values()),
                      "selection": ("median of %d article%s (ΔfH°, or ΔcH° turned into ΔfH° with the CODATA key values of CO2 (g) and "
                                    "H2O (l), %s)" % (len(xs), "s" if len(xs) > 1 else "", CODATA_URL))
                      + ("; ΔfG° from the standard entropy: %s, and the CODATA key entropies of the elements" % sdesc if sdesc else
                         "; no open standard entropy of the %s: no ΔfG°" % state)
                      + ("; the values disagree by %.1f kJ/mol: the enthalpy of formation is uncertain" % ((xs[-1] - xs[0]) / 1000) if uncertain else "")
                      + ("; left out: " + "; ".join(left) if left else "")},
           "source_ids": sorted(sids)}
    used = [x for x in arts if x[0] == state]
    if used:
        # an open article or thesis among the values: make_sources.py names the sources from the text
        only = len(used) == len(xs)
        rec["source"]["name"] = "Measured values: " + ("open articles and theses" if only else
                                                      "NIST Chemistry WebBook (SRD 69), NIST TRC ThermoML Archive, open articles and theses")
        rec["source"]["access"] = "; ".join(sorted({x[2] for x in used})) + ("" if only else "; " + rec["source"]["access"])
        del rec["source_ids"]
    return rec, "%s Hf %.1f kJ/mol (%d values, spread %.1f)%s" % (state, Hf / 1000, len(xs), (xs[-1] - xs[0]) / 1000,
                                                                     "  Gf %.1f" % (Gf / 1000) if Gf is not None else "")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--chemsep", required=True, nargs="+", help="chemsep1.xml and chemsep2.xml")
    ap.add_argument("--fetch", action="store_true", help="read the WebBook pages of the components ChemSep lacks")
    ap.add_argument("--fetch-thermoml", metavar="ARCHIVE", help="read their combustion and entropy data from the bulk archive")
    ap.add_argument("--cache", type=Path, default=ROOT / ".cache" / "webbook", help="directory for the WebBook pages")
    ap.add_argument("--write", action="store_true")
    ap.add_argument("--only", nargs="+", metavar="ID", help="fetch only these components (the others keep their stored values)")
    a = ap.parse_args()
    doc = json.loads(COMP_FILE.read_text())
    comps = doc["components"]
    cs = ChemSep(a.chemsep)
    todo = [cid for cid, c in comps.items() if chemsep_record(cs, c["cas"]) is None and (not a.only or cid in a.only)]
    measured = json.loads(MEASURED_FILE.read_text()) if MEASURED_FILE.exists() else {}
    if a.fetch:
        fetch_webbook(comps, todo, a.cache, measured)
    if a.fetch_thermoml:
        fetch_thermoml(comps, todo, a.fetch_thermoml, measured)
    if a.fetch or a.fetch_thermoml:
        measured["_about"] = ("Measured formation data of the components ChemSep does not have, as found on their NIST WebBook pages "
                              "and in the NIST TRC ThermoML Archive (bulk file ThermoML.v2020-09-30.tgz), by "
                              "validation/python/formation_data.py --fetch / --fetch-thermoml; chosen by the rule of that script.")
        measured["_codata"] = {"source": CODATA_URL, **CODATA}
        MEASURED_FILE.parent.mkdir(parents=True, exist_ok=True)
        MEASURED_FILE.write_text(json.dumps({k: measured[k] for k in sorted(measured)}, indent=1, ensure_ascii=False) + "\n")
    out, n = {}, {"chemsep": 0, "measured": 0, "none": 0}
    for cid, c in comps.items():
        rec = chemsep_record(cs, c["cas"])
        if rec is not None and cid in WEBBOOK_GAS_OVER_CHEMSEP:
            rec = webbook_gas_record(cid, c, a.cache, WEBBOOK_GAS_OVER_CHEMSEP[cid])
            print("%-26s WebBook gas values in place of ChemSep's: Hf %.1f kJ/mol, Gf %.1f kJ/mol"
                  % (cid, rec["Hf_ig_J_mol"] / 1000, rec["Gf_ig_J_mol"] / 1000))
            n["measured"] += 1
        elif rec is not None:
            n["chemsep"] += 1
        else:
            rec, line = build_measured(cid, c, measured.get(cid, {}))
            if rec is None:
                rec = {"available": False, "searched": SEARCHED + measured.get(cid, {}).get("searched_also", [])
                       + ([line.split("; left out: ", 1)[1].join(["Left out: ", ""])] if "; left out: " in line else [])}
                if cid in HOLD:
                    rec["held"] = HOLD[cid]
                n["none"] += 1
            else:
                n["measured"] += 1
            print("%-26s %s" % (cid, line))
        out[cid] = rec
    print("ChemSep %(chemsep)d, measured %(measured)d, no open data %(none)d" % n)
    if a.write:
        for cid, rec in out.items():
            comps[cid]["formation"] = rec
        COMP_FILE.write_text(json.dumps(doc, indent=2, ensure_ascii=False) + "\n")
        print("written %s" % COMP_FILE.relative_to(ROOT))


if __name__ == "__main__":
    main()
