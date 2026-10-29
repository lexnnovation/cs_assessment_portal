'use client';

import { useEffect, useRef, useState } from 'react';
import { scoreLine } from '@/lib/quiz';

async function postJson(url, body) {
  const res = await fetch(url, {
    method: 'POST',
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

function formatClock(sec) {
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}

function Watermark({ name, code }) {
  const label = `${name} · ${code} · ${new Date().toLocaleString()}`;
  return (
    <div className="watermark-layer" style={{ gridTemplateColumns: 'repeat(4, 1fr)', alignContent: 'space-between' }}>
      {Array.from({ length: 24 }).map((_, i) => (
        <span key={i}>{label}</span>
      ))}
    </div>
  );
}

// Score + "my answers" tabs, shared by the post-submit screen and the
// previous-results modal.
function ResultsTabs({ data, score, total, tab, setTab }) {
  const showScore = score != null;
  const line = showScore ? scoreLine(score, total) : null;
  return (
    <>
      <div className="tabbar" style={{ justifyContent: 'center' }}>
        <button className={'tabbtn' + (tab === 'score' ? ' active' : '')} onClick={() => setTab('score')}>
          Score
        </button>
        <button className={'tabbtn' + (tab === 'review' ? ' active' : '')} onClick={() => setTab('review')}>
          My answers
        </button>
      </div>

      {tab === 'score' && (
        <div className="card" style={{ textAlign: 'center' }}>
          {showScore ? (
            <>
              <div className="score-label">Your score</div>
              <div className="score-big" style={{ color: 'var(--teal)' }}>
                {line.pct}%
              </div>
              <div style={{ color: 'var(--muted)', fontSize: '14px', marginTop: '8px' }}>
                {score} of {total} correct
              </div>
              {data.pendingCount > 0 && (
                <div style={{ color: 'var(--amber)', fontSize: '13px', marginTop: '10px' }}>
                  {data.pendingCount} written answer{data.pendingCount === 1 ? '' : 's'} still pending
                  review &mdash; your score may change once graded.
                </div>
              )}
            </>
          ) : (
            <div className="pt-sub" style={{ marginBottom: 0 }}>
              Your responses have been recorded.
            </div>
          )}
        </div>
      )}

      {tab === 'review' && (
        <div className="card">
          {data.pendingCount > 0 && (
            <div className="msg msg-warn">
              {data.pendingCount} written answer{data.pendingCount === 1 ? '' : 's'} still pending review.
            </div>
          )}
          {data.questions.map((q, i) => {
            const badge = !q.answered
              ? { cls: 'unanswered', label: 'Not answered' }
              : q.kind === 'text' && !q.graded
                ? { cls: 'pending', label: 'Pending' }
                : q.correct
                  ? { cls: 'correct', label: 'Correct' }
                  : { cls: 'wrong', label: 'Incorrect' };
            return (
              <div className="qlist-item" key={i}>
                {q.media?.kind === 'audio' && <audio controls src={q.media.url} style={{ width: '100%', marginBottom: '8px' }} />}
                {q.media?.kind === 'image' && (
                  <img src={q.media.url} alt="" style={{ width: '100%', borderRadius: '6px', marginBottom: '8px' }} />
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px', marginBottom: '8px' }}>
                  <div>
                    <strong>Q{i + 1}.</strong> {q.text}
                  </div>
                  <span className={'answer-badge ' + badge.cls}>{badge.label}</span>
                </div>
                {q.kind === 'mcq' ? (
                  <div className="opts-mini" style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    {q.options.map((o, oi) => {
                      const isCorrect = oi === q.correctIndex;
                      const isYours = oi === q.yourIndex;
                      const color = isCorrect ? 'var(--teal)' : isYours ? 'var(--red)' : 'var(--muted)';
                      return (
                        <span key={oi} style={{ color, fontWeight: isCorrect || isYours ? 600 : 400 }}>
                          {isCorrect ? '✓ ' : isYours ? '✗ ' : ''}
                          {o}
                          {isYours ? ' (your answer)' : ''}
                        </span>
                      );
                    })}
                    {!q.answered && <span style={{ color: 'var(--muted)', fontWeight: 400 }}>You didn&rsquo;t answer this one.</span>}
                  </div>
                ) : (
                  <div className="opts-mini">
                    {q.answered ? (
                      <div>{q.yourAnswer}</div>
                    ) : (
                      <span style={{ color: 'var(--muted)' }}>You didn&rsquo;t answer this one.</span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

export default function OfficerPortal({ initialTitle, initialQuarter }) {
  const [view, setView] = useState('landing');
  const [errMsg, setErrMsg] = useState('');
  const [code, setCode] = useState('');
  const [officerName, setOfficerName] = useState('');
  const [title, setTitle] = useState(initialTitle);
  const [quarter, setQuarter] = useState(initialQuarter);
  const [questionCount, setQuestionCount] = useState(0);
  const [question, setQuestion] = useState(null);
  const [totalSeconds, setTotalSeconds] = useState(1800);
  const [totalMinutes, setTotalMinutes] = useState(null);
  const [selected, setSelected] = useState(null);
  const [answerText, setAnswerText] = useState('');
  const [remaining, setRemaining] = useState(0);
  const [doneInfo, setDoneInfo] = useState(null);
  const [reviewData, setReviewData] = useState(null);
  const [previousData, setPreviousData] = useState(null);
  const [hasPrevious, setHasPrevious] = useState(false);
  const [prevOpen, setPrevOpen] = useState(false);
  const [prevTab, setPrevTab] = useState('score');
  const [doneTab, setDoneTab] = useState('score');
  const [blockedMsg, setBlockedMsg] = useState('');
  const [draft, setDraft] = useState(null);
  const [editing, setEditing] = useState(null); // question index being changed on the review screen
  const [editSelected, setEditSelected] = useState(null);
  const [editText, setEditText] = useState('');

  const codeInputRef = useRef(null);
  const submittingRef = useRef(false);
  const codeRef = useRef('');

  useEffect(() => {
    codeRef.current = code;
  }, [code]);

  // ---- test-mode integrity guards ----
  useEffect(() => {
    if (view !== 'test' && view !== 'review') return;

    const blockCtx = (e) => e.preventDefault();
    const blockCopy = (e) => e.preventDefault();
    const blockSelect = (e) => e.preventDefault();
    const blockPrintKeys = (e) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'p' || e.key === 's')) e.preventDefault();
    };
    const onBeforePrint = () => document.body.classList.add('printing');
    const onAfterPrint = () => document.body.classList.remove('printing');
    const onVisChange = () => {
      if (document.hidden || !document.hasFocus()) {
        postJson('/api/officer/flag', { code: codeRef.current });
      }
    };

    document.addEventListener('contextmenu', blockCtx);
    document.addEventListener('copy', blockCopy);
    document.addEventListener('cut', blockCopy);
    document.addEventListener('selectstart', blockSelect);
    document.addEventListener('keydown', blockPrintKeys);
    window.addEventListener('beforeprint', onBeforePrint);
    window.addEventListener('afterprint', onAfterPrint);
    document.addEventListener('visibilitychange', onVisChange);
    window.addEventListener('blur', onVisChange);

    return () => {
      document.removeEventListener('contextmenu', blockCtx);
      document.removeEventListener('copy', blockCopy);
      document.removeEventListener('cut', blockCopy);
      document.removeEventListener('selectstart', blockSelect);
      document.removeEventListener('keydown', blockPrintKeys);
      window.removeEventListener('beforeprint', onBeforePrint);
      window.removeEventListener('afterprint', onAfterPrint);
      document.removeEventListener('visibilitychange', onVisChange);
      window.removeEventListener('blur', onVisChange);
      document.body.classList.remove('printing');
    };
  }, [view]);

  function applyQuestionResult(data) {
    if (data.remainingSeconds != null) {
      setRemaining(Math.ceil(data.remainingSeconds));
      setTotalSeconds(data.totalSeconds);
    }
    if (data.status === 'review') {
      setEditing(null);
      loadDraft();
      setView('review');
      return;
    }
    if (data.status === 'done') {
      setDoneInfo({ score: data.score, totalQuestions: data.totalQuestions });
      setDoneTab('score');
      setView('done');
      loadReview(); // best-effort - stays hidden if review is turned off
      return;
    }
    setQuestion(data.question);
    setSelected(null);
    setAnswerText('');
    setView('test');
  }

  async function advance(action) {
    if (submittingRef.current || !question) return;
    submittingRef.current = true;

    const { ok, data } = await postJson('/api/officer/answer', {
      code: codeRef.current,
      questionIndex: question.index,
      action,
      selectedOrigIdx: question.kind === 'mcq' ? selected : null,
      answerText: question.kind === 'text' ? answerText : null,
    });
    submittingRef.current = false;

    if (!ok) {
      setErrMsg(data.error || 'Something went wrong.');
      return;
    }
    applyQuestionResult(data);
  }

  // ---- whole-test timer ----
  // The server is authoritative on expiry; this interval only drives the
  // on-screen countdown, and is re-synced from every server response.
  useEffect(() => {
    if (view !== 'test' && view !== 'review') return;
    const id = setInterval(() => setRemaining((r) => Math.max(0, r - 1)), 1000);
    return () => clearInterval(id);
  }, [view]);

  // Time's up: ask the server to submit whatever is answered so far.
  useEffect(() => {
    if ((view === 'test' || view === 'review') && remaining <= 0) submitFinal();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, remaining]);

  async function submitCode() {
    setErrMsg('');
    const raw = (codeInputRef.current?.value || '').trim().toUpperCase();
    if (!raw) return;
    setCode(raw);
    codeRef.current = raw;

    const { ok, data } = await postJson('/api/officer/redeem', { code: raw });
    if (!ok) {
      setErrMsg(data.error || 'Something went wrong.');
      return;
    }

    if (data.status === 'blocked') {
      setBlockedMsg(data.message);
      setView('blocked');
    } else if (data.status === 'previous_only') {
      if (data.name) setOfficerName(data.name);
      setView('previous_only');
      await showPrevious();
    } else if (data.status === 'consent') {
      setOfficerName(data.name);
      setTitle(data.title);
      setQuarter(data.quarter);
      setQuestionCount(data.questionCount);
      setTotalMinutes(data.totalMinutes);
      setHasPrevious(!!data.hasPrevious);
      setView('consent');
    } else if (data.status === 'submitted') {
      // Already finished on a prior visit - re-entering shows the read-only
      // paper instead of a hard block, when the admin has review turned on.
      if (data.name) setOfficerName(data.name);
      const review = await loadReview();
      setDoneInfo({ score: review?.score ?? null, totalQuestions: review?.totalQuestions ?? null });
      setDoneTab('score');
      setView('done');
    } else {
      if (data.name) setOfficerName(data.name);
      applyQuestionResult(data);
    }
  }

  async function startTest() {
    const { ok, data } = await postJson('/api/officer/question', { code: codeRef.current });
    if (!ok) {
      setErrMsg(data.error || 'Something went wrong.');
      return;
    }
    applyQuestionResult(data);
  }

  async function loadReview() {
    const { ok, data } = await postJson('/api/officer/review', { code: codeRef.current });
    if (!ok) return null;
    setReviewData(data);
    return data;
  }

  async function showPrevious() {
    const { ok, data } = await postJson('/api/officer/previous', { code: codeRef.current });
    if (!ok) {
      setErrMsg(data.error || 'Something went wrong.');
      return;
    }
    setPreviousData(data);
    setPrevTab('score');
    setPrevOpen(true);
  }

  async function loadDraft() {
    const { ok, data } = await postJson('/api/officer/draft', { code: codeRef.current });
    if (!ok) {
      setErrMsg(data.error || 'Something went wrong.');
      return;
    }
    setDraft(data.questions);
    setRemaining(Math.ceil(data.remainingSeconds));
    setTotalSeconds(data.totalSeconds);
  }

  function startEdit(q) {
    setErrMsg('');
    setEditing(q.index);
    setEditSelected(q.kind === 'mcq' ? q.yourValue : null);
    setEditText(q.kind === 'text' ? q.yourValue : '');
  }

  async function saveEdit(q) {
    setErrMsg('');
    const { ok, data } = await postJson('/api/officer/change', {
      code: codeRef.current,
      questionIndex: q.index,
      selectedOrigIdx: q.kind === 'mcq' ? editSelected : null,
      answerText: q.kind === 'text' ? editText : null,
    });
    if (!ok) {
      setErrMsg(data.error || 'Something went wrong.');
      return;
    }
    setEditing(null);
    await loadDraft();
  }

  async function submitFinal() {
    setErrMsg('');
    const { ok, data } = await postJson('/api/officer/submit', { code: codeRef.current });
    if (!ok) {
      setErrMsg(data.error || 'Something went wrong.');
      return;
    }
    setDoneInfo({ score: data.score, totalQuestions: data.totalQuestions });
    setDoneTab('score');
    setView('done');
    loadReview(); // best-effort - stays hidden if review is turned off
  }

  // Esc closes the previous-results modal
  useEffect(() => {
    if (!prevOpen) return;
    const onKey = (e) => {
      if (e.key === 'Escape') setPrevOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [prevOpen]);

  const previousModal =
    prevOpen && previousData ? (
      <div className="modal-backdrop" onClick={() => setPrevOpen(false)}>
        <div className="modal" onClick={(e) => e.stopPropagation()}>
          <div className="modal-head">
            <div>
              <h2 style={{ margin: 0 }}>Previous test</h2>
              <div style={{ fontSize: '13px', color: 'var(--muted)', marginTop: '6px' }}>
                {previousData.title} &middot; {previousData.quarter} &middot;{' '}
                {new Date(previousData.submittedAt).toLocaleDateString()}
              </div>
            </div>
            <button className="btn btn-ghost btn-small" onClick={() => setPrevOpen(false)}>
              Close
            </button>
          </div>
          <ResultsTabs
            data={previousData}
            score={previousData.score}
            total={previousData.totalQuestions}
            tab={prevTab}
            setTab={setPrevTab}
          />
        </div>
      </div>
    ) : null;

  if (view === 'landing') {
    return (
      <div className="wrap narrow">
        <div className="code-entry">
          <div className="lockmark">&#9673;</div>
          <div className="eyebrow">Customer Service &middot; {quarter}</div>
          <h1 className="pt-title">{title}</h1>
          <p className="pt-sub">Enter the personal access code your supervisor sent you. Each code works once.</p>
          <button
            className="btn btn-primary"
            onClick={() => {
              setErrMsg('');
              setView('code');
            }}
          >
            Enter access code
          </button>
          <div>
            <a className="pt-footer-link" href="/admin">
              Admin &rarr;
            </a>
          </div>
        </div>
      </div>
    );
  }

  if (view === 'code') {
    return (
      <div className="wrap narrow">
        <div className="code-entry">
          <div className="eyebrow">{quarter}</div>
          <h1 className="pt-title" style={{ fontSize: '22px' }}>
            Enter your access code
          </h1>
          <p className="pt-sub">
            This was sent to you individually. Do not share it &mdash; it can only be opened once, and the exact time
            it is opened is logged under your name.
          </p>
          {errMsg && <div className="msg msg-error">{errMsg}</div>}
          <input
            className="pt-input"
            ref={codeInputRef}
            placeholder="CS-XXXXX"
            maxLength={12}
            autoComplete="off"
            autoCapitalize="characters"
            onKeyDown={(e) => {
              if (e.key === 'Enter') submitCode();
            }}
          />
          <div style={{ height: '14px' }} />
          <button className="btn btn-primary" onClick={submitCode}>
            Continue
          </button>
        </div>
      </div>
    );
  }

  if (view === 'consent') {
    return (
      <div className="wrap narrow">
        <div className="card">
          <div className="eyebrow">
            {quarter} &middot; {code}
          </div>
          <h1 className="pt-title" style={{ fontSize: '22px' }}>
            Hi {officerName.split(' ')[0]}
          </h1>
          <p className="pt-sub">
            {questionCount} questions in {totalMinutes} minutes. Questions are shown one at a time; some can be
            skipped and answered later. When you reach the end you can review and change your answers before you
            submit. Your access has already been recorded as opened.
          </p>
          <ul style={{ fontSize: '13px', color: 'var(--muted)', lineHeight: 1.9, margin: '0 0 20px', paddingLeft: '18px' }}>
            <li>One timer covers the whole test and keeps running while you review &mdash; when it runs out, your answers so far are submitted automatically.</li>
            <li>Copying, right-click, and printing are disabled for the duration of the test.</li>
            <li>Leaving this tab or window during the test is logged.</li>
          </ul>
          {errMsg && <div className="msg msg-error">{errMsg}</div>}
          {hasPrevious && (
            <button className="btn btn-ghost btn-block" style={{ marginBottom: '10px' }} onClick={showPrevious}>
              See my previous results
            </button>
          )}
          <button className="btn btn-primary btn-block" onClick={startTest}>
            Start test
          </button>
        </div>
        {previousModal}
      </div>
    );
  }

  if (view === 'test' && question) {
    const pct = Math.max(0, (remaining / totalSeconds) * 100);
    const canSkip = question.skipPolicy !== 'none';
    const canProceed = question.kind === 'text' ? answerText.trim().length > 0 : selected != null;
    return (
      <div className="wrap narrow">
        <div className="q-progress">
          QUESTION {question.index + 1} OF {question.total} &middot; {formatClock(remaining)} LEFT
        </div>
        <div className="timerbar-track">
          <div className="timerbar-fill" style={{ width: pct + '%' }} />
        </div>
        <div className="q-shell card">
          <Watermark name={officerName} code={code} />
          {question.media?.kind === 'audio' && (
            <audio controls src={question.media.url} style={{ width: '100%', marginBottom: '16px' }} />
          )}
          {question.media?.kind === 'image' && (
            <img src={question.media.url} alt="" style={{ width: '100%', borderRadius: '8px', marginBottom: '16px' }} />
          )}
          <div className="q-text">{question.text}</div>
          {question.kind === 'text' ? (
            <textarea
              className="pt-textarea"
              rows={6}
              placeholder="Type your answer..."
              value={answerText}
              onChange={(e) => setAnswerText(e.target.value)}
            />
          ) : (
            <div>
              {question.options.map((opt) => (
                <button
                  key={opt.origIdx}
                  className={'opt' + (selected === opt.origIdx ? ' selected' : '')}
                  onClick={() => setSelected(opt.origIdx)}
                >
                  <span className="idx">{opt.letter}</span>
                  {opt.text}
                </button>
              ))}
            </div>
          )}
        </div>
        {errMsg && <div className="msg msg-error">{errMsg}</div>}
        <div className="row">
          {canSkip && (
            <button className="btn btn-ghost" onClick={() => advance('skip')}>
              Skip for now
            </button>
          )}
          <button className="btn btn-primary btn-block" disabled={!canProceed} onClick={() => advance('answer')}>
            Next
          </button>
        </div>
      </div>
    );
  }

  if (view === 'review') {
    return (
      <div className="wrap narrow">
        <div className="code-entry">
          <div className="lockmark" style={{ color: 'var(--amber)', borderColor: 'var(--amber)' }}>
            &#10003;
          </div>
          <h1 className="pt-title" style={{ fontSize: '20px' }}>
            Review your answers
          </h1>
          <p className="pt-sub">
            Look over what you chose and change anything you like. Once you submit, your answers are final.
          </p>
          <div className="q-progress">{formatClock(remaining)} LEFT &mdash; submitted automatically at zero</div>
          <div className="timerbar-track">
            <div className="timerbar-fill" style={{ width: Math.max(0, (remaining / totalSeconds) * 100) + '%' }} />
          </div>
        </div>
        <div className="q-shell card">
          <Watermark name={officerName} code={code} />
          {!draft && <div className="pt-sub">Loading your answers...</div>}
          {draft?.map((q, i) => {
            const isEditing = editing === q.index;
            const canSave = q.kind === 'text' ? editText.trim().length > 0 : editSelected != null;
            return (
              <div className="qlist-item" key={q.index}>
                {q.media?.kind === 'audio' && <audio controls src={q.media.url} style={{ width: '100%', marginBottom: '8px' }} />}
                {q.media?.kind === 'image' && (
                  <img src={q.media.url} alt="" style={{ width: '100%', borderRadius: '6px', marginBottom: '8px' }} />
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px', marginBottom: '8px' }}>
                  <div>
                    <strong>Q{i + 1}.</strong> {q.text}
                  </div>
                  {q.editable && !isEditing && (
                    <button className="btn btn-ghost" onClick={() => startEdit(q)}>
                      Change
                    </button>
                  )}
                </div>

                {isEditing ? (
                  <>
                    {q.kind === 'text' ? (
                      <textarea className="pt-textarea" rows={5} value={editText} onChange={(e) => setEditText(e.target.value)} />
                    ) : (
                      q.options.map((opt) => (
                        <button
                          key={opt.origIdx}
                          className={'opt' + (editSelected === opt.origIdx ? ' selected' : '')}
                          onClick={() => setEditSelected(opt.origIdx)}
                        >
                          <span className="idx">{opt.letter}</span>
                          {opt.text}
                        </button>
                      ))
                    )}
                    <div className="row">
                      <button className="btn btn-ghost" onClick={() => setEditing(null)}>
                        Cancel
                      </button>
                      <button className="btn btn-primary btn-block" disabled={!canSave} onClick={() => saveEdit(q)}>
                        Save answer
                      </button>
                    </div>
                  </>
                ) : q.answered ? (
                  <div className="opts-mini">
                    {q.kind === 'text' ? (
                      q.yourValue
                    ) : (
                      (() => {
                        const opt = q.options.find((o) => o.origIdx === q.yourValue);
                        return `${opt.letter}. ${opt.text}`;
                      })()
                    )}
                  </div>
                ) : (
                  <div className="opts-mini" style={{ color: 'var(--muted)' }}>
                    Not answered &mdash; this question can&rsquo;t be reopened.
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {errMsg && <div className="msg msg-error">{errMsg}</div>}
        <button className="btn btn-primary btn-block" disabled={!draft || editing != null} onClick={submitFinal}>
          Submit assessment
        </button>
      </div>
    );
  }

  if (view === 'blocked') {
    return (
      <div className="wrap narrow">
        <div className="code-entry">
          <div className="lockmark" style={{ color: 'var(--red)', borderColor: 'var(--red)' }}>
            &#10005;
          </div>
          <h1 className="pt-title" style={{ fontSize: '20px' }}>
            {blockedMsg}
          </h1>
          <p className="pt-sub">If you believe this is an error, contact your supervisor.</p>
          <button
            className="btn btn-ghost"
            onClick={() => {
              setErrMsg('');
              setView('landing');
            }}
          >
            Back
          </button>
        </div>
      </div>
    );
  }

  if (view === 'previous_only') {
    return (
      <div className="wrap narrow">
        <div className="code-entry">
          <h1 className="pt-title" style={{ fontSize: '20px' }}>
            No new test right now
          </h1>
          <p className="pt-sub">There is nothing new to take yet, but you can look back at your last test.</p>
          <button className="btn btn-primary" onClick={() => showPrevious()}>
            See my previous results
          </button>
        </div>
        {previousModal}
      </div>
    );
  }

  if (view === 'done') {
    const showScore = doneInfo && doneInfo.score != null;
    const line = showScore ? scoreLine(doneInfo.score, doneInfo.totalQuestions) : null;
    return (
      <div className="wrap narrow">
        <div className="code-entry">
          <div className="lockmark" style={{ color: 'var(--teal)', borderColor: 'var(--teal)' }}>
            &#10003;
          </div>
          <h1 className="pt-title" style={{ fontSize: '20px' }}>
            Test submitted
          </h1>
          {reviewData?.previous && (
            <button className="btn btn-ghost" onClick={() => showPrevious()}>
              See my previous results
            </button>
          )}
          {!reviewData && (
            <p className="pt-sub">{showScore ? `You answered ${line.text}.` : 'Your responses have been recorded.'}</p>
          )}
        </div>

        {reviewData && (
          <ResultsTabs
            data={reviewData}
            score={doneInfo?.score}
            total={doneInfo?.totalQuestions}
            tab={doneTab}
            setTab={setDoneTab}
          />
        )}
        {previousModal}
      </div>
    );
  }

  return null;
}
