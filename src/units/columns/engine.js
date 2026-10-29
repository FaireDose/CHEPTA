/**
 * The column engine (proposal 0015, Part I, section 1, and section 9, contract 3): one engine for every column
 * configuration (distillation, absorber, stripper, extraction), built in milestones M1 (shortcut) and M2a (rigorous,
 * one liquid). Until then it refuses, so nothing can call a column that does not exist.
 *
 *   solveCascade({ sys, stages, feeds, draws, specs, ends, phases: "VL" | "LL" | "VLL", start })
 *   → { stages: [...], converged, residuals: { material, equilibrium, summation, energy, specifications },
 *       tolerances, iterations, warnings }
 *
 * Rules the engine will keep: the residuals are reported by group, never as one number; a state it cannot represent
 * (a second liquid where `phases` is "VL") is found by the phase-stability check and refused (PHASE_SPLIT), never
 * returned as a metastable answer; a solver that fails says so (NO_CONVERGENCE), which is not a statement that the
 * separation is impossible; `start` (a previous solution) is only a first guess, and every accepted solution passes the
 * full residual checks.
 */
import { fail } from "../../util/errors.js";

export const CASCADE_PHASES = Object.freeze(["VL", "LL", "VLL"]);

/** Not built yet: refuses with NOT_AVAILABLE (proposal 0015, milestones M1 and M2a). */
export function solveCascade() {
  throw fail("NOT_AVAILABLE", "The column engine is not built yet: the shortcut column comes with milestone M1 and the rigorous column with M2a of proposal 0015.");
}
