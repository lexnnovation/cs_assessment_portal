import { NextResponse } from 'next/server';
import { adminGuard } from '@/lib/auth';
import { getSettings, updateSettings } from '@/lib/db';

export const runtime = 'nodejs';

export async function GET() {
  const unauthorized = await adminGuard();
  if (unauthorized) return unauthorized;
  return NextResponse.json({ settings: getSettings() });
}

export async function PUT(req) {
  const unauthorized = await adminGuard();
  if (unauthorized) return unauthorized;

  const current = getSettings();
  const body = await req.json().catch(() => ({}));
  const title = String(body.title || '').trim() || current.title;
  const quarter = String(body.quarter || '').trim() || current.quarter;
  const secondsPerQuestion = Math.max(10, parseInt(body.secondsPerQuestion, 10) || current.secondsPerQuestion);
  const showScoreToOfficer = !!body.showScoreToOfficer;
  const showReviewToOfficer = !!body.showReviewToOfficer;
  const questionsPerAssessment = Number.isInteger(body.questionsPerAssessment) && body.questionsPerAssessment > 0
    ? body.questionsPerAssessment
    : null;

  updateSettings({ title, quarter, secondsPerQuestion, showScoreToOfficer, showReviewToOfficer, questionsPerAssessment });
  return NextResponse.json({ settings: getSettings() });
}
