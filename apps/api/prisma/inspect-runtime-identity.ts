/**
 * Read-only T-004 inventory command. Execute separately inside EACH authorized
 * environment. Output hashes and nonsecret IDs only; never log process.env.
 * No network, database query, payment, or production write occurs.
 */
import { collectRuntimeIdentity } from '../src/common/runtime-identity-fingerprint';

process.stdout.write(
  `${JSON.stringify(collectRuntimeIdentity(process.env), null, 2)}\n`,
);
