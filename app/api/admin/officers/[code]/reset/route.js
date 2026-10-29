import { NextResponse } from 'next/server';
import { adminGuard } from '@/lib/auth';
import { getOfficer, resetOfficer, getSettings } from '@/lib/db';
import { buildSnapshot } from '@/lib/officerFlow';

export const runtime = 'nodejs';

export async function POST(_req, { params }) {
  const unauthorized = await adminGuard();
  if (unauthorized) return unauthorized;

  const code = String(params.code || '').toUpperCase();
  const officer = getOfficer(code);
  if (!officer) return NextResponse.json({ error: 'Officer not found.' }, { status: 404 });

  // Only a finished quiz becomes the "previous" one; resetting someone who
  // never submitted keeps the snapshot they already have.
  const previous = officer.status === 'submitted' ? buildSnapshot(officer, getSettings()) : null;
  resetOfficer(code, previous);
  return NextResponse.json({ ok: true });
}
