'use client';

import { Fragment, useEffect, useRef, useState } from 'react';
import { scoreLine } from '@/lib/quiz';

async function getJson(url) {
  const res = await fetch(url);
  let data = {};
  try {
    data = await res.json();
  } catch (e) {
    /* no body */
  }
  return { ok: res.ok, status: res.status, data };
}

async function sendJson(url, body, method = 'POST') {
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
  let data = {};
  try {
    data = await res.json();
  } catch (e) {
    /* no body */
  }
  return { ok: res.ok, status: res.status, data };
}

function normalizeHeader(h) {
  return String(h || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

const IMPORT_HEADER_MAP = {
  question: 'text',
  questiontext: 'text',
  text: 'text',
  q: 'text',
  a: 'optA',
  optiona: 'optA',
  answera: 'optA',
  choicea: 'optA',
  b: 'optB',
  optionb: 'optB',
  answerb: 'optB',
  choiceb: 'optB',
  c: 'optC',
  optionc: 'optC',
  answerc: 'optC',
  choicec: 'optC',
  d: 'optD',
  optiond: 'optD',
  answerd: 'optD',
  choiced: 'optD',
  e: 'optE',
  optione: 'optE',
  answere: 'optE',
  choicee: 'optE',
  f: 'optF',
  optionf: 'optF',
  answerf: 'optF',
  choicef: 'optF',
  correct: 'correct',
  answer: 'correct',
  correctanswer: 'correct',
  correctoption: 'correct',
  correctchoice: 'correct',
  key: 'correct',
};

function resolveCorrectIndex(correctRaw, options) {
  const v = String(correctRaw ?? '').trim();
  if (!v) return -1;
  if (/^[a-fA-F]$/.test(v)) return v.toUpperCase().charCodeAt(0) - 65;
  // Prefer matching the literal option text (e.g. a numeric-answer question where
  // "Correct" holds the answer itself, like "4") over treating a bare digit as a
  // 1-based position — text match is the less ambiguous signal when it hits.
  const textMatch = options.findIndex((o) => o.trim().toLowerCase() === v.toLowerCase());
  if (textMatch !== -1) return textMatch;
  if (/^[1-6]$/.test(v)) return parseInt(v, 10) - 1;
  return -1;
}

function parseImportRows(rawRows) {
  const questions = [];
  rawRows.forEach((raw, i) => {
    const mapped = {};
    Object.keys(raw).forEach((key) => {
      const target = IMPORT_HEADER_MAP[normalizeHeader(key)];
      if (target) mapped[target] = raw[key];
    });
    const text = String(mapped.text || '').trim();
    // Trailing blank columns (e.g. only A-D filled, E/F empty) are dropped so
    // 2-6 option questions can share one sheet without ragged blank options.
    const options = [mapped.optA, mapped.optB, mapped.optC, mapped.optD, mapped.optE, mapped.optF]
      .map((o) => String(o ?? '').trim())
      .filter(Boolean);
    if (!text && !options.length) return; // skip blank spreadsheet row
    const correctIndex = resolveCorrectIndex(mapped.correct, options);
    questions.push({ row: i + 2, text, options, correctIndex });
  });
  return questions;
}

function fmtTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return (
    d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) +
    ' ' +
    d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  );
}

// Mirrors lib/officerFlow.js's buildReview, but computed client-side from data
// already loaded (officers + questions) so viewing a paper needs no extra API call.
function buildOfficerPaper(officer, questions) {
  const qMap = new Map(questions.map((q) => [q.id, q]));
  return (officer.order || [])
    .map((qId) => {
      const q = qMap.get(qId);
      if (!q) return null;
      const yourValue = officer.answers ? officer.answers[qId] : undefined;
      const answered = yourValue !== undefined;
      if (q.kind === 'text') {
        const graded = officer.grades && Object.prototype.hasOwnProperty.call(officer.grades, qId);
        return {
          qId,
          kind: 'text',
          text: q.text,
          mediaFile: q.mediaFile,
          mediaKind: q.mediaKind,
          answered,
          yourAnswer: answered ? yourValue : null,
          graded,
          correct: graded ? !!officer.grades[qId] : null,
        };
      }
      return {
        qId,
        kind: 'mcq',
        text: q.text,
        mediaFile: q.mediaFile,
        mediaKind: q.mediaKind,
        options: q.options,
        answered,
        yourIndex: answered ? yourValue : null,
        correctIndex: q.correctIndex,
        correct: answered && yourValue === q.correctIndex,
      };
    })
    .filter(Boolean);
}

function pendingReviewRows(officers, questions) {
  const rows = [];
  officers.forEach((o) => {
    if (o.status !== 'submitted') return;
    buildOfficerPaper(o, questions).forEach((row) => {
      if (row.kind === 'text' && row.answered && !row.graded) {
        rows.push({ code: o.code, name: o.name, ...row });
      }
    });
  });
  return rows;
}

