import { NextResponse } from 'next/server';
import { adminGuard } from '@/lib/auth';
import { getSettings, resetAllOfficers } from '@/lib/db';
import { buildSnapshot } from '@/lib/officerFlow';

export const runtime = 'nodejs';

// Same rule as the single reset: a submitted quiz is kept as the officer's
// "previous" one, anyone else is just cleared.
export async function POST() {
  const unauthorized = await adminGuard();
  if (unauthorized) return unauthorized;

  const settings = getSettings();
  const count = resetAllOfficers((officer) =>
    officer.status === 'submitted' ? buildSnapshot(officer, settings) : null
  );
  return NextResponse.json({ ok: true, count });
}
