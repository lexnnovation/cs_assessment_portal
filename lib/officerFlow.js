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
// or past the end of `order` once nothing is left open.
function normalizePosition(officer) {
  const atCurrent = officer.currentIndex < officer.order.length ? officer.order[officer.currentIndex] : null;
  if (atCurrent != null && isOpen(officer, atCurrent)) return;

  for (let i = officer.currentIndex + 1; i < officer.order.length; i++) {
    if (isOpen(officer, officer.order[i])) {
      officer.currentIndex = i;
      return;
    }
  }
  for (let i = 0; i <= officer.currentIndex && i < officer.order.length; i++) {
    if (isOpen(officer, officer.order[i])) {
      officer.currentIndex = i;
      return;
    }
  }
  officer.currentIndex = officer.order.length;
}

// One clock for the whole test, started the first time a question is served
// and measured against the server, so refreshing or reopening never grants
// more time.
function secondsLeft(officer, settings) {
  if (!officer.startedAt) officer.startedAt = new Date().toISOString();
  const deadlineMs = new Date(officer.startedAt).getTime() + settings.totalMinutes * 60_000;
  return Math.max(0, (deadlineMs - Date.now()) / 1000);
}

// If the clock has run out, submits whatever is answered so far (open
// questions simply count as unanswered). Returns true when it did, in which
// case the caller must saveOfficer() and tell the client the test is done.
export function expireIfTimeUp(officer, settings) {
  if (officer.status !== 'in_progress' || secondsLeft(officer, settings) > 0) return false;
  finishOfficer(officer);
  return true;
}

function mediaUrlFor(mediaFile, code) {
  return mediaFile ? `/api/media/${mediaFile}?code=${encodeURIComponent(code)}` : null;
}

// Never includes the correct answer - only shuffled option text (for mcq) or
// nothing (for text, since there's nothing to shuffle or hide).
function questionPayload(officer, index = officer.currentIndex) {
  const qId = officer.order[index];
  const q = getQuestionById(qId);
  const media = q.mediaFile ? { kind: q.mediaKind, url: mediaUrlFor(q.mediaFile, officer.code) } : null;

  if (q.kind === 'text') {
    return { index, total: officer.order.length, kind: 'text', text: q.text, skipPolicy: q.skipPolicy, media };
  }

  const optOrder = optionOrderFor(officer.code, qId, q.options.length);
  const options = optOrder.map((origIdx, shownIdx) => ({
    letter: String.fromCharCode(65 + shownIdx),
    origIdx,
    text: q.options[origIdx],
  }));
  return { index, total: officer.order.length, kind: 'mcq', text: q.text, options, skipPolicy: q.skipPolicy, media };
}

