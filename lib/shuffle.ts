/**
 * Deterministic per-student shuffling (PRD §4.2).
 *
 * The requirement is that order is "shuffled per student, seeded by studentId +
 * examId so it's reproducible for review/audit". Seeding rather than persisting is
 * what makes that work: nothing extra is written at start, a resumed session
 * recomputes the identical order, and a teacher auditing a paper months later can
 * reproduce exactly what that student saw.
 *
 * `Math.random()` would break all three — order would differ between the initial
 * load and every resume, so a student's answers could not be reliably mapped back
 * to the questions they actually saw.
 */

/**
 * cyrb53 — a fast, well-distributed 53-bit string hash. Not cryptographic and does
 * not need to be: it only has to turn an id pair into a stable, evenly spread seed.
 */
function cyrb53(input: string, seed = 0): number {
  let h1 = 0xdeadbeef ^ seed
  let h2 = 0x41c6ce57 ^ seed

  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i)
    h1 = Math.imul(h1 ^ ch, 2654435761)
    h2 = Math.imul(h2 ^ ch, 1597334677)
  }

  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)

  return 4294967296 * (2097151 & h2) + (h1 >>> 0)
}

/** mulberry32 — a small PRNG with a full 2^32 period, ample for shuffling ≤500 items. */
function mulberry32(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Fisher–Yates using a seeded PRNG. Returns a new array; the input is untouched.
 *
 * Iterating downward and swapping with an index in `[0, i]` is the unbiased form —
 * the common `sort(() => rng() - 0.5)` shortcut produces a measurably skewed
 * distribution, which for exam papers would mean some orderings appearing far more
 * often than others.
 */
export function seededShuffle<T>(items: readonly T[], seed: string): T[] {
  const result = [...items]
  const random = mulberry32(cyrb53(seed))

  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    const a = result[i] as T
    const b = result[j] as T
    result[i] = b
    result[j] = a
  }

  return result
}

/** Seed for question order within one student's sitting of one exam. */
export function questionOrderSeed(studentId: string, examId: string): string {
  return `q:${studentId}:${examId}`
}

/**
 * Seed for option order within a single question.
 *
 * `questionId` is part of the seed on purpose: seeding every question in a paper
 * identically would give them all the same permutation, so "the answer is always
 * the option that moved to slot C" becomes a usable pattern across the paper.
 */
export function optionOrderSeed(studentId: string, examId: string, questionId: string): string {
  return `o:${studentId}:${examId}:${questionId}`
}
