import { getQuestionById } from './db';
import { optionOrderFor } from './quiz';

function isOpen(officer, qId) {
  const q = getQuestionById(qId);
  if (!q) return false; // admin deleted it mid-assessment
  if (officer.closed.includes(qId)) return false;
  if (officer.answers[qId] !== undefined) return false;
  return true;
}

// Question IDs (in order) that still need an answer - i.e. what's left before
// the officer can submit. Also what a 'revisit' skip leaves behind to resurface.
export function openQuestionIds(officer) {
  return officer.order.filter((qId) => isOpen(officer, qId));
}

// Moves currentIndex to the next open question - forward from where it is,
// wrapping around to pick up anything left open by an earlier 'revisit' skip -
// or past the end of `order` once nothing is left open. A freshly-landed-on
// question always gets a fresh clock; staying put never resets it, so a page
// refresh resumes the same countdown instead of granting more time.
function normalizePosition(officer) {
  const atCurrent = officer.currentIndex < officer.order.length ? officer.order[officer.currentIndex] : null;
  if (atCurrent != null && isOpen(officer, atCurrent)) {
    if (!officer.questionStartedAt) officer.questionStartedAt = new Date().toISOString();
    return;
  }

  for (let i = officer.currentIndex + 1; i < officer.order.length; i++) {
    if (isOpen(officer, officer.order[i])) {
      officer.currentIndex = i;
      officer.questionStartedAt = new Date().toISOString();
      return;
    }
  }
  for (let i = 0; i <= officer.currentIndex && i < officer.order.length; i++) {
    if (isOpen(officer, officer.order[i])) {
      officer.currentIndex = i;
      officer.questionStartedAt = new Date().toISOString();
      return;
    }
  }
  officer.currentIndex = officer.order.length;
  officer.questionStartedAt = null;
}

function mediaUrlFor(mediaFile, code) {
  return mediaFile ? `/api/media/${mediaFile}?code=${encodeURIComponent(code)}` : null;
}

// Never includes the correct answer - only shuffled option text (for mcq) or
// nothing (for text, since there's nothing to shuffle or hide).
function questionPayload(officer) {
  const qId = officer.order[officer.currentIndex];
  const q = getQuestionById(qId);
  const media = q.mediaFile ? { kind: q.mediaKind, url: mediaUrlFor(q.mediaFile, officer.code) } : null;

  if (q.kind === 'text') {
    return { index: officer.currentIndex, total: officer.order.length, kind: 'text', text: q.text, skipPolicy: q.skipPolicy, media };
  }

  const optOrder = optionOrderFor(officer.code, qId, q.options.length);
  const options = optOrder.map((origIdx, shownIdx) => ({
    letter: String.fromCharCode(65 + shownIdx),
    origIdx,
    text: q.options[origIdx],
  }));
  return { index: officer.currentIndex, total: officer.order.length, kind: 'mcq', text: q.text, options, skipPolicy: q.skipPolicy, media };
}

// The single source of truth for "what should this officer see right now."
// Mutates officer (position, clock, and any auto-close from a budget that ran
// out while they were away) - callers must saveOfficer() afterward regardless
// of whether the result is `done` or a question.
export function serveCurrent(officer, settings) {
  normalizePosition(officer);
  if (officer.currentIndex >= officer.order.length) {
    return { done: true };
  }

  const qId = officer.order[officer.currentIndex];
  const q = getQuestionById(qId);
  const budget = q.secondsOverride ?? settings.secondsPerQuestion;
  const startedMs = new Date(officer.questionStartedAt).getTime();
  const elapsed = Math.max(0, (Date.now() - startedMs) / 1000);
  const spentSoFar = (officer.spent[qId] || 0) + elapsed;

  if (spentSoFar >= budget) {
    // Ran out while they were away (or between requests) - close it out
    // unanswered rather than grant more time, then serve whatever's next.
    officer.spent[qId] = budget;
    officer.closed.push(qId);
    officer.questionStartedAt = null;
    return serveCurrent(officer, settings);
  }

  return {
    done: false,
    remainingSeconds: Math.max(0, Math.round(budget - spentSoFar)),
    budgetSeconds: budget,
    question: questionPayload(officer),
  };
}

