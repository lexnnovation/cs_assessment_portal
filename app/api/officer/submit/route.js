import { NextResponse } from 'next/server';
import { getOfficer, saveOfficer, getSettings } from '@/lib/db';
import { openQuestionIds, finishOfficer } from '@/lib/officerFlow';
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
  if (officer.status !== 'in_progress') {
    return NextResponse.json({ error: 'This test is not currently in progress.' }, { status: 409 });
  }
  if (openQuestionIds(officer).length > 0) {
    return NextResponse.json({ error: 'Answer or skip every question before submitting.' }, { status: 409 });
  }

  const settings = getSettings();
  finishOfficer(officer);
  saveOfficer(officer);

  return NextResponse.json({
    status: 'done',
    score: settings.showScoreToOfficer ? officer.score : null,
    totalQuestions: officer.totalQuestions,
  });
}
