// CRYPT-008: PHI-access token generation.
//
// IntakeToken and ClientPortalToken default to @default(cuid()) in the
// schema, which is CUID v1 — derived from Date.now() + Math.random() and
// NOT cryptographically random. A motivated attacker who observes a few
// emitted tokens can predict future ones within minutes. PHI access tokens
// must be sampled from a CSPRNG.
//
// Strategy: leave the schema default in place (so legacy rows remain valid
// and migrations stay simple) but ALWAYS pass an explicit `token` on
// create from this helper. The helper produces 32 bytes of randomness via
// node:crypto, encoded as base64url — URL-safe, 43 characters, ~256 bits
// of entropy. Brute-forcing the keyspace is computationally infeasible.

import { randomBytes } from "node:crypto";

export function generateSecureToken(): string {
  return randomBytes(32).toString("base64url");
}
