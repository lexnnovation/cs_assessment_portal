import { NextResponse } from 'next/server';
import { adminGuard } from '@/lib/auth';
import { getOfficer, getQuestionById, saveOfficer } from '@/lib/db';
import { recomputeScore } from '@/lib/officerFlow';

export const runtime = 'nodejs';

export async function POST(req) {
  const unauthorized = await adminGuard();
  if (unauthorized) return unauthorized;

  const body = await req.json().catch(() => ({}));
  const code = String(body.code || '').trim().toUpperCase();
  const questionId = Number.isInteger(body.questionId) ? body.questionId : parseInt(body.questionId, 10);
  const correct = !!body.correct;

  const officer = getOfficer(code);
  if (!officer) return NextResponse.json({ error: 'Officer not found.' }, { status: 404 });
  if (officer.status !== 'submitted') {
    return NextResponse.json({ error: 'This officer has not submitted yet.' }, { status: 409 });
  }

  const question = Number.isInteger(questionId) ? getQuestionById(questionId) : null;
  if (!question || question.kind !== 'text') {
    return NextResponse.json({ error: 'Not a written-answer question.' }, { status: 400 });
  }
  if (officer.answers[questionId] === undefined) {
    return NextResponse.json({ error: "This officer didn't answer that question." }, { status: 400 });
  }

  officer.grades[questionId] = correct ? 1 : 0;
  recomputeScore(officer);
  saveOfficer(officer);

  return NextResponse.json({ score: officer.score, totalQuestions: officer.totalQuestions });
}
