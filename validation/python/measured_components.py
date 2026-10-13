"""Proposal 0008, Part B: components that are neither CoolProp fluids nor in the ChemSep databank, built
from measured data in open sources (AGENTS.md rule 1, steps 3 and 5):

  - the NIST Chemistry WebBook (SRD 69): critical constants, Antoine equations, enthalpies of
    vaporization, heat capacities, as printed on the compound's pages;
  - the NIST TRC ThermoML Archive (2003-2019; NIST open data, even where the article is
    paywalled): every pure-component data set of the compound, and the pure-compound end points
    (mole fraction 1) of binary data sets.

    python validation/python/measured_components.py --fetch --cache DIR   # download (pages, records)
    python validation/python/measured_components.py                       # fit and print
    python validation/python/measured_components.py --write              # and write

--fetch stores what the fits use, with the citation of every value, in
validation/data/pure/measured/webbook_<id>.json (the WebBook tables, as printed) and
validation/data/pure/measured/thermoml_<id>.json (one row per measured value). The ThermoML
records themselves go to the --cache directory and are not committed. No number is typed in by
hand: the choices below name the WebBook reference (as printed there) and the rules; the values
come from the stored files.

How a record is fitted (same equation forms and targets as fit_properties.py):
  1. every measured value of the property, in record units; duplicates (the same value of the same
     article at the same temperature, as in the pure end point of a binary set) counted once;
     liquid values at pressures above 110 kPa left out (a record is at saturation or 1 atm);
  2. values whose own stated expanded uncertainty is larger than the target (1 % for thermodynamic
     properties, 3 % for transport properties) are left out: they cannot test the fit at the target;
  3. the DIPPR form is fitted by least squares, with the fewest coefficients that meet the target
     (for vapour pressures also the minimax fit of fit_properties.py);
     while no variant meets it, the value that deviates most from a robust fit (Huber weights) of
     all, relative to its own stated uncertainty, is left out. At most a third of the values may be
     left out this way, otherwise the script stops with an error;
  4. the record keeps the range of the values used; every value left out is listed in the record
     (`excluded`), with the reason and its deviation from the final fit.

The stored points of each record (validation/data/pure/<id>.json) are the measured values used, so
test/properties.test.js checks every record against the measurements themselves.
"""
import argparse
import datetime
import html as H
import json
import math
import re
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

import numpy as np
from scipy.optimize import brentq, least_squares

sys.path.insert(0, str(Path(__file__).resolve().parent))
from fit_properties import (UNITS, ev, fit_101, fit_107, pct, rel_dev, rnd)  # noqa: E402
import thermoml_read  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
COMP_FILE = ROOT / "src" / "data" / "components.json"
POINTS_DIR = ROOT / "validation" / "data" / "pure"
MEASURED_DIR = POINTS_DIR / "measured"
DOC_FILE = ROOT / "docs" / "PURE_DATA_MEASURED.md"
UA = "CHEPTA data script (https://github.com/FaireDose/CHEPTA)"
WEBBOOK_URL = "https://webbook.nist.gov/cgi/cbook.cgi?ID={ID}&Units=SI&Mask={mask}"
THERMOML_API = "https://trc.nist.gov/ThermoML-API/objects"
WEBBOOK_ACCESS = "free to read (NIST SRD 69)"
THERMOML_ACCESS = "open data (NIST TRC ThermoML Archive), free to read even where the article is not"
# the WebBook pages of individual values (Type=...), for the quantities whose phase change table row is an average
INDIVIDUAL = {"Tc": "TC", "Pc": "PC", "ΔvapH°": "HVAP"}
TRANSPORT = {"liquidViscosity", "vapourViscosity", "liquidThermalConductivity", "vapourThermalConductivity"}
PROPS = ["liquidDensity", "idealGasHeatCapacity", "liquidHeatCapacity", "heatOfVaporization", "liquidViscosity",
         "vapourViscosity", "liquidThermalConductivity", "vapourThermalConductivity", "surfaceTension"]
# ThermoML property name -> (record, factor to record units, phase that must be in the set)
THERMOML_PROPS = {
    "Vapor or sublimation pressure, kPa": ("vapourPressure", 1000.0, "Liquid"),
    "Mass density, kg/m3": ("liquidDensity", 1.0, "Liquid"),
    "Molar heat capacity at constant pressure, J/K/mol": ("liquidHeatCapacity", 1.0, "Liquid"),
    "Viscosity, Pa*s": ("liquidViscosity", 1.0, "Liquid"),
    "Surface tension liquid-gas, N/m": ("surfaceTension", 1.0, "Liquid"),
    "Thermal conductivity, W/m/K": ("liquidThermalConductivity", 1.0, "Liquid"),
    "Molar enthalpy of vaporization or sublimation, kJ/mol": ("heatOfVaporization", 1000.0, "Liquid"),
    "Normal boiling temperature, K": ("Tb", 1.0, "Liquid"),
    "Critical temperature, K": ("Tc", 1.0, None),
    "Critical pressure, kPa": ("Pc", 1000.0, None),
    # melting data, for validation/python/fusion_data.py (proposal 0009, batch 2: where the WebBook and ChemSep have none)
    "Normal melting temperature, K": ("Tm", 1.0, "Liquid"),
    "Triple point temperature, K": ("Ttriple", 1.0, "Liquid"),
    "Molar enthalpy of transition or fusion, kJ/mol": ("Hfus", 1000.0, "Liquid"),
}

