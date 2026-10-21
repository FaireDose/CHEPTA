# 2026-10-21: mixture entropy, compressor and expander, the Charts workspace (proposal 0013, steps 6 and 7)

The maintainer asked to go on with the next point of the timeline, then (2026-10-21): "after you do step 6 and 7 you
need to clean a bit the errors on the workbench" (next pull request).

**Entropy, for every model** (`src/thermo/enthalpy.js`). Each phase takes its entropy from its Gibbs energy,
s = (h − g)/T, with g built from the fugacities the flash already uses. Reference: each component as an ideal gas at
298.15 K and 101.325 kPa (a nonvolatile component: its liquid at 298.15 K, as for its enthalpy). Chosen over integrating
cp_L/T for an activity model's liquid because two phases in equilibrium then differ by exactly the latent heat over T,
which an isentropic path through the two-phase region needs. The price, stated in the code and the docs: such a liquid's
entropy follows its vapour-pressure record; water's entropy rise from 300 to 370 K is within 0.8 % of IAPWS-IF97's.

**The P-S flash** (`sys.flash({ z, P, S })`) is the P-H search on the entropy, the same code path.

**Compressor and expander** (`src/units/units.js`): outlet pressure, rise or drop, or the pressure ratio; the
isentropic outlet, then the isentropic efficiency. An inlet with liquid is refused; liquid along the path is said.
The defaults, as the maintainer asked for typical values from an open source (2026-10-20, answer 5), are from the U.S.
NETL's *Quality Guidelines for Energy System Studies: Process Modeling Design Parameters* (NETL-PUB-22478, June 2019;
public domain):
- **compressor 75 %**, the lower of its single-stage syngas recycle compressors (84 %, Exhibit 4-8, p. 23; 75 %,
  Exhibit 5-7, p. 47);
- **expander 80 %**, its boiler feed water pump turbine (Exhibit 4-3, p. 17); its steam turbines are 85 to 93.5 %.
These are values from power-plant studies, not for every machine: the person's own efficiency replaces them.

**The independent check** (`validation/python/reference_compressor.py`, `reference_charts.py`). The reference adds
CoolProp's ideal-gas cp0 and the departure functions of the thermo library, with CHEPTA's Tc, Pc and ω. CoolProp's own
cubic backend was not used: its molar entropy does not follow from its ideal-gas and residual parts. For methane from
300 K and 100 kPa to 1000 kPa it gives an isentropic outlet of 452 K, where its reference equation gives 485.3 K and
the reference above 485.5 K.

Results (`test/entropy.test.js`, `test/charts.test.js`):
- isentropic outlets within 0.11 K, work within 0.1 %;
- the mixture's 0.10 K comes from CHEPTA's ethane ideal-gas record, 0.6 % below CoolProp's cp0 at 300 K;
- the chart dome and isobars of propane and carbon dioxide are within 0.5 %.

**The Charts workspace.** The Steam workspace is now **Charts**, with two views:
- **Water and steam:** IAPWS-IF97, as before, plus P-h (with isotherms) and h-s charts.
- **Any fluid:** one to six components with Peng–Robinson or SRK, with isobars or isotherms, vapour-fraction lines and
  a compression or expansion drawn on it.

Both are per kg. The workspace id stays "steam", so saved projects open. A project that uses the fluid charts is
written as format 5 (`workbench.chart`); every other project keeps its older format.

**Review of 2026-10-21.** The maintainer: "would be nice if can draw more points there somehow on the H-E charts. so i
can make calculations . or if not possible because it is too complicated and takes visual space, the opportunity to save
some data from one line". Both were done:
- **State points**, up to 12 per chart. A click on the chart places one: on the P-h chart at the P and h clicked; on the
  T-s and h-s charts on the nearest isobar, at the entropy clicked. A point can also be typed from two of T, P, h, s and
  the vapour fraction. Each point is calculated exactly (a flash of the feed; IAPWS-IF97 for water), drawn as A, B, …,
  and listed under the chart with T, P, h, s, VF and Δh, Δs from the point before, also as CSV. The points are saved
  with the project (`chart.points`, `chart.waterPoints`; format 5).
- **Lines as data:** each line of the chart can be downloaded or copied as CSV on its own.

**To check:** the two NETL efficiencies against the report, pages 17, 23 and 47.
