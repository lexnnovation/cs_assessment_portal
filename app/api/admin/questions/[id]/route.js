import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { adminGuard } from '@/lib/auth';
import { deleteQuestion, getQuestionById, updateQuestion, UPLOADS_DIR } from '@/lib/db';
import { parseQuestionInput } from '@/lib/quiz';

export const runtime = 'nodejs';

export async function PUT(req, { params }) {
  const unauthorized = await adminGuard();
  if (unauthorized) return unauthorized;

  const id = parseInt(params.id, 10);
  if (!Number.isInteger(id)) return NextResponse.json({ error: 'Invalid question id.' }, { status: 400 });

  const existing = getQuestionById(id);
  if (!existing) return NextResponse.json({ error: 'Question not found.' }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const { error, status, value } = parseQuestionInput(body);
  if (error) return NextResponse.json({ error }, { status });

  updateQuestion(id, value);

  // The media file was replaced or removed - clean up the one it replaced.
  if (existing.mediaFile && existing.mediaFile !== value.mediaFile) {
    await fs.unlink(path.join(UPLOADS_DIR, existing.mediaFile)).catch(() => {});
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(_req, { params }) {
  const unauthorized = await adminGuard();
  if (unauthorized) return unauthorized;

  const id = parseInt(params.id, 10);
  if (!Number.isInteger(id)) return NextResponse.json({ error: 'Invalid question id.' }, { status: 400 });

  const question = getQuestionById(id);
  deleteQuestion(id);

  if (question?.mediaFile) {
    await fs.unlink(path.join(UPLOADS_DIR, question.mediaFile)).catch(() => {});
  }

  return NextResponse.json({ ok: true });
}
