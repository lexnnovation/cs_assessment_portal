function hashSeed(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822519);
  h = Math.imul(h ^ (h >>> 13), 3266489917);
  h ^= h >>> 16;
  return h >>> 0;
}

function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seededShuffle(arr, seedStr) {
  const rnd = mulberry32(hashSeed(seedStr));
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const CODE_CHARS = 'ACDEFGHJKMNPQRTUVWXY34679';

export function genCode(existing) {
  let code;
  do {
    code = 'CS-';
    for (let i = 0; i < 5; i++) code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  } while (existing.includes(code));
  return code;
}

// Deterministic per-officer question order and per-question option order,
// derived from the officer's code so it never needs to be stored beyond the
// order array itself and is stable across reopens.
export function optionOrderFor(code, questionOriginalIndex, optionCount) {
  const idxs = Array.from({ length: optionCount }, (_, i) => i);
  return seededShuffle(idxs, code + ':q' + questionOriginalIndex);
}

export function scoreLine(score, total) {
  const pct = total > 0 ? Math.round((score / total) * 100) : 0;
  return { pct, text: `${score} of ${total} (${pct}%)` };
}
