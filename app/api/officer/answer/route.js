import { NextResponse } from 'next/server';
import { getOfficer, saveOfficer, getSettings } from '@/lib/db';
import { submitAnswer } from '@/lib/officerFlow';

export const runtime = 'nodejs';

export async function POST(req) {
  const body = await req.json().catch(() => ({}));
  const code = String(body.code || '').trim().toUpperCase();
  const questionIndex = Number.isInteger(body.questionIndex) ? body.questionIndex : null;
  const action = body.action === 'skip' ? 'skip' : 'answer';
  const selectedOrigIdx = Number.isInteger(body.selectedOrigIdx) ? body.selectedOrigIdx : null;
  const answerText = typeof body.answerText === 'string' ? body.answerText : null;

  const officer = getOfficer(code);
  if (!officer) return NextResponse.json({ error: 'Code not recognized.' }, { status: 404 });
  if (officer.status !== 'in_progress') {
    return NextResponse.json({ error: 'This test is not currently in progress.' }, { status: 409 });
  }

  const settings = getSettings();
  const result = submitAnswer(officer, settings, { questionIndex, action, selectedOrigIdx, answerText });
  saveOfficer(officer);

  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  if (result.done) {
    return NextResponse.json({ status: 'review' });
  }
  return NextResponse.json({
    status: 'question',
    remainingSeconds: result.remainingSeconds,
    budgetSeconds: result.budgetSeconds,
    question: result.question,
  });
}
