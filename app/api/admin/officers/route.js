import { NextResponse } from 'next/server';
import { adminGuard } from '@/lib/auth';
import { listOfficers, listOfficerCodes, createOfficer } from '@/lib/db';
import { officerEvents, rescoreSubmittedOnce } from '@/lib/officerFlow';
import { genCode } from '@/lib/quiz';

export const runtime = 'nodejs';

export async function GET() {
  const unauthorized = await adminGuard();
  if (unauthorized) return unauthorized;

  rescoreSubmittedOnce();
  const officers = listOfficers();
  return NextResponse.json({ officers, events: officerEvents(officers) });
}

export async function POST(req) {
  const unauthorized = await adminGuard();
  if (unauthorized) return unauthorized;

  const body = await req.json().catch(() => ({}));
  const name = String(body.name || '').trim();
  if (!name) return NextResponse.json({ error: "Enter the officer's name first." }, { status: 400 });

  const code = genCode(listOfficerCodes());
  const officer = createOfficer({ code, name });
  return NextResponse.json({ officer });
}
