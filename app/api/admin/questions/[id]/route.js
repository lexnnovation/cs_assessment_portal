import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { adminGuard } from '@/lib/auth';
import { deleteQuestion, getQuestionById, UPLOADS_DIR } from '@/lib/db';

export const runtime = 'nodejs';

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