# ---------------------------------------------------------------------------------------------
# The components and the choices made for each (the values are in the stored files)
# ---------------------------------------------------------------------------------------------
COMPONENTS = {
    "dichloromethane": {
        "name": "Dichloromethane", "cas": "75-09-2", "webbook": "C75092",
        "aliases": ["methylene chloride", "methylene dichloride", "dcm"],
        "thermoml_queries": ["dichloromethane", "methylene chloride"],
        # WebBook phase change data: Tc 508 K and Pc 63.55 bar of the same article (Majer and Svoboda, 1985
        # list Tc 510 K without a Pc)
        "critical": "Garcia-Sanchez, Romero-Martinez, et al., 1989",
        # Antoine equations fitted with the ThermoML values: Ganeff and Jungers (1948) are the only measured
        # vapour pressures below 285 K in either source; the other set is a cross-check
        "antoine_fit": ["Ganeff and Jungers, 1948"],
        # enthalpy of vaporization: the calorimetric values (method C) and the critically evaluated ones
        # (Majer and Svoboda, 1985; the review of Manion, 2002) of the WebBook
        "dHvap_methods": ["C", "Review"], "dHvap_refs": ["Majer and Svoboda, 1985"],
        "cp0": "shomate",
    },
    "2-methoxyethanol": {
        "name": "2-Methoxyethanol", "cas": "109-86-4", "webbook": "C109864",
        "aliases": ["methyl cellosolve", "ethylene glycol monomethyl ether", "egme", "methoxyethanol"],
        "thermoml_queries": ["2-methoxyethanol", "ethylene glycol monomethyl ether"],
        # WebBook: Wilson, Wilson, et al., 1996 (597.6 K, 52.85 bar) and Steele, Chirico, et al., 1994 (571 K,
        # 36.00 bar); the measured vapour pressures are consistent with both points (they lie on one curve),
        # Wilson et al. are the later measurement
        "critical": "Wilson, Wilson, et al., 1996",
        # the ThermoML values below 352 K state uncertainties above 1 %; Pick et al. (1956) measured 329-397 K
        "antoine_fit": ["Pick, Fried, et al., 1956, 2"],
        "dHvap_methods": ["C"], "dHvap_refs": ["Majer and Svoboda, 1985"],
        "cpL_equation": "Svoboda, Zabransky, et al., 1991",
        "cp0": None,
    },
    # proposal 0009, batch 3 (volatile platform molecules), first part: the six with measured critical constants
    "furan": {
        "name": "Furan", "cas": "110-00-9", "webbook": "C110009", "proposal": "proposal 0009, batch 3",
        "aliases": ["furane", "oxole", "furfuran"],
        "thermoml_queries": ["furan"],
        # Kobe et al. (1956) give the only Pc; their Tc (487 K, TRC uncertainty 2 K) is less certain than that of
        # Cheng et al. (1962, 490.2 K, 0.3 K), the value Majer and Svoboda (1985) also list
        "critical_Tc": "Cheng, McCoubrey, et al., 1962", "critical_Pc": "Kobe, Ravicz, et al., 1956",
        "critical_why": "Kobe et al. (1956) give the only measured Pc; Tc from Cheng et al. (1962), uncertainty 0.3 K, "
                        "instead of their 487 K (2 K)",
        # the ThermoML values cover 284-304 K and 353-408 K; Guthrie et al. (1952) measured 276-335 K
        "antoine_fit": ["Guthrie, Scott, et al., 1952, 3"],
        "dHvap": "clapeyron", "dHvap_refs": ["Majer and Svoboda, 1985"],
        "dHvap_why": "the critically evaluated values of Majer and Svoboda (1985) are at 298.15 K and 304.5 K only",
        "cp0": {"tables": ["Dorofeeva O.V., 1992"], "Tmin": 200.0},
    },
    "2-methylfuran": {
        "name": "2-Methylfuran", "cas": "534-22-5", "webbook": "C534225", "proposal": "proposal 0009, batch 3",
        "aliases": ["sylvan", "2-mf", "methylfuran"],
        "thermoml_queries": ["2-methylfuran"],
        "critical": "Kobe, Ravicz, et al., 1956",
        "antoine_fit": [],
        # Tai et al. (2014) disagree with the other two sets by up to 6 %, beyond the stated uncertainties
        "vp_fit": "within",
        "dHvap": "clapeyron",
        "dHvap_why": "no calorimetric value; the WebBook values are derived from vapour pressures",
        "cp0": {"tables": ["Thermodynamics Research Center, 1997"], "Tmin": 200.0},
    },
    "2-methyltetrahydrofuran": {
        "name": "2-Methyltetrahydrofuran", "cas": "96-47-9", "webbook": "C96479", "proposal": "proposal 0009, batch 3",
        "aliases": ["2-methyloxolane", "2-methf", "methyltetrahydrofuran", "tetrahydrosylvan"],
        "thermoml_queries": ["2-methyltetrahydrofuran", "2-methyloxolane"],
        "critical": "Kobe, Ravicz, et al., 1956",
        "antoine_fit": [],
        # Lepori et al. (2017, 279-310 K, 2.5 %) extend the range below the values within 1 %
        "vp_fit": "loose",
        "dHvap": "clapeyron",
        "dHvap_why": "no calorimetric value; the WebBook values are derived from vapour pressures",
        "cp0": None,
    },
    "gbl": {
        "name": "gamma-Butyrolactone", "cas": "96-48-0", "webbook": "C96480", "proposal": "proposal 0009, batch 3",
        "aliases": ["γ-butyrolactone", "butyrolactone", "oxolan-2-one", "gbl"],
        "thermoml_queries": ["gamma-butyrolactone", "oxolan-2-one"],
        "webbook_individual": ["HVAP"],
        # not written yet: no temperature where both its vapour pressure and its liquid density are measured
        "hold": "its open measured vapour pressures start at 377 K (ThermoML Archive; the WebBook has none) and its "
                "liquid densities end at 353 K, so no liquid state has both; wanted: vapour pressures below 377 K or "
                "densities above 353 K from an open source",
        # the archive also has VonNiederhausern et al. (2006): 732.5 K and 5.10 MPa, with larger uncertainties
        "critical": "Wilson, Wilson, et al., 1996",
        "antoine_fit": [],
        # Mathuni et al. (2011) have the only values within 1 %; the others (1.4-5 %) confirm the curve
        "vp_fit": "loose",
        "dHvap": "clapeyron",
        "dHvap_why": "the calorimetric value of Leitao et al. (1990) is at 298.15 K only",
        "cpL_equation": "Ismailov, Gabzalilova, et al., 1988",
        "cp0": {"tables": ["Kudchadker S.A., 1975"], "Tmin": 200.0},
    },
    "isoamyl-alcohol": {
        "name": "Isoamyl alcohol", "cas": "123-51-3", "webbook": "C123513", "proposal": "proposal 0009, batch 3",
        "aliases": ["3-methyl-1-butanol", "3-methylbutan-1-ol", "isopentyl alcohol", "isopentanol"],
        "thermoml_queries": ["3-methyl-1-butanol", "3-methylbutan-1-ol"],
        "webbook_individual": ["TC", "HVAP"],
        "hold": "its open measured vapour pressures start at 335.85 K (ThermoML Archive; the WebBook has none) and its "
                "liquid densities end at 332.7 K, so no liquid state has both; wanted: vapour pressures below 336 K or "
                "densities above 333 K from an open source",
        "critical": "Gude and Teja, 1995",
        "antoine_fit": [],
        # calorimetric values of Majer, Svoboda et al. (1985), 303-358 K, and the evaluation of Majer and Svoboda (1985)
        "dHvap_methods": ["C"], "dHvap_refs": ["Majer and Svoboda, 1985"],
        "cp0": {"tables": ["Stromsoe E., 1970"]},
        # the archive's sets disagree by up to 3 %, beyond their stated uncertainties; Censky et al. (2010,
        # ebulliometry) state the smallest (0.14-0.21 %)
        "vp_fit": "anchor", "vp_anchor": ["Censky 2010"],
    },
    "1-3-propanediol": {
        "name": "1,3-Propanediol", "cas": "504-63-2", "webbook": "C504632", "proposal": "proposal 0009, batch 3",
        "aliases": ["propane-1,3-diol", "trimethylene glycol", "1,3-pdo", "pdo"],
        "thermoml_queries": ["1,3-propanediol", "propane-1,3-diol"],
        "webbook_individual": ["HVAP"],
        # not on the WebBook page; the archive has two articles of Nikitin et al. (pulse heating)
        "critical_thermoml": "10.1016/j.fluid.2014.07.038",
        "critical_why": "the later article; its values equal the median of all four",
        # Stull (1947), a compilation, as a cross-check only
        "antoine_fit": [],
        # every set states uncertainties above 1 % except a few values of Mokbel et al. (2012)
        "vp_fit": "within",
        "dHvap": "clapeyron",
        "dHvap_why": "the calorimetric value of Knauth and Sabbah (1988) is at 298.15 K only",
        "cp0": None,
    },
}

# ---------------------------------------------------------------------------------------------
# Fetching
# ---------------------------------------------------------------------------------------------


def get(url, tries=6):
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=120) as r:
                return r.read()
        except Exception:
            if i == tries - 1:
                raise
            time.sleep(4 * 2 ** i)


def tables_of(page):
    """Every table of a WebBook page: header row and rows, cell text as printed."""
    out = []
    for m in re.finditer(r"<table[^>]*>(.*?)</table>", page, re.S):
        rows = []
        for r in re.findall(r"<tr[^>]*>(.*?)</tr>", m.group(1), re.S):
            cells = [H.unescape(re.sub(r"<[^>]+>", "", c)).strip() for c in re.findall(r"<t[dh][^>]*>(.*?)</t[dh]>", r, re.S)]
            if cells:
                rows.append(cells)
        if len(rows) > 1:
            out.append({"header": rows[0], "rows": rows[1:]})
    return out


def fetch_webbook(cid):
    C = COMPONENTS[cid]
    out = {"component": cid, "retrieved": datetime.date.today().isoformat(), "pages": {}}
    for mask, what in ((1, "gas phase thermochemistry"), (2, "condensed phase thermochemistry"), (4, "phase change")):
        url = WEBBOOK_URL.format(ID=C["webbook"], mask=mask)
        page = get(url).decode("utf-8")
        keep = [t for t in tables_of(page) if re.search(r"Quantity|Temperature \(K\)|ΔvapH|Cp,liquid|Cp,gas|ΔfusH", " ".join(t["header"]))]
        out["pages"][what] = {"url": url, "tables": keep}
    # where the phase change table gives only an average (AVG), the individual values are on their own page
    for typ in C.get("webbook_individual", []):
        url = WEBBOOK_URL.split("&Mask")[0].format(ID=C["webbook"]) + "&Type=" + typ
        page = get(url).decode("utf-8")
        out["pages"]["%s values" % typ] = {"url": url, "tables": [t for t in tables_of(page) if "Reference" in t["header"]]}
    (MEASURED_DIR / ("webbook_%s.json" % cid)).write_text(json.dumps(out, indent=1, ensure_ascii=False) + "\n")
    print("fetched WebBook pages of %s" % cid)


def thermoml_search(q):
    res, page = [], 0
    while True:
        qs = urllib.parse.urlencode({"query": '"%s"' % q, "pageNum": page, "pageSize": 100,
                                     "requestContext": json.dumps({"Citation": True, "data_summary": True, "Compound": True})})
        d = json.loads(get(THERMOML_API + "?" + qs))
        res += d["results"]
        if len(res) >= d["size"] or not d["results"]:
            return res
        page += 1


def norm_inchi(s):
    return (s or "").replace("InChI=", "").replace("1S/", "")


