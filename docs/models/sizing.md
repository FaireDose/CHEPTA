# Drum and decanter sizes

The size of a flash drum and of a decanter from a flash block's result ([proposal 0015](../../proposals/0015-separation-units.md),
Part I section 4, contract 4; roadmap E1; milestone M1). Code: `src/sizing/sizing.js`; written against **contracts v1**.
A pre-size for concept design and for cost (E2), not a mechanical design.

```js
CHEPTA.sizeDrum(flashResult, { sys, orientation: "vertical" })        // → { dimensions, basis, source, notes }
CHEPTA.sizeDecanter(flashResult, { sys, orientation: "horizontal" })
CHEPTA.run({ capability: "size_drum", input: { project, block: "V1", drum: { orientation: "horizontal" } } })
```

`flashResult` is `runUnit("flash", ...)`, or a solved flowsheet's block with its outlets
(`flashBlockResult(flowsheet, result, id)`); `sys` is its property package. The `size_drum` capability (command line,
MCP server) solves the flowsheet and returns `drum` when the block has a vapour and `decanter` when it has two liquids.
The Flowsheet workspace shows both, with the defaults, under the drum's results.

## The properties

At the drum's T and P, from CHEPTA's own records; a record outside its range refuses (`OUT_OF_RANGE`), a missing one
refuses (`MISSING_DATA`):

- vapour density ρV = M P / (Z R T), Z from the system's vapour model (1 for an ideal-gas vapour);
- a liquid's density from the pure liquids' density records, volumes adding up;
- a liquid's viscosity by ln μ = Σ x_i ln μ_i over the pure liquids' records (the thermo library's preferred rule for
  liquid mixtures, `MIXING_LOG_MOLAR`; MIT). Only the decanter needs it.

## Vapour-liquid drum (`sizeDrum`)

| Step | Rule | Source |
|---|---|---|
| flow parameter | F = (W_L/W_V) √(ρV/ρL), W mass flows | Fermeglia (2021), slide 83 |
| K | K = exp(A + B ln F + C ln²F + D ln³F + E ln⁴F) ft/s, A = −1.877478, B = −0.814580, C = −0.187074, D = −0.014523, E = −0.001015; F within 0.006-5.5 (the chart), else refused | Fermeglia, slide 83; Bagajewicz (2013, 2018): ft/s |
| permitted velocity | v_perm = K √((ρL − ρV)/ρV) | Fermeglia, slides 83-84 |
| design velocity | u = 0.85 v_perm (`fraction`) | Fermeglia, slide 88: "a security factor of 0.85" |
| diameter | D = √(4 V̇V / (π u)) | Fermeglia, slide 87 |
| heights | h_v = 36 in + ½ d_feed, at least 48 in; h_f = 12 in + ½ d_feed | Fermeglia, slide 87 (minimum 48 in); Bagajewicz: "½ diameter of feedline" |
| feed line | at the lower nozzle velocity 60/√ρ_mix ft/s (ρ_mix in lb/ft³), or `feedLine_m` | Fermeglia, slide 87 |
| liquid pool | h_L = V_pool / (π D²/4), V_pool = V̇L · 2 min (`residence_min`), or `holdup_m3` | Bagajewicz (2013): "~2 minutes residence time" |
| height | H = h_v + h_f + h_L; H/D < 3: the pool is deepened to H = 3D; H/D > 5: a horizontal drum is advised | Fermeglia, slides 87-88 |
| horizontal | K_H = 1.25 K_V; the vapour in 20 % of the cross-section; vapour space at least max(0.2 D, 12 in); the liquid in the rest; L at least 3 D | Coker (1993) |

The chart of slide 83 is Watkins' (1967) as fitted by Blackwell (1984), both paywalled and not used; the fit's values
are checked against the chart itself, read by pixel position (within 7 %, `test/sizing.test.js`). Not checked: the
length a horizontal drum needs for the drops to fall out of the vapour, and a demister (no open source for them was
opened in this step). Your own K (`K_m_s`) replaces the fit.

## Decanter (`sizeDecanter`)

All from Al-Bayati, "Liquid-liquid separators" (University of Baghdad lecture notes):

| Step | Rule |
|---|---|
| settling velocity | Stokes: u_d = g d² (ρd − ρc) / (18 μc), d = 150 μm (`droplet_um`); above 4 × 10⁻³ m/s, 4 × 10⁻³ m/s is used |
| interface area | A_i = V̇c / u_d (the continuous phase in plug flow through the interface) |
| vertical | A_i = π D²/4, H = 2 D (`ratio`; example 1) |
| horizontal | A_i = w L, w = 2 (H_i D − H_i²)^½, interface at half the diameter (`interface`), L = 4 D (`ratio`; example 2; "3-5:1") |
| checks | the dispersion band, 10 % of the height, held 2-5 min (u_d); hold-up 2-10 min; the drops of the continuous phase the dispersed phase can carry, d = √(18 μd u / (g Δρ)); the inlet pipe at 1 m/s; the heavy take-off H2 = H3 + (H1 − H3) ρ_light/ρ_heavy |

Which liquid is dispersed is the user's (`dispersed`: `light` or `heavy`); by default the one with the smaller volume
flow, a choice of this project. The drop Reynolds number is reported; the limit of Stokes' law is not checked (no open
source stating it was opened in this step).

## Sources

- M. Fermeglia, "Single stage thermal separation: flash", Separation Processes, University of Trieste (22 March 2021),
  slides 81-88: <https://moodle2.units.it/pluginfile.php/389467/mod_resource/content/3/01_Flash.pdf>.
- M. Bagajewicz, ChE 4253 Design I, University of Oklahoma: "Flash drum design" (2013),
  <https://ou.edu/class/che-design/design%201-2013/Flash%20Design.pdf>, and "Flash and tray design examples" (2018),
  <https://www.ou.edu/class/che-design/Design&Safety-2018/Flash%20and%20Column%20Design%20Exercises.pdf>. Its worked
  example uses log₁₀ in place of ln in the fit (K = 0.2365 instead of 0.347 ft/s at F = 0.2402) and 0.30103 m per ft;
  the test reproduces its arithmetic with its own K and states both.
- A. K. Coker, "Computer program enhances guidelines for gas-liquid separator designs", Oil & Gas Journal (10 May 1993),
  free to read: <https://www.ogj.com/home/article/17222980/computer-program-enhances-guidelines-for-gas-liquid-separator-designs>.
- S. D. Al-Bayati, "Liquid-liquid separators", University of Baghdad: <https://uomus.edu.iq/img/lectures21/MUCLecture_2024_4232530.pdf>.
  Example 2 writes its inlet flow as 2.932 × 10⁻³ m³/s; its own numbers give 8.49 × 10⁻³ m³/s.

## Validation

`validation/python/reference_sizing.py` writes the same formulas anew (the horizontal segment by Newton's method on
its angle, where the engine bisects on its height) into `validation/fixtures/sizing.json`; `test/sizing.test.js`
compares them within 1e-9, the fit with its chart, and the two lecture examples and the Oklahoma example with their
printed numbers, and runs a flash drum (ethanol and water) and a three-phase drum (ethyl acetate and water) end to end.
