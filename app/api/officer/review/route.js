import { NextResponse } from 'next/server';
import { getOfficer, getSettings } from '@/lib/db';
import { buildReview } from '@/lib/officerFlow';
import { rateLimit, clientKey } from '@/lib/rateLimit';

export const runtime = 'nodejs';

export async function POST(req) {
  const limited = rateLimit('officer:' + clientKey(req), { limit: 30, windowMs: 60_000 });
  if (!limited.ok) {
    return NextResponse.json({ error: 'Too many attempts. Try again in a minute.' }, { status: 429 });
  }

  const body = await req.json().catch(() => ({}));
  const code = String(body.code || '').trim().toUpperCase();

  const officer = getOfficer(code);
  if (!officer) return NextResponse.json({ error: 'Code not recognized.' }, { status: 404 });
  if (officer.status !== 'submitted') {
    return NextResponse.json({ error: 'This assessment has not been submitted yet.' }, { status: 409 });
  }
  if (!getSettings().showReviewToOfficer) {
    return NextResponse.json({ error: 'Answer review is not available.' }, { status: 403 });
  }

  const questions = buildReview(officer);
  const pendingCount = questions.filter((q) => q.kind === 'text' && !q.graded).length;

  return NextResponse.json({
    name: officer.name,
    score: officer.score,
    totalQuestions: officer.totalQuestions,
    pendingCount,
    questions,
  });
}
