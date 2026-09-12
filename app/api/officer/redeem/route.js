import { NextResponse } from 'next/server';
import { getOfficer, saveOfficer, getSettings, listQuestions } from '@/lib/db';
import { seededShuffle } from '@/lib/quiz';
import { serveCurrent } from '@/lib/officerFlow';
import { rateLimit, clientKey } from '@/lib/rateLimit';

export const runtime = 'nodejs';

export async function POST(req) {
  const limited = rateLimit('redeem:' + clientKey(req), { limit: 20, windowMs: 60_000 });
  if (!limited.ok) {
    return NextResponse.json({ error: 'Too many attempts. Try again in a minute.' }, { status: 429 });
  }

  const body = await req.json().catch(() => ({}));
  const code = String(body.code || '').trim().toUpperCase();
  if (!code) return NextResponse.json({ error: 'Enter your access code.' }, { status: 400 });

  const officer = getOfficer(code);
  if (!officer) return NextResponse.json({ error: 'Code not recognized.' }, { status: 404 });

  const settings = getSettings();

  if (officer.status === 'submitted') {
    officer.reuseAttempts.push(new Date().toISOString());
    saveOfficer(officer);
    if (settings.showReviewToOfficer) {
      return NextResponse.json({ status: 'submitted', name: officer.name });
    }
    return NextResponse.json({
      status: 'blocked',
      message: `This code was already submitted on ${officer.submittedAt}.`,
    });
  }

  if (officer.status === 'in_progress') {
    officer.reopens.push(new Date().toISOString());
    const result = serveCurrent(officer, settings);
    saveOfficer(officer);
    if (result.done) {
      return NextResponse.json({ status: 'review', name: officer.name });
    }
    return NextResponse.json({
      status: 'question',
      name: officer.name,
      remainingSeconds: result.remainingSeconds,
      budgetSeconds: result.budgetSeconds,
      question: result.question,
    });
  }

  // not_opened -> first time this code is used
  const questions = listQuestions();
  if (!questions.length) {
    return NextResponse.json(
      { error: 'No questions have been configured yet. Contact your supervisor.' },
      { status: 409 }
    );
  }

  officer.status = 'in_progress';
  officer.openedAt = new Date().toISOString();
  officer.currentIndex = 0;
  officer.answers = {};
  officer.closed = [];
  officer.spent = {};
  officer.questionStartedAt = null;
  officer.order = seededShuffle(questions.map((q) => q.id), officer.code);
  saveOfficer(officer);

  return NextResponse.json({
    status: 'consent',
    name: officer.name,
    title: settings.title,
    quarter: settings.quarter,
    questionCount: officer.order.length,
  });
}