def fetch_thermoml(cid, cache, C=None):
    """Every pure-component value of the compound in the archive, and the pure end points of binary sets.
    C: {"cas", "thermoml_queries"} (default: COMPONENTS[cid]); also used by check_measured.py."""
    from chemicals.identifiers import search_chemical
    C = C or COMPONENTS[cid]
    meta = search_chemical(C["cas"])
    if meta.CASs != C["cas"]:
        raise SystemExit("%s: CAS %s does not match chemicals (%s)" % (cid, C["cas"], meta.CASs))
    inchi = norm_inchi(meta.InChI)
    dois = sorted({h["content"]["Citation"]["sDOI"] for q in C["thermoml_queries"] for h in thermoml_search(q)})
    cache.mkdir(parents=True, exist_ok=True)
    rows, articles = [], {}
    for doi in dois:
        f = cache / (doi.replace("/", "_") + ".xml")
        if not f.exists():
            f.write_bytes(get("https://trc.nist.gov/ThermoML/%s.xml" % doi))
        rec = thermoml_read.parse(f.read_bytes())
        mine = [n for n, c in rec["compounds"].items() if norm_inchi(c["inchi"]) == inchi]
        if not mine:
            continue
        me = mine[0]
        for s in rec["sets"]:
            if me not in s["components"] or len(s["components"]) > 2:
                continue
            other = [c for c in s["components"] if c != me]
            for pn, p in s["properties"].items():
                if p["name"] not in THERMOML_PROPS or (p["compound"] and p["compound"] != me):
                    continue
                for r in s["rows"]:
                    if "p" + pn not in r:
                        continue
                    vals = {}
                    for c in s["constraints"]:
                        vals[c["type"]] = (c["value"], c["compound"])
                    for vn, v in s["variables"].items():
                        if "v" + vn in r:
                            vals[v["type"]] = (r["v" + vn], v["compound"])
                    if other:
                        comp = [x for k, x in vals.items() if k and "fraction" in k.lower()]
                        if not comp or not all((c == me and abs(x - 1) < 1e-12) or (c != me and abs(x) < 1e-12) for x, c in comp):
                            continue
                    T = next((x[0] for k, x in vals.items() if k and k.startswith("Temperature")), None)
                    P = next((x[0] for k, x in vals.items() if k and k.startswith("Pressure")), None)
                    rows.append({"property": p["name"], "phases": s["phases"], "T_K": T, "P_kPa": P,
                                 "value": r["p" + pn], "uncertainty": r.get("p" + pn + "_unc"), "doi": doi, "set": s["number"],
                                 "binary_with": rec["compounds"][other[0]]["names"][0] if other else None})
                    c = rec["citation"]
                    articles[doi] = {"authors": c["authors"], "title": c["title"], "journal": c["journal"],
                                     "volume": c["volume"], "year": c["year"], "pages": c["pages"]}
    out = {"component": cid, "cas": C["cas"], "archive": "NIST TRC ThermoML Archive, https://trc.nist.gov/ThermoML/",
           "retrieved": datetime.date.today().isoformat(),
           "searched": "ThermoML-API full-text search for %s; %d records opened" % (
               ", ".join('"%s"' % q for q in C["thermoml_queries"]), len(dois)),
           "about": "Values as stored in the archive records (property units as named); 'uncertainty' is the expanded "
                    "(or combined) uncertainty stated there; 'binary_with' marks the pure end point of a binary set.",
           "articles": dict(sorted(articles.items())), "rows": rows}
    (MEASURED_DIR / ("thermoml_%s.json" % cid)).write_text(json.dumps(out, indent=1, ensure_ascii=False) + "\n")
    print("fetched ThermoML for %s: %d records searched, %d values from %d articles" % (cid, len(dois), len(rows), len(articles)))

# ---------------------------------------------------------------------------------------------
# Reading the stored files
# ---------------------------------------------------------------------------------------------


def num(s):
    """A WebBook number as printed ('29.03 ± 0.08', '508.') -> (value, uncertainty or None)."""
    m = re.match(r"^\s*([-+]?[0-9.]+(?:[eE][-+]?\d+)?)\s*(?:±\s*([0-9.]+))?", s)
    return (float(m.group(1)), float(m.group(2)) if m.group(2) else None) if m else (None, None)


class WebBook:
    def __init__(self, cid):
        self.d = json.loads((MEASURED_DIR / ("webbook_%s.json" % cid)).read_text())

    def url(self, what):
        return self.d["pages"][what]["url"]

    def table(self, what, head):
        for t in self.d["pages"][what]["tables"]:
            if re.search(head, " ".join(t["header"])):
                return t
        return None

    def constant(self, quantity, reference):
        t = self.table("phase change", r"^Quantity")
        for r in t["rows"]:
            if r[0] == quantity and r[4] == reference:
                return num(r[1])[0], r[2]
        page = self.d["pages"].get("%s values" % quantity.upper())
        for t in (page["tables"] if page else []):
            unit = re.search(r"\((.*?)\)", t["header"][0]).group(1)
            for r in t["rows"]:
                if r[1] == reference:
                    return num(r[0])[0], unit
        raise SystemExit("WebBook: no %s of %s" % (quantity, reference))

    def constants(self, quantity):
        """(value, uncertainty, units, method, reference) of every row of a quantity in the phase change table; where
        the table gives only the average (AVG) and the individual values were fetched, those instead."""
        t = self.table("phase change", r"^Quantity")
        out = [num(r[1]) + (r[2], r[3], r[4]) for r in t["rows"] if r[0] == quantity]
        page = self.d["pages"].get("%s values" % INDIVIDUAL.get(quantity, "-"))
        if page:
            out = [o for o in out if o[3] != "AVG"]
            for t in page["tables"]:
                unit = re.search(r"\((.*?)\)", t["header"][0]).group(1)
                col = {h: i for i, h in enumerate(t["header"])}
                for r in t["rows"]:
                    out.append(num(r[0]) + (unit, r[col["Method"]] if "Method" in col else "N/A", r[col["Reference"]]))
        return out

    def antoine(self):
        t = self.table("phase change", r"^Temperature \(K\) A B C")
        out = []
        for r in (t["rows"] if t else []):
            lo, hi = (float(v) for v in r[0].split(" to "))
            out.append({"Tmin_K": lo, "Tmax_K": hi, "A": float(r[1]), "B": float(r[2]), "C": float(r[3]), "reference": r[4]})
        return out

    def dhvap(self):
        t = self.table("phase change", r"^ΔvapH \(kJ/mol\) Temperature")
        out = []
        for r in (t["rows"] if t else []):
            v, u = num(r[0])
            T = num(r[1])[0]
            if v is None or T is None or " to " in r[1]:
                continue
            out.append({"value": v, "unc": u, "T_K": T, "method": r[2], "reference": r[3], "comment": r[4]})
        return out

    def cp_liquid(self):
        t = self.table("condensed phase thermochemistry", r"^Cp,liquid")
        return [{"value": num(r[0])[0], "T_K": num(r[1])[0], "reference": r[2], "comment": r[3]} for r in (t["rows"] if t else [])]

    def cp_gas(self):
        """The tables of gas heat capacities, one per reference: {"reference", "comment", "rows": [(T, Cp, unc)]}."""
        out = []
        for t in self.d["pages"]["gas phase thermochemistry"]["tables"]:
            if not t["header"][0].startswith("Cp,gas ("):
                continue
            for r in t["rows"]:
                if len(r) > 2 and r[2]:
                    out.append({"reference": r[2], "comment": r[3] if len(r) > 3 else "", "rows": []})
                v, u = num(r[0])
                out[-1]["rows"].append((num(r[1])[0], v, u))
        return out

    def shomate(self):
        t = self.table("gas phase thermochemistry", r"^Temperature \(K\)")
        if not t:
            return None
        col = {r[0]: r[1:] for r in t["rows"]}
        sets = []
        for j, span in enumerate(t["header"][1:]):
            lo, hi = (float(v) for v in span.split(" to "))
            sets.append({"Tmin": lo, "Tmax": hi, **{k: float(col[k][j]) for k in "ABCDE"},
                         "reference": col["Reference"][j], "comment": col.get("Comment", [""] * 9)[j]})
        return sets


class ThermoML:
    """The measured values of a component: its ThermoML file (thermoml_<id>.json) and, where open-access articles
    outside the archive have values, one file per article, article_<id>.json or article_<id>_<label>.json, in the same
    format (transcribed from the article's tables, with its source block); any of them may be missing."""
    def __init__(self, cid):
        f = MEASURED_DIR / ("thermoml_%s.json" % cid)
        self.d = json.loads(f.read_text()) if f.exists() else {"articles": {}, "rows": []}
        self.access = {}  # doi -> access text of an article outside the archive
        for a in sorted(MEASURED_DIR.glob("article_%s.json" % cid)) + sorted(MEASURED_DIR.glob("article_%s_*.json" % cid)):
            art = json.loads(a.read_text())
            self.d = dict(self.d, articles={**self.d["articles"], **art["articles"]}, rows=self.d["rows"] + art["rows"])
            self.access.update({doi: art["source"]["access"] for doi in art["articles"]})
        self.from_article = set(self.access)

    def origin(self, pts):
        """Where the values come from, for a record's source name and access text."""
        used = {p["doi"] for p in pts if p.get("doi")}
        arts = sorted(used & self.from_article)
        if not arts:
            return "NIST TRC ThermoML Archive", "open data (NIST TRC ThermoML Archive), free to read even where the article is not"
        what = "an open-access article" if len(arts) == 1 else "%d open-access articles" % len(arts)
        acc = "; ".join("%s: %s" % (self.short(d), self.access[d]) for d in arts)
        if used - self.from_article:
            return "the NIST TRC ThermoML Archive and " + what, \
                "open data (NIST TRC ThermoML Archive) and %s (%s)" % (what, acc)
        return what, acc

    def cite(self, doi):
        a = self.d["articles"][doi]
        first = a["authors"][0].split(",")[0]
        who = first + (" et al." if len(a["authors"]) > 2 else (" and " + a["authors"][1].split(",")[0] if len(a["authors"]) == 2 else ""))
        return "%s, %s %s (%s) %s, doi:%s" % (who, a["journal"], a["volume"], a["year"], a["pages"], doi)

    def short(self, doi):
        a = self.d["articles"][doi]
        return "%s %s" % (a["authors"][0].split(",")[0], a["year"])

    def values(self, record, pmax=110.0):
        out, seen = [], set()
        for r in self.d["rows"]:
            spec = THERMOML_PROPS.get(r["property"])
            if not spec or spec[0] != record:
                continue
            if spec[2] and spec[2] not in r["phases"]:
                continue
            if record not in ("vapourPressure", "Tb", "Tc", "Pc") and r["P_kPa"] is not None and r["P_kPa"] > pmax:
                continue
            if record in ("liquidDensity", "liquidHeatCapacity", "liquidViscosity", "surfaceTension") and "Gas" in r["phases"]:
                continue
            key = (r["doi"], r["T_K"], r["value"])
            if key in seen:
                continue
            seen.add(key)
            u = r["uncertainty"]
            out.append({"T": r["T_K"], "y": r["value"] * spec[1], "u_rel": (u / r["value"]) if u else None,
                        "ref": self.short(r["doi"]), "doi": r["doi"],
                        "from": "article" if r["doi"] in self.from_article else "ThermoML", "set": r.get("set")})
        return out

