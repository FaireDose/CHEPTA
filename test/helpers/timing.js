// Timing for the speed tests (proposal 0015, W9). One measurement of a few milliseconds is as much the machine's
// noise as the calculation's cost: a garbage collection, another process, a shared runner. So each calculation is run
// once to warm up, then timed `repeats` times, and the fastest is compared with the budget: the budget stays the
// same, and a calculation that is slow every time still fails it.

/** The fastest of `repeats` timings of fn() in ms, after `warmup` untimed runs. */
export function fastestMs(fn, { warmup = 1, repeats = 5 } = {}) {
  for (let k = 0; k < warmup; k++) fn();
  let best = Infinity;
  for (let k = 0; k < repeats; k++) {
    const t0 = performance.now();
    fn();
    best = Math.min(best, performance.now() - t0);
  }
  return best;
}
