import { resolveEmulatorTarget } from '../../src/config';
import { isPortOpen } from '../../src/emulator';

/**
 * Runs once before the suite. Fails fast if the emulator is not reachable so
 * that a missing dependency surfaces as an error rather than silent skips
 */
export default async function globalSetup(): Promise<void> {
  const target = resolveEmulatorTarget();
  const reachable = await isPortOpen(target.host, target.port);
  if (!reachable) {
    throw new Error(
      `Firestore emulator is not reachable on ${target.host}:${target.port}. ` +
      'Start it with "npm run emulators" and wait for "All emulators ready", ' +
      'then set FIRESTORE_EMULATOR_HOST=127.0.0.1:8085 in this shell.',
    );
  }
  process.env.ACTIVATION_EMULATOR_REACHABLE = '1';
}
