import { NextResponse } from 'next/server';
import { adminGuard } from '@/lib/auth';
import { addQuestionsBulk } from '@/lib/db';

export const runtime = 'nodejs';

const MAX_ROWS = 1000;
const MAX_BODY_BYTES = 2 * 1024 * 1024; // 2MB — plenty for 1000 rows of question text
const MAX_TEXT_LEN = 2000;
const MAX_OPTION_LEN = 500;

// Reads the request body while enforcing a real byte cap on the stream itself,
// rather than trusting the (client-supplied, spoofable) Content-Length header.
async function readBodyWithLimit(req, maxBytes) {
  const reader = req.body?.getReader();
  if (!reader) return '';

  const chunks = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > maxBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks.map((c) => Buffer.from(c))).toString('utf-8');
}

export async function POST(req) {
  const unauthorized = await adminGuard();
  if (unauthorized) return unauthorized;

  const bodyText = await readBodyWithLimit(req, MAX_BODY_BYTES);
  if (bodyText === null) {
    return NextResponse.json(
      { error: `Upload too large — max ${MAX_BODY_BYTES / (1024 * 1024)}MB per import.` },
      { status: 413 }
    );
  }

  let body;
  try {
    body = JSON.parse(bodyText || '{}');
  } catch {
    body = {};
  }
  const rows = Array.isArray(body.questions) ? body.questions : [];

  if (!rows.length) {
    return NextResponse.json({ error: 'No questions to import.' }, { status: 400 });
  }
  if (rows.length > MAX_ROWS) {
    return NextResponse.json({ error: `Too many rows — max ${MAX_ROWS} per import.` }, { status: 400 });
  }

  const valid = [];
  const errors = [];

  rows.forEach((row, i) => {
    const rowNum = Number.isInteger(row?.row) ? row.row : i + 1;
    const text = String(row?.text || '').trim();
    const options = (Array.isArray(row?.options) ? row.options : []).map((o) => String(o || '').trim()).filter(Boolean);
    const correctIndex = Number.isInteger(row?.correctIndex) ? row.correctIndex : -1;

    if (!text || options.length < 2 || options.length > 6) {
      errors.push({ row: rowNum, error: 'Missing question text or between 2 and 6 non-empty options.' });
      return;
    }
    if (text.length > MAX_TEXT_LEN) {
      errors.push({ row: rowNum, error: `Question text is too long (max ${MAX_TEXT_LEN} characters).` });
      return;
    }
    if (options.some((o) => o.length > MAX_OPTION_LEN)) {
      errors.push({ row: rowNum, error: `An option is too long (max ${MAX_OPTION_LEN} characters).` });
      return;
    }
    if (correctIndex < 0 || correctIndex >= options.length) {
      errors.push({ row: rowNum, error: 'Could not determine the correct answer.' });
      return;
    }
    valid.push({ text, options, correctIndex });
  });

  const insertedIds = valid.length ? addQuestionsBulk(valid) : [];

  return NextResponse.json({ inserted: insertedIds.length, errors });
}
