/**
 * Equipment sizing (proposal 0015, section 9, contract 4; roadmap E1): a layer above the blocks (src/units/), which
 * reads a block's result and returns its dimensions; cost (E2) reads these. Each function is
 *
 *   (unit result, options) → { dimensions, basis, source }
 *
 * with `basis` the rule and its inputs (a fraction of flooding, a residence time) and `source` the open reference of the
 * correlation. The column diameter is set by the largest required vapour-flow area of its stages,
 * A_j = V̇_j / (f · u_fl,j) (Part I, section 2), not by the stage with the lowest flooding velocity.
 *
 * Built in workstream W4: the drum and decanter sizes at milestone M1, the column diameter at M2b, the membrane area at
 * M3. Until then each refuses. (The heater's area, proposal 0013, stays with the heater: src/units/heat-exchange.js.)
 */
import { fail } from "../util/errors.js";

const notYet = (what, when) => () => { throw fail("NOT_AVAILABLE", `${what} is not built yet: it comes with milestone ${when} of proposal 0015.`); };

export const sizeDrum = notYet("The size of a flash drum", "M1");
export const sizeDecanter = notYet("The size of a decanter", "M1");
export const columnDiameter = notYet("The column diameter", "M2b");
export const membraneArea = notYet("The membrane area", "M3");