# ---------------------------------------------------------------------------------------------
# Fitting measured values
# ---------------------------------------------------------------------------------------------


def complexities(form, T):
    """The variants of a form, fewest coefficients first; never more coefficients than distinct temperatures."""
    nT = len(set(np.round(T, 2)))
    if form == "DIPPR100":
        return list(range(0, min(3, nT - 1) + 1))
    if form == "DIPPR101":
        return [None] + ([1, 2, 3, 4, 6, 8, 10, 12] if nT >= 6 else [])
    if form == "DIPPR106":
        return list(range(1, min(4, nT - 1) + 1))
    return [None]


def fit_ls(form, T, y, Tc, k, w=None):
    """Weighted least squares on relative deviations (on ln y for the exponential forms)."""
    w = np.ones_like(T) if w is None else w
    if form == "DIPPR100":
        M = np.vstack([T ** j for j in range(k + 1)]).T
        x = np.linalg.lstsq(M / y[:, None] * w[:, None], w, rcond=None)[0]
        return {n: float(v) for n, v in zip("ABCD", x)}
    if form == "DIPPR101":
        Tr = T.max()  # the T^E column scaled by the highest temperature, for the conditioning
        cols = [np.ones_like(T), 1 / T, np.log(T)] + ([(T / Tr) ** k] if k else [])
        x = np.linalg.lstsq(np.vstack(cols).T * w[:, None], np.log(y) * w, rcond=None)[0]
        return {"A": float(x[0]), "B": float(x[1]), "C": float(x[2]), "D": float(x[3] / Tr ** k) if k else 0.0,
                "E": float(k or 0)}
    if form == "DIPPR106":
        r = T / Tc
        L = np.log(1 - r)
        M = np.vstack([np.ones_like(T)] + [L * r ** j for j in range(k)]).T
        x = np.linalg.lstsq(M * w[:, None], np.log(y) * w, rcond=None)[0]
        return {"A": float(math.exp(x[0])), **{n: float(v) for n, v in zip("BCDE", x[1:])}}
    if form == "DIPPR105":
        # rho = A / B^(1 + (1 - T/Tc)^D), C fixed at the critical temperature
        def res(p):
            return w * (math.exp(p[0]) / math.exp(p[1]) ** (1 + (1 - T / Tc) ** p[2]) / y - 1)
        best = None
        for D0 in (0.2857, 0.25, 0.33):
            r = least_squares(res, [math.log(y.mean() * 0.27 ** 1.29), math.log(0.27), D0], max_nfev=20000)
            if best is None or r.cost < best.cost:
                best = r
        return {"A": math.exp(best.x[0]), "B": math.exp(best.x[1]), "C": Tc, "D": float(best.x[2])}
    raise ValueError(form)


def robust(form, T, y, Tc, k, fixed_mask):
    """Least squares with Huber weights (iteratively reweighted), so that a few discordant values do not pull the
    curve; returns the coefficients and the relative deviations of every value."""
    w = np.ones_like(T)
    for _ in range(20):
        c = fit_ls(form, T, y, Tc, k, w)
        d = ev(form, c, T, Tc) / y - 1
        s = max(1.4826 * np.median(np.abs(d - np.median(d))), 1e-4)
        w = 1 / np.sqrt(np.maximum(1.0, np.abs(d) / (2 * s)))
        w[fixed_mask] = 10.0
    return c, d


def fit_measured(cid, prop, form, pts, target, Tc=None, fixed=()):
    """Steps 2-4 of the docstring. `fixed`: points that are never left out (the critical point)."""
    excluded, use = [], []
    for p in pts:
        if p["u_rel"] is not None and p["u_rel"] > target:
            excluded.append(dict(p, why="stated uncertainty %.2g %% is above the %g %% target" % (100 * p["u_rel"], 100 * target)))
        else:
            use.append(p)
    use += list(fixed)
    n0 = len(use)
    while True:
        T = np.array([p["T"] for p in use])
        y = np.array([p["y"] for p in use])
        fm = np.array([p in fixed for p in use])
        w = np.where(fm, 10.0, 1.0)
        found = None
        for k in complexities(form, T):
            c = fit_ls(form, T, y, Tc, k, w)
            if rel_dev(ev(form, c, T, Tc), y) <= target:
                found = c
                break
        if found is None and form == "DIPPR101" and len(T) >= 6:
            # least squares minimise the sum of squares, not the largest deviation: the minimax fit of
            # fit_properties.py (Lawson reweighting) may meet the target where they do not
            c = fit_101(T, y, target, Es=(1, 2, 3, 4, 6, 8, 10))[0]
            if rel_dev(ev(form, c, T, Tc), y) <= target:
                found = c
        if found is not None:
            c = found
            break
        # the value that deviates most from a robust fit of the most flexible variant, relative to its uncertainty
        _, d = robust(form, T, y, Tc, complexities(form, T)[-1], fm)
        score = [-1 if f else abs(dd) / max(p["u_rel"] or 0, target / 4) for dd, p, f in zip(d, use, fm)]
        j = int(np.argmax(score))
        excluded.append(dict(use[j], why="deviates most from a robust fit of the others"))
        use.pop(j)
        if len(use) < 2 * n0 / 3:
            raise SystemExit("%s %s: more than a third of the values would be left out; the data disagree" % (cid, prop))
    coeffs = {k: rnd(v) for k, v in c.items() if k in "ABCDE"}
    T = np.array([p["T"] for p in use])
    y = np.array([p["y"] for p in use])
    m = rel_dev(ev(form, coeffs, T, Tc), y)
    for p in excluded:
        p["deviation_percent"] = round(100 * float(ev(form, coeffs, np.array([p["T"]]), Tc)[0] / p["y"] - 1), 2)
    return coeffs, use, excluded, m


def fit_within_uncertainty(cid, prop, form, pts, Tc=None, fixed=()):
    """Where no measured value has a stated uncertainty within the target (Cyrene's vapour pressures, 1.4-17 %): least
    squares weighted by 1/u, the fewest coefficients that meet every value within its own stated uncertainty; values
    it cannot meet are left out one at a time (the one furthest outside its uncertainty first), at most a third.
    Returns coeffs, the values met, the values left out, and the maximum relative deviation."""
    use = [p for p in pts if p["u_rel"]] + list(fixed)
    n0, excluded = len(use), []
    while True:
        T = np.array([p["T"] for p in use])
        y = np.array([p["y"] for p in use])
        fm = np.array([p in fixed for p in use])
        u = np.array([0.001 if f else p["u_rel"] for p, f in zip(use, fm)])
        w = 1 / u
        found = None
        for k in complexities(form, T):
            c = fit_ls(form, T, y, Tc, k, w)
            d = ev(form, c, T, Tc) / y - 1
            if np.all(np.abs(d[~fm]) <= u[~fm]):
                found = c
                break
        if found is not None:
            break
        score = [-1 if f else abs(dd) / uu for dd, uu, f in zip(d, u, fm)]
        j = int(np.argmax(score))
        excluded.append(dict(use[j], why="outside its stated uncertainty in every fit of the others"))
        use.pop(j)
        if len(use) < 2 * n0 / 3:
            raise SystemExit("%s %s: more than a third of the values would be left out; the data disagree" % (cid, prop))
    coeffs = {k: rnd(v) for k, v in found.items() if k in "ABCDE"}
    T = np.array([p["T"] for p in use])
    y = np.array([p["y"] for p in use])
    m = rel_dev(ev(form, coeffs, T, Tc), y)
    for p in excluded:
        p["deviation_percent"] = round(100 * float(ev(form, coeffs, np.array([p["T"]]), Tc)[0] / p["y"] - 1), 2)
    return coeffs, use, excluded, m


def fit_measured_loose(cid, prop, form, pts, target, Tc=None, fixed=()):
    """As fit_measured, which fits only the values whose stated uncertainty is within the target. The values with
    larger stated uncertainties are then compared with the fit: those it meets within their own uncertainty are kept
    as confirmation (they may extend the range of the record beyond the better values), the others are listed as left
    out. Returns coeffs, the values within the target (`use`, checked against the stated maximum deviation), the
    looser values kept, the values left out, and the maximum deviation."""
    coeffs, use, exc, m = fit_measured(cid, prop, form, pts, target, Tc, fixed)
    kept, out = [], []
    for p in exc:
        p["deviation_percent"] = round(100 * float(ev(form, coeffs, np.array([p["T"]]), Tc)[0] / p["y"] - 1), 2)
        if p["u_rel"] is not None and p["u_rel"] > target and abs(p["deviation_percent"]) <= 100 * p["u_rel"]:
            kept.append(p)
        elif p["u_rel"] is not None and p["u_rel"] > target:
            out.append(dict(p, why="stated uncertainty %.2g %% is above the target, and the value deviates by more than it"
                            % (100 * p["u_rel"])))
        else:
            out.append(p)
    return coeffs, use, kept, out, m