function PaperRow({ row }) {
  const badge = !row.answered
    ? { cls: 'unanswered', label: 'Not answered' }
    : row.kind === 'text' && !row.graded
      ? { cls: 'pending', label: 'Pending' }
      : row.correct
        ? { cls: 'correct', label: 'Correct' }
        : { cls: 'wrong', label: 'Incorrect' };
  return (
    <div className="qlist-item">
      {row.mediaFile && row.mediaKind === 'audio' && (
        <audio controls src={`/api/media/${row.mediaFile}`} style={{ width: '100%', marginBottom: '8px' }} />
      )}
      {row.mediaFile && row.mediaKind === 'image' && (
        <img src={`/api/media/${row.mediaFile}`} alt="" style={{ width: '100%', borderRadius: '6px', marginBottom: '8px' }} />
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px', marginBottom: '8px' }}>
        <div>{row.text}</div>
        <span className={'answer-badge ' + badge.cls}>{badge.label}</span>
      </div>
      {row.kind === 'mcq' ? (
        <div className="opts-mini" style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {row.options.map((o, oi) => {
            const isCorrect = oi === row.correctIndex;
            const isTheirs = oi === row.yourIndex;
            const color = isCorrect ? 'var(--teal)' : isTheirs ? 'var(--red)' : 'var(--muted)';
            return (
              <span key={oi} style={{ color, fontWeight: isCorrect || isTheirs ? 600 : 400 }}>
                {isCorrect ? '✓ ' : isTheirs ? '✗ ' : ''}
                {o}
                {isTheirs ? ' (their answer)' : ''}
              </span>
            );
          })}
          {!row.answered && <span style={{ color: 'var(--muted)', fontWeight: 400 }}>Not answered.</span>}
        </div>
      ) : (
        <div className="opts-mini">{row.answered ? <div>{row.yourAnswer}</div> : <span style={{ color: 'var(--muted)' }}>Not answered.</span>}</div>
      )}
    </div>
  );
}

function LogTab({ events }) {
  if (!events.length) {
    return (
      <div className="card">
        <div className="empty-state">
          No activity yet. Once officers start opening their codes, every event shows here in real time.
        </div>
      </div>
    );
  }
  const labels = { opened: 'OPENED', submitted: 'SUBMITTED', reopen: 'REOPENED', reuse_attempt: 'REUSE BLOCKED' };
  return (
    <div className="card">
      <h2>Audit trail</h2>
      <div className="log-feed">
        {events.map((e, i) => (
          <div className="log-row" key={i}>
            <span className="t">{fmtTime(e.t).split(' ').slice(-2).join(' ')}</span>
            <span className={'tag tag-' + e.tag}>{labels[e.tag]}</span>
            <span>
              {e.name} <span className="code-chip">{e.code}</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function OfficersTab({
  officers,
  questions,
  lastAdded,
  adminMsg,
  addingOfficer,
  nameRef,
  copiedCode,
  expandedCode,
  onAdd,
  onCopy,
  onReset,
  onDelete,
  onExport,
  onToggleExpand,
}) {
  return (
    <>
      <div className="card">
        <h2>
          Add officer <span className="tag">generates a single-use code</span>
        </h2>
        {adminMsg && <div className="msg msg-error">{adminMsg}</div>}
        <div className="row">
          <div className="field" style={{ flex: 2 }}>
            <input className="pt-input" ref={nameRef} placeholder="Officer full name" />
          </div>
          <div className="field">
            <button className="btn btn-primary btn-block" disabled={addingOfficer} onClick={onAdd}>
              {addingOfficer ? 'Generating...' : 'Generate code'}
            </button>
          </div>
        </div>
        <p style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '-6px' }}>
          Send each code to that officer only, individually (e.g. by DM). Do not post the list in a group.
        </p>
        {lastAdded && (
          <div className="msg msg-ok" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <span>
              Code for <strong>{lastAdded.name}</strong>:{' '}
              <span className="code-chip" style={{ fontSize: '14px' }}>
                {lastAdded.code}
              </span>{' '}
              &mdash; send this to them privately, it works once.
            </span>
            <button className="btn btn-ghost btn-small" onClick={() => onCopy(lastAdded.code)}>
              {copiedCode === lastAdded.code ? 'Copied!' : 'Copy code'}
            </button>
          </div>
        )}
      </div>
      <div className="card">
        <h2>
          Officers{' '}
          <button className="btn btn-ghost btn-small" style={{ float: 'right' }} onClick={onExport}>
            Export CSV
          </button>
        </h2>
        {officers.length ? (
          <table className="pt-table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Name</th>
                <th>Status</th>
                <th>Opened</th>
                <th>Submitted</th>
                <th>Score</th>
                <th>Flags</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {officers.map((o) => {
                const flags = [];
                if ((o.tabSwitches || 0) > 0) flags.push(o.tabSwitches + ' tab-switch' + (o.tabSwitches > 1 ? 'es' : ''));
                if ((o.reopens || []).length > 0) flags.push(o.reopens.length + ' reopen' + (o.reopens.length > 1 ? 's' : ''));
                if ((o.reuseAttempts || []).length > 0) flags.push(o.reuseAttempts.length + ' blocked reuse');
                const expanded = expandedCode === o.code;
                return (
                  <Fragment key={o.code}>
                    <tr>
                      <td>
                        <span className="code-chip">{o.code}</span>{' '}
                        <button className="btn btn-ghost btn-small" style={{ padding: '2px 6px', fontSize: '10px' }} onClick={() => onCopy(o.code)}>
                          {copiedCode === o.code ? 'Copied!' : 'Copy'}
                        </button>
                      </td>
                      <td>{o.name}</td>
                      <td>
                        <span className={'status-pill status-' + o.status}>{o.status.replace('_', ' ')}</span>
                      </td>
                      <td>{fmtTime(o.openedAt)}</td>
                      <td>{fmtTime(o.submittedAt)}</td>
                      <td>{o.status === 'submitted' ? scoreLine(o.score, o.totalQuestions).text : '—'}</td>
                      <td>
                        {flags.length ? <span className="flag-badge">{flags.join(', ')}</span> : <span style={{ color: 'var(--muted)' }}>—</span>}
                      </td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        {o.status === 'submitted' && (
                          <button className="btn btn-ghost btn-small" onClick={() => onToggleExpand(o.code)}>
                            {expanded ? 'Hide paper' : 'View paper'}
                          </button>
                        )}{' '}
                        <button className="btn btn-ghost btn-small" onClick={() => onReset(o.code)}>
                          Reset
                        </button>{' '}
                        <button className="btn btn-danger btn-small" onClick={() => onDelete(o.code)}>
                          Delete
                        </button>
                      </td>
                    </tr>
                    {expanded && (
                      <tr>
                        <td colSpan={8} style={{ background: 'var(--panel-2)' }}>
                          {buildOfficerPaper(o, questions).map((row) => (
                            <PaperRow key={row.qId} row={row} />
                          ))}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        ) : (
          <div className="empty-state">No officers added yet.</div>
        )}
      </div>
    </>
  );
}

function GradingTab({ rows, onGrade }) {
  return (
    <div className="card">
      <h2>Pending review ({rows.length})</h2>
      {rows.length ? (
        rows.map((r) => (
          <div className="qlist-item" key={r.code + ':' + r.qId}>
            <div style={{ marginBottom: '8px' }}>
              <strong>{r.name}</strong> <span className="code-chip">{r.code}</span>
            </div>
            <div className="opts-mini" style={{ marginBottom: '8px' }}>
              {r.text}
            </div>
            <div
              style={{
                background: 'var(--ink)',
                border: '1px solid var(--border)',
                borderRadius: '6px',
                padding: '10px',
                marginBottom: '10px',
                fontSize: '13px',
              }}
            >
              {r.yourAnswer}
            </div>
            <div className="row">
              <button className="btn btn-primary btn-small" onClick={() => onGrade(r.code, r.qId, true)}>
                Correct
              </button>
              <button className="btn btn-danger btn-small" onClick={() => onGrade(r.code, r.qId, false)}>
                Incorrect
              </button>
            </div>
          </div>
        ))
      ) : (
        <div className="empty-state">Nothing waiting on review.</div>
      )}
    </div>
  );
}

const SKIP_LABELS = {
  revisit: 'Skip: can return',
  no_return: 'Skip: no return',
  none: 'No skip',
};

function QuestionsTab({
  questions,
  qTextRef,
  qKind,
  setQKind,
  qOptions,
  setQOptions,
  qCorrectIndex,
  setQCorrectIndex,
  qSkipPolicy,
  setQSkipPolicy,
  qSecondsRef,
  qMedia,
  qMediaBusy,
  qMediaErr,
  onMediaChange,
  onRemoveMedia,
  qErr,
  editingId,
  formRef,
  onAdd,
  onEdit,
  onCancelEdit,
  onDelete,
  fileInputRef,
  importBusy,
  importMsg,
  importResult,
  onImportFile,
}) {
  function updateOption(i, val) {
    setQOptions(qOptions.map((o, idx) => (idx === i ? val : o)));
  }
  function addOption() {
    if (qOptions.length >= 6) return;
    setQOptions([...qOptions, '']);
  }
  function removeOption(i) {
    if (qOptions.length <= 2) return;
    setQOptions(qOptions.filter((_, idx) => idx !== i));
    if (qCorrectIndex >= qOptions.length - 1) setQCorrectIndex(Math.max(0, qOptions.length - 2));
    else if (qCorrectIndex === i) setQCorrectIndex(0);
    else if (qCorrectIndex > i) setQCorrectIndex(qCorrectIndex - 1);
  }

  return (
    <>
      <div className="card">
        <h2>
          Bulk import <span className="tag">.xlsx or .csv</span>
        </h2>
        <p style={{ fontSize: '12px', color: 'var(--muted)' }}>
          Columns: <strong>Question, A, B, C, D, E, F, Correct</strong> (2-6 options; leave unused option columns
          blank) — Correct can be the letter or the matching option text. Multiple choice only — written-answer and
          media questions are added one at a time below.
        </p>
        {importMsg && <div className="msg msg-error">{importMsg}</div>}
        {importResult && (
          <div className={importResult.errors.length ? 'msg msg-error' : 'msg msg-ok'}>
            Imported {importResult.inserted} question{importResult.inserted === 1 ? '' : 's'}.
            {importResult.errors.length > 0 && (
              <>
                {' '}
                {importResult.errors.length} row{importResult.errors.length === 1 ? '' : 's'} skipped:
                <ul style={{ margin: '6px 0 0 18px' }}>
                  {importResult.errors.map((e, i) => (
                    <li key={i}>
                      Row {e.row}: {e.error}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}
        <input type="file" accept=".xlsx,.csv" ref={fileInputRef} onChange={onImportFile} disabled={importBusy} />
        {importBusy && (
          <p style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '8px' }}>Importing&hellip;</p>
        )}
      </div>
      <div className="card" ref={formRef}>
        <h2>{editingId ? 'Edit question' : 'Add question'}</h2>
        <div className="field">
          <label className="pt-label">Question type</label>
          <select className="pt-select" value={qKind} onChange={(e) => setQKind(e.target.value)}>
            <option value="mcq">Multiple choice</option>
            <option value="text">Written answer</option>
          </select>
        </div>
        <div className="field">
          <textarea className="pt-textarea" ref={qTextRef} rows={2} placeholder="Question text" />
        </div>

        {qKind === 'mcq' && (
          <div className="field">
            <label className="pt-label">Options ({qOptions.length})</label>
            {qOptions.map((opt, i) => (
              <div className="opt-row" key={i}>
                <input
                  type="radio"
                  name="qCorrect"
                  checked={qCorrectIndex === i}
                  onChange={() => setQCorrectIndex(i)}
                  title="Correct answer"
                />
                <input
                  className="pt-input"
                  value={opt}
                  placeholder={`Option ${String.fromCharCode(65 + i)}`}
                  onChange={(e) => updateOption(i, e.target.value)}
                />
                {qOptions.length > 2 && (
                  <button className="btn btn-ghost btn-small" onClick={() => removeOption(i)} title="Remove option">
                    &times;
                  </button>
                )}
              </div>
            ))}
            {qOptions.length < 6 && (
              <button className="btn btn-ghost btn-small" onClick={addOption}>
                + Add option
              </button>
            )}
            <p style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '6px' }}>
              Select the radio button next to the correct option.
            </p>
          </div>
        )}

        <div className="field">
          <label className="pt-label">Attach audio or image (optional)</label>
          <p style={{ fontSize: '11px', color: 'var(--muted)', margin: '-2px 0 8px' }}>
            Audio: mp3, m4a, wav, ogg (max 25MB). Image: png, jpg, webp (max 5MB).
          </p>
          {qMedia ? (
            <div className="row" style={{ alignItems: 'center' }}>
              <span className="code-chip">
                {qMedia.kind}: {qMedia.file}
              </span>
              <button className="btn btn-ghost btn-small" onClick={onRemoveMedia}>
                Remove
              </button>
            </div>
          ) : (
            <input
              type="file"
              accept=".mp3,.m4a,.wav,.ogg,.png,.jpg,.jpeg,.webp"
              onChange={onMediaChange}
              disabled={qMediaBusy}
            />
          )}
          {qMediaBusy && <p style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '6px' }}>Uploading&hellip;</p>}
          {qMediaErr && (
            <div className="msg msg-error" style={{ marginTop: '8px' }}>
              {qMediaErr}
            </div>
          )}
        </div>

        <div className="row">
          <div className="field">
            <label className="pt-label">Skip behaviour</label>
            <select className="pt-select" value={qSkipPolicy} onChange={(e) => setQSkipPolicy(e.target.value)}>
              <option value="revisit">Can skip, can return</option>
              <option value="no_return">Can skip, no return</option>
              <option value="none">Cannot skip</option>
            </select>
          </div>
          <div className="field">
            <label className="pt-label">Time override (seconds, optional)</label>
            <input className="pt-input" type="number" min={5} ref={qSecondsRef} placeholder="Use default" />
          </div>
        </div>

        {qErr && <div className="msg msg-error">{qErr}</div>}
        <div style={{ display: 'flex', gap: '10px' }}>
          <button className="btn btn-primary" onClick={onAdd}>
            {editingId ? 'Save changes' : 'Add question'}
          </button>
          {editingId && (
            <button className="btn btn-ghost" onClick={onCancelEdit}>
              Cancel
            </button>
          )}
        </div>
      </div>
      <div className="card">
        <h2>Question bank ({questions.length})</h2>
        {questions.length ? (
          questions.map((q, i) => (
            <div className="qlist-item" key={q.id} style={q.id === editingId ? { borderColor: 'var(--amber)' } : undefined}>
              <div className="qmeta">
                <div>
                  <strong>Q{i + 1}.</strong> {q.text}
                  {q.kind === 'text' ? (
                    <div className="opts-mini">Written answer &mdash; graded manually.</div>
                  ) : (
                    <div className="opts-mini">
                      {q.options.map((o, oi) => (
                        <span key={oi}>
                          {oi > 0 && ' ·  '}
                          {oi === q.correctIndex ? <span className="correct-mark">✓ {o}</span> : o}
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="qtags">
                    <span className="qtag">{q.kind === 'text' ? 'Written' : 'Multiple choice'}</span>
                    <span className="qtag">{SKIP_LABELS[q.skipPolicy] || SKIP_LABELS.revisit}</span>
                    {q.secondsOverride ? <span className="qtag">{q.secondsOverride}s</span> : null}
                    {q.mediaFile ? <span className="qtag">{q.mediaKind}</span> : null}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                  <button className="btn btn-ghost btn-small" onClick={() => onEdit(q)}>
                    Edit
                  </button>
                  <button className="btn btn-ghost btn-small" onClick={() => onDelete(q.id)}>
                    Remove
                  </button>
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className="empty-state">No questions yet.</div>
        )}
      </div>
    </>
  );
}

function SettingsTab({
  settings,
  questionBankSize,
  setTitleRef,
  setQuarterRef,
  setSecondsRef,
  setQuestionsPerRef,
  setShowScoreRef,
  setShowReviewRef,
  newPassRef,
  onSave,
  onChangePass,
}) {
  return (
    <>
      <div className="card">
        <div className="field">
          <label className="pt-label">Test title</label>
          <input className="pt-input" ref={setTitleRef} defaultValue={settings.title} />
        </div>
        <div className="row">
          <div className="field">
            <label className="pt-label">Quarter label</label>
            <input className="pt-input" ref={setQuarterRef} defaultValue={settings.quarter} />
          </div>
          <div className="field">
            <label className="pt-label">Seconds per question</label>
            <input className="pt-input" type="number" min={10} ref={setSecondsRef} defaultValue={settings.secondsPerQuestion} />
          </div>
        </div>
        <div className="field">
          <label className="pt-label">Questions per assessment</label>
          <input
            className="pt-input"
            type="number"
            min={1}
            max={questionBankSize || undefined}
            ref={setQuestionsPerRef}
            defaultValue={settings.questionsPerAssessment || ''}
            placeholder={`Blank = all ${questionBankSize} in the bank`}
          />
          <p style={{ fontSize: '11px', color: 'var(--muted)', margin: '6px 0 0' }}>
            Each officer gets a different random selection of this many questions from the bank, in a random order -
            not the same set every time. Leave blank to give everyone every question.
          </p>
        </div>
        <div className="field" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input type="checkbox" id="setShowScore" ref={setShowScoreRef} defaultChecked={settings.showScoreToOfficer} />
          <label htmlFor="setShowScore" style={{ fontSize: '13px' }}>
            Show officers their score after submitting
          </label>
        </div>
        <div className="field" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input type="checkbox" id="setShowReview" ref={setShowReviewRef} defaultChecked={settings.showReviewToOfficer} />
          <label htmlFor="setShowReview" style={{ fontSize: '13px' }}>
            Let officers review their own answers (right/wrong) after submitting, including by re-entering their code
          </label>
        </div>
        <button className="btn btn-primary" onClick={onSave}>
          Save settings
        </button>
      </div>
      <div className="card">
        <h2>Change admin passcode</h2>
        <div className="row">
          <div className="field">
            <input className="pt-input" type="password" ref={newPassRef} placeholder="New passcode" />
          </div>
          <div className="field">
            <button className="btn btn-ghost btn-block" onClick={onChangePass}>
              Update
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

export default function AdminPortal() {
  const [phase, setPhase] = useState('loading'); // loading | setup | login | dashboard
  const [passErr, setPassErr] = useState('');
  const [tab, setTab] = useState('log');

  const [officers, setOfficers] = useState([]);
  const [events, setEvents] = useState([]);
  const [questions, setQuestions] = useState([]);
  const [settings, setSettings] = useState(null);

  const [lastAdded, setLastAdded] = useState(null);
  const [adminMsg, setAdminMsg] = useState('');
  const [addingOfficer, setAddingOfficer] = useState(false);
  const [copiedCode, setCopiedCode] = useState('');
  const [expandedCode, setExpandedCode] = useState(null);
  const [importBusy, setImportBusy] = useState(false);
  const [importMsg, setImportMsg] = useState('');
  const [importResult, setImportResult] = useState(null);

  const [qKind, setQKind] = useState('mcq');
  const [qOptions, setQOptions] = useState(['', '']);
  const [qCorrectIndex, setQCorrectIndex] = useState(0);
  const [qSkipPolicy, setQSkipPolicy] = useState('revisit');
  const [qMedia, setQMedia] = useState(null);
  const [qMediaBusy, setQMediaBusy] = useState(false);
  const [qMediaErr, setQMediaErr] = useState('');
  const [qErr, setQErr] = useState('');
  const [editingId, setEditingId] = useState(null);

  const passRef = useRef(null);
  const nameRef = useRef(null);
  const qTextRef = useRef(null);
  const qSecondsRef = useRef(null);
  const qFormRef = useRef(null);
  const fileInputRef = useRef(null);
  const setTitleRef = useRef(null);
  const setQuarterRef = useRef(null);
  const setSecondsRef = useRef(null);
  const setQuestionsPerRef = useRef(null);
  const setShowScoreRef = useRef(null);
  const setShowReviewRef = useRef(null);
  const newPassRef = useRef(null);

  useEffect(() => {
    checkSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function checkSession() {
    const { data } = await getJson('/api/admin/session');
    if (data.authenticated) {
      setPhase('dashboard');
      loadAll();
    } else if (data.needsSetup) {
      setPhase('setup');
    } else {
      setPhase('login');
    }
  }

  async function loadAll() {
    const [o, q, s] = await Promise.all([getJson('/api/admin/officers'), getJson('/api/admin/questions'), getJson('/api/admin/settings')]);
    if (o.ok) {
      setOfficers(o.data.officers);
      setEvents(o.data.events);
    }
    if (q.ok) setQuestions(q.data.questions);
    if (s.ok) setSettings(s.data.settings);
  }

  async function refreshOfficers() {
    const o = await getJson('/api/admin/officers');
    if (o.ok) {
      setOfficers(o.data.officers);
      setEvents(o.data.events);
    }
  }

  async function submitPasscode() {
    setPassErr('');
    const val = (passRef.current?.value || '').trim();
    if (!val) return;
    const { ok, data } = await sendJson('/api/admin/login', { passcode: val });
    if (!ok) {
      setPassErr(data.error || 'Incorrect passcode.');
      return;
    }
    setPhase('dashboard');
    loadAll();
  }

  async function logout() {
    await sendJson('/api/admin/logout', {});
    setPhase('login');
  }

  async function addOfficer() {
    const name = (nameRef.current?.value || '').trim();
    setAdminMsg('');
    if (!name) {
      setAdminMsg("Enter the officer's name first.");
      return;
    }
    setAddingOfficer(true);
    const { ok, data } = await sendJson('/api/admin/officers', { name });
    setAddingOfficer(false);
    if (!ok) {
      setAdminMsg(data.error || 'Could not save this officer — try again in a moment.');
      setLastAdded(null);
      return;
    }
    setLastAdded({ code: data.officer.code, name: data.officer.name });
    if (nameRef.current) nameRef.current.value = '';
    refreshOfficers();
  }

  async function copyCode(code) {
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(code);
      setCopiedCode(code);
      setTimeout(() => setCopiedCode(''), 1200);
    } catch (e) {
      /* clipboard unavailable */
    }
  }

  async function resetOfficerCode(code) {
    await sendJson(`/api/admin/officers/${encodeURIComponent(code)}/reset`, {});
    refreshOfficers();
  }

  async function deleteOfficerCode(code) {
    if (!window.confirm(`Delete ${code} permanently? This removes their name, code, and full history - it can't be undone.`)) {
      return;
    }
    await sendJson(`/api/admin/officers/${encodeURIComponent(code)}`, {}, 'DELETE');
    if (expandedCode === code) setExpandedCode(null);
    refreshOfficers();
  }

  async function gradeAnswer(code, questionId, correct) {
    await sendJson('/api/admin/grade', { code, questionId, correct });
    refreshOfficers();
  }

  function exportCsv() {
    window.location.href = '/api/admin/officers/export';
  }

  async function onMediaChange(e) {
    const file = e.target.files?.[0];
    if (e.target) e.target.value = '';
    if (!file) return;
    setQMediaErr('');
    setQMediaBusy(true);
    const form = new FormData();
    form.append('file', file);
    const res = await fetch('/api/admin/upload', { method: 'POST', body: form });
    let data = {};
    try {
      data = await res.json();
    } catch (e) {
      /* no body */
    }
    setQMediaBusy(false);
    if (!res.ok) {
      setQMediaErr(data.error || 'Upload failed.');
      return;
    }
    setQMedia({ file: data.file, kind: data.kind });
  }

  function removeMedia() {
    setQMedia(null);
    setQMediaErr('');
  }

  function resetQuestionForm() {
    if (qTextRef.current) qTextRef.current.value = '';
    if (qSecondsRef.current) qSecondsRef.current.value = '';
    setQKind('mcq');
    setQOptions(['', '']);
    setQCorrectIndex(0);
    setQSkipPolicy('revisit');
    setQMedia(null);
    setQMediaErr('');
    setQErr('');
    setEditingId(null);
  }

  function editQuestion(q) {
    setEditingId(q.id);
    setQErr('');
    setQMediaErr('');
    setQKind(q.kind);
    setQOptions(q.kind === 'mcq' && q.options.length ? q.options : ['', '']);
    setQCorrectIndex(q.kind === 'mcq' ? q.correctIndex : 0);
    setQSkipPolicy(q.skipPolicy);
    setQMedia(q.mediaFile ? { file: q.mediaFile, kind: q.mediaKind } : null);
    if (qTextRef.current) qTextRef.current.value = q.text;
    if (qSecondsRef.current) qSecondsRef.current.value = q.secondsOverride || '';
    qFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function addOrUpdateQuestion() {
    setQErr('');
    const text = (qTextRef.current?.value || '').trim();
    if (!text) {
      setQErr('Question text is required.');
      return;
    }

    const secondsRaw = (qSecondsRef.current?.value || '').trim();
    const secondsOverride = secondsRaw ? parseInt(secondsRaw, 10) : null;

    const body = {
      text,
      kind: qKind,
      skipPolicy: qSkipPolicy,
      secondsOverride,
      mediaKind: qMedia?.kind || null,
      mediaFile: qMedia?.file || null,
    };

    if (qKind === 'mcq') {
      const opts = qOptions.map((o) => o.trim());
      if (opts.some((o) => !o)) {
        setQErr('Fill in every option, or remove the empty one.');
        return;
      }
      body.options = opts;
      body.correctIndex = qCorrectIndex;
    }

    const url = editingId ? `/api/admin/questions/${editingId}` : '/api/admin/questions';
    const { ok, data } = await sendJson(url, body, editingId ? 'PUT' : 'POST');
    if (!ok) {
      setQErr(data.error || 'Could not save this question.');
      return;
    }
    resetQuestionForm();
    const q = await getJson('/api/admin/questions');
    if (q.ok) setQuestions(q.data.questions);
  }

  async function onImportFile(e) {
    const file = e.target.files?.[0];
    if (e.target) e.target.value = '';
    if (!file) return;

    setImportMsg('');
    setImportResult(null);

    const name = file.name.toLowerCase();
    if (!name.endsWith('.xlsx') && !name.endsWith('.csv')) {
      setImportMsg('Only .xlsx and .csv files are supported.');
      return;
    }

    setImportBusy(true);
    let rawRows;
    try {
      const XLSX = await import('xlsx');
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      rawRows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
    } catch (err) {
      setImportBusy(false);
      setImportMsg('Could not read that file — make sure it is a valid .xlsx or .csv.');
      return;
    }

    const questions = parseImportRows(rawRows);
    if (!questions.length) {
      setImportBusy(false);
      setImportMsg('No question rows found. Check the column headers (Question, A, B, C, D, Correct).');
      return;
    }

    const { ok, data } = await sendJson('/api/admin/questions/bulk', { questions });
    setImportBusy(false);
    if (!ok) {
      setImportMsg(data.error || 'Import failed.');
      return;
    }
    setImportResult(data);
    const q = await getJson('/api/admin/questions');
    if (q.ok) setQuestions(q.data.questions);
  }

  async function deleteQuestionById(id) {
    await sendJson(`/api/admin/questions/${id}`, {}, 'DELETE');
    if (editingId === id) resetQuestionForm();
    const q = await getJson('/api/admin/questions');
    if (q.ok) setQuestions(q.data.questions);
  }

  async function saveSettings() {
    const questionsPerRaw = (setQuestionsPerRef.current?.value || '').trim();
    const body = {
      title: setTitleRef.current?.value.trim(),
      quarter: setQuarterRef.current?.value.trim(),
      secondsPerQuestion: parseInt(setSecondsRef.current?.value, 10),
      questionsPerAssessment: questionsPerRaw ? parseInt(questionsPerRaw, 10) : null,
      showScoreToOfficer: !!setShowScoreRef.current?.checked,
      showReviewToOfficer: !!setShowReviewRef.current?.checked,
    };
    const { ok, data } = await sendJson('/api/admin/settings', body, 'PUT');
    if (ok) setSettings(data.settings);
  }

  async function changePasscode() {
    const v = (newPassRef.current?.value || '').trim();
    if (!v) return;
    const { ok } = await sendJson('/api/admin/passcode', { newPasscode: v });
    if (ok && newPassRef.current) newPassRef.current.value = '';
  }

  if (phase === 'loading') return null;

  if (phase === 'setup' || phase === 'login') {
    return (
      <div className="wrap narrow">
        <div className="code-entry">
          <div className="eyebrow">Admin</div>
          <h1 className="pt-title" style={{ fontSize: '20px' }}>
            {phase === 'setup' ? 'Set an admin passcode' : 'Enter admin passcode'}
          </h1>
          {passErr && <div className="msg msg-error">{passErr}</div>}
          <input
            className="pt-input"
            type="password"
            ref={passRef}
            placeholder="Passcode"
            style={{ maxWidth: '260px', margin: '0 auto' }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submitPasscode();
            }}
          />
          <div style={{ height: '14px' }} />
          <button className="btn btn-primary" onClick={submitPasscode}>
            {phase === 'setup' ? 'Save passcode' : 'Enter'}
          </button>
          <div>
            <a className="pt-footer-link" href="/">
              &larr; Officer view
            </a>
          </div>
        </div>
      </div>
    );
  }

  const tabs = ['log', 'officers', 'questions', 'grading', 'settings'];
  const tabLabels = {
    log: 'Live log',
    officers: 'Officers & codes',
    questions: 'Questions',
    grading: 'Grading',
    settings: 'Settings',
  };
  const pendingRows = pendingReviewRows(officers, questions);

  return (
    <div className="wrap">
      <div className="eyebrow">Admin</div>
      <h1 className="pt-title">{settings?.title || 'Test Portal'}</h1>
      <p className="pt-sub">
        {settings?.quarter} &middot; {questions.length} questions &middot; {officers.length} officers registered
      </p>
      <div className="tabbar">
        {tabs.map((t) => (
          <button key={t} className={'tabbtn' + (tab === t ? ' active' : '')} onClick={() => setTab(t)}>
            {tabLabels[t]}
            {t === 'grading' && pendingRows.length > 0 ? ` (${pendingRows.length})` : ''}
          </button>
        ))}
      </div>

      {tab === 'log' && <LogTab events={events} />}
      {tab === 'officers' && (
        <OfficersTab
          officers={officers}
          questions={questions}
          lastAdded={lastAdded}
          adminMsg={adminMsg}
          addingOfficer={addingOfficer}
          nameRef={nameRef}
          copiedCode={copiedCode}
          expandedCode={expandedCode}
          onAdd={addOfficer}
          onCopy={copyCode}
          onReset={resetOfficerCode}
          onDelete={deleteOfficerCode}
          onExport={exportCsv}
          onToggleExpand={(code) => setExpandedCode(expandedCode === code ? null : code)}
        />
      )}
      {tab === 'grading' && <GradingTab rows={pendingRows} onGrade={gradeAnswer} />}
      {tab === 'questions' && (
        <QuestionsTab
          questions={questions}
          qTextRef={qTextRef}
          qKind={qKind}
          setQKind={setQKind}
          qOptions={qOptions}
          setQOptions={setQOptions}
          qCorrectIndex={qCorrectIndex}
          setQCorrectIndex={setQCorrectIndex}
          qSkipPolicy={qSkipPolicy}
          setQSkipPolicy={setQSkipPolicy}
          qSecondsRef={qSecondsRef}
          qMedia={qMedia}
          qMediaBusy={qMediaBusy}
          qMediaErr={qMediaErr}
          onMediaChange={onMediaChange}
          onRemoveMedia={removeMedia}
          qErr={qErr}
          editingId={editingId}
          formRef={qFormRef}
          onAdd={addOrUpdateQuestion}
          onEdit={editQuestion}
          onCancelEdit={resetQuestionForm}
          onDelete={deleteQuestionById}
          fileInputRef={fileInputRef}
          importBusy={importBusy}
          importMsg={importMsg}
          importResult={importResult}
          onImportFile={onImportFile}
        />
      )}
      {tab === 'settings' && settings && (
        <SettingsTab
          settings={settings}
          questionBankSize={questions.length}
          setTitleRef={setTitleRef}
          setQuarterRef={setQuarterRef}
          setSecondsRef={setSecondsRef}
          setQuestionsPerRef={setQuestionsPerRef}
          setShowScoreRef={setShowScoreRef}
          setShowReviewRef={setShowReviewRef}
          newPassRef={newPassRef}
          onSave={saveSettings}
          onChangePass={changePasscode}
        />
      )}

      <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
        <a className="pt-footer-link" href="/">
          &larr; Officer view
        </a>
        <button className="pt-footer-link" onClick={logout}>
          Log out
        </button>
      </div>
    </div>
  );
}
