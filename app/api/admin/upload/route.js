import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { adminGuard } from '@/lib/auth';
import { UPLOADS_DIR } from '@/lib/db';

export const runtime = 'nodejs';

const AUDIO_EXT = ['.mp3', '.m4a', '.wav', '.ogg'];
const IMAGE_EXT = ['.png', '.jpg', '.jpeg', '.webp'];
const MAX_AUDIO_BYTES = 25 * 1024 * 1024;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export async function POST(req) {
  const unauthorized = await adminGuard();
  if (unauthorized) return unauthorized;

  const form = await req.formData().catch(() => null);
  const file = form?.get('file');
  if (!file || typeof file === 'string') {
    return NextResponse.json({ error: 'No file provided.' }, { status: 400 });
  }

  const ext = path.extname(file.name || '').toLowerCase();
  const kind = AUDIO_EXT.includes(ext) ? 'audio' : IMAGE_EXT.includes(ext) ? 'image' : null;
  if (!kind) {
    return NextResponse.json(
      { error: 'Unsupported file type. Use mp3/m4a/wav/ogg for audio or png/jpg/webp for images.' },
      { status: 400 }
    );
  }

  const maxBytes = kind === 'audio' ? MAX_AUDIO_BYTES : MAX_IMAGE_BYTES;
  if (file.size > maxBytes) {
    return NextResponse.json({ error: `File too large — max ${Math.round(maxBytes / (1024 * 1024))}MB.` }, { status: 413 });
  }

  const filename = crypto.randomUUID() + ext;
  const buf = Buffer.from(await file.arrayBuffer());
  await fs.mkdir(UPLOADS_DIR, { recursive: true });
  await fs.writeFile(path.join(UPLOADS_DIR, filename), buf);

  return NextResponse.json({ file: filename, kind });
}