def record(prop, form, coeffs, use, excluded, m, Tc, source_text, references, access, notes=None, tier="fitted"):
    T = [p["T"] for p in use]
    rec = {"equation": form, "coefficients": coeffs, "units": UNITS[prop], "Tmin_K": rnd(min(T), 8), "Tmax_K": rnd(max(T), 8)}
    if form == "DIPPR106":
        rec["Tc_K"] = Tc
    rec["tier"] = tier
    rec["source"] = {"name": source_text, "reference": "; ".join(references), "access": access,
                     "fit": "%d measured values, %.2f-%.2f K, max deviation %s %%" % (len(use), min(T), max(T), pct(m))}
    if notes:
        rec["source"]["notes"] = notes
    if excluded:
        rec["source"]["excluded"] = [{"T_K": p["T"], "value": rnd(p["y"], 8), "reference": p["ref"],
                                      "deviation_percent": p["deviation_percent"], "why": p["why"]} for p in excluded]
    order = sorted(range(len(use)), key=lambda i: (use[i]["T"], use[i]["y"]))
    pts = {"units": UNITS[prop], "source": {"name": source_text, "fit": rec["source"]["fit"]},
           "T_K": [rnd(use[i]["T"], 8) for i in order], "values": [rnd(use[i]["y"], 8) for i in order],
           "references": [use[i]["ref"] for i in order]}
    return rec, pts


def fit_or_marker(cid, prop, form, target, pts, records, points, log, Tc, tml, searched, name, access):
    """A fitted record when at least three temperatures have values within the target uncertainty, else a
    "no open data" marker that says what there is."""
    ok = [p for p in pts if p["u_rel"] is None or p["u_rel"] <= target]
    temps = {round(p["T"], 1) for p in ok if not p.get("webbook_single")}
    if len(temps) >= 2 and len({round(p["T"], 1) for p in ok}) >= 3:
        coeffs, use, exc, m = fit_measured(cid, prop, form, pts, target, Tc=Tc)
        records[prop], points[prop] = record(
            prop, form, coeffs, use, exc, m, Tc, name,
            refs_of([p for p in use if p.get("doi")], tml) + sorted({p["ref"] for p in use if not p.get("doi")}), access)
        log.append("%-17s %-25s %3d values, %d left out, max dev %s %%" % (cid, prop, len(use), len(exc), pct(m)))
        return
    r = {"available": False, "searched": searched}
    if pts:
        loose = [p for p in pts if p["u_rel"] is not None and p["u_rel"] > target]
        Ts = [p["T"] for p in pts]
        if loose and len({round(p["T"], 1) for p in loose}) >= 3:
            u = [100 * p["u_rel"] for p in loose]
            r["note"] = ("no open data at the %g %% target of the records: %d measured values, %.2f-%.2f K, but their stated "
                         "uncertainties (%.2g-%.2g %%) are larger than the target" % (100 * target, len(pts), min(Ts), max(Ts), min(u), max(u)))
        else:
            r["note"] = "no open data over a temperature range: %s" % "; ".join(
                "%.2f K: %.4g (%s)" % (p["T"], p["y"], p["ref"]) for p in sorted(pts, key=lambda p: p["T"]))
    records[prop] = r
    log.append("%-17s %-25s no open data%s" % (cid, prop, " (%d values: %s)" % (len(pts), r["note"][:60]) if pts else ""))


def refs_of(use, tml):
    out = []
    for p in use:
        r = tml.cite(p["doi"]) if p.get("doi") else p["ref"]
        if r not in out:
            out.append(r)
    return out

# ---------------------------------------------------------------------------------------------
# One component
# ---------------------------------------------------------------------------------------------


def critical(cid, C, wb, tml):
    """Tc (K) and Pc (Pa) as chosen for the component: one WebBook reference for both ("critical"), one for each
    ("critical_Tc", "critical_Pc"), or one article of the ThermoML Archive ("critical_thermoml", its DOI). Returns
    Tc, Pc, who (the reference), where (the source) and the sentence for constants_source."""
    if "critical_thermoml" in C:
        doi = C["critical_thermoml"]
        tc = [p for p in tml.values("Tc") if p["doi"] == doi]
        pc = [p for p in tml.values("Pc") if p["doi"] == doi]
        if len(tc) != 1 or len(pc) != 1:
            raise SystemExit("%s: %s has %d Tc and %d Pc values in the ThermoML Archive" % (cid, doi, len(tc), len(pc)))
        others = sorted({p["ref"] for p in tml.values("Tc") + tml.values("Pc") if p["doi"] != doi})
        text = "Tc and Pc: %s, NIST TRC ThermoML Archive (stated uncertainties %.3g K and %.3g kPa)" % (
            tml.cite(doi), tc[0]["u_rel"] * tc[0]["y"], pc[0]["u_rel"] * pc[0]["y"] / 1000)
        if others:
            text += "; the archive also has the values of %s, %s" % (", ".join(others), C["critical_why"])
        return tc[0]["y"], pc[0]["y"], tml.short(doi), "NIST TRC ThermoML Archive", text
    tref, pref = C.get("critical_Tc", C.get("critical")), C.get("critical_Pc", C.get("critical"))
    Tc, _ = wb.constant("Tc", tref)
    Pc_bar, unit = wb.constant("Pc", pref)
    if unit != "bar":
        raise SystemExit("Pc unit %s" % unit)
    who = tref if tref == pref else "Tc %s, Pc %s" % (tref, pref)
    head = "Tc and Pc: %s" % tref if tref == pref else "Tc: %s; Pc: %s" % (tref, pref)
    text = "%s, NIST Chemistry WebBook (SRD 69), phase change data, %s" % (head, wb.url("phase change"))
    if C.get("critical_why"):
        text += " (%s)" % C["critical_why"]
    return Tc, Pc_bar * 1e5, who, "NIST WebBook", text


def clapeyron(cid, C, psat, Tlo, Thi, Tc, Pc, omega):
    """Enthalpies of vaporization from the vapour-pressure record by the Clapeyron equation,
    dHvap = T (dPsat/dT) (v_vapour - v_liquid), with both molar volumes from the Peng-Robinson equation of state
    (thermo library, MIT; Peng and Robinson, Ind. Eng. Chem. Fundam. 15 (1976) 59) at Psat, between Tlo and Thi."""
    from thermo.eos import PR
    out = []
    for T in np.linspace(Tlo, Thi, 25):
        h = 1e-3 * T
        dPdT = (psat(T + h) - psat(T - h)) / (2 * h)
        e = PR(Tc=Tc, Pc=Pc, omega=omega, T=float(T), P=psat(T))
        out.append({"T": float(T), "y": float(T * dPdT * (e.V_g - e.V_l)), "u_rel": None, "doi": None,
                    "ref": "Clapeyron equation with the vapour-pressure record"})
    return out


def dh_measured(cid, C, wb, tml, pts, Tc, records, points, log, wb4):
    """The enthalpy-of-vaporization record fitted to the chosen measured values (calorimetric, critically evaluated)."""
    coeffs, use, exc, m = fit_measured(cid, "heatOfVaporization", "DIPPR106", pts, 0.01, Tc=Tc)
    others = [e for e in wb.dhvap() if not (e["method"] in C["dHvap_methods"] or e["reference"] in C["dHvap_refs"])]
    cross = ["%s at %.0f K: %+.1f %%" % (e["reference"], e["T_K"], 100 * (float(ev("DIPPR106", coeffs, np.array([e["T_K"]]), Tc)[0]) / (1000 * e["value"]) - 1))
             for e in others]
    records["heatOfVaporization"], points["heatOfVaporization"] = record(
        "heatOfVaporization", "DIPPR106", coeffs, use, exc, m, Tc,
        "Measured enthalpies of vaporization (NIST Chemistry WebBook; calorimetric and critically evaluated values)",
        [p["ref"] for p in use], WEBBOOK_ACCESS + " (%s)" % wb4,
        notes=("DIPPR 106 with the critical temperature %.2f K. Values derived from vapour pressures, compared with the "
               "record (not fitted): %s." % (Tc, "; ".join(cross) if cross else "none")))
    log.append("%-17s heatOfVaporization        %3d values, %d left out, max dev %s %%" % (cid, len(use), len(exc), pct(m)))


