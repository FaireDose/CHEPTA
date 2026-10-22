# 2026-10-22: Missing properties, round 3: modelling papers and suppliers

Pull request: missing properties round 3.

## What the maintainer asked for

- "with this new rules look also for the missing properties of the other chemicals" (the supplier rule,
  docs/decisions/2026-10-22-06-supplier-data.md);
- "when i mentioned the new rules i also mentioned the idea with simulations papers": articles that model or
  simulate a compound often compare with measured values, and cite where they come from; use those.

How that idea is applied: an open article counts as the open copy of measured values it prints, whether they are its
own or quoted. It is cited, together with the original measurement it names. Values a modelling article quotes from
a commercial databank or a handbook (DIPPR, Yaws, CRC) are not taken: they stay that source's, as for open libraries
(DATA_RULES section 1).

## Found

- **Levoglucosenone: vapour pressure and liquid density.** Baird, Uusi-Kyyny, Pokki, Pedegert and Alopaeus, Vapor
  Pressures, Densities, and PC-SAFT Parameters for 11 Bio-compounds, Int. J. Thermophys. 40 (2019) 102,
  doi:10.1007/s10765-019-2570-9. Open access, CC BY 4.0; the published PDF is in the Aalto repository. It is a
  modelling paper (PC-SAFT) with its own measurements, and CHEPTA already used it for Cyrene, but levoglucosenone's
  tables in it had been missed:
  - Table 19: 12 vapour pressures, 298-403 K, 6.2 Pa to 3.48 kPa (gas saturation), with expanded uncertainties of
    4-27 %. The authors' sample was 96.2 wt % pure (98.5 wt % after the measurement, Section 2.1).
  - Table 13: liquid density at 0.100 MPa, 293-363 K (distilled sample, 98.7 wt %).
  - Transcribed into `validation/data/pure/measured/article_levoglucosenone_ijt2019.json`.
  - `measured_components.py` makes the records:
    - vapour pressure: within 20 % of every value, each within its stated uncertainty or close to it (at 373 K the
      fit is +9.2 % against 6 %). The values scatter; none is more than three times its uncertainty from the curve,
      so none is left out;
    - density: within 0.003 %;
    - heat of vaporization by Clapeyron.
  - Levoglucosenone is no longer a liquid without a vapour pressure: bubble and dew points and flashes work with it
    (NRTL with fitted pairs, or the ideal solution; it has no Mod. UNIFAC 2.0 groups). It still has no heat capacity,
    so energy balances with it are refused.

## Searched, nothing usable found (2026-10-22)

- **Vapour pressures of solketal, alpha-angelica lactone, 5-(ethoxymethyl)furfural, isosorbide, lactide, BHMF and
  dimethyl FDCA:** web searches for measured values and for modelling articles that compare with them. Found:
  - for lactide, only a conference abstract (Emel'yanenko, Verevkin, Pimerzin: transpiration measurements, no numbers);
  - supplier estimates ("est"), which are not data.
- **Enthalpies of fusion of fumaric and itaconic acid:** none (docs/decisions/2026-10-22-05-reactions.md).
- **Liquid density of glycerol carbonate:** Valletti et al., J. Mol. Liq. 357 (2022) 119114, measured it in water,
  but the article is not open.
- **Supplier data** (rule of 2026-10-22):
  - TCI, Sigma-Aldrich, Thermo Fisher and Fisher refuse automated access, so their pages have to be downloaded by
    the maintainer;
  - the one value seen in a search, solketal's density of 1.06 g/mL (Thermo Scientific), is for a 97 % product,
    below the 98 % assay of the rule, and it is one supplier.

## Still open

- Compare the transcribed values in `article_levoglucosenone_ijt2019.json` with Tables 13 and 19 of the article.
- The supplier pages for the single constants that would change a calculation: the liquid densities at 20-25 degC of
  glycerol carbonate and 5-(ethoxymethyl)furfural (three suppliers each). Boiling and melting points of the other
  components would only be shown, since they make no vapour-pressure curve or fusion record.