// The single source of truth for "what should this officer see right now."
// Mutates officer (position and the start of the clock) - callers must
// saveOfficer() afterward regardless of whether the result is `done` or a
// question. Callers check expireIfTimeUp() first.
export function serveCurrent(officer, settings) {
  normalizePosition(officer);
  const remainingSeconds = secondsLeft(officer, settings);
  if (officer.currentIndex >= officer.order.length) {
    return { done: true, remainingSeconds, totalSeconds: settings.totalMinutes * 60 };
  }

  return {
    done: false,
    remainingSeconds,
    totalSeconds: settings.totalMinutes * 60,
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

  if (action === 'skip') {
    if (q.skipPolicy === 'none') return { error: 'This question cannot be skipped.', status: 400 };
    if (q.skipPolicy === 'no_return') officer.closed.push(qId);
    // 'revisit' - leave it open; normalizePosition will resurface it later.
  } else {
    const hasAnswer = q.kind === 'text' ? String(answerText || '').trim().length > 0 : Number.isInteger(selectedOrigIdx);
    if (!hasAnswer) {
      officer.closed.push(qId); // gave up with nothing selected
    } else if (q.kind === 'text') {
      officer.answers[qId] = String(answerText).trim().slice(0, 5000);
    } else if (selectedOrigIdx < 0 || selectedOrigIdx >= q.options.length) {
      return { error: 'Invalid answer.', status: 400 };
    } else {
      officer.answers[qId] = selectedOrigIdx;
    }
  }

  officer.currentIndex += 1;
  return serveCurrent(officer, settings);
}

// What the client gets once an attempt is submitted - by the officer or by
// the clock running out.
export function finishedPayload(officer, settings) {
  return {
    status: 'done',
    score: settings.showScoreToOfficer ? officer.score : null,
    totalQuestions: officer.totalQuestions,
  };
}

// The pre-submit paper: every question in order with what the officer chose,
// so they can look it over and change answers before submitting. Same shape
// as a served question (shuffled options, no correct answer), plus their
// current answer and whether it can still be changed - a question skipped
// for good ("no return") stays locked.
export function buildDraft(officer) {
  return officer.order
    .map((qId, index) => {
      if (!getQuestionById(qId)) return null; // deleted mid-assessment
      const payload = questionPayload(officer, index);
      const answered = officer.answers[qId] !== undefined;
      return { ...payload, answered, yourValue: answered ? officer.answers[qId] : null, editable: answered };
    })
    .filter(Boolean);
}

// Replaces an already-given answer from the review screen, while the test
// clock is still running. Returns { error,
// status } or { ok: true }. Mutates officer - caller must save it.
export function changeAnswer(officer, { questionIndex, selectedOrigIdx, answerText }) {
  const qId = officer.order[questionIndex];
  const q = qId === undefined ? null : getQuestionById(qId);
  if (!q) return { error: 'Question not found.', status: 404 };
  if (officer.answers[qId] === undefined) {
    return { error: 'This question can no longer be answered.', status: 409 };
  }

  if (q.kind === 'text') {
    const text = String(answerText || '').trim();
    if (!text) return { error: 'Written answers cannot be empty.', status: 400 };
    officer.answers[qId] = text.slice(0, 5000);
  } else {
    if (!Number.isInteger(selectedOrigIdx) || selectedOrigIdx < 0 || selectedOrigIdx >= q.options.length) {
      return { error: 'Invalid answer.', status: 400 };
    }
    officer.answers[qId] = selectedOrigIdx;
  }
  return { ok: true };
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
      const mediaFile = q.mediaFile;
      const mediaKind = q.mediaKind;

      if (q.kind === 'text') {
        const graded = Object.prototype.hasOwnProperty.call(officer.grades, qId);
        return {
          kind: 'text',
          text: q.text,
          media,
          mediaFile,
          mediaKind,
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
        mediaFile,
        mediaKind,
        options: q.options,
        answered,
        yourIndex: answered ? yourValue : null,
        correctIndex: q.correctIndex,
        correct: answered && yourValue === q.correctIndex,
      };
    })
    .filter(Boolean);
}

// A frozen copy of a finished attempt - questions, answers and results as they
// were - so it survives the admin editing the question bank before the next
// round. Kept as the officer's one "previous quiz" when they're reset.
export function buildSnapshot(officer, settings) {
  return {
    title: settings.title,
    quarter: settings.quarter,
    submittedAt: officer.submittedAt,
    score: officer.score,
    totalQuestions: officer.totalQuestions,
    questions: buildReview(officer),
  };
}

// The officer-facing view of their saved previous quiz, or null when they
// have none or the admin hasn't turned answer review on. Score is hidden
// unless the admin allows officers to see scores.
export function previousForOfficer(officer, settings) {
  if (!officer.previous || !settings.showReviewToOfficer) return null;
  const { title, quarter, submittedAt, score, totalQuestions, questions } = officer.previous;
  return {
    title,
    quarter,
    submittedAt,
    score: settings.showScoreToOfficer ? score : null,
    totalQuestions,
    pendingCount: questions.filter((q) => q.kind === 'text' && q.answered && !q.graded).length,
    questions,
  };
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