def dh_clapeyron(cid, C, wb, tml, measured, psat, Tlow, Tc, Pc, omega, records, points, log, wb4):
    """Where the measured enthalpies of vaporization do not give the temperature dependence (one temperature, or
    none): the record is fitted to Clapeyron values from the vapour-pressure record, from its lowest temperature up to
    where Psat reaches 500 kPa (low enough that the Peng-Robinson vapour volume is close to the real one), together
    with the calorimetric values (WebBook method C, and the ThermoML Archive), which are never left out and must be met
    within their stated uncertainty (1 % where none is stated); the record meets the Clapeyron values it keeps within
    1 %. The other chosen values (critically evaluated) and those of the WebBook page (most derived by their authors
    from vapour pressures) are compared with the record."""
    Thi = brentq(lambda T: psat(T) - 5e5, Tlow, Tc - 1)
    pts = clapeyron(cid, C, psat, Tlow, Thi, Tc, Pc, omega)
    fixed = [p for p in measured if (p.get("method") == "C" or p.get("doi")) and (p["u_rel"] is None or p["u_rel"] <= 0.02)]
    coeffs, use, exc, m = fit_measured(cid, "heatOfVaporization", "DIPPR106", pts, 0.01, Tc=Tc, fixed=fixed)
    f = lambda T: float(ev("DIPPR106", coeffs, np.array([T]), Tc)[0])  # noqa: E731
    checks, bad = [], []
    for p in measured:
        d = f(p["T"]) / p["y"] - 1
        checks.append("%s, %.2f K: %+.2f %%%s%s" % (
            p["ref"], p["T"], 100 * d, " (stated uncertainty %.2g %%)" % (100 * p["u_rel"]) if p["u_rel"] else "",
            "" if p in fixed else ", not fitted"))
        if p in fixed and abs(d) > max(0.01, p["u_rel"] or 0):
            bad.append(checks[-1])
    if bad:
        raise SystemExit("%s: the record misses measured enthalpies of vaporization: %s" % (cid, bad))
    mc = rel_dev(ev("DIPPR106", coeffs, np.array([p["T"] for p in use if p not in fixed]), Tc),
                 np.array([p["y"] for p in use if p not in fixed]))
    chosen = lambda method, ref: method in C.get("dHvap_methods", ["C"]) or ref in C.get("dHvap_refs", [])  # noqa: E731
    derived = ["%s at %.0f K (%s): %+.1f %%" % (e["reference"], e["T_K"], "method " + e["method"] if e["method"] != "N/A"
                                                else "no method given", 100 * (f(e["T_K"]) / (1000 * e["value"]) - 1))
               for e in wb.dhvap() if not chosen(e["method"], e["reference"])]
    derived += ["%s (ΔvapH° at 298.15 K, %s): %+.1f %%" % (ref, "method " + method if method != "N/A" else "no method given",
                                                           100 * (f(298.15) / (1000 * v) - 1))
                for v, u, unit, method, ref in wb.constants("ΔvapH°") if unit == "kJ/mol" and not chosen(method, ref)]
    records["heatOfVaporization"], points["heatOfVaporization"] = record(
        "heatOfVaporization", "DIPPR106", coeffs, use, exc, m, Tc,
        "Clapeyron equation with the vapour-pressure record (measured values of the NIST TRC ThermoML Archive and the "
        "NIST Chemistry WebBook) and the Peng-Robinson equation of state of the open-source thermo library; and "
        "measured values (NIST Chemistry WebBook)",
        ["validation/python/measured_components.py (clapeyron)"] + sorted({p["ref"] for p in fixed}),
        "calculated from the open measured data of the vapour-pressure record; " + WEBBOOK_ACCESS + " (%s)" % wb4,
        notes=("dHvap = T (dPsat/dT) (v_vapour - v_liquid), Psat from the vapour-pressure record of this component, both "
               "volumes from the Peng-Robinson equation of state with Tc, Pc and ω of this component (thermo library, "
               "MIT), %.2f-%.2f K (up to Psat = 500 kPa); DIPPR 106 with the critical temperature %.2f K. Chosen because "
               "the measured values do not give the temperature dependence (%s). Max deviation from the Clapeyron "
               "values %s %%. Measured values (calorimetric ones fitted with weight 10 and never left out, met within "
               "their stated uncertainty, 1 %% where none is stated; the others compared): %s. Other values on the WebBook page (most derived by "
               "their authors from vapour pressures), compared: %s." % (
                   min(p["T"] for p in use if p not in fixed), max(p["T"] for p in use if p not in fixed), Tc,
                   C["dHvap_why"], pct(mc), "; ".join(checks) if checks else "none", "; ".join(derived) if derived else "none")))
    for d in (records["heatOfVaporization"]["source"], points["heatOfVaporization"]["source"]):
        d["fit"] = d["fit"].replace("%d measured values" % len(use), "%d Clapeyron values and %d measured values" % (
            len(use) - len(fixed), len(fixed)))
    log.append("%-17s heatOfVaporization        Clapeyron, %d values, max dev %s %%; calorimetric: %s" % (
        cid, len(use), pct(m), "; ".join(checks) or "none"))


