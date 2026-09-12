import { NextResponse } from 'next/server';
import { adminGuard } from '@/lib/auth';
import { listQuestions, addQuestion } from '@/lib/db';

export const runtime = 'nodejs';

const SKIP_POLICIES = ['revisit', 'no_return', 'none'];
const MEDIA_KINDS = ['audio', 'image'];

export async function GET() {
  const unauthorized = await adminGuard();
  if (unauthorized) return unauthorized;
  return NextResponse.json({ questions: listQuestions() });
}

export async function POST(req) {
  const unauthorized = await adminGuard();
  if (unauthorized) return unauthorized;

  const body = await req.json().catch(() => ({}));
  const text = String(body.text || '').trim();
  const kind = body.kind === 'text' ? 'text' : 'mcq';
  const skipPolicy = SKIP_POLICIES.includes(body.skipPolicy) ? body.skipPolicy : 'revisit';
  const secondsOverride = Number.isInteger(body.secondsOverride) && body.secondsOverride > 0 ? body.secondsOverride : null;
  const mediaKind = MEDIA_KINDS.includes(body.mediaKind) ? body.mediaKind : null;
  const mediaFile = mediaKind ? String(body.mediaFile || '').trim() || null : null;

  if (!text) {
    return NextResponse.json({ error: 'Question text is required.' }, { status: 400 });
  }
  if (mediaKind && !mediaFile) {
    return NextResponse.json({ error: 'Upload the file before adding the question.' }, { status: 400 });
  }

  if (kind === 'text') {
    const id = addQuestion({
      text,
      options: [],
      correctIndex: -1,
      kind,
      skipPolicy,
      secondsOverride,
      mediaKind,
      mediaFile,
    });
    return NextResponse.json({ id });
  }

  const options = Array.isArray(body.options) ? body.options.map((o) => String(o || '').trim()) : [];
  const correctIndex = Number.isInteger(body.correctIndex) ? body.correctIndex : -1;

  if (options.length < 2 || options.length > 6 || options.some((o) => !o)) {
    return NextResponse.json({ error: 'Provide between 2 and 6 non-empty options.' }, { status: 400 });
  }
  if (correctIndex < 0 || correctIndex >= options.length) {
    return NextResponse.json({ error: 'Pick which option is correct.' }, { status: 400 });
  }

  const id = addQuestion({ text, options, correctIndex, kind, skipPolicy, secondsOverride, mediaKind, mediaFile });
  return NextResponse.json({ id });
}
