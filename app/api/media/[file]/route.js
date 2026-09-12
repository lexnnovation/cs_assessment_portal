import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { requireAdmin } from '@/lib/auth';
import { UPLOADS_DIR, getOfficer } from '@/lib/db';

export const runtime = 'nodejs';

const SAFE_NAME = /^[A-Za-z0-9_-]+\.[A-Za-z0-9]+$/;
const CONTENT_TYPES = {
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
};

export async function GET(req, { params }) {
  const isAdmin = await requireAdmin();
  if (!isAdmin) {
    const code = String(new URL(req.url).searchParams.get('code') || '').trim().toUpperCase();
    const officer = code ? getOfficer(code) : null;
    if (!officer) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const name = params.file;
  if (!SAFE_NAME.test(name)) {
    return NextResponse.json({ error: 'Invalid file name.' }, { status: 400 });
  }

  const filePath = path.join(UPLOADS_DIR, name);
  if (path.dirname(filePath) !== UPLOADS_DIR) {
    return NextResponse.json({ error: 'Invalid file name.' }, { status: 400 });
  }

  let data;
  try {
    data = await fs.readFile(filePath);
  } catch {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  }

  const contentType = CONTENT_TYPES[path.extname(name).toLowerCase()] || 'application/octet-stream';
  return new NextResponse(data, { headers: { 'Content-Type': contentType, 'Cache-Control': 'private, max-age=3600' } });
}