def build(cid, log):
    from chemicals.identifiers import search_chemical
    C = COMPONENTS[cid]
    wb, tml = WebBook(cid), ThermoML(cid)
    meta = search_chemical(C["cas"])
    wb4 = wb.url("phase change")
    Tc, Pc, crit_who, crit_where, crit_text = critical(cid, C, wb, tml)
    records, points, notes = {}, {}, []
    searched_common = ["CoolProp 8.0.0 (not a fluid)", "ChemSep v8.3 and v8.31 data 2 (compound not included)",
                       "NIST Chemistry WebBook (%s)" % wb4, "NIST TRC ThermoML Archive (%s)" % tml.d["searched"]]

    # vapour pressure: ThermoML values, the chosen WebBook Antoine equations, and the critical point
    pts = tml.values("vapourPressure")
    antoine = wb.antoine()
    for s in antoine:
        if s["reference"] in C["antoine_fit"]:
            for T in np.linspace(s["Tmin_K"], s["Tmax_K"], 9):
                pts.append({"T": float(T), "y": 1e5 * 10 ** (s["A"] - s["B"] / (T + s["C"])), "u_rel": None,
                            "ref": "%s (Antoine equation, NIST WebBook)" % s["reference"], "doi": None, "from": "WebBook"})
    crit = {"T": Tc, "y": Pc, "u_rel": None, "ref": "%s (critical point, %s)" % (crit_who, crit_where), "doi": None}
    kept = []
    if C.get("vp_fit") == "loose":
        # few values within the target: those with larger stated uncertainties confirm the fit where it meets them
        coeffs, use, kept, exc, m = fit_measured_loose(cid, "vapourPressure", "DIPPR101", pts, 0.01, fixed=[crit])
    elif C.get("vp_fit") == "anchor":
        # the sets disagree beyond their stated uncertainties: the set with the smallest ones ("vp_anchor") and the
        # critical point are fitted; every other value is kept as confirmation where the fit meets it within its own
        # stated uncertainty, else listed as left out
        anchor = [p for p in pts if p["ref"] in C["vp_anchor"]]
        coeffs, use, exc, m = fit_measured(cid, "vapourPressure", "DIPPR101", anchor, 0.01, fixed=[crit])
        for p in pts:
            if p["ref"] in C["vp_anchor"]:
                continue
            d = float(ev("DIPPR101", coeffs, np.array([p["T"]]))[0]) / p["y"] - 1
            if p["u_rel"] is not None and abs(d) <= p["u_rel"]:
                kept.append(dict(p, deviation_percent=round(100 * d, 2)))
            else:
                exc.append(dict(p, deviation_percent=round(100 * d, 2),
                                why="deviates by more than its stated uncertainty from the fit of %s" % " and ".join(C["vp_anchor"])))
    elif C.get("vp_fit") == "within":
        # no set within the target over the range: every value fitted within its own stated uncertainty
        coeffs, use, exc, m = fit_within_uncertainty(cid, "vapourPressure", "DIPPR101", pts, fixed=[crit])
    else:
        coeffs, use, exc, m = fit_measured(cid, "vapourPressure", "DIPPR101", pts, 0.01, fixed=[crit])
    coeffs.setdefault("D", 0.0)
    coeffs.setdefault("E", 0.0)
    refs = refs_of([p for p in use if p.get("doi")], tml) + sorted({p["ref"] for p in use if not p.get("doi")})
    Tdata = max(p["T"] for p in use + kept if p is not crit)
    Tlow = min(p["T"] for p in use + kept)
    vp_fit = ("%d measured values (%d from the ThermoML Archive) and the critical point, %.2f-%.2f K, max deviation %s %%%s. "
              "Between %.2f K and the critical point the curve is held only by the critical point."
              % (len(use), sum(1 for p in use if p.get("doi")), min(p["T"] for p in use), Tc, pct(m),
                 ", each within its own stated uncertainty" if C.get("vp_fit") == "within" else "", Tdata))
    if C.get("vp_fit") == "anchor":
        vp_fit += (" Fitted: %s (the smallest stated uncertainties of the measured sets, which disagree with each other "
                   "beyond their uncertainties) and the critical point." % " and ".join(C["vp_anchor"]))
    if kept:
        u = [100 * p["u_rel"] for p in kept]
        vp_fit += (" Also %d values with stated uncertainties above 1 %% (%.2g-%.2g %%), %.2f-%.2f K, which the fit meets "
                   "within their uncertainties (kept as confirmation, not fitted)." % (
                       len(kept), min(u), max(u), min(p["T"] for p in kept), max(p["T"] for p in kept)))
        refs += [r for r in refs_of([p for p in kept if p.get("doi")], tml) if r not in refs]
    vp = {"equation": "DIPPR101", "form": "ln(P/Pa) = A + B/T + C ln T + D T^E", "units": "Pa",
          **{k: coeffs[k] for k in "ABCDE"}, "Tmin_K": rnd(Tlow, 8), "Tmax_K": rnd(Tc, 8),
          "tier": "fitted",
          "source": "Measured vapour pressures (NIST TRC ThermoML Archive and NIST Chemistry WebBook): %s. %s" % (
              "; ".join(refs), vp_fit)}
    checks = []
    for s in antoine:
        if s["reference"] in C["antoine_fit"]:
            continue
        Tq = np.linspace(s["Tmin_K"], s["Tmax_K"], 21)
        dev = ev("DIPPR101", coeffs, Tq) / (1e5 * 10 ** (s["A"] - s["B"] / (Tq + s["C"]))) - 1
        k = int(np.argmax(np.abs(dev)))
        checks.append({"reference": s["reference"] + " (Antoine equation, NIST WebBook)", "url": wb4,
                       "T_range_K": [s["Tmin_K"], s["Tmax_K"]], "max_deviation_percent": round(100 * float(dev[k]), 2)})
    if checks:
        vp["crossCheck"] = checks
    if exc:
        vp["excluded"] = [{"T_K": p["T"], "value": rnd(p["y"], 8), "reference": p["ref"],
                           "deviation_percent": p["deviation_percent"], "why": p["why"]} for p in exc]
    order = sorted(range(len(use)), key=lambda i: use[i]["T"])
    vp_pts = {"units": "Pa", "source": {"name": "measured vapour pressures and the critical point", "fit": vp_fit},
              "T_K": [rnd(use[i]["T"], 8) for i in order], "values": [rnd(use[i]["y"], 8) for i in order],
              "references": [use[i]["ref"] for i in order]}
    log.append("%-17s vapourPressure            %3d values, %d left out, max dev %s %%" % (cid, len(use), len(exc), pct(m)))
    vpc = dict(coeffs)  # (coeffs is reused by the records below)
    psat = lambda T: float(ev("DIPPR101", vpc, np.array([T]))[0])  # noqa: E731
    Tb = float("%.7g" % brentq(lambda T: psat(T) - 101325.0, vp["Tmin_K"], Tc - 1))
    omega = float("%.6g" % (-math.log10(psat(0.7 * Tc) / Pc) - 1))
    tb_measured = [(p["y"], p["ref"]) for p in tml.values("Tb")]
    vp_pts["Tb_K_at_101325Pa"] = Tb

    # liquid density
    pts = tml.values("liquidDensity")
    coeffs, use, exc, m = fit_measured(cid, "liquidDensity", "DIPPR105", pts, 0.01, Tc=Tc)
    records["liquidDensity"], points["liquidDensity"] = record(
        "liquidDensity", "DIPPR105", coeffs, use, exc, m, Tc,
        "Measured densities of the liquid at 0.1 MPa (NIST TRC ThermoML Archive)", refs_of(use, tml), THERMOML_ACCESS,
        notes="DIPPR 105 with C fixed at the critical temperature %.2f K (%s, %s)." % (Tc, crit_who, crit_where))
    log.append("%-17s liquidDensity             %3d values, %d left out, max dev %s %%" % (cid, len(use), len(exc), pct(m)))

    # ideal-gas heat capacity: the WebBook Shomate equation (JANAF), as for chloroform in fit_properties.py
    sh = wb.shomate() if C["cp0"] == "shomate" else None
    if sh:
        s = sh[0]
        T = np.linspace(s["Tmin"], s["Tmax"], 200)
        t = T / 1000
        y = s["A"] + s["B"] * t + s["C"] * t ** 2 + s["D"] * t ** 3 + s["E"] / t ** 2
        c, _ = fit_107(T, y, 0.01)
        c = {k: rnd(v) for k, v in c.items()}
        m = rel_dev(ev("DIPPR107", c, T), y)
        idx = np.round(np.linspace(0, len(T) - 1, 41)).astype(int)
        records["idealGasHeatCapacity"] = {
            "equation": "DIPPR107", "coefficients": c, "units": "J/mol/K", "Tmin_K": s["Tmin"], "Tmax_K": s["Tmax"],
            "tier": "fitted",
            "source": {"name": "NIST Chemistry WebBook", "url": wb.url("gas phase thermochemistry"), "access": WEBBOOK_ACCESS,
                       "reference": "%s (NIST-JANAF Thermochemical Tables, 4th ed., J. Phys. Chem. Ref. Data Monograph 9), "
                                    "Shomate equation as given in the NIST Chemistry WebBook (SRD 69); %s" % (s["reference"], s["comment"]),
                       "fit": "200 points sampled from the Shomate equation, %.2f-%.2f K, max deviation %s %%" % (s["Tmin"], s["Tmax"], pct(m))}}
        points["idealGasHeatCapacity"] = {"units": "J/mol/K", "source": records["idealGasHeatCapacity"]["source"],
                                          "T_K": [rnd(float(T[i]), 8) for i in idx], "values": [rnd(float(y[i]), 8) for i in idx]}
        log.append("%-17s idealGasHeatCapacity      Shomate (JANAF), max dev %s %%" % (cid, pct(m)))
    elif isinstance(C["cp0"], dict):
        # the WebBook table of gas heat capacities named in "tables" (from Tmin up); the other tables are compared
        tabs = wb.cp_gas()
        chosen = [t for t in tabs if t["reference"] in C["cp0"]["tables"]]
        rows = sorted((T, v) for t in chosen for T, v, _ in t["rows"] if T >= C["cp0"].get("Tmin", 0))
        T, y = np.array([r[0] for r in rows]), np.array([r[1] for r in rows])
        if len(T) >= 8:
            c, _ = fit_107(T, y, 0.01)
            form, c = "DIPPR107", {k: rnd(v) for k, v in c.items()}
        else:
            pts = [{"T": float(a), "y": float(b), "u_rel": None} for a, b in rows]
            form, c = "DIPPR100", fit_measured(cid, "idealGasHeatCapacity", "DIPPR100", pts, 0.01)[0]
        m = rel_dev(ev(form, c, T), y)
        cross = []
        for t in tabs:
            if t in chosen:
                continue
            Tq = np.array([r[0] for r in t["rows"] if T.min() <= r[0] <= T.max()])
            if len(Tq):
                yq = np.array([r[1] for r in t["rows"] if T.min() <= r[0] <= T.max()])
                d = ev(form, c, Tq) / yq - 1
                cross.append("%s, %d values %.2f-%.2f K: max deviation %+.2f %%" % (
                    t["reference"], len(Tq), Tq.min(), Tq.max(), 100 * d[np.argmax(np.abs(d))]))
        src = {"name": "NIST Chemistry WebBook", "url": wb.url("gas phase thermochemistry"), "access": WEBBOOK_ACCESS,
               "reference": "; ".join("%s, gas heat capacities as tabulated in the NIST Chemistry WebBook (SRD 69)%s" % (
                   t["reference"], ": " + t["comment"] if t["comment"] else "") for t in chosen),
               "fit": "%d tabulated values, %.2f-%.2f K, max deviation %s %%" % (len(T), T.min(), T.max(), pct(m))}
        if cross:
            src["notes"] = "Other tables of the WebBook page, compared with the record (not fitted): %s." % "; ".join(cross)
        records["idealGasHeatCapacity"] = {"equation": form, "coefficients": c, "units": "J/mol/K", "Tmin_K": float(T.min()),
                                           "Tmax_K": float(T.max()), "tier": "fitted", "source": src}
        points["idealGasHeatCapacity"] = {"units": "J/mol/K", "source": src, "T_K": [float(v) for v in T],
                                          "values": [float(v) for v in y]}
        log.append("%-17s idealGasHeatCapacity      %d tabulated values, %s, max dev %s %%" % (cid, len(T), form, pct(m)))
    else:
        records["idealGasHeatCapacity"] = {"available": False, "searched": searched_common + [
            "NIST Chemistry WebBook, gas phase thermochemistry: no gas heat capacity", "ThermoML Archive: no gas-phase heat capacity"]}
        log.append("%-17s idealGasHeatCapacity      no open data" % cid)

    # liquid heat capacity: ThermoML values and, where named, the WebBook equation of an article
    pts = tml.values("liquidHeatCapacity")
    eq_ref = C.get("cpL_equation")
    for e in wb.cp_liquid():
        if eq_ref and e["reference"] == eq_ref:
            mm = re.search(r"T = (\d+) to (\d+) K\. Cp\(liq\) = ([0-9.]+) \+ ([0-9.]+)\(T/K\)", e["comment"])
            if mm:
                lo, hi, a, b = (float(v) for v in mm.groups())
                cp = lambda T: a + b * T  # noqa: E731
            else:
                # as printed for gamma-butyrolactone: Cp(liq) = a + bX10-nT + cx10-kT2 J/mol*K
                mm = re.search(r"T = (\d+) to (\d+) K\. Cp\(liq\) = ([0-9.]+) \+ ([0-9.]+)[xX]10-(\d+)T \+ ([0-9.]+)[xX]10-(\d+)T2",
                               e["comment"])
                lo, hi, a, b, nb, c2, nc = (float(v) for v in mm.groups())
                cp = lambda T: a + b * 10 ** -nb * T + c2 * 10 ** -nc * T ** 2  # noqa: E731
            for T in np.linspace(lo, hi, 7):
                pts.append({"T": float(T), "y": float(cp(T)), "u_rel": None, "doi": None,
                            "ref": "%s (equation on the NIST WebBook page, %g-%g K)" % (e["reference"], lo, hi)})
    for e in wb.cp_liquid():
        if not (eq_ref and e["reference"] == eq_ref):
            pts.append({"T": e["T_K"], "y": e["value"], "u_rel": None, "doi": None, "webbook_single": True,
                        "ref": "%s (NIST WebBook, %s)" % (e["reference"], e["comment"].split(";")[-1].strip() or "")})
    # single WebBook values (one temperature each, often older) only count where an equation or a ThermoML
    # set gives the temperature dependence
    fit_or_marker(cid, "liquidHeatCapacity", "DIPPR100", 0.01, pts, records, points, log, Tc, tml, searched_common,
                  "Measured heat capacities of the liquid (NIST TRC ThermoML Archive and NIST Chemistry WebBook)",
                  THERMOML_ACCESS + "; " + WEBBOOK_ACCESS)

    # enthalpy of vaporization: the WebBook values chosen by method and reference, and ThermoML values
    pts = [{"T": e["T_K"], "y": 1000 * e["value"], "u_rel": (e["unc"] / e["value"]) if e["unc"] else None, "doi": None,
            "method": e["method"], "ref": "%s (%s, NIST WebBook)" % (e["reference"], "method " + e["method"] if e["method"] != "N/A" else "compilation")}
           for e in wb.dhvap() if e["method"] in C.get("dHvap_methods", ["C"]) or e["reference"] in C.get("dHvap_refs", [])]
    # the standard enthalpy of vaporization (at 298.15 K) of the phase change table, chosen the same way
    for v, u, unit, method, ref in wb.constants("ΔvapH°"):
        if unit == "kJ/mol" and (method in C.get("dHvap_methods", ["C"]) or ref in C.get("dHvap_refs", [])):
            pts.append({"T": 298.15, "y": 1000 * v, "u_rel": (u / v) if u else None, "doi": None, "method": method,
                        "ref": "%s (ΔvapH° at 298.15 K, %s, NIST WebBook)" % (ref, "method " + method if method != "N/A" else "compilation")})
    pts += tml.values("heatOfVaporization")
    if C.get("dHvap") == "clapeyron":
        dh_clapeyron(cid, C, wb, tml, pts, psat, Tlow, Tc, Pc, omega, records, points, log, wb4)
    else:
        dh_measured(cid, C, wb, tml, pts, Tc, records, points, log, wb4)

    # liquid viscosity, surface tension, liquid thermal conductivity: ThermoML values where there are enough
    for prop, form, target in (("liquidViscosity", "DIPPR101", 0.03), ("surfaceTension", "DIPPR106", 0.01),
                               ("liquidThermalConductivity", "DIPPR100", 0.03)):
        fit_or_marker(cid, prop, form, target, tml.values(prop), records, points, log, Tc, tml, searched_common,
                      "Measured values (NIST TRC ThermoML Archive)", THERMOML_ACCESS)
    for prop in ("vapourViscosity", "vapourThermalConductivity"):
        records[prop] = {"available": False, "searched": searched_common}
        log.append("%-17s %-25s no open data" % (cid, prop))
    records = {p: records[p] for p in PROPS}

    tb_text = " Tb: where the vapour-pressure record reaches 101.325 kPa (%g K)" % Tb
    if tb_measured:
        tb_text += "; measured normal boiling temperatures in the ThermoML Archive: %s" % "; ".join("%.2f K (%s)" % t for t in tb_measured)
    comp = {
        "name": C["name"], "formula": meta.formula, "cas": C["cas"], "aliases": C["aliases"],
        "MW": rnd(meta.MW, 7), "Tc_K": Tc, "Pc_Pa": rnd(Pc, 7), "Tb_K": Tb, "vapourPressure": vp,
        "uniquac_missing": {
            "searched": ["ChemSep v8.3 and v8.31 data 2 (compound not included)",
                         "thermo and chemicals libraries (no UNIQUAC r and q tables)"],
            "note": "no open data: UNIQUAC r and q could be computed from UNIFAC group volumes and areas, but the licence "
                    "of those group tables is the open question of roadmap A3 (proposal 0008, Part A, on hold); until it "
                    "is settled the component has no activity-model data."},
        "omega": omega,
        "constants_source": ("%s. MW, formula and CAS: "
                             "chemicals library (MIT). Measured data only: not a CoolProp 8.0.0 fluid and not in the ChemSep "
                             "databank (%s).%s." % (crit_text, C.get("proposal", "proposal 0008, Part B"), tb_text)),
        # stated here: the text above names CoolProp only to say it does not have the fluid
        "constants_source_ids": ["nist-webbook"],
        "omega_source": ("From its definition, -log10(Psat(0.7 Tc)/Pc) - 1, with the vapour-pressure record (measured values "
                         "of the NIST TRC ThermoML Archive and the NIST Chemistry WebBook; Psat at %.2f K %s)." % (
                             0.7 * Tc, "inside the measured range" if 0.7 * Tc <= Tdata else
                             "between the last measured value at %.2f K and the critical point, so ω is less certain "
                             "than the measured values" % Tdata)),
        "properties": records,
    }
    points["vapourPressure"] = vp_pts
    log.append("%-17s Tc %.2f K, Pc %.0f Pa, Tb %.3f K, omega %.4f, MW %.4f" % (cid, Tc, Pc, Tb, omega, meta.MW))
    return comp, points

