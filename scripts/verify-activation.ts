/**
 * Verify all six required activation scenarios against the local emulator.
 * Fails with a non-zero exit code if the emulator is not reachable, if any
 * scenario returns a non-success status, or if the expected Firestore documents
 * are missing. Run after "npm run seed".
 *
 *   npm run verify
 */
import { AddressInfo } from 'node:net';
import { createApp } from '../src/app';
import { closeDb, getDb } from '../src/db';
import { requireEmulator } from '../src/emulator';
import { COLLECTIONS } from '../src/model';
import { FIXTURE, FixturePractitioner } from '../fixtures/baseline';
import { seedBaseline } from '../fixtures/seed';

const practitioners: FixturePractitioner[] = ['cedar', 'harbor'];

let passed = 0;
let failed = 0;

function pass(label: string) {
  console.log(`  ok  ${label}`);
  passed++;
}

function fail(label: string, detail: string) {
  console.error(`  FAIL  ${label}`);
  console.error(`        ${detail}`);
  failed++;
}

async function main() {
  const target = await requireEmulator();
  const db = getDb();

  await seedBaseline(db, target);

  const server = createApp(getDb).listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', () => resolve()));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  const post = async (path: string, body: unknown) => {
    const res = await fetch(base + path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    return res.json();
  };

  const get = async (path: string) => {
    const res = await fetch(base + path);
    return res.json();
  };

  console.log(`\nVerifying activation against ${target.host}:${target.port} (${target.projectId})\n`);

  for (const which of practitioners) {
    const fixture = FIXTURE[which];
    const personId = `verify-${which}`;

    console.log(`--- ${which} ---`);

    // activation.invitation
    const accepted = await post('/invitations/accept', {
      token: fixture.invitationToken,
      personId,
    });
    if (accepted.status === 'accepted' && accepted.practitionerId === fixture.practitionerId && accepted.cohortId === fixture.cohortId) {
      pass(`activation.invitation: ${which}`);
    } else {
      fail(`activation.invitation: ${which}`, JSON.stringify(accepted));
    }

    // activation.practitioner
    const resolved = await get(`/people/${personId}/practitioner`);
    if (resolved.status === 'resolved' && resolved.practitioner?.id === fixture.practitionerId) {
      pass(`activation.practitioner: ${which}`);
    } else {
      fail(`activation.practitioner: ${which}`, JSON.stringify(resolved));
    }

    // activation.practice-start
    const started = await post('/practices/start', {
      personId,
      practiceId: fixture.practiceId,
    });
    if (started.status === 'started' && started.personId === personId && started.practitionerId === fixture.practitionerId && started.practiceId === fixture.practiceId) {
      const sessionDoc = await db.collection(COLLECTIONS.practiceSessions).doc(started.sessionId).get();
      if (sessionDoc.exists && sessionDoc.data()?.personId === personId && sessionDoc.data()?.practitionerId === fixture.practitionerId) {
        pass(`activation.practice-start: ${which}`);
      } else {
        fail(`activation.practice-start: ${which}`, 'session document missing or fields do not match');
      }
    } else {
      fail(`activation.practice-start: ${which}`, JSON.stringify(started));
    }

    console.log('');
  }

  await new Promise<void>((resolve) => server.close(() => resolve()));

  console.log(`${passed} passed, ${failed} failed`);

  if (failed > 0) process.exitCode = 1;
}

main()
  .catch((error: unknown) => {
    console.error(`verify failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
