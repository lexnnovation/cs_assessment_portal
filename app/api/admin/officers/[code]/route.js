import { NextResponse } from 'next/server';
import { adminGuard } from '@/lib/auth';
import { getOfficer, deleteOfficer } from '@/lib/db';

export const runtime = 'nodejs';

export async function DELETE(_req, { params }) {
  const unauthorized = await adminGuard();
  if (unauthorized) return unauthorized;

  const code = String(params.code || '').toUpperCase();
  const officer = getOfficer(code);
  if (!officer) return NextResponse.json({ error: 'Officer not found.' }, { status: 404 });

  deleteOfficer(code);
  return NextResponse.json({ ok: true });
}
