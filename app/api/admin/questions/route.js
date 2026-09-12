import { NextResponse } from 'next/server';
import { adminGuard } from '@/lib/auth';
import { listQuestions, addQuestion } from '@/lib/db';
import { parseQuestionInput } from '@/lib/quiz';

export const runtime = 'nodejs';

export async function GET() {
  const unauthorized = await adminGuard();
  if (unauthorized) return unauthorized;
  return NextResponse.json({ questions: listQuestions() });
}

export async function POST(req) {
  const unauthorized = await adminGuard();
  if (unauthorized) return unauthorized;

  const body = await req.json().catch(() => ({}));
  const { error, status, value } = parseQuestionInput(body);
  if (error) return NextResponse.json({ error }, { status });

  const id = addQuestion(value);
  return NextResponse.json({ id });
}
