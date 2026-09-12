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

export default function OfficerPortal({ initialTitle, initialQuarter }) {
  const [view, setView] = useState('landing');
  const [errMsg, setErrMsg] = useState('');
  const [code, setCode] = useState('');
  const [officerName, setOfficerName] = useState('');
  const [title, setTitle] = useState(initialTitle);
  const [quarter, setQuarter] = useState(initialQuarter);
  const [questionCount, setQuestionCount] = useState(0);
  const [secondsPerQuestion, setSecondsPerQuestion] = useState(45);
  const [question, setQuestion] = useState(null);
  const [selected, setSelected] = useState(null);
  const [remaining, setRemaining] = useState(0);
  const [doneInfo, setDoneInfo] = useState(null);
  const [blockedMsg, setBlockedMsg] = useState('');

  const codeInputRef = useRef(null);
  const submittingRef = useRef(false);
  const timerRef = useRef(null);
  const codeRef = useRef('');

  useEffect(() => {
    codeRef.current = code;
  }, [code]);

  // ---- test-mode integrity guards ----
  useEffect(() => {
    if (view !== 'test') return;

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

  async function advance(selectedOrigIdx) {
    if (submittingRef.current || !question) return;
    submittingRef.current = true;
    if (timerRef.current) clearInterval(timerRef.current);

    const { ok, data } = await postJson('/api/officer/answer', {
      code: codeRef.current,
      questionIndex: question.index,
      selectedOrigIdx,
    });
    submittingRef.current = false;

    if (!ok) {
      setErrMsg(data.error || 'Something went wrong.');
      return;
    }
    if (data.status === 'done') {
      setDoneInfo({ score: data.score, totalQuestions: data.totalQuestions });
      setView('done');
    } else {
      setQuestion(data.question);
      setSelected(null);
    }
  }

  // ---- per-question timer ----
  useEffect(() => {
    if (view !== 'test' || !question) return;
    setRemaining(secondsPerQuestion);
    submittingRef.current = false;
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) {
          clearInterval(timerRef.current);
          advance(null);
          return 0;
        }
        return r - 1;
      });
    }, 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, question?.index]);

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
    } else if (data.status === 'consent') {
      setOfficerName(data.name);
      setTitle(data.title);
      setQuarter(data.quarter);
      setQuestionCount(data.questionCount);
      setSecondsPerQuestion(data.secondsPerQuestion);
      setView('consent');
    } else if (data.status === 'question') {
      if (data.name) setOfficerName(data.name);
      setSecondsPerQuestion(data.secondsPerQuestion);
      setQuestion(data.question);
      setSelected(null);
      setView('test');
    } else if (data.status === 'done') {
      setDoneInfo({ score: data.score, totalQuestions: data.totalQuestions });
      setView('done');
    }
  }

  async function startTest() {
    const { ok, data } = await postJson('/api/officer/question', { code: codeRef.current });
    if (!ok) {
      setErrMsg(data.error || 'Something went wrong.');
      return;
    }
    if (data.status === 'done') {
      setDoneInfo({ score: data.score, totalQuestions: data.totalQuestions });
      setView('done');
      return;
    }
    setSecondsPerQuestion(data.secondsPerQuestion);
    setQuestion(data.question);
    setSelected(null);
    setView('test');
  }

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
            {questionCount} questions, {secondsPerQuestion} seconds each. Questions are shown one at a time and
            cannot be revisited. Your access has already been recorded as opened.
          </p>
          <ul style={{ fontSize: '13px', color: 'var(--muted)', lineHeight: 1.9, margin: '0 0 20px', paddingLeft: '18px' }}>
            <li>Answer at your own pace within the time given &mdash; the next question loads automatically when time runs out.</li>
            <li>Copying, right-click, and printing are disabled for the duration of the test.</li>
            <li>Leaving this tab or window during the test is logged.</li>
          </ul>
          <button className="btn btn-primary btn-block" onClick={startTest}>
            Start test
          </button>
        </div>
      </div>
    );
  }

  if (view === 'test' && question) {
    const pct = Math.max(0, (remaining / secondsPerQuestion) * 100);
    return (
      <div className="wrap narrow">
        <div className="q-progress">
          QUESTION {question.index + 1} OF {question.total}
        </div>
        <div className="timerbar-track">
          <div className="timerbar-fill" style={{ width: pct + '%' }} />
        </div>
        <div className="q-shell card">
          <Watermark name={officerName} code={code} />
          <div className="q-text">{question.text}</div>
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
        </div>
        {errMsg && <div className="msg msg-error">{errMsg}</div>}
        <button className="btn btn-primary btn-block" disabled={selected == null} onClick={() => advance(selected)}>
          Next
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

  if (view === 'done') {
    const showScore = doneInfo && doneInfo.score != null;
    return (
      <div className="wrap narrow">
        <div className="code-entry">
          <div className="lockmark" style={{ color: 'var(--teal)', borderColor: 'var(--teal)' }}>
            &#10003;
          </div>
          <h1 className="pt-title" style={{ fontSize: '20px' }}>
            Test submitted
          </h1>
          <p className="pt-sub">
            {showScore
              ? `You answered ${scoreLine(doneInfo.score, doneInfo.totalQuestions).text}.`
              : 'Your responses have been recorded.'}
          </p>
        </div>
      </div>
    );
  }

  return null;
}
