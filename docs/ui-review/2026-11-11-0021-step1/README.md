# Visual check: measured points and the x-y, γ and α plots (proposal 0021, answer 7)

Taken with Chromium from the built bundle (`dist/chepta.js`), by docs/UI_GUIDE.md section 7: 375 px and 1280 px wide,
light and dark, in the workbench as it is ("classic") and in the reorganized layout ("next"). `before-` is `main` at
712be5b, `after-` this pull request. File names: `<before|after>-<case>-<layout>-<width>-<theme>.png`.

| Case | What it shows |
|---|---|
| `txy` | ethanol + water, NRTL, 101.325 kPa: the 21 points of Kamihama et al. (2012), the set the parameters were fitted to (filled dots) |
| `txy-3sets` | methanol + water: one fitted set (dots) and two compared, not fitted (rings), each with its source and deviation |
| `xy`, `gamma`, `alpha` | ethanol + water: the three plots of the switch above the diagram |
| `pxy` | 1-butanol + benzene at 40 °C: the isothermal set of Villamanan et al. (2006) |
| `elsewhere` | 1-butanol + benzene at 101.325 kPa: no set at this pressure; the set is listed with the button "P-x-y at 40 °C" |
| `nodata` | acetone + water: "No measured data" |
| `gamma-eos` | methane + ethane, Peng–Robinson: the γ plot refused, with the reason |

Checked in every case, layout, width and theme (72 pages): no sideways scroll of the page; no chart text under 11 px
as shown; the list of sets and the switch inside the canvas. In the "next" layout at 375 px the readout of a complete
diagram is on the first screen, as before.
