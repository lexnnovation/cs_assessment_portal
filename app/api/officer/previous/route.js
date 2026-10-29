import { NextResponse } from 'next/server';
import { getOfficer, getSettings } from '@/lib/db';
import { previousForOfficer } from '@/lib/officerFlow';
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

  const previous = previousForOfficer(officer, getSettings());
  if (!previous) return NextResponse.json({ error: 'No previous results available.' }, { status: 404 });
  return NextResponse.json(previous);
}
