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
import collections
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
    # the boiling temperature of the pure component at a stated pressure (the x = 1 end of an isobaric set): a vapour
    # pressure, read by values("vapourPressure") with T and P swapped
    "Boiling temperature at pressure P, K": ("boilingT", 1.0, "Liquid"),
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
        # liquid heat capacity: only single values are open (the measurements over a range, Harrison and
        # Moelwyn-Hughes 1957 and Chorazewski et al. 2015, are paywalled; docs/decisions/2026-10-17-02-liquid-heat-capacity.md)
        "cp_single_values": {
            "decided": "2026-10-18: \"use this values you found because dichlormethane has a lower boiling point\"",
            "leave_out": {"Kurbatov, 1948 (NIST WebBook, DH)":
                          "a mean heat capacity over -76 to 41 degC (four temperatures), as the WebBook says, not a value "
                          "at 298 K; 29 % above the others"},
            "notes": ("The values span 292.5-303.2 K and scatter by about 10 %, more than any change of the heat capacity "
                      "over those 11 K, so no temperature dependence is fitted."),
            "to_Tb": "2026-10-18, \"yes for dichloremethane\"",
        },
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
    # proposal 0009, batch 3, second part: levulinic acid and its esters (critical constants: Nikitin et al. 2019,
    # ThermoML Archive)
    "levulinic-acid": {
        "name": "Levulinic acid", "cas": "123-76-2", "webbook": "C123762", "proposal": "proposal 0009, batch 3",
        "aliases": ["4-oxopentanoic acid", "4-oxovaleric acid", "levulic acid", "la"],
        "thermoml_queries": ["levulinic acid", "4-oxidanylidenepentanoic acid"],
        # critical point: Nikitin et al. (2019, pulse heating), ThermoML Archive, the only measurement
        "critical_thermoml": "10.1016/j.jct.2019.03.040",
        # melts at 306-310 K (WebBook); Nikitin et al. (2019) report their densities (293-343 K) and heat capacities
        # (303-374 K) as of the metastable liquid
        "metastable_liquid": True,
        # The open vapour pressures disagree. Stull (1947, a compilation, 375-519 K) agrees with the measured normal
        # boiling temperature (Uslu et al. 2008, 518.2 K); the transpiration values of Verevkin et al. (2012, 328-373 K,
        # 5 %) lie 11-43 % above the curve through them and the critical point, and no curve with a physical enthalpy
        # of vaporization meets both. Transpiration takes the vapour as monomer; a carboxylic acid partly dimerizes in
        # the gas, which makes the apparent pressure too high, a likely reason (not checked here). Fitted: Stull, the
        # boiling temperature and the critical point; Verevkin et al. listed as left out; the record starts at 375 K.
        # Written with a gap (the maintainer's decision, 2026-10-14): its open liquid densities end at 343 K, so
        # between 343 and 375 K there is neither a density nor a vapour pressure, and above 375 K no density; each
        # record refuses outside its own range (vapour-liquid equilibrium with an ideal-gas vapour needs only the
        # vapour pressure)
        "antoine_fit": ["Stull, 1947"],
        "vp_fit": "consensus", "vp_tb": "thermoml",
        "vp_exclude": {"Verevkin 2012": "transpiration takes the vapour as monomer, and a carboxylic acid partly "
                                        "dimerizes in the gas, which makes the apparent pressure too high; these values "
                                        "lie 11-43 % above the curve of Stull (1947), the measured boiling temperature "
                                        "and the critical point"},
        "vp_why": ("The transpiration values of Verevkin et al. (2012, 328-373 K) lie 11-43 % above this curve and are "
                   "left out: no curve with a physical enthalpy of vaporization meets both them and the measured normal "
                   "boiling temperature; transpiration takes the vapour as monomer, and a carboxylic acid partly "
                   "dimerizes in the gas, which makes the apparent pressure too high (a likely reason, not checked). "
                   "Below 375 K the record refuses. The open liquid densities end at 343 K, so above 375 K the liquid "
                   "density is refused too (no open data; wanted: densities above 375 K, or vapour pressures between "
                   "343 and 375 K by a static or ebulliometric method)."),
        "dHvap": "clapeyron",
        "dHvap_why": "the only calorimetric value, Verevkin et al. (2012, ThermoML Archive), is at 298.15 K",
        "cp0": None,
    },
    "methyl-levulinate": {
        "name": "Methyl levulinate", "cas": "624-45-3", "webbook": "C624453", "proposal": "proposal 0009, batch 3",
        "aliases": ["methyl 4-oxopentanoate", "ml"],
        "thermoml_queries": ["methyl levulinate", "methyl 4-oxidanylidenepentanoate"],
        # critical point: Nikitin et al. (2019, pulse heating), ThermoML Archive, the only measurement
        "critical_thermoml": "10.1016/j.jct.2019.03.040",
        # Lomba et al. (2013, 333-453 K, 0.2-2.7 %) and Emel'yanenko et al. (2018, transpiration, 294-353 K, 6 %), fitted
        # together with the same weight (the rule of 2026-10-14); Stull (1947), a compilation, as a cross-check only
        "antoine_fit": [],
        "vp_fit": "consensus",
        "dHvap": "clapeyron",
        "dHvap_why": "no calorimetric value; the WebBook values are derived from vapour pressures",
        "cp0": None,
    },
    "ethyl-levulinate": {
        "name": "Ethyl levulinate", "cas": "539-88-8", "webbook": "C539888", "proposal": "proposal 0009, batch 3",
        "aliases": ["ethyl 4-oxopentanoate", "el"],
        "thermoml_queries": ["ethyl levulinate", "ethyl 4-oxidanylidenepentanoate"],
        # critical point: Nikitin et al. (2019, pulse heating), ThermoML Archive, the only measurement
        "critical_thermoml": "10.1016/j.jct.2019.03.040",
        # Emel'yanenko et al. (2018, transpiration, 6 %) measured 294-349 K; Bo et al. (Energies 2025, open access,
        # article_ethyl-levulinate_bo2025.json) 446-479 K, the pure end points of their isobaric VLE sets and their
        # boiling temperature at 101.3 kPa. Stull (1947, a compilation, 320-479 K) as a cross-check only
        "antoine_fit": [],
        "vp_fit": "consensus",
        "dHvap": "clapeyron",
        "dHvap_why": "no calorimetric value; the WebBook values are derived from vapour pressures",
        "cp0": None,
    },
    "butyl-levulinate": {
        "name": "Butyl levulinate", "cas": "2052-15-5", "webbook": "C2052155", "proposal": "proposal 0009, batch 3",
        "aliases": ["butyl 4-oxopentanoate", "n-butyl levulinate", "bl"],
        "thermoml_queries": ["butyl levulinate", "butyl 4-oxidanylidenepentanoate"],
        # critical point: Nikitin et al. (2019, pulse heating), ThermoML Archive, the only measurement
        "critical_thermoml": "10.1016/j.jct.2019.03.040",
        # only Emel'yanenko et al. (2018, transpiration, 6-7 %), 298-348 K; the WebBook has no Antoine equation; above
        # them only the normal boiling temperature of the WebBook (Weast and Grasselli, 1989, a compilation; 510.7 K)
        "antoine_fit": [],
        "vp_fit": "consensus", "vp_tb": "Weast and Grasselli, 1989",
        "dHvap": "clapeyron",
        "dHvap_why": "no calorimetric value; the WebBook values are derived from vapour pressures",
        "cp0": None,
    },
    # proposal 0009, batch 3, third part: molecules with no measured critical constants in any open source; activity
    # models with an ideal-gas vapour only (src/thermo/critical.js)
    "gvl": {
        "name": "gamma-Valerolactone", "cas": "108-29-2", "webbook": "C108292", "proposal": "proposal 0009, batch 3",
        "aliases": ["γ-valerolactone", "gvl", "5-methyloxolan-2-one", "4-pentanolide", "valerolactone"],
        "thermoml_queries": ["gamma-valerolactone", "5-methyloxolan-2-one"],
        "no_critical": ["NIST Chemistry WebBook (no Tc or Pc on its phase-change page)", "NIST TRC ThermoML Archive (no critical temperature or pressure)", "CoolProp 8.0.0 (not a fluid)", "ChemSep v8.3 and v8.31 data 2 (compound not included)", "open literature (web search, 2026-10-14)"],
        # Stull (1947), a compilation, as a cross-check only
        "antoine_fit": [],
        "vp_fit": "consensus",
        "dHvap": "clapeyron",
        "dHvap_why": "the calorimetric value of Leitao et al. (1990) is at 298.15 K only",
        "cp0": None,
    },
    "furfuryl-alcohol": {
        # its two vapour-pressure sets disagree (Tai 2014, three values at 353-408 K, lie 4-7 % above Negadi 2014, 27
        # values at 273-412 K, beyond the stated uncertainties); both reach the measured normal boiling temperatures of
        # the WebBook (442.5-444.15 K), so the independent check does not single out one. The maintainer chose Negadi
        # 2014 (2026-10-14): more values over a wider range (27 distinct values; the archive lists 9 of them twice)
        "name": "Furfuryl alcohol", "cas": "98-00-0", "webbook": "C98000", "proposal": "proposal 0009, batch 3",
        "aliases": ["2-furanmethanol", "furan-2-ylmethanol", "2-furylmethanol", "furfural alcohol"],
        "thermoml_queries": ["furfuryl alcohol", "furan-2-ylmethanol"],
        "no_critical": ["NIST Chemistry WebBook (no Tc or Pc on its phase-change page)", "NIST TRC ThermoML Archive (no critical temperature or pressure)", "CoolProp 8.0.0 (not a fluid)", "ChemSep v8.3 and v8.31 data 2 (compound not included)", "open literature (web search, 2026-10-14)"],
        "antoine_fit": [],
        "vp_fit": "consensus",
        "vp_exclude": {"Tai 2014": "its three values at 353-408 K lie 4-7 % above Negadi 2014, beyond the stated "
                                   "uncertainties, and no independent check singles out one set; the maintainer chose "
                                   "Negadi 2014, with 27 values over 273-412 K (2026-10-14)"},
        "dHvap": "clapeyron",
        "dHvap_why": "no calorimetric value; the WebBook values are derived from vapour pressures",
        "cp0": None,
    },
    "thfa": {
        "name": "Tetrahydrofurfuryl alcohol", "cas": "97-99-4", "webbook": "C97994", "proposal": "proposal 0009, batch 3",
        "aliases": ["tetrahydro-2-furanmethanol", "oxolan-2-ylmethanol", "thfa"],
        "thermoml_queries": ["tetrahydrofurfuryl alcohol", "oxolan-2-ylmethanol"],
        "no_critical": ["NIST Chemistry WebBook (no Tc or Pc on its phase-change page)", "NIST TRC ThermoML Archive (no critical temperature or pressure)", "CoolProp 8.0.0 (not a fluid)", "ChemSep v8.3 and v8.31 data 2 (compound not included)", "open literature (web search, 2026-10-14)"],
        "antoine_fit": [],
        # the measured vapour pressures (Lomba 2014) end at 448 K and 97.9 kPa, so the record has no normal boiling
        # point (Tb_note). The WebBook value of Moshkin (1955, 451.0 K) is not used to complete the curve: fitted with
        # it, the curve misses Lomba's values at 428-448 K by 2-3.7 %, beyond their stated uncertainties (Lomba's own
        # curve reaches 101.325 kPa at about 449.5 K)
        "vp_fit": "consensus",
        "dHvap": "clapeyron",
        "dHvap_why": "no calorimetric value; the WebBook values are derived from vapour pressures",
        "cp0": None,
    },
    "methyl-lactate": {
        # Lomba 2014 misses the agreement test narrowly (2.96 % against its stated 2.59 %; Sanz 2005: three values at
        # 283-303 K, stated 4.6-24 %); Lomba's own curve meets the measured boiling temperature of Lecat (417.0 K) within
        # 0.3 K. The maintainer accepted the narrow miss (2026-10-14)
        "vp_accept": {"Lomba 2014": 2.96},
        "name": "Methyl lactate", "cas": "547-64-8", "webbook": "C547648", "proposal": "proposal 0009, batch 3",
        "aliases": ["methyl 2-hydroxypropanoate", "lactic acid methyl ester"],
        "thermoml_queries": ["methyl lactate", "methyl 2-oxidanylpropanoate"],
        "no_critical": ["NIST Chemistry WebBook (no Tc or Pc on its phase-change page)", "NIST TRC ThermoML Archive (no critical temperature or pressure)", "CoolProp 8.0.0 (not a fluid)", "ChemSep v8.3 and v8.31 data 2 (compound not included)", "open literature (web search, 2026-10-14)"],
        "antoine_fit": [],
        "vp_fit": "consensus",
        "dHvap": "clapeyron",
        "dHvap_why": "no calorimetric value; the WebBook values are derived from vapour pressures",
        "cp0": None,
    },
    "ethyl-lactate": {
        # Resa 2010 (two boiling temperatures at 101 kPa, 427.6 K) misses the agreement test narrowly (1.94 % against its
        # stated 1.70 %); the other boiling temperatures are 425.0 K (Resa 2006) and 426.2-426.7 K (Matsuda 2016, Lomba
        # 2014). The maintainer accepted the narrow miss (2026-10-14)
        "vp_accept": {"Resa 2010": 1.94},
        "name": "Ethyl lactate", "cas": "97-64-3", "webbook": "C97643", "proposal": "proposal 0009, batch 3",
        "aliases": ["ethyl 2-hydroxypropanoate", "lactic acid ethyl ester"],
        "thermoml_queries": ["ethyl lactate", "ethyl 2-oxidanylpropanoate"],
        "no_critical": ["NIST Chemistry WebBook (no Tc or Pc on its phase-change page)", "NIST TRC ThermoML Archive (no critical temperature or pressure)", "CoolProp 8.0.0 (not a fluid)", "ChemSep v8.3 and v8.31 data 2 (compound not included)", "open literature (web search, 2026-10-14)"],
        "antoine_fit": [],
        "vp_fit": "consensus",
        "dHvap": "clapeyron",
        "dHvap_why": "no calorimetric value; the WebBook values are derived from vapour pressures",
        "cp0": None,
    },
    "cpme": {
        "name": "Cyclopentyl methyl ether", "cas": "5614-37-9", "webbook": "C5614379", "proposal": "proposal 0009, batch 3",
        "aliases": ["methoxycyclopentane", "cpme"],
        "thermoml_queries": ["cyclopentyl methyl ether", "methoxycyclopentane"],
        "no_critical": ["NIST Chemistry WebBook (no Tc or Pc on its phase-change page)", "NIST TRC ThermoML Archive (no critical temperature or pressure)", "CoolProp 8.0.0 (not a fluid)", "ChemSep v8.3 and v8.31 data 2 (compound not included)", "open literature (web search, 2026-10-14)"],
        "antoine_fit": [],
        "vp_fit": "consensus",
        "dHvap": "clapeyron",
        "dHvap_why": "no calorimetric value; the WebBook values are derived from vapour pressures",
        "cp0": None,
    },
    "limonene": {
        # Wu 2019 (two boiling temperatures at 101 kPa, 449.3-449.6 K) misses the agreement test narrowly (1.83 % against
        # its stated 1.62 %); the other measured boiling temperatures are 450.34 K (Sun 2011) and 450.2-450.8 K from the
        # curves of Ngema 2012 and Clara 2009. The maintainer accepted the narrow miss (2026-10-14)
        "vp_accept": {"Wu 2019": 1.83},
        "name": "Limonene", "cas": "138-86-3", "webbook": "C138863", "proposal": "proposal 0009, batch 3",
        "aliases": ["dipentene", "d-limonene", "(R)-limonene", "1-methyl-4-(prop-1-en-2-yl)cyclohexene"],
        "thermoml_queries": ["limonene", "d-limonene", "(R)-limonene", "dipentene", "1-methyl-4-prop-1-en-2-yl-cyclohexene",
                             "(+)-limonene"],
        # the archive's values of either enantiomer and of the racemate count (mirror images have the same thermodynamic
        # properties; most measurements are of (R)-limonene)
        "inchi_no_stereo": True,
        "no_critical": ["NIST Chemistry WebBook (no Tc or Pc on its phase-change page)", "NIST TRC ThermoML Archive (no critical temperature or pressure)", "CoolProp 8.0.0 (not a fluid)", "ChemSep v8.3 and v8.31 data 2 (compound not included)", "open literature (web search, 2026-10-14)"],
        "antoine_fit": [],
        "vp_fit": "consensus",
        "dHvap": "clapeyron",
        "dHvap_why": "no calorimetric value; the WebBook values are derived from vapour pressures or thermogravimetry",
        "cp0": None,
    },
    "2-3-butanediol": {
        "name": "2,3-Butanediol", "cas": "513-85-9", "webbook": "C513859", "proposal": "proposal 0009, batch 3",
        "aliases": ["butane-2,3-diol", "2,3-butylene glycol", "2,3-bdo", "dimethylethylene glycol"],
        "thermoml_queries": ["2,3-butanediol", "butane-2,3-diol", "2,3-butylene glycol", "meso-2,3-butanediol"],
        "no_critical": ["NIST Chemistry WebBook (no Tc or Pc on its phase-change page)", "NIST TRC ThermoML Archive (no critical temperature or pressure)", "CoolProp 8.0.0 (not a fluid)", "ChemSep v8.3 and v8.31 data 2 (compound not included)", "open literature (web search, 2026-10-14)"],
        # no measured vapour pressure in the archive or open articles: the WebBook's Antoine equation of Stull (1947, a
        # compilation, 317-455 K) is the only source, as for levulinic acid; the measured normal boiling temperatures of
        # four articles (ThermoML Archive) are the independent check
        "antoine_fit": ["Stull, 1947"],
        "vp_fit": "consensus",
        "dHvap": "clapeyron",
        "dHvap_why": "no calorimetric value; the WebBook values are derived from vapour pressures",
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
        # vapour pressure: every set together, each article with the same weight (the rule of 2026-10-14)
        "vp_fit": "consensus",
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
        # Tai et al. (2014) lie 5-6 % above the other two sets, beyond the stated uncertainties; the same article lies
        # 4-7 % above Negadi 2014 for furfuryl alcohol, so its offset is systematic across compounds (decided 2026-10-14)
        "vp_fit": "consensus",
        "vp_exclude": {"Tai 2014": "its values lie 5-6 % above the two other sets, beyond the stated uncertainties, and the "
                                   "same article lies 4-7 % above the other measured set for furfuryl alcohol too: a "
                                   "systematic offset of that set, not scatter"},
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
        # vapour pressure: every set together, each article with the same weight (the rule of 2026-10-14)
        "vp_fit": "consensus",
        "dHvap": "clapeyron",
        "dHvap_why": "no calorimetric value; the WebBook values are derived from vapour pressures",
        "cp0": None,
    },
    "gbl": {
        "name": "gamma-Butyrolactone", "cas": "96-48-0", "webbook": "C96480", "proposal": "proposal 0009, batch 3",
        "aliases": ["γ-butyrolactone", "butyrolactone", "oxolan-2-one", "gbl"],
        "thermoml_queries": ["gamma-butyrolactone", "oxolan-2-one"],
        "webbook_individual": ["HVAP"],
        # its open measured vapour pressures start at 377 K and its liquid densities end at 333 K (a gap the maintainer
        # accepted, 2026-10-14). Its vapour-pressure sets are pooled: Sun 2017 (two values) misses the agreement test
        # narrowly (1.93 % against its stated 1.71 %), and the maintainer accepted the narrow miss (2026-10-14)
        "vp_accept": {"Sun 2017": 1.93},
        # the archive also has VonNiederhausern et al. (2006): 732.5 K and 5.10 MPa, with larger uncertainties
        "critical": "Wilson, Wilson, et al., 1996",
        "antoine_fit": [],
        # vapour pressure: every set together, each article with the same weight (the rule of 2026-10-14)
        "vp_fit": "consensus",
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
        # its open measured vapour pressures start at 335.85 K and its liquid densities end at 332.7 K (a gap the
        # maintainer accepted, 2026-10-14). Its twelve vapour-pressure sets scatter from -2.7 to +1.9 % around the curve of
        # all of them, seven by more than their stated uncertainties, and no set is singled out by an independent check:
        # the maintainer asked for the best decision to close batch 3 (2026-10-14), so all twelve are pooled with the same
        # weight and the spread is the record's stated uncertainty (about 3 %); the build stops if a set moves further
        "vp_accept": {"Censky 2010": 0.98, "Gnanakumari 2009": 2.72, "Bejarano 2009": 1.85, "Zhou 2017": 1.29,
                      "Vasanta 2018": 1.87, "Cepeda 2011": 1.53, "Lladosa 2008": 1.05},
        "vp_why": ("The twelve measured sets scatter from -2.7 to +1.9 % around this curve, seven of them by more than their "
                   "stated uncertainties, and no independent check singles out one; the record's uncertainty is that "
                   "spread, about 3 %."),
        "critical": "Gude and Teja, 1995",
        "antoine_fit": [],
        # calorimetric values of Majer, Svoboda et al. (1985), 303-358 K, and the evaluation of Majer and Svoboda (1985)
        "dHvap_methods": ["C"], "dHvap_refs": ["Majer and Svoboda, 1985"],
        "cp0": {"tables": ["Stromsoe E., 1970"]},
        # the archive's twelve sets differ by up to 3 %: fitted together with the same weight (the rule of 2026-10-14;
        # until then anchored on Censky et al. 2010 for its smallest stated uncertainty, which the independent checks
        # did not support)
        "vp_fit": "consensus",
    },
    # Nonvolatile components (proposal 0009, step 5; the maintainer, 2026-10-14): no vapour pressure, they stay in the
    # liquid; where no open measured heat capacity exists it is predicted by group additivity (predict_cp.py), tier
    # "predicted", as the maintainer decided ("definitely not refuse ... there should be some data or predicted")
    "lactic-acid": {
        "class": "nonvolatile",
        "why_nonvolatile": "lactic acid has no open measured vapour pressures and, in the aqueous processes where it "
                           "appears, hardly evaporates (it forms oligomers on heating); CHEPTA keeps it in the liquid",
        "name": "Lactic acid", "cas": "50-21-5", "webbook": "C50215", "proposal": "proposal 0009, step 5",
        "aliases": ["2-hydroxypropanoic acid", "dl-lactic acid", "l-lactic acid", "milk acid"],
        "thermoml_queries": ["lactic acid", "l-lactic acid", "dl-lactic acid", "2-hydroxypropanoic acid",
                             "(2S)-2-hydroxypropanoic acid"],
        # values of either enantiomer and of the racemate count (mirror images have the same thermodynamic properties)
        "inchi_no_stereo": True,
    },
    "hmf": {
        "class": "nonvolatile",
        "why_nonvolatile": "HMF has no open measured vapour pressure curve; the NIST WebBook gives its enthalpy of vaporization (83.4 kJ/mol, Verevkin, Emel'yanenko et al. 2009, from data at 314-368 K) and a boiling temperature of 388.2 K at 0.1 kPa (Weast and Grasselli 1989), where water's is 169.5 kPa (IAPWS-IF97): in the aqueous and solvent processes where it is made and extracted it stays in the liquid. Its vacuum distillation is not represented",
        "name": "5-Hydroxymethylfurfural", "cas": "67-47-0", "webbook": "C67470", "proposal": "proposal 0009, batch 4",
        "aliases": ["hmf", "5-hmf", "5-(hydroxymethyl)furfural", "5-(hydroxymethyl)furan-2-carbaldehyde", "hydroxymethylfurfural"],
        "thermoml_queries": ["5-hydroxymethylfurfural", "5-(hydroxymethyl)furan-2-carbaldehyde", "hydroxymethylfurfural", "5-(hydroxymethyl)-2-furaldehyde"],
    },
    "glucose": {
        "class": "nonvolatile",
        "why_nonvolatile": "sugars and sugar alcohols decompose before they boil; in processes they are dissolved in water or crystallized (proposal 0009)",
        "name": "D-Glucose", "cas": "50-99-7", "webbook": "C50997", "proposal": "proposal 0009, batch 4",
        "aliases": ["glucose", "dextrose", "d-glucopyranose", "grape sugar"],
        "thermoml_queries": ["glucose", "d-glucose", "dextrose", "(2R,3S,4R,5R)-2,3,4,5,6-pentahydroxyhexanal"],
    },
    "fructose": {
        "class": "nonvolatile",
        "why_nonvolatile": "sugars and sugar alcohols decompose before they boil; in processes they are dissolved in water or crystallized (proposal 0009)",
        "name": "D-Fructose", "cas": "57-48-7", "webbook": "C57487", "proposal": "proposal 0009, batch 4",
        "aliases": ["fructose", "levulose", "fruit sugar", "d-fructopyranose"],
        "thermoml_queries": ["fructose", "d-fructose", "levulose", "(3S,4R,5R)-1,3,4,5,6-pentahydroxyhexan-2-one"],
    },
    "sorbitol": {
        "class": "nonvolatile",
        "why_nonvolatile": "sugars and sugar alcohols decompose before they boil; in processes they are dissolved in water or crystallized (proposal 0009); its measured vapour pressure is 1.31 kPa at 523 K (doi:10.1021/je800070y)",
        "name": "D-Sorbitol", "cas": "50-70-4", "webbook": "C50704", "proposal": "proposal 0009, batch 4",
        "aliases": ["sorbitol", "d-glucitol", "glucitol", "hexane-1,2,3,4,5,6-hexol"],
        "thermoml_queries": ["d-sorbitol", "sorbitol", "d-glucitol", "(2r,3r,4r,5s)-hexane-1,2,3,4,5,6-hexol"],
    },
    "xylitol": {
        "class": "nonvolatile",
        "why_nonvolatile": "sugars and sugar alcohols decompose before they boil; in processes they are dissolved in water or crystallized (proposal 0009)",
        "name": "Xylitol", "cas": "87-99-0", "webbook": "C87990", "proposal": "proposal 0009, batch 4",
        "aliases": ["pentane-1,2,3,4,5-pentol", "xylite"],
        "thermoml_queries": ["xylitol", "pentane-1,2,3,4,5-pentol"],
    },
    "erythritol": {
        "class": "nonvolatile",
        "why_nonvolatile": "sugars and sugar alcohols decompose before they boil; in processes they are dissolved in water or crystallized (proposal 0009)",
        "name": "Erythritol", "cas": "149-32-6", "webbook": "C149326", "proposal": "proposal 0009, batch 4",
        "aliases": ["butane-1,2,3,4-tetrol", "meso-erythritol", "1,2,3,4-butanetetrol"],
        "thermoml_queries": ["erythritol", "meso-erythritol", "butane-1,2,3,4-tetrol", "1,2,3,4-butanetetrol"],
    },
    "succinic-acid": {
        "class": "nonvolatile",
        "why_nonvolatile": "most polyacids decompose before they boil; in processes they are dissolved in water or crystallized (proposal 0009)",
        "name": "Succinic acid", "cas": "110-15-6", "webbook": "C110156", "proposal": "proposal 0009, batch 4",
        "aliases": ["butanedioic acid", "amber acid"],
        "thermoml_queries": ["succinic acid", "butanedioic acid"],
    },
    "itaconic-acid": {
        "class": "nonvolatile",
        "why_nonvolatile": "most polyacids decompose before they boil; in processes they are dissolved in water or crystallized (proposal 0009)",
        "name": "Itaconic acid", "cas": "97-65-4", "webbook": "C97654", "proposal": "proposal 0009, batch 4",
        "aliases": ["2-methylidenebutanedioic acid", "methylenesuccinic acid"],
        "thermoml_queries": ["itaconic acid", "2-methylidenebutanedioic acid", "methylenesuccinic acid"],
    },
    "fumaric-acid": {
        "class": "nonvolatile",
        "why_nonvolatile": "most polyacids decompose before they boil; in processes they are dissolved in water or crystallized (proposal 0009)",
        "name": "Fumaric acid", "cas": "110-17-8", "webbook": "C110178", "proposal": "proposal 0009, batch 4",
        "aliases": ["(e)-but-2-enedioic acid", "trans-butenedioic acid"],
        "thermoml_queries": ["fumaric acid", "(e)-but-2-enedioic acid"],
    },
    "malic-acid": {
        "class": "nonvolatile",
        "why_nonvolatile": "most polyacids decompose before they boil; in processes they are dissolved in water or crystallized (proposal 0009)",
        "name": "Malic acid", "cas": "6915-15-7", "webbook": "C6915157", "proposal": "proposal 0009, batch 4",
        "aliases": ["2-hydroxybutanedioic acid", "dl-malic acid", "l-malic acid", "hydroxysuccinic acid"],
        "thermoml_queries": ["malic acid", "dl-malic acid", "l-malic acid", "2-hydroxybutanedioic acid", "2-oxidanylbutanedioic acid"],
        # values of either enantiomer and of the racemate count (one stereocentre: mirror images only)
        "inchi_no_stereo": True,
    },
    "citric-acid": {
        "class": "nonvolatile",
        "why_nonvolatile": "most polyacids decompose before they boil; in processes they are dissolved in water or crystallized (proposal 0009)",
        "name": "Citric acid", "cas": "77-92-9", "webbook": "C77929", "proposal": "proposal 0009, batch 4",
        "aliases": ["2-hydroxypropane-1,2,3-tricarboxylic acid"],
        "thermoml_queries": ["citric acid", "2-hydroxypropane-1,2,3-tricarboxylic acid", "2-oxidanylpropane-1,2,3-tricarboxylic acid"],
    },
    "glycolic-acid": {
        "class": "nonvolatile",
        "why_nonvolatile": "glycolic acid has no open measured vapour pressure and, like lactic acid, condenses with itself to oligomers on heating; in the aqueous processes where it appears CHEPTA keeps it in the liquid",
        "name": "Glycolic acid", "cas": "79-14-1", "webbook": "C79141", "proposal": "proposal 0009, batch 4",
        "aliases": ["hydroxyacetic acid", "2-hydroxyethanoic acid"],
        "thermoml_queries": ["glycolic acid", "hydroxyacetic acid", "2-hydroxyacetic acid", "2-oxidanylethanoic acid"],
    },
    "glucaric-acid": {
        "class": "nonvolatile",
        "why_nonvolatile": "most polyacids decompose before they boil; in processes they are dissolved in water or crystallized (proposal 0009)",
        "name": "D-Glucaric acid", "cas": "87-73-0", "webbook": "C87730", "proposal": "proposal 0009, batch 4",
        "aliases": ["saccharic acid", "glucaric acid"],
        "thermoml_queries": ["glucaric acid", "d-glucaric acid", "saccharic acid"],
    },
    "3-hydroxypropionic-acid": {
        "class": "nonvolatile",
        "why_nonvolatile": "3-hydroxypropionic acid has no open measured vapour pressure; on heating it dehydrates (to acrylic acid) or condenses with itself instead of boiling, so in the aqueous processes where it appears CHEPTA keeps it in the liquid",
        "name": "3-Hydroxypropionic acid", "cas": "503-66-2", "webbook": "C503662", "proposal": "proposal 0009, batch 4",
        "aliases": ["3-hp", "hydracrylic acid", "3-hydroxypropanoic acid"],
        "thermoml_queries": ["3-hydroxypropionic acid", "3-hydroxypropanoic acid", "hydracrylic acid"],
    },
    "fdca": {
        "class": "nonvolatile",
        "why_nonvolatile": "most polyacids decompose before they boil; in processes they are dissolved in water or crystallized (proposal 0009)",
        "name": "2,5-Furandicarboxylic acid", "cas": "3238-40-2", "webbook": "C3238402", "proposal": "proposal 0009, batch 4",
        "aliases": ["fdca", "furan-2,5-dicarboxylic acid", "dehydromucic acid"],
        "thermoml_queries": ["2,5-furandicarboxylic acid", "furan-2,5-dicarboxylic acid"],
    },
    "bhet": {
        "class": "nonvolatile",
        "why_nonvolatile": "BHET has no open measured vapour pressure; on heating it polycondenses (it is the monomer of PET and the product of its glycolysis) instead of boiling, so CHEPTA keeps it in the liquid",
        "name": "Bis(2-hydroxyethyl) terephthalate", "cas": "959-26-2", "webbook": "C959262", "proposal": "proposal 0009, batch 4",
        "aliases": ["bhet", "bis(2-hydroxyethyl) benzene-1,4-dicarboxylate"],
        "thermoml_queries": ["bis(2-hydroxyethyl) terephthalate", "bis(2-hydroxyethyl) benzene-1,4-dicarboxylate"],
    },
    "diphenolic-acid": {
        "class": "nonvolatile",
        "why_nonvolatile": "diphenolic acid has no open measured vapour pressure; a solid used dissolved or as a polymer monomer, it does not evaporate in those processes, so CHEPTA keeps it in the liquid",
        "name": "Diphenolic acid", "cas": "126-00-1", "webbook": "C126001", "proposal": "proposal 0009, batch 4",
        "aliases": ["4,4-bis(4-hydroxyphenyl)pentanoic acid", "dpa"],
        "thermoml_queries": ["diphenolic acid", "4,4-bis(4-hydroxyphenyl)pentanoic acid", "4,4-bis(4-hydroxyphenyl)valeric acid"],
    },
    # identity from PubChem (validation/python/pubchem.py): the chemicals library files D-xylose as dl-xylose (CAS
    # 25990-60-7) and cis,cis-muconic acid without its double-bond geometry (the trans,trans CAS 3588-17-8)
    "xylose": {
        "class": "nonvolatile",
        "why_nonvolatile": "sugars and sugar alcohols decompose before they boil; in processes they are dissolved in water or crystallized (proposal 0009)",
        "name": "D-Xylose", "cas": "58-86-6", "webbook": "C58866", "proposal": "proposal 0009, batch 4",
        "aliases": ["xylose", "wood sugar", "d-xylopyranose", "(2r,3s,4r)-2,3,4,5-tetrahydroxypentanal"],
        "thermoml_queries": ["xylose", "d-xylose", "(2R,3S,4R)-2,3,4,5-tetrahydroxypentanal", "(3R,4S,5R)-oxane-2,3,4,5-tetrol"],
    },
    "muconic-acid": {
        "class": "nonvolatile",
        "why_nonvolatile": "most polyacids decompose before they boil; in processes they are dissolved in water or crystallized (proposal 0009)",
        "name": "cis,cis-Muconic acid", "cas": "1119-72-8", "webbook": "C1119728", "proposal": "proposal 0009, batch 4",
        "aliases": ["muconic acid", "(2z,4z)-hexa-2,4-dienedioic acid", "cis,cis-2,4-hexadienedioic acid"],
        "thermoml_queries": ["muconic acid", "cis,cis-muconic acid", "hexa-2,4-dienedioic acid", "(2Z,4Z)-hexa-2,4-dienedioic acid"],
    },
    # the components held in proposal 0009 for want of an open liquid vapour pressure (2026-10-20). Glycerol carbonate
    # has one after all: the ThermoML Archive names it "glycerine carbonate"
    "glycerol-carbonate": {
        "name": "Glycerol carbonate", "cas": "931-40-8", "webbook": "C931408", "proposal": "proposal 0009",
        "aliases": ["4-(hydroxymethyl)-1,3-dioxolan-2-one", "glycerine carbonate", "glycerol 1,2-carbonate"],
        "thermoml_queries": ["glycerine carbonate", "glycerol carbonate", "4-(hydroxymethyl)-1,3-dioxolan-2-one"],
        "no_critical": ["NIST Chemistry WebBook (no Tc or Pc on its phase-change page)", "NIST TRC ThermoML Archive (no critical temperature or pressure)", "CoolProp 8.0.0 (not a fluid)", "ChemSep v8.3 and v8.31 data 2 (compound not included)", "open literature (web search, 2026-10-20)"],
        "antoine_fit": [],
        "vp_fit": "consensus",
        "dHvap": "clapeyron",
        "dHvap_why": "the calorimetric values on the WebBook (Verevkin et al. 2008; Wilson et al. 2002) are at 298.15 K only",
        "cp0": None,
    },
    "solketal": {
        "class": "no_vapour_pressure",
        "name": 'Solketal', "cas": '100-79-8', "webbook": 'C100798', "proposal": "proposal 0009",
        "aliases": ['(2,2-dimethyl-1,3-dioxolan-4-yl)methanol', 'isopropylidene glycerol', '2,2-dimethyl-1,3-dioxolane-4-methanol'],
        "thermoml_queries": ['solketal', '2,2-dimethyl-1,3-dioxolane-4-methanol', '(2,2-dimethyl-1,3-dioxolan-4-yl)methanol', 'isopropylidene glycerol'],
        "no_critical": ["NIST Chemistry WebBook (no Tc or Pc on its phase-change page)", "NIST TRC ThermoML Archive (no critical temperature or pressure)", "CoolProp 8.0.0 (not a fluid)", "ChemSep v8.3 and v8.31 data 2 (compound not included)", "open literature (web search, 2026-10-20)"],
        "no_vapour_pressure": 'the WebBook lists a normal boiling temperature of 461.7 K from a supplier catalogue (Aldrich Chemical Company Inc., 1990), which is not used (DATA_RULES section 1); the ThermoML Archive has its vapour-liquid data with carbon dioxide only',
    },
    "angelica-lactone": {
        "class": "no_vapour_pressure",
        "name": 'alpha-Angelica lactone', "cas": '591-12-8', "webbook": 'C591128', "proposal": "proposal 0009",
        "aliases": ['5-methylfuran-2(3h)-one', 'alpha-angelica lactone', 'angelica lactone'],
        "thermoml_queries": ['alpha-angelica lactone', 'angelica lactone', '5-methylfuran-2(3H)-one', '2(3H)-furanone, 5-methyl-'],
        "no_critical": ["NIST Chemistry WebBook (no Tc or Pc on its phase-change page)", "NIST TRC ThermoML Archive (no critical temperature or pressure)", "CoolProp 8.0.0 (not a fluid)", "ChemSep v8.3 and v8.31 data 2 (compound not included)", "open literature (web search, 2026-10-20)"],
        "no_vapour_pressure": 'the WebBook lists boiling temperatures at 0.016 bar of a compilation (Weast and Grasselli, 1989, 329.2 K) and a supplier catalogue (American Tokyo Kasei, 1988), which are not used (DATA_RULES section 1)',
    },
    "lactide": {
        "class": "no_vapour_pressure",
        "name": 'Lactide', "cas": '95-96-5', "webbook": 'C95965', "proposal": "proposal 0009",
        "aliases": ['3,6-dimethyl-1,4-dioxane-2,5-dione', 'dilactide', 'rac-lactide'],
        "thermoml_queries": ['lactide', '3,6-dimethyl-1,4-dioxane-2,5-dione', '1,4-dioxane-2,5-dione, 3,6-dimethyl-'],
        "no_critical": ["NIST Chemistry WebBook (no Tc or Pc on its phase-change page)", "NIST TRC ThermoML Archive (no critical temperature or pressure)", "CoolProp 8.0.0 (not a fluid)", "ChemSep v8.3 and v8.31 data 2 (compound not included)", "open literature (web search, 2026-10-20)"],
        "no_vapour_pressure": "the WebBook lists a boiling temperature of 415.2 K at 0.01 bar from a supplier catalogue (Aldrich Chemical Company Inc., 1990), which is not used (DATA_RULES section 1); CAS 95-96-5 does not specify the stereoisomer, and the archive's lactide data are of L-lactide (a different solid), which are not used for it",
    },
    "isosorbide": {
        "class": "no_vapour_pressure",
        "name": 'Isosorbide', "cas": '652-67-5', "webbook": 'C652675', "proposal": "proposal 0009",
        "aliases": ['1,4:3,6-dianhydro-d-glucitol', '1,4:3,6-dianhydro-d-sorbitol'],
        "thermoml_queries": ['isosorbide', '1,4:3,6-dianhydro-D-glucitol', '1,4:3,6-dianhydro-D-sorbitol'],
        "no_critical": ["NIST Chemistry WebBook (no Tc or Pc on its phase-change page)", "NIST TRC ThermoML Archive (no critical temperature or pressure)", "CoolProp 8.0.0 (not a fluid)", "ChemSep v8.3 and v8.31 data 2 (compound not included)", "open literature (web search, 2026-10-20)"],
        "no_vapour_pressure": 'not a WebBook compound; nothing in the ThermoML Archive',
    },
    "levoglucosan": {
        "class": "no_vapour_pressure",
        "name": 'Levoglucosan', "cas": '498-07-7', "webbook": 'C498077', "proposal": "proposal 0009",
        "aliases": ['1,6-anhydro-beta-d-glucopyranose', '1,6-anhydroglucose'],
        "thermoml_queries": ['levoglucosan', '1,6-anhydro-beta-D-glucopyranose'],
        "no_critical": ["NIST Chemistry WebBook (no Tc or Pc on its phase-change page)", "NIST TRC ThermoML Archive (no critical temperature or pressure)", "CoolProp 8.0.0 (not a fluid)", "ChemSep v8.3 and v8.31 data 2 (compound not included)", "open literature (web search, 2026-10-20)"],
        "no_vapour_pressure": 'the ThermoML Archive has sublimation pressures of the crystal (doi:10.1021/je400207t, doi:10.1016/j.jct.2015.01.005), not of the liquid',
    },
    "dimethyl-fdca": {
        "class": "no_vapour_pressure",
        "name": 'Dimethyl 2,5-furandicarboxylate', "cas": '4282-32-0', "webbook": 'C4282320', "proposal": "proposal 0009",
        "aliases": ['dimethyl furan-2,5-dicarboxylate', 'dmfdca', 'fdca dimethyl ester'],
        "thermoml_queries": ['dimethyl 2,5-furandicarboxylate', 'dimethyl furan-2,5-dicarboxylate', '2,5-furandicarboxylic acid, dimethyl ester'],
        "no_critical": ["NIST Chemistry WebBook (no Tc or Pc on its phase-change page)", "NIST TRC ThermoML Archive (no critical temperature or pressure)", "CoolProp 8.0.0 (not a fluid)", "ChemSep v8.3 and v8.31 data 2 (compound not included)", "open literature (web search, 2026-10-20)"],
        "no_vapour_pressure": 'no phase-change data on the WebBook; nothing in the ThermoML Archive',
    },
    "bhmf": {
        "class": "no_vapour_pressure",
        "name": '2,5-Bis(hydroxymethyl)furan', "cas": '1883-75-6', "webbook": 'C1883756', "proposal": "proposal 0009",
        "aliases": ['bhmf', '2,5-furandimethanol', '[5-(hydroxymethyl)furan-2-yl]methanol'],
        "thermoml_queries": ['2,5-bis(hydroxymethyl)furan', '2,5-furandimethanol', 'furan-2,5-diyldimethanol'],
        "no_critical": ["NIST Chemistry WebBook (no Tc or Pc on its phase-change page)", "NIST TRC ThermoML Archive (no critical temperature or pressure)", "CoolProp 8.0.0 (not a fluid)", "ChemSep v8.3 and v8.31 data 2 (compound not included)", "open literature (web search, 2026-10-20)"],
        "no_vapour_pressure": 'not a WebBook compound with phase-change data; nothing in the ThermoML Archive',
    },
    "levoglucosenone": {
        "class": "no_vapour_pressure",
        "name": 'Levoglucosenone', "cas": '37112-31-5', "webbook": 'C37112315', "proposal": "proposal 0009",
        "aliases": ['lgo', '6,8-dioxabicyclo[3.2.1]oct-2-en-4-one'],
        "thermoml_queries": ['levoglucosenone', '6,8-dioxabicyclo[3.2.1]oct-2-en-4-one'],
        "no_critical": ["NIST Chemistry WebBook (no Tc or Pc on its phase-change page)", "NIST TRC ThermoML Archive (no critical temperature or pressure)", "CoolProp 8.0.0 (not a fluid)", "ChemSep v8.3 and v8.31 data 2 (compound not included)", "open literature (web search, 2026-10-20)"],
        "no_vapour_pressure": 'no phase-change data on the WebBook; nothing in the ThermoML Archive',
    },
    "emf": {
        "class": "no_vapour_pressure",
        "name": '5-(Ethoxymethyl)furfural', "cas": '1917-65-3', "webbook": 'C1917653', "proposal": "proposal 0009",
        "aliases": ['emf', 'ethoxymethylfurfural', '5-(ethoxymethyl)furan-2-carbaldehyde'],
        "thermoml_queries": ['5-ethoxymethylfurfural', '5-(ethoxymethyl)furfural', 'ethoxymethylfurfural', '5-(ethoxymethyl)furan-2-carbaldehyde'],
        "no_critical": ["NIST Chemistry WebBook (no Tc or Pc on its phase-change page)", "NIST TRC ThermoML Archive (no critical temperature or pressure)", "CoolProp 8.0.0 (not a fluid)", "ChemSep v8.3 and v8.31 data 2 (compound not included)", "open literature (web search, 2026-10-20)"],
        "no_vapour_pressure": 'no phase-change data on the WebBook; nothing in the ThermoML Archive',
    },
    "terephthalic-acid": {
        "class": "nonvolatile",
        "why_nonvolatile": "the maintainer's choice (2026-10-17): terephthalic acid is kept a liquid that does not evaporate "
                           "up to an assumed melting temperature of 400 degC; it sublimes at 402-404 degC at atmospheric "
                           "pressure (ECHA registration dossier, free to read), and in its liquid-phase processes "
                           "(oxidation and crystallization in acetic acid and water) it does not evaporate. Until 2026-10-17 "
                           "it was a ChemSep component, whose liquid records covered only temperatures above 700 K",
        "name": "Terephthalic acid", "cas": "100-21-0", "webbook": "C100210", "proposal": "the maintainer, 2026-10-17",
        "aliases": ["benzene-1,4-dicarboxylic acid", "pta", "tpa"],
        "thermoml_queries": ["1,4-benzenedicarboxylic acid", "terephthalic acid"],
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
        # vapour pressure: every set together, each article with the same weight (the rule of 2026-10-14)
        # (every set states uncertainties above 1 % except a few values of Mokbel et al. 2012; the sets differ by up to
        # 8 %)
        "vp_fit": "consensus",
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
    C: {"cas", "thermoml_queries"} (default: COMPONENTS[cid]); also used by gap_report.py."""
    from pubchem import chemical as search_chemical  # PubChem where `chemicals` files the compound under another form
    C = C or COMPONENTS[cid]
    meta = search_chemical(C["cas"])
    if meta.CASs != C["cas"]:
        raise SystemExit("%s: CAS %s does not match chemicals (%s)" % (cid, C["cas"], meta.CASs))
    inchi = norm_inchi(meta.InChI)
    # "inchi_no_stereo": the archive's values of either enantiomer count (mirror images have the same thermodynamic
    # properties; limonene); the stereo layers of the InChI are ignored
    unstereo = lambda s: re.sub(r"/[tmsb][^/]*", "", s)  # noqa: E731
    if C.get("inchi_no_stereo"):
        inchi = unstereo(inchi)
    dois = sorted({h["content"]["Citation"]["sDOI"] for q in C["thermoml_queries"] for h in thermoml_search(q)})
    cache.mkdir(parents=True, exist_ok=True)
    rows, articles = [], {}
    for doi in dois:
        f = cache / (doi.replace("/", "_") + ".xml")
        if not f.exists():
            f.write_bytes(get("https://trc.nist.gov/ThermoML/%s.xml" % doi))
        rec = thermoml_read.parse(f.read_bytes())
        mine = [n for n, c in rec["compounds"].items()
                if (unstereo(norm_inchi(c["inchi"])) if C.get("inchi_no_stereo") else norm_inchi(c["inchi"])) == inchi]
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
        out = [num(r[1]) + (r[2], r[3], r[4]) for r in (t["rows"] if t else []) if r[0] == quantity]
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
        # a component that melts near room temperature: the archive labels the liquid values of some articles
        # "Metastable liquid" (below the melting point, and for some articles over their whole range); "metastable_liquid"
        # in COMPONENTS accepts them as liquid values
        self.metastable = COMPONENTS.get(cid, {}).get("metastable_liquid", False)

    def origin(self, pts):
        """Where the values come from, for a record's source name and access text."""
        used = {p["doi"] for p in pts if p.get("doi")}
        arts = sorted(used & self.from_article)
        if not arts:
            return "NIST TRC ThermoML Archive", "open data (NIST TRC ThermoML Archive), free to read even where the article is not"
        what = "an article outside the archive" if len(arts) == 1 else "%d articles outside the archive" % len(arts)
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
            if record == "vapourPressure" and spec and spec[0] == "boilingT" and r["P_kPa"]:
                # a boiling temperature at a stated pressure: the vapour pressure P at T; its stated uncertainty is on
                # T, so the relative uncertainty of P is not stated (None: 1 % in the pooled fit)
                key = (r["doi"], r["value"], r["P_kPa"])
                if key not in seen:
                    seen.add(key)
                    out.append({"T": r["value"], "y": 1000.0 * r["P_kPa"], "u_rel": None, "ref": self.short(r["doi"]),
                                "doi": r["doi"], "from": "article" if r["doi"] in self.from_article else "ThermoML",
                                "set": r.get("set"), "boiling": True})
                continue
            if not spec or spec[0] != record:
                continue
            if spec[2] and spec[2] not in r["phases"] and not (
                    self.metastable and spec[2] == "Liquid" and "Metastable liquid" in r["phases"]):
                continue
            if record not in ("vapourPressure", "Tb", "Tc", "Pc") and r["P_kPa"] is not None and r["P_kPa"] > pmax:
                continue
            # a liquid property measured with a gas phase present is left out, except the surface tension, whose
            # liquid-gas values the archive lists with both phases (against the liquid's own vapour; against air at
            # 1 atm it lists "Air at 1 atmosphere"); until 2026-10-17 these were left out too
            if record in ("liquidDensity", "liquidHeatCapacity", "liquidViscosity") and "Gas" in r["phases"]:
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


def fit_consensus(cid, prop, form, pts, fixed=(), exclude=None, floor=0.005, none_u=0.01, Tc=None, accept=None):
    """The rule of 2026-10-14 (docs/decisions/2026-10-14-07-...): a small stated uncertainty is the authors' claim,
    not proof, so no set is preferred for it; the sets are pooled only when they agree (each set's mean deviation from
    the pooled curve within its mean stated uncertainty), else the build stops and asks for a set to be chosen or left
    out with a stated reason. Every set is fitted together, each paper with the same total weight
    (point weight 1 / (u sqrt(n_set)), u the stated uncertainty with a floor of 0.5 %, 1 % where none is stated), with
    the fixed points (critical point). A whole set is left out only with a physical reason stated in COMPONENTS
    ("vp_exclude": {set: reason}); a single value only when the fit misses it by more than three times its
    uncertainty: fit, keep every value within three times its uncertainty of that fit, fit again, until the values
    kept no longer change (at most a third left out). Of the DIPPR 101 variants, the fewest coefficients whose weighted
    residual is within 10 % of the best one and whose enthalpy of vaporization (ideal gas, R T^2 dlnP/dT) falls with
    temperature over the measured range below 0.7 Tc (above it the real-gas factor makes the ideal-gas value rise).
    A set that misses the agreement test narrowly may be pooled when the maintainer accepted it ("vp_accept":
    {set: the mean deviation accepted, %}); the build still stops if the set's mean deviation grows beyond that.
    Returns coeffs, the values used, the values left out, the maximum deviation, each set's mean deviation (%) and the
    accepted misses (text)."""
    exclude = exclude or {}
    cand = [p for p in pts if p["ref"] not in exclude]
    by_set = [dict(p, why=exclude[p["ref"]]) for p in pts if p["ref"] in exclude]
    u_of = lambda p: max(p["u_rel"] if p["u_rel"] else none_u, floor)  # noqa: E731

    def fit(use):
        cnt = collections.Counter(p["ref"] for p in use)
        T = np.array([p["T"] for p in use] + [p["T"] for p in fixed])
        y = np.array([p["y"] for p in use] + [p["y"] for p in fixed])
        w = np.array([1 / (u_of(p) * math.sqrt(cnt[p["ref"]])) for p in use] + [1 / 0.001] * len(fixed))
        Td = np.array([p["T"] for p in use])
        hi = min(Td.max(), 0.7 * Tc) if Tc else Td.max()
        grid = np.linspace(Td.min(), max(hi, Td.min() + 1), 50)
        fits = []
        for k in complexities(form, T):
            c = fit_ls(form, T, y, None, k, w)
            r = float(np.sqrt(np.mean((w * np.log(ev(form, c, T) / y)) ** 2)))
            lnp = np.log(ev(form, c, grid))
            dh = grid[1:-1] ** 2 * (lnp[2:] - lnp[:-2]) / (grid[2:] - grid[:-2])
            fits.append((c, r, bool(np.all(np.diff(dh) < 0))))
        ok = [f for f in fits if f[2]]
        if not ok:
            raise SystemExit("%s %s: no DIPPR 101 variant with an enthalpy of vaporization falling with temperature" % (cid, prop))
        best = min(f[1] for f in ok)
        return next(f[0] for f in ok if f[1] <= 1.1 * best)

    dev = lambda c, p: float(ev(form, c, np.array([p["T"]]))[0]) / p["y"] - 1  # noqa: E731
    use, seen = list(cand), []
    for _ in range(30):
        c = fit(use)
        new = [p for p in cand if abs(dev(c, p)) <= 3 * u_of(p)]
        key = frozenset(id(p) for p in new)
        if len(new) < 2 * len(cand) / 3:
            raise SystemExit("%s %s: more than a third of the values would be left out; the data disagree" % (cid, prop))
        if key == frozenset(id(p) for p in use) or key in seen:
            use = new
            break
        seen.append(frozenset(id(p) for p in use))
        use = new
    c = fit(use)
    coeffs = {k: rnd(v) for k, v in c.items() if k in "ABCDE"}
    kept = {id(p) for p in use}
    excluded = by_set + [dict(p, why="more than three times its stated uncertainty from the fit of all the sets")
                         for p in cand if id(p) not in kept]
    m = rel_dev(ev(form, coeffs, np.array([p["T"] for p in use])), np.array([p["y"] for p in use]))
    for p in excluded:
        p["deviation_percent"] = round(100 * dev(coeffs, p), 2)
    sets = collections.defaultdict(list)
    for p in use:
        sets[p["ref"]].append((100 * dev(coeffs, p), 100 * u_of(p)))
    # pooled only when the sets agree (the maintainer's rule, 2026-10-14): each set's mean deviation from the pooled
    # curve within its mean stated uncertainty; otherwise a set has to be chosen, or left out, with a stated reason
    disagree = ["%s (mean deviation %+.2f %%, mean stated uncertainty %.2f %%)" % (k, np.mean([d for d, _ in v]),
                                                                              np.mean([u for _, u in v]))
                for k, v in sets.items() if abs(np.mean([d for d, _ in v])) > np.mean([u for _, u in v])
                and not (k in (accept or {}) and abs(np.mean([d for d, _ in v])) <= accept[k] + 0.05)]
    accepted = ["%s (mean deviation %+.2f %%, mean stated uncertainty %.2f %%)" % (k, np.mean([d for d, _ in v]),
                                                                              np.mean([u for _, u in v]))
                for k, v in sets.items() if k in (accept or {}) and abs(np.mean([d for d, _ in v])) > np.mean([u for _, u in v])]
    if disagree:
        raise SystemExit("%s %s: the sets disagree, so they are not pooled: %s; choose or leave out a set with a stated "
                         "reason (vp_exclude)" % (cid, prop, "; ".join(disagree)))
    return (coeffs, use + list(fixed), excluded, m, {k: float(np.mean([d for d, _ in v])) for k, v in sets.items()},
            accepted)


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


def fit_or_marker(cid, prop, form, target, pts, records, points, log, Tc, tml, searched, name, access, loose=True):
    """A fitted record when at least three temperatures have values within the target uncertainty; else, by the rule
    "measured before predicted" (docs/DATA_RULES.md, section 10; for every property since 2026-10-17), a record of the
    measured values whose stated uncertainties are above the target, held to those uncertainties and saying so
    (`stated_uncertainty_percent`), when they cover three temperatures; else a "no open data" marker that says what
    there is."""
    ok = [p for p in pts if p["u_rel"] is None or p["u_rel"] <= target]
    temps = {round(p["T"], 1) for p in ok if not p.get("webbook_single")}
    if len(temps) >= 2 and len({round(p["T"], 1) for p in ok}) >= 3:
        coeffs, use, exc, m = fit_measured(cid, prop, form, pts, target, Tc=Tc)
        if tml is not None and access == THERMOML_ACCESS and "(NIST TRC ThermoML Archive)" in name:
            # values of articles outside the archive (article_<id>_*.json) are named as such, with their access
            where, access = tml.origin(use)
            name = name.replace("(NIST TRC ThermoML Archive)", "(%s)" % where)
        records[prop], points[prop] = record(
            prop, form, coeffs, use, exc, m, Tc, name,
            refs_of([p for p in use if p.get("doi")], tml) + sorted({p["ref"] for p in use if not p.get("doi")}), access)
        log.append("%-17s %-25s %3d values, %d left out, max dev %s %%" % (cid, prop, len(use), len(exc), pct(m)))
        return
    stated = [p for p in pts if p["u_rel"] is not None]
    if loose and len({round(p["T"], 1) for p in stated}) >= 3 and max(p["u_rel"] for p in stated) > target:
        u = max(p["u_rel"] for p in stated)
        why = "the only alternative is a prediction" if prop == "liquidHeatCapacity" else "no open values meet the target"
        fit_or_marker(cid, prop, form, u, pts, records, points, log, Tc, tml, searched,
                      "%s; stated uncertainties up to %.1f %%, above the %g %% target, used because %s" % (
                          name, 100 * u, 100 * target, why), access, loose=False)
        if records[prop].get("available") is not False:
            # the target this record is held to, in place of the usual one (test/properties.test.js reads it)
            records[prop]["source"]["stated_uncertainty_percent"] = rnd(100 * u, 3)
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


def cp_measured_or_predicted(cid, cps, records, points, log, Tc, tml, searched, name=None, access=None, Tb=None):
    """Where the liquid heat capacity has no record at the 1 % target (fit_or_marker), the rule "measured before
    predicted" (docs/DATA_RULES.md, section 10; the maintainer, 2026-10-16): measured values whose stated uncertainty is
    above the target make the record, with that uncertainty stated, when they cover three temperatures; else the
    group-additivity prediction (predict_cp.py, tier "predicted") where the component's groups are written there.
    Without either the "no open data" marker stays."""
    import predict_cp
    name = name or "Measured heat capacities of the liquid (NIST TRC ThermoML Archive)"
    access = access or THERMOML_ACCESS
    if records["liquidHeatCapacity"].get("available") is False:
        # measured values above the target first (fit_or_marker; where the caller has already called it, the same
        # marker again)
        fit_or_marker(cid, "liquidHeatCapacity", "DIPPR100", 0.01, cps, records, points, log, Tc, tml, searched, name, access)
    single = COMPONENTS.get(cid, {}).get("cp_single_values")
    if records["liquidHeatCapacity"].get("available") is False and single and cid not in predict_cp.PREDICT:
        # no group-additivity prediction and no values over a range: the single values of several articles, as a
        # constant over the temperatures they span, by the maintainer's decision (dichloromethane, 2026-10-18); held to
        # their largest deviation from the mean, which the record states
        use = [p for p in cps if p["ref"] not in single["leave_out"]]
        A = float(np.mean([p["y"] for p in use]))
        for p in use:
            p["deviation_percent"] = rnd(100 * (p["y"] / A - 1), 3)
        exc = [dict(p, deviation_percent=rnd(100 * (p["y"] / A - 1), 3), why=single["leave_out"][p["ref"]])
               for p in cps if p["ref"] in single["leave_out"]]
        m = max(abs(p["y"] / A - 1) for p in use)
        records["liquidHeatCapacity"], points["liquidHeatCapacity"] = record(
            "liquidHeatCapacity", "DIPPR100", {"A": rnd(A, 6)}, use, exc, m, Tc,
            "%s; measured at single temperatures only, so the record is their mean, a constant, by the maintainer's "
            "decision (%s); their deviations from it, up to %s %%, are above the 1 %% target, used because no open "
            "values meet the target" % (name, single["decided"], pct(m)),
            refs_of([p for p in use if p.get("doi")], tml) + sorted({p["ref"] for p in use if not p.get("doi")}), access,
            notes=single["notes"])
        # the deviation as the fit text prints it, which the test compares with
        records["liquidHeatCapacity"]["source"]["stated_uncertainty_percent"] = float(pct(m))
        if single.get("to_Tb") and Tb and Tb > records["liquidHeatCapacity"]["Tmax_K"]:
            # extended to the normal boiling point, so that the liquid at 1 atm is covered (the maintainer's decision)
            hi = records["liquidHeatCapacity"]["Tmax_K"]
            records["liquidHeatCapacity"]["Tmax_K"] = Tb
            records["liquidHeatCapacity"]["source"]["notes"] += (
                " Extended from %g K to the normal boiling point, %.1f K, by the maintainer's decision (%s): the "
                "constant is used %.0f K beyond the measured temperatures." % (hi, Tb, single["to_Tb"], Tb - hi))
        log.append("%-17s liquidHeatCapacity        constant from %d single values, max dev %s %%" % (cid, len(use), pct(m)))
    rec = records["liquidHeatCapacity"]
    if rec.get("available") is not False and rec["source"].get("stated_uncertainty_percent") and cid in predict_cp.PREDICT:
        _, (lo, hi) = predict_cp.coefficients(predict_cp.PREDICT[cid]["groups"])
        T = np.array(sorted({p["T"] for p in cps if lo <= p["T"] <= hi and rec["Tmin_K"] <= p["T"] <= rec["Tmax_K"]}))
        if len(T):
            dev = 100 * (predict_cp.cp(predict_cp.PREDICT[cid]["groups"], T) / ev(rec["equation"], rec["coefficients"], T) - 1)
            rec["source"]["notes"] = ("The group-additivity prediction (Ruzicka and Domalski 1993, predict_cp.py) would be "
                                      "%+.0f to %+.0f %% from this record at the measured temperatures within its groups' "
                                      "range, %.0f-%.0f K." % (min(dev), max(dev), T[0], T[-1]))
    if records["liquidHeatCapacity"].get("available") is False and cid in predict_cp.PREDICT:
        why = "No open measured liquid heat capacity over a temperature range (searched: %s)" % "; ".join(searched)
        if cps:
            why += "; the measured values there are: %s" % "; ".join(
                "%.4g J/(mol K) at %.2f K (%s, stated uncertainty %s), the prediction %+.0f %% from it" % (
                    p["y"], p["T"], p["ref"], "%.1f %%" % (100 * p["u_rel"]) if p["u_rel"] is not None else "not stated",
                    100 * (predict_cp.cp(predict_cp.PREDICT[cid]["groups"], p["T"]) / p["y"] - 1)) for p in cps)
        records["liquidHeatCapacity"] = predict_cp.predicted_record(cid, why)
        log.append("%-17s liquidHeatCapacity        predicted (Ruzicka-Domalski), %g-%g K" % (
            cid, records["liquidHeatCapacity"]["Tmin_K"], records["liquidHeatCapacity"]["Tmax_K"]))


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
    Tc, Pc, who (the reference), where (the source) and the sentence for constants_source. A component with no
    measured critical constants in any open source ("no_critical": the sources searched) gets None for both: it is used
    with activity models and an ideal-gas vapour only (proposal 0009; src/thermo/critical.js)."""
    if "no_critical" in C:
        return None, None, None, None, ("Tc and Pc: no measured values in the open sources (searched: %s); not estimated, "
                                        "so the component is used with activity models and an ideal-gas vapour only "
                                        "(proposal 0009)" % "; ".join(C["no_critical"]))
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


def clapeyron_ideal(psat, Tlo, Thi, n=25):
    """Without critical constants: the Clapeyron equation with an ideal-gas vapour, dHvap = R T^2 dln(Psat)/dT, at
    low pressure (the caller keeps Psat at or below 10 kPa), where the liquid volume is negligible against the vapour's
    (the caller states the largest P v_L / R T from the density record)."""
    out = []
    for T in np.linspace(Tlo, Thi, n):
        h = 1e-3 * T
        out.append({"T": float(T), "y": float(8.314462618 * T * T * (math.log(psat(T + h)) - math.log(psat(T - h))) / (2 * h)),
                    "u_rel": None, "doi": None, "ref": "Clapeyron equation with the vapour-pressure record (ideal-gas vapour)"})
    return out


def dh_clapeyron_ideal(cid, C, wb, tml, measured, psat, Tlow, Tdata, records, points, log, wb4, MW):
    """dh_clapeyron without critical constants: Clapeyron values with an ideal-gas vapour, from the lowest measured
    vapour pressure up to where Psat reaches 10 kPa or the last measured vapour pressure, fitted (DIPPR 100, a
    polynomial in T) together with the calorimetric values, which are never left out and must be met within their
    stated uncertainty (1 % where none is stated)."""
    T10 = brentq(lambda T: psat(T) - 1e4, Tlow, Tdata) if psat(Tdata) > 1e4 else Tdata
    Thi = min(T10, Tdata)
    pts = clapeyron_ideal(psat, Tlow, Thi)
    fixed = [p for p in measured if (p.get("method") == "C" or p.get("doi")) and (p["u_rel"] is None or p["u_rel"] <= 0.02)]
    fixed = [p for p in fixed if Tlow - 30 <= p["T"] <= Thi + 30]
    coeffs, use, exc, m = fit_measured(cid, "heatOfVaporization", "DIPPR100", pts, 0.01, fixed=fixed)
    f = lambda T: float(ev("DIPPR100", coeffs, np.array([T]))[0])  # noqa: E731
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
    # the liquid volume neglected: the largest P v_L / R T over the range, from the density record where it applies
    rho = records.get("liquidDensity")
    vl = []
    if rho and rho.get("equation"):
        for T in np.linspace(max(Tlow, rho["Tmin_K"]), min(Thi, rho["Tmax_K"]), 5):
            r = float(ev(rho["equation"], rho["coefficients"], np.array([T]), rho.get("Tc_K"))[0])
            vl.append(psat(T) * (MW / 1000 / r) / (8.314462618 * T))
    vl_text = ("largest P v_L / R T %.2g where the density record applies" % max(vl)) if vl else "no liquid density in this range"
    records["heatOfVaporization"], points["heatOfVaporization"] = record(
        "heatOfVaporization", "DIPPR100", coeffs, use, exc, m, None,
        "Clapeyron equation with the vapour-pressure record (measured values of the NIST TRC ThermoML Archive and the "
        "NIST Chemistry WebBook) and an ideal-gas vapour; and measured values (NIST Chemistry WebBook)",
        ["validation/python/measured_components.py (clapeyron_ideal)"] + sorted({p["ref"] for p in fixed}),
        "calculated from the open measured data of the vapour-pressure record; " + WEBBOOK_ACCESS + " (%s)" % wb4,
        notes=("No measured critical constants (proposal 0009): dHvap = R T^2 dln(Psat)/dT, the Clapeyron equation with "
               "an ideal-gas vapour and the liquid volume neglected (%s), Psat from the vapour-pressure record of this "
               "component, %.2f-%.2f K (up to Psat = 10 kPa or the last measured vapour pressure); DIPPR 100 (a "
               "polynomial in T). Chosen because %s. Measured values (calorimetric ones fitted with weight 10 and never "
               "left out, met within their stated uncertainty, 1 %% where none is stated; the others compared): %s." % (
                   vl_text, Tlow, Thi, C["dHvap_why"], "; ".join(checks) if checks else "none")))
    for d in (records["heatOfVaporization"]["source"], points["heatOfVaporization"]["source"]):
        d["fit"] = d["fit"].replace("%d measured values" % len(use), "%d Clapeyron values and %d measured values" % (
            len(use) - len(fixed), len(fixed)))
    log.append("%-17s heatOfVaporization        Clapeyron (ideal gas), %d values, max dev %s %%; calorimetric: %s" % (
        cid, len(use), pct(m), "; ".join(checks) or "none"))


def dh_measured(cid, C, wb, tml, pts, Tc, records, points, log, wb4):
    """The enthalpy-of-vaporization record fitted to the chosen measured values (calorimetric, critically evaluated)."""
    form = "DIPPR106" if Tc else "DIPPR100"  # without critical constants a polynomial in T over the measured range
    coeffs, use, exc, m = fit_measured(cid, "heatOfVaporization", form, pts, 0.01, Tc=Tc)
    others = [e for e in wb.dhvap() if not (e["method"] in C["dHvap_methods"] or e["reference"] in C["dHvap_refs"])]
    cross = ["%s at %.0f K: %+.1f %%" % (e["reference"], e["T_K"], 100 * (float(ev(form, coeffs, np.array([e["T_K"]]), Tc)[0]) / (1000 * e["value"]) - 1))
             for e in others]
    records["heatOfVaporization"], points["heatOfVaporization"] = record(
        "heatOfVaporization", form, coeffs, use, exc, m, Tc,
        "Measured enthalpies of vaporization (NIST Chemistry WebBook; calorimetric and critically evaluated values)",
        [p["ref"] for p in use], WEBBOOK_ACCESS + " (%s)" % wb4,
        notes=("%s. Values derived from vapour pressures, compared with the record (not fitted): %s." % (
            "DIPPR 106 with the critical temperature %.2f K" % Tc if Tc else "DIPPR 100 (no measured critical temperature)",
            "; ".join(cross) if cross else "none")))
    log.append("%-17s heatOfVaporization        %3d values, %d left out, max dev %s %%" % (cid, len(use), len(exc), pct(m)))


def dh_clapeyron(cid, C, wb, tml, measured, psat, Tlow, Tdata, Tc, Pc, omega, records, points, log, wb4):
    """Where the measured enthalpies of vaporization do not give the temperature dependence (one temperature, or
    none): the record is fitted to Clapeyron values from the vapour-pressure record, from its lowest temperature up to
    where Psat reaches 500 kPa (low enough that the Peng-Robinson vapour volume is close to the real one), together
    with the calorimetric values (WebBook method C, and the ThermoML Archive), which are never left out and must be met
    within their stated uncertainty (1 % where none is stated); the record meets the Clapeyron values it keeps within
    1 %. The other chosen values (critically evaluated) and those of the WebBook page (most derived by their authors
    from vapour pressures) are compared with the record."""
    T500 = brentq(lambda T: psat(T) - 5e5, Tlow, Tc - 1)
    Thi = min(T500, Tdata)
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
               "MIT), %.2f-%.2f K (%s); DIPPR 106 with the critical temperature %.2f K. Chosen because "
               "the measured values do not give the temperature dependence (%s). Max deviation from the Clapeyron "
               "values %s %%. Measured values (calorimetric ones fitted with weight 10 and never left out, met within "
               "their stated uncertainty, 1 %% where none is stated; the others compared): %s. Other values on the WebBook page (most derived by "
               "their authors from vapour pressures), compared: %s." % (
                   min(p["T"] for p in use if p not in fixed), max(p["T"] for p in use if p not in fixed),
                   "up to Psat = 500 kPa" if T500 <= Tdata else "up to the last measured vapour pressure", Tc,
                   C["dHvap_why"], pct(mc), "; ".join(checks) if checks else "none", "; ".join(derived) if derived else "none")))
    for d in (records["heatOfVaporization"]["source"], points["heatOfVaporization"]["source"]):
        d["fit"] = d["fit"].replace("%d measured values" % len(use), "%d Clapeyron values and %d measured values" % (
            len(use) - len(fixed), len(fixed)))
    log.append("%-17s heatOfVaporization        Clapeyron, %d values, max dev %s %%; calorimetric: %s" % (
        cid, len(use), pct(m), "; ".join(checks) or "none"))


def build(cid, log):
    from pubchem import chemical as search_chemical  # PubChem where `chemicals` files the compound under another form
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
    nocrit = Tc is None  # no measured critical constants: the curve covers the measured range only
    crit = None if nocrit else {"T": Tc, "y": Pc, "u_rel": None, "ref": "%s (critical point, %s)" % (crit_who, crit_where), "doi": None}
    # "vp_tb": the normal boiling temperature as a vapour pressure of 101.325 kPa, fitted like the critical point (never
    # left out), where the measured vapour pressures stop well below it: "thermoml" (the archive's measured values) or
    # the reference of a WebBook Tboil row
    tbp = []
    if C.get("vp_tb") == "thermoml":
        tbp = [{"T": p["y"], "y": 101325.0, "u_rel": None, "doi": None,
                "ref": "%s (normal boiling temperature, NIST TRC ThermoML Archive)" % tml.cite(p["doi"])}
               for p in tml.values("Tb")]
    elif C.get("vp_tb"):
        tbp = [{"T": v, "y": 101325.0, "u_rel": None, "doi": None,
                "ref": "%s (normal boiling temperature, NIST WebBook)" % ref}
               for v, u, unit, method, ref in wb.constants("Tboil") if ref == C["vp_tb"] and unit == "K"]
    if C.get("vp_tb") and len(tbp) != 1:
        raise SystemExit("%s: %d normal boiling temperatures for vp_tb %s" % (cid, len(tbp), C["vp_tb"]))
    fix = ([] if nocrit else [crit]) + tbp
    kept = []
    if C.get("vp_fit") == "loose":
        # few values within the target: those with larger stated uncertainties confirm the fit where it meets them
        coeffs, use, kept, exc, m = fit_measured_loose(cid, "vapourPressure", "DIPPR101", pts, 0.01, fixed=fix)
    elif C.get("vp_fit") == "anchor":
        # the sets disagree beyond their stated uncertainties: the set with the smallest ones ("vp_anchor") and the
        # critical point are fitted; every other value is kept as confirmation where the fit meets it within its own
        # stated uncertainty, else listed as left out
        anchor = [p for p in pts if p["ref"] in C["vp_anchor"]]
        coeffs, use, exc, m = fit_measured(cid, "vapourPressure", "DIPPR101", anchor, 0.01, fixed=fix)
        for p in pts:
            if p["ref"] in C["vp_anchor"]:
                continue
            d = float(ev("DIPPR101", coeffs, np.array([p["T"]]))[0]) / p["y"] - 1
            if p["u_rel"] is not None and abs(d) <= p["u_rel"]:
                kept.append(dict(p, deviation_percent=round(100 * d, 2)))
            else:
                exc.append(dict(p, deviation_percent=round(100 * d, 2),
                                why="deviates by more than its stated uncertainty from the fit of %s" % " and ".join(C["vp_anchor"])))
    elif C.get("vp_fit") == "consensus":
        # every set together, each paper with the same weight (the rule of 2026-10-14)
        coeffs, use, exc, m, set_dev, accepted = fit_consensus(cid, "vapourPressure", "DIPPR101", pts, fixed=fix,
                                                               exclude=C.get("vp_exclude"), Tc=Tc,
                                                               accept=C.get("vp_accept"))
    elif C.get("vp_fit") == "within":
        # no set within the target over the range: every value fitted within its own stated uncertainty
        coeffs, use, exc, m = fit_within_uncertainty(cid, "vapourPressure", "DIPPR101", pts, fixed=fix)
    else:
        coeffs, use, exc, m = fit_measured(cid, "vapourPressure", "DIPPR101", pts, 0.01, fixed=fix)
    coeffs.setdefault("D", 0.0)
    coeffs.setdefault("E", 0.0)
    refs = refs_of([p for p in use if p.get("doi")], tml) + sorted({p["ref"] for p in use if not p.get("doi")})
    Tdata = max(p["T"] for p in use + kept if p is not crit)
    Tlow = min(p["T"] for p in use + kept)
    n_art = sum(1 for p in use if p.get("from") == "article")
    vp_fit = ("%d measured values (%d from the ThermoML Archive%s)%s%s, %.2f-%.2f K, max deviation %s %%%s. %s"
              % (len(use), sum(1 for p in use if p.get("from") == "ThermoML"),
                 ", %d from open-access articles" % n_art if n_art else "",
                 ", the normal boiling temperature %.2f K (%s, fitted as 101.325 kPa, never left out)" % (
                     tbp[0]["T"], tbp[0]["ref"]) if tbp else "", "" if nocrit else " and the critical point",
                 min(p["T"] for p in use), Tdata if nocrit else Tc, pct(m),
                 ", each within its own stated uncertainty" if C.get("vp_fit") == "within" else "",
                 "No measured critical constants: the record covers the measured temperatures only." if nocrit else
                 "Between %.2f K and the critical point the curve is held only by the critical point." % Tdata))
    if C.get("vp_fit") == "consensus":
        vp_fit += (" All the measured sets fitted together, each article with the same weight (no set preferred for a "
                   "smaller stated uncertainty), pooled because they agree: each set lies within its mean stated "
                   "uncertainty of the curve on average%s; mean deviation of the fit from each set: %s." % (
                       ", except a narrow miss the maintainer accepted (2026-10-14): %s" % "; ".join(accepted)
                       if accepted else "",
                       "; ".join("%s %+.2f %%" % (k, v) for k, v in sorted(set_dev.items()))))
        tight = [abs(float(ev("DIPPR101", coeffs, np.array([p["T"]]))[0]) / p["y"] - 1) for p in use
                 if p.get("u_rel") is not None and p["u_rel"] <= 0.10]
        loose = [p for p in use if p.get("u_rel") is not None and p["u_rel"] > 0.10]
        if loose and tight:
            vp_fit += (" The largest deviations are at values whose stated uncertainty exceeds 10 %% (%d values, %.2g-%.2g %%); "
                       "among the values stated within 10 %%, the largest deviation is %s %%." % (
                           len(loose), 100 * min(p["u_rel"] for p in loose), 100 * max(p["u_rel"] for p in loose),
                           pct(max(tight))))
    if C.get("vp_why"):
        vp_fit += " " + C["vp_why"]
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
          **{k: coeffs[k] for k in "ABCDE"}, "Tmin_K": rnd(Tlow, 8), "Tmax_K": rnd(Tdata if nocrit else Tc, 8),
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
    if nocrit and psat(vp["Tmax_K"]) < 101325.0:
        Tb = None  # the measured vapour pressures stay below 101.325 kPa
    else:
        Tb = float("%.7g" % brentq(lambda T: psat(T) - 101325.0, vp["Tmin_K"], vp["Tmax_K"] if nocrit else Tc - 1))
    omega = None if nocrit else float("%.6g" % (-math.log10(psat(0.7 * Tc) / Pc) - 1))
    tb_measured = [(p["y"], p["ref"]) for p in tml.values("Tb")]
    vp_pts["Tb_K_at_101325Pa"] = Tb
    # independent checks of the curve (not fitted): the measured normal boiling temperatures, and the slope against
    # the calorimetric enthalpies of vaporization (Clapeyron, Peng-Robinson volumes) inside the curve's range
    if C.get("vp_fit") == "consensus":
        chk = []
        tbs = [t for t, ref in tb_measured if not (C.get("vp_tb") == "thermoml")]
        if tbs and not Tb:
            T0 = float(np.median(tbs))
            if vp["Tmin_K"] <= T0 <= vp["Tmax_K"]:
                chk.append("at the measured normal boiling temperature %.2f K (%d articles) the record gives %.2f kPa, %+.1f %% "
                           "from 101.325 kPa" % (T0, len(tbs), psat(T0) / 1000, 100 * (psat(T0) / 101325.0 - 1)))
        if tbs and Tb:
            chk.append("normal boiling temperature %.2f K against the measured %.2f-%.2f K (%d articles, median %.2f K)" % (
                Tb, min(tbs), max(tbs), len(tbs), float(np.median(tbs))))
        avg = [(v, u) for v, u, unit, method, ref in wb.constants("Tboil") if method == "AVG" and unit == "K"]
        if avg and Tb:
            chk.append("normal boiling temperature %.2f K against the WebBook average of the measured values, %g +/- %g K" % (
                Tb, avg[0][0], avg[0][1]))
        cal = [(e["T_K"], 1000 * e["value"], e["reference"]) for e in wb.dhvap() if e["method"] == "C"]
        cal += [(p["T"], p["y"], p["ref"]) for p in tml.values("heatOfVaporization") if p["u_rel"] and p["u_rel"] <= 0.02]
        cal = [c for c in cal if vp["Tmin_K"] <= c[0] <= Tdata]
        if cal:
            d = [100 * ((clapeyron_ideal(psat, T0, T0, 1) if nocrit else clapeyron(cid, C, psat, T0, T0, Tc, Pc, omega))[0]["y"] / v - 1)
                 for T0, v, _ in cal]
            chk.append("enthalpy of vaporization from the curve's slope against %d calorimetric values (%s): %+.1f to %+.1f %%" % (
                len(cal), "; ".join(sorted({r for _, _, r in cal})), min(d), max(d)))
        if chk:
            vp["source"] += " Independent checks (not fitted): %s." % "; ".join(chk)
            vp_pts["source"]["fit"] = vp_fit

    # liquid density
    pts = tml.values("liquidDensity")
    rho_form = "DIPPR100" if nocrit else "DIPPR105"
    if not pts:
        # no open liquid density at all (glycerol carbonate, 2026-10-20): the "no open data" marker; phase equilibrium
        # with an activity model and an ideal-gas vapour does not need it
        fit_or_marker(cid, "liquidDensity", rho_form, 0.01, pts, records, points, log, Tc, tml, searched_common,
                      "Measured densities of the liquid at 0.1 MPa (NIST TRC ThermoML Archive)", THERMOML_ACCESS)
    else:
        coeffs, use, exc, m = fit_measured(cid, "liquidDensity", rho_form, pts, 0.01, Tc=Tc)
        where, acc = tml.origin(use)
        records["liquidDensity"], points["liquidDensity"] = record(
            "liquidDensity", rho_form, coeffs, use, exc, m, Tc,
            "Measured densities of the liquid at 0.1 MPa (%s)" % where, refs_of(use, tml), acc,
            notes=("DIPPR 100 (a polynomial in T; no measured critical temperature)." if nocrit else
                   "DIPPR 105 with C fixed at the critical temperature %.2f K (%s, %s)." % (Tc, crit_who, crit_where)))
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
    cp_measured_or_predicted(cid, pts, records, points, log, Tc, tml, searched_common,
                             "Measured heat capacities of the liquid (NIST TRC ThermoML Archive and NIST Chemistry WebBook)",
                             THERMOML_ACCESS + "; " + WEBBOOK_ACCESS, Tb=Tb)

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
    if C.get("dHvap") == "clapeyron" and nocrit:
        dh_clapeyron_ideal(cid, C, wb, tml, pts, psat, Tlow, Tdata, records, points, log, wb4, meta.MW)
    elif C.get("dHvap") == "clapeyron":
        dh_clapeyron(cid, C, wb, tml, pts, psat, Tlow, Tdata, Tc, Pc, omega, records, points, log, wb4)
    else:
        dh_measured(cid, C, wb, tml, pts, Tc, records, points, log, wb4)

    # liquid viscosity, surface tension, liquid thermal conductivity: ThermoML values where there are enough
    for prop, form, target in (("liquidViscosity", "DIPPR101", 0.03), ("surfaceTension", "DIPPR100" if nocrit else "DIPPR106", 0.01),
                               ("liquidThermalConductivity", "DIPPR100", 0.03)):
        fit_or_marker(cid, prop, form, target, tml.values(prop), records, points, log, Tc, tml, searched_common,
                      "Measured values (NIST TRC ThermoML Archive)", THERMOML_ACCESS)
    for prop in ("vapourViscosity", "vapourThermalConductivity"):
        records[prop] = {"available": False, "searched": searched_common}
        log.append("%-17s %-25s no open data" % (cid, prop))
    records = {p: records[p] for p in PROPS}

    tb_text = (" Tb: where the vapour-pressure record reaches 101.325 kPa (%g K)" % Tb if Tb else
               " Tb: not reached, the measured vapour pressures stay below 101.325 kPa")
    if tb_measured:
        tb_text += "; measured normal boiling temperatures in the ThermoML Archive: %s" % "; ".join("%.2f K (%s)" % t for t in tb_measured)
    comp = {
        "name": C["name"], "formula": meta.formula, "cas": C["cas"], "aliases": C["aliases"],
        "MW": rnd(meta.MW, 7), "Tc_K": Tc, "Pc_Pa": None if nocrit else rnd(Pc, 7), "Tb_K": Tb, "vapourPressure": vp,
        "uniquac_missing": {
            "searched": ["ChemSep v8.3 and v8.31 data 2 (compound not included)",
                         "thermo and chemicals libraries (no UNIQUAC r and q tables)"],
            "note": "no open data: UNIQUAC r and q could be computed from UNIFAC group volumes and areas, but the licence "
                    "of those group tables is the open question of roadmap A3 (proposal 0008, Part A, on hold); until it "
                    "is settled the component has no UNIQUAC data (NRTL and the ideal solution work without r and q)."},
        "omega": omega,
        "constants_source": ("%s. MW, formula and CAS: "
                             "chemicals library (MIT). Measured data only: not a CoolProp 8.0.0 fluid and not in the ChemSep "
                             "databank (%s).%s." % (crit_text, C.get("proposal", "proposal 0008, Part B"), tb_text)),
        # stated here: the text above names CoolProp only to say it does not have the fluid
        "constants_source_ids": ["nist-webbook"],
        "omega_source": ("Not defined: the acentric factor needs Tc and Pc, which have no measured values in the open "
                         "sources." if nocrit else
                         "From its definition, -log10(Psat(0.7 Tc)/Pc) - 1, with the vapour-pressure record (measured values "
                         "of the NIST TRC ThermoML Archive and the NIST Chemistry WebBook; Psat at %.2f K %s)." % (
                             0.7 * Tc, "inside the measured range" if 0.7 * Tc <= Tdata else
                             "between the last measured value at %.2f K and the critical point, so ω is less certain "
                             "than the measured values" % Tdata)),
        "properties": records,
    }
    if nocrit:
        # src/thermo/critical.js: activity models with an ideal-gas vapour only; no acentric factor, so no omega source
        comp["critical"] = {"available": False, "searched": C["no_critical"]}
        del comp["omega_source"]
    if Tb is None:
        comp["Tb_note"] = ("the vapour-pressure record ends with the measured temperatures at %.2f K, where it gives "
                           "%.4g kPa, below 101.325 kPa: no normal boiling temperature from measured data" % (
                               vp["Tmax_K"], psat(vp["Tmax_K"]) / 1000))
    points["vapourPressure"] = vp_pts
    log.append("%-17s Tc %s, Pc %s, Tb %s, omega %s, MW %.4f" % (
        cid, "%.2f K" % Tc if Tc else "none", "%.0f Pa" % Pc if Pc else "none", "%.3f K" % Tb if Tb else "none",
        "%.4f" % omega if omega is not None else "none", meta.MW))
    return comp, points

def build_nonvolatile(cid, log):
    """A nonvolatile component (proposal 0009, step 5): no vapour pressure, no critical constants, no vapour
    properties; the liquid's records from measured values where they meet the targets, the liquid heat capacity
    predicted by group additivity (predict_cp.py, tier "predicted") where no open measured values exist."""
    from pubchem import chemical as search_chemical  # PubChem where `chemicals` files the compound under another form
    import predict_cp
    C = COMPONENTS[cid]
    wb, tml = WebBook(cid), ThermoML(cid)
    meta = search_chemical(C["cas"])
    searched = ["CoolProp 8.0.0 (not a fluid)", "ChemSep v8.3 and v8.31 data 2 (compound not included)",
                "NIST Chemistry WebBook (%s)" % wb.url("phase change"), "NIST TRC ThermoML Archive (%s)" % tml.d["searched"]]
    records, points = {}, {}
    fit_or_marker(cid, "liquidDensity", "DIPPR100", 0.01, tml.values("liquidDensity"), records, points, log, None, tml,
                  searched, "Measured densities of the liquid at 0.1 MPa (NIST TRC ThermoML Archive)", THERMOML_ACCESS)
    fit_or_marker(cid, "liquidHeatCapacity", "DIPPR100", 0.01, tml.values("liquidHeatCapacity"), records, points, log,
                  None, tml, searched, "Measured heat capacities of the liquid (NIST TRC ThermoML Archive)", THERMOML_ACCESS)
    cp_measured_or_predicted(cid, tml.values("liquidHeatCapacity"), records, points, log, None, tml, searched)
    for prop, form, target in (("liquidViscosity", "DIPPR101", 0.03), ("surfaceTension", "DIPPR100", 0.01),
                               ("liquidThermalConductivity", "DIPPR100", 0.03)):
        fit_or_marker(cid, prop, form, target, tml.values(prop), records, points, log, None, tml, searched,
                      "Measured values (NIST TRC ThermoML Archive)", THERMOML_ACCESS)
    gas_note = "not defined: %s is nonvolatile, it is never in the vapour" % C["name"]
    for prop in ("idealGasHeatCapacity", "heatOfVaporization", "vapourViscosity", "vapourThermalConductivity"):
        records[prop] = {"available": False, "notApplicable": gas_note}
    records = {p: records[p] for p in PROPS}
    tb = ["%.2f K (%s)" % (p["y"], tml.cite(p["doi"])) for p in tml.values("Tb")]
    comp = {
        "name": C["name"], "formula": meta.formula, "cas": C["cas"], "aliases": C["aliases"], "class": "nonvolatile",
        "nonvolatile": {"why": C["why_nonvolatile"], "source": C.get("proposal")},
        "MW": rnd(meta.MW, 7), "Tc_K": None, "Pc_Pa": None, "Tb_K": None, "omega": None,
        "Tb_note": "nonvolatile in CHEPTA: %s%s" % (C["why_nonvolatile"],
                                                     "; a normal boiling temperature is reported: %s" % "; ".join(tb) if tb else ""),
        "uniquac_missing": {
            "searched": ["ChemSep v8.3 and v8.31 data 2 (compound not included)",
                         "thermo and chemicals libraries (no UNIQUAC r and q tables)"],
            "note": "no open data: UNIQUAC r and q could be computed from UNIFAC group volumes and areas, but the licence "
                    "of those group tables is the open question of roadmap A3 (proposal 0008, Part A, on hold); until it "
                    "is settled the component has no UNIQUAC data (NRTL and the ideal solution work without r and q)."},
        "constants_source": ("%s. Nonvolatile (%s): no vapour pressure, critical constants or acentric factor; not a "
                             "CoolProp 8.0.0 fluid and not in the ChemSep databank." % (
                                 ("Formula, structure and CAS: PubChem CID %s (%s), %s%s; MW from the formula (chemicals "
                                  "library, MIT)" % (meta.pubchem["compound"]["cid"], meta.pubchem["compound"]["title"],
                                                     meta.pubchem["compound"]["url"],
                                                     "; groups and the ThermoML Archive's compound from PubChem CID %s "
                                                     "(%s): %s" % (meta.pubchem["structure"]["cid"],
                                                                   meta.pubchem["structure"]["title"],
                                                                   meta.pubchem["structure"]["why"])
                                                     if "structure" in meta.pubchem else ""))
                                 if hasattr(meta, "pubchem") else "MW, formula and CAS: chemicals library (MIT)",
                                 C.get("proposal"))),
        "constants_source_ids": ["nist-webbook"] + (["pubchem"] if hasattr(meta, "pubchem") else []),
        "critical": {"available": False, "searched": searched},
        "properties": records,
    }
    log.append("%-17s nonvolatile, MW %.4f" % (cid, meta.MW))
    return comp, points


def build_no_vp(cid, log):
    """A volatile component without an open liquid vapour pressure (the maintainer, 2026-10-20): its liquid records
    from measured values where they meet the targets, and a "no open data" marker for the vapour pressure
    (`vapourPressure_missing`, with the sources searched). Activity-model calculations refuse it with that reason
    until the user gives a vapour pressure of their own (My data, proposal 0012), which replaces the marker. No
    critical constants (none are measured), no normal boiling point, no vapour records: they all need the vapour
    pressure. It is not made nonvolatile, which would make every distillation with it wrong (DATA_RULES section 10)."""
    from pubchem import chemical as search_chemical  # PubChem where `chemicals` files the compound under another form
    C = COMPONENTS[cid]
    wb, tml = WebBook(cid), ThermoML(cid)
    meta = search_chemical(C["cas"])
    searched = ["CoolProp 8.0.0 (not a fluid)", "ChemSep v8.3 and v8.31 data 2 (compound not included)",
                "NIST Chemistry WebBook (%s)" % wb.url("phase change"), "NIST TRC ThermoML Archive (%s)" % tml.d["searched"]]
    records, points = {}, {}
    fit_or_marker(cid, "liquidDensity", "DIPPR100", 0.01, tml.values("liquidDensity"), records, points, log, None, tml,
                  searched, "Measured densities of the liquid at 0.1 MPa (NIST TRC ThermoML Archive)", THERMOML_ACCESS)
    fit_or_marker(cid, "liquidHeatCapacity", "DIPPR100", 0.01, tml.values("liquidHeatCapacity"), records, points, log,
                  None, tml, searched, "Measured heat capacities of the liquid (NIST TRC ThermoML Archive)", THERMOML_ACCESS)
    cp_measured_or_predicted(cid, tml.values("liquidHeatCapacity"), records, points, log, None, tml, searched)
    for prop, form, target in (("liquidViscosity", "DIPPR101", 0.03), ("surfaceTension", "DIPPR100", 0.01),
                               ("liquidThermalConductivity", "DIPPR100", 0.03)):
        fit_or_marker(cid, prop, form, target, tml.values(prop), records, points, log, None, tml, searched,
                      "Measured values (NIST TRC ThermoML Archive)", THERMOML_ACCESS)
    no_vp = "no open liquid vapour pressure (%s)" % C["no_vapour_pressure"]
    dh = ["%.4g kJ/mol at %.2f K (%s)" % (v / 1000, T0, ref) for T0, v, ref in
          [(p["T"], p["y"], p["ref"]) for p in tml.values("heatOfVaporization")]]
    records["heatOfVaporization"] = {"available": False, "searched": searched,
                                     "note": "needs the vapour pressure (Clapeyron) or calorimetric values over a range: "
                                             "%s%s" % (no_vp, "; single values: %s" % "; ".join(dh) if dh else "")}
    for prop in ("idealGasHeatCapacity", "vapourViscosity", "vapourThermalConductivity"):
        records[prop] = {"available": False, "searched": searched + ["no vapour data without a vapour pressure"]}
    records = {p: records[p] for p in PROPS}
    for prop in ("heatOfVaporization", "idealGasHeatCapacity", "vapourViscosity", "vapourThermalConductivity"):
        log.append("%-17s %-25s no open data" % (cid, prop))
    pub = getattr(meta, "pubchem", None)
    comp = {
        "name": C["name"], "formula": meta.formula, "cas": C["cas"], "aliases": C["aliases"],
        "MW": rnd(meta.MW, 7), "Tc_K": None, "Pc_Pa": None, "Tb_K": None, "omega": None,
        "Tb_note": "no normal boiling point: %s" % no_vp,
        "vapourPressure_missing": {
            "searched": searched + ["open literature (web search, 2026-10-20)"],
            "note": ("%s. Add your own vapour pressure in My data (proposal 0012); until then the activity models "
                     "refuse it. Group-contribution predictions (SIMPOL.1) were checked and not accepted (the maintainer, "
                     "2026-10-20: errors of a factor of 2 and more)." % (no_vp[0].upper() + no_vp[1:]))},
        "uniquac_missing": {
            "searched": ["ChemSep v8.3 and v8.31 data 2 (compound not included)",
                         "thermo and chemicals libraries (no UNIQUAC r and q tables)"],
            "note": "no open data: UNIQUAC r and q could be computed from UNIFAC group volumes and areas, but the licence "
                    "of those group tables is the open question of roadmap A3 (proposal 0008, Part A, on hold); until it "
                    "is settled the component has no UNIQUAC data (NRTL and the ideal solution work without r and q)."},
        "constants_source": ("%s. No open liquid vapour pressure, so no normal boiling point, critical constants or "
                             "acentric factor; not a CoolProp 8.0.0 fluid and not in the ChemSep databank." % (
                                 ("Formula, structure and CAS: PubChem CID %s (%s), %s; MW from the formula (chemicals "
                                  "library, MIT)" % (pub["compound"]["cid"], pub["compound"]["title"], pub["compound"]["url"]))
                                 if pub else "MW, formula and CAS: chemicals library (MIT)")),
        "constants_source_ids": ["nist-webbook"] + (["pubchem"] if pub else []),
        "critical": {"available": False, "searched": C["no_critical"]},
        "properties": records,
    }
    log.append("%-17s no open vapour pressure, MW %.4f" % (cid, meta.MW))
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
              ("- Nonvolatile (no vapour pressure; it stays in the liquid): %s; M %.4f g/mol" % (c["nonvolatile"]["why"], c["MW"])
               if c.get("class") == "nonvolatile" else
               "- Tc %.2f K, Pc %.4g MPa, Tb %.3f K, ω %.4f, M %.4f g/mol" % (c["Tc_K"], c["Pc_Pa"] / 1e6, c["Tb_K"], c["omega"], c["MW"])
               if c["Tc_K"] else "- No measured Tc and Pc (activity models with an ideal-gas vapour only); Tb %s, M %.4f g/mol" % (
                   "%.3f K" % c["Tb_K"] if c["Tb_K"] else "not reached by the measured vapour pressures", c["MW"])),
              "- Constants: %s" % c["constants_source"], "",
              "| Property | Range (K) | Values used | Left out | Max deviation | Sources |", "|---|---|---|---|---|---|"]
        vp = c.get("vapourPressure")
        if vp:
            L.append("| Vapour pressure | %.2f-%.2f | %s | %d | %s | ThermoML, WebBook |" % (
                vp["Tmin_K"], vp["Tmax_K"], re.search(r"(\d+) measured values", vp["source"]).group(1), len(vp.get("excluded", [])),
                re.search(r"max deviation ([0-9.]+ %)", vp["source"]).group(1)))
        for p, r in c["properties"].items():
            if r.get("available") is False:
                if r.get("notApplicable"):
                    L.append("| %s | — | — | — | — | %s |" % (p, r["notApplicable"].split(":")[0]))
                    continue
                L.append("| %s | — | — | — | — | no open data%s |" % (p, " (%s)" % r["note"].split(":")[0] if r.get("note") else ""))
                continue
            f = r["source"]["fit"]
            if r.get("tier") == "predicted":
                L.append("| %s | %.2f-%.2f | predicted | — | — | %s |" % (p, r["Tmin_K"], r["Tmax_K"], r["source"]["name"]))
                continue
            nval = re.match(r"(\d+)", f).group(1)
            L.append("| %s | %.2f-%.2f | %s | %d | %s | %s |" % (
                p, r["Tmin_K"], r["Tmax_K"], nval, len(r["source"].get("excluded", [])),
                re.search(r"max deviation ([0-9.]+ %)", f).group(1), r["source"]["name"]))
        L.append("")
        for p, r in ([("vapourPressure", vp)] if vp else []) + list(c["properties"].items()):
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
        cls = COMPONENTS[cid].get("class")
        comps[cid], pts[cid] = {"nonvolatile": build_nonvolatile, "no_vapour_pressure": build_no_vp}.get(cls, build)(cid, log)
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
