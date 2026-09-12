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

// Picks this officer's set of questions: the whole bank shuffled into a
// random order, then cut down to `count` if the admin has capped how many
// questions each person sees. Because the shuffle is seeded by the officer's
// own code, two officers with a cap lower than the bank size end up with
// different combinations of questions, not just a different order of the
// same ones - a null/zero count means "give everyone the whole bank."
export function pickQuestionOrder(questionIds, code, count) {
  const shuffled = seededShuffle(questionIds, code);
  if (!count || count >= shuffled.length) return shuffled;
  return shuffled.slice(0, count);
}

export function scoreLine(score, total) {
  const pct = total > 0 ? Math.round((score / total) * 100) : 0;
  return { pct, text: `${score} of ${total} (${pct}%)` };
}

const SKIP_POLICIES = ['revisit', 'no_return', 'none'];
const MEDIA_KINDS = ['audio', 'image'];
const MAX_TEXT_LEN = 2000;
const MAX_OPTION_LEN = 500;

// Shared by the create and edit question API routes. Returns either
// { error, status } or { value } holding the validated fields ready to pass
// straight to addQuestion/updateQuestion. Length caps match bulk import's.
export function parseQuestionInput(body) {
  const text = String(body.text || '').trim();
  const kind = body.kind === 'text' ? 'text' : 'mcq';
  const skipPolicy = SKIP_POLICIES.includes(body.skipPolicy) ? body.skipPolicy : 'revisit';
  const secondsOverride = Number.isInteger(body.secondsOverride) && body.secondsOverride > 0 ? body.secondsOverride : null;
  const mediaKind = MEDIA_KINDS.includes(body.mediaKind) ? body.mediaKind : null;
  const mediaFile = mediaKind ? String(body.mediaFile || '').trim() || null : null;

  if (!text) return { error: 'Question text is required.', status: 400 };
  if (text.length > MAX_TEXT_LEN) return { error: `Question text is too long (max ${MAX_TEXT_LEN} characters).`, status: 400 };
  if (mediaKind && !mediaFile) return { error: 'Upload the file before saving.', status: 400 };

  if (kind === 'text') {
    return { value: { text, options: [], correctIndex: -1, kind, skipPolicy, secondsOverride, mediaKind, mediaFile } };
  }

  const options = Array.isArray(body.options) ? body.options.map((o) => String(o || '').trim()) : [];
  const correctIndex = Number.isInteger(body.correctIndex) ? body.correctIndex : -1;

  if (options.length < 2 || options.length > 6 || options.some((o) => !o)) {
    return { error: 'Provide between 2 and 6 non-empty options.', status: 400 };
  }
  if (options.some((o) => o.length > MAX_OPTION_LEN)) {
    return { error: `An option is too long (max ${MAX_OPTION_LEN} characters).`, status: 400 };
  }
  if (correctIndex < 0 || correctIndex >= options.length) {
    return { error: 'Pick which option is correct.', status: 400 };
  }
  return { value: { text, options, correctIndex, kind, skipPolicy, secondsOverride, mediaKind, mediaFile } };
}
