import { prisma } from './prisma';

const SAFE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function randomShortcode(len = 6): string {
  let out = '';
  for (let i = 0; i < len; i++) {
    out += SAFE_ALPHABET[Math.floor(Math.random() * SAFE_ALPHABET.length)];
  }
  return out;
}

export async function generateLicenceNumber(): Promise<string> {
  const row = await prisma.$queryRawUnsafe<{ next: bigint }[]>(
    `SELECT nextval('licence_number_seq') AS next`,
  );
  const seq = Number(row[0].next);
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = `VAI-${seq}-${randomShortcode()}`;
    const clash = await prisma.licence.findUnique({ where: { licenceNumber: candidate } });
    if (!clash) return candidate;
  }
  throw new Error('Could not generate a unique licence number after 5 attempts');
}