// Applies one officer action (answer or skip) to the question at
// `questionIndex`, then advances and serves whatever's next. Returns either
// an { error, status } pair, { done: true }, or the same shape as
// serveCurrent's question result. Mutates officer - caller must save it.
export function submitAnswer(officer, settings, { questionIndex, action, selectedOrigIdx, answerText }) {
  normalizePosition(officer);
  if (officer.currentIndex >= officer.order.length) {
    return { error: 'This assessment has no more open questions.', status: 409 };
  }
  if (questionIndex !== officer.currentIndex) {
    return { error: 'Question mismatch. Reload and try again.', status: 409 };
  }

  const qId = officer.order[officer.currentIndex];
  const q = getQuestionById(qId);
  const budget = q.secondsOverride ?? settings.secondsPerQuestion;
  const startedMs = new Date(officer.questionStartedAt).getTime();
  const elapsed = Math.max(0, (Date.now() - startedMs) / 1000);
  const spentSoFar = (officer.spent[qId] || 0) + elapsed;
  const expired = spentSoFar >= budget;

  if (expired) {
    // The clock is authoritative - a late-arriving answer loses to real time.
    officer.spent[qId] = budget;
    officer.closed.push(qId);
  } else {
    officer.spent[qId] = spentSoFar;
    if (action === 'skip') {
      if (q.skipPolicy === 'none') return { error: 'This question cannot be skipped.', status: 400 };
      if (q.skipPolicy === 'no_return') officer.closed.push(qId);
      // 'revisit' - leave it open; normalizePosition will resurface it later.
    } else {
      const hasAnswer = q.kind === 'text' ? String(answerText || '').trim().length > 0 : Number.isInteger(selectedOrigIdx);
      if (!hasAnswer) {
        officer.closed.push(qId); // gave up, or the client's own timer fired with nothing selected
      } else if (q.kind === 'text') {
        officer.answers[qId] = String(answerText).trim().slice(0, 5000);
      } else if (selectedOrigIdx < 0 || selectedOrigIdx >= q.options.length) {
        return { error: 'Invalid answer.', status: 400 };
      } else {
        officer.answers[qId] = selectedOrigIdx;
      }
    }
  }

  officer.currentIndex += 1;
  officer.questionStartedAt = null;
  return serveCurrent(officer, settings);
}

// Recomputed from scratch (not incrementally) so re-grading a text answer can
// never double-count. mcq questions always count; text questions only count
// once an admin has graded them (see app/api/admin/grade) - until then the
// officer's score reflects only what's actually been graded so far.
export function recomputeScore(officer) {
  let score = 0;
  let total = 0;
  for (const qId of officer.order) {
    const q = getQuestionById(qId);
    if (!q) continue;
    if (q.kind === 'text') {
      if (!Object.prototype.hasOwnProperty.call(officer.grades, qId)) continue;
      total++;
      if (officer.grades[qId]) score++;
    } else {
      total++;
      if (officer.answers[qId] === q.correctIndex) score++;
    }
  }
  officer.score = score;
  officer.totalQuestions = total;
}

export function finishOfficer(officer) {
  recomputeScore(officer);
  officer.status = 'submitted';
  officer.submittedAt = new Date().toISOString();
}

// The officer's own read-only paper: each question they saw, what they
// answered, and (now that the attempt is over) whether it was right - shown
// only after submission, never during the assessment itself.
export function buildReview(officer) {
  return officer.order
    .map((qId) => {
      const q = getQuestionById(qId);
      if (!q) return null; // deleted since submission
      const media = q.mediaFile ? { kind: q.mediaKind, url: mediaUrlFor(q.mediaFile, officer.code) } : null;
      const yourValue = officer.answers[qId];
      const answered = yourValue !== undefined;

      if (q.kind === 'text') {
        const graded = Object.prototype.hasOwnProperty.call(officer.grades, qId);
        return {
          kind: 'text',
          text: q.text,
          media,
          answered,
          yourAnswer: answered ? yourValue : null,
          graded,
          correct: graded ? !!officer.grades[qId] : null,
        };
      }

      return {
        kind: 'mcq',
        text: q.text,
        media,
        options: q.options,
        answered,
        yourIndex: answered ? yourValue : null,
        correctIndex: q.correctIndex,
        correct: answered && yourValue === q.correctIndex,
      };
    })
    .filter(Boolean);
}

export function pendingReviewCount(officer) {
  let count = 0;
  for (const qId of officer.order) {
    const q = getQuestionById(qId);
    if (!q || q.kind !== 'text') continue;
    if (officer.answers[qId] === undefined) continue;
    if (Object.prototype.hasOwnProperty.call(officer.grades, qId)) continue;
    count++;
  }
  return count;
}

export function officerEvents(officers) {
  const ev = [];
  officers.forEach((o) => {
    if (o.openedAt) ev.push({ t: o.openedAt, tag: 'opened', code: o.code, name: o.name });
    if (o.submittedAt) ev.push({ t: o.submittedAt, tag: 'submitted', code: o.code, name: o.name });
    (o.reopens || []).forEach((t) => ev.push({ t, tag: 'reopen', code: o.code, name: o.name }));
    (o.reuseAttempts || []).forEach((t) => ev.push({ t, tag: 'reuse_attempt', code: o.code, name: o.name }));
  });
  ev.sort((a, b) => new Date(b.t) - new Date(a.t));
  return ev;
}