# ---------------------------------------------------------------------------------------------
# Report
# ---------------------------------------------------------------------------------------------


def write_doc(comps):
    L = ["# Components from measured data", "",
         "Generated by `validation/python/measured_components.py` (proposal 0008, Part B; proposal 0009, batch 3). These",
         "components are neither",
         "CoolProp fluids nor in the ChemSep databank, so every record is fitted to measured values from the NIST",
         "Chemistry WebBook and the NIST TRC ThermoML Archive. The stored files",
         "`validation/data/pure/measured/webbook_<id>.json` and `thermoml_<id>.json` hold the values with their",
         "citations; `validation/data/pure/<id>.json` holds the values each record uses, which",
         "`test/properties.test.js` checks.", "",
         "A record covers only the temperatures that were measured. Outside them the engine refuses with an",
         "out-of-range error instead of extrapolating. A property without open data says so (\"no open data\"), with",
         "the sources searched.", ""]
    for cid, c in comps.items():
        L += ["## %s (%s, CAS %s)" % (c["name"], c["formula"], c["cas"]), "",
              "- Tc %.2f K, Pc %.4g MPa, Tb %.3f K, ω %.4f, M %.4f g/mol" % (c["Tc_K"], c["Pc_Pa"] / 1e6, c["Tb_K"], c["omega"], c["MW"]),
              "- Constants: %s" % c["constants_source"], "",
              "| Property | Range (K) | Values used | Left out | Max deviation | Sources |", "|---|---|---|---|---|---|"]
        vp = c["vapourPressure"]
        L.append("| Vapour pressure | %.2f-%.2f | %s | %d | %s | ThermoML, WebBook |" % (
            vp["Tmin_K"], vp["Tmax_K"], re.search(r"(\d+) measured values", vp["source"]).group(1), len(vp.get("excluded", [])),
            re.search(r"max deviation ([0-9.]+ %)", vp["source"]).group(1)))
        for p, r in c["properties"].items():
            if r.get("available") is False:
                L.append("| %s | — | — | — | — | no open data%s |" % (p, " (%s)" % r["note"].split(":")[0] if r.get("note") else ""))
                continue
            f = r["source"]["fit"]
            nval = re.match(r"(\d+)", f).group(1)
            L.append("| %s | %.2f-%.2f | %s | %d | %s | %s |" % (
                p, r["Tmin_K"], r["Tmax_K"], nval, len(r["source"].get("excluded", [])),
                re.search(r"max deviation ([0-9.]+ %)", f).group(1), r["source"]["name"]))
        L.append("")
        for p, r in [("vapourPressure", vp)] + list(c["properties"].items()):
            exc = r.get("excluded") or (r.get("source", {}).get("excluded") if isinstance(r.get("source"), dict) else None)
            if exc:
                L.append("Left out of %s: %s." % (p, "; ".join("%.2f K, %s, %+.2f %% (%s)" % (
                    e["T_K"], e["reference"], e["deviation_percent"], e["why"]) for e in exc)))
                L.append("")
    DOC_FILE.write_text("\n".join(L) + "\n")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--fetch", action="store_true")
    ap.add_argument("--cache", type=Path, help="directory for the downloaded ThermoML records (with --fetch)")
    ap.add_argument("--write", action="store_true")
    ap.add_argument("--only", nargs="+", metavar="ID", help="build (and write) only these components")
    args = ap.parse_args()
    for c in [c for c in COMPONENTS if COMPONENTS[c].get("hold") and c not in (args.only or [])]:
        print("held: %s (%s)" % (c, COMPONENTS[c]["hold"]))
        del COMPONENTS[c]
    every = list(COMPONENTS)
    if args.only:
        unknown = [c for c in args.only if c not in COMPONENTS]
        if unknown:
            raise SystemExit("not in COMPONENTS: %s" % unknown)
        for c in list(COMPONENTS):
            if c not in args.only:
                del COMPONENTS[c]
    if args.fetch:
        if not args.cache:
            raise SystemExit("--fetch needs --cache DIR")
        for cid in COMPONENTS:
            fetch_webbook(cid)
            fetch_thermoml(cid, args.cache)
    log, comps, pts = [], {}, {}
    for cid in COMPONENTS:
        comps[cid], pts[cid] = build(cid, log)
    print("\n".join(log))
    if args.write:
        data = json.loads(COMP_FILE.read_text())
        for cid, c in comps.items():
            data["components"][cid] = c
        COMP_FILE.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n")
        for cid, p in pts.items():
            doc = {"component": cid, "name": comps[cid]["name"],
                   "about": "Measured values each record of this component was fitted to (validation/python/"
                            "measured_components.py). test/properties.test.js checks that the coefficients in "
                            "src/data/components.json reproduce them within the maximum deviation stated in each record.",
                   "records": p}
            (POINTS_DIR / ("%s.json" % cid)).write_text(json.dumps(doc, indent=1, ensure_ascii=False) + "\n")
        write_doc({cid: data["components"][cid] for cid in every})
        print("written: components.json, validation/data/pure/<id>.json, %s" % DOC_FILE.relative_to(ROOT))


if __name__ == "__main__":
    main()
