/**
 * Aleo / Provable SDK integration point for the Verifiable Diversion
 * Protocol (VDP).
 *
 * This is intentionally a stub: wiring a compliance_proof.leo circuit into
 * the hub requires the circuit itself, a funded Aleo testnet account, and a
 * decision on where proof generation happens (browser via @provablehq/wasm,
 * or server-side). None of that exists yet, so this module only defines the
 * shape callers should expect once it does - filling it in is follow-up
 * work, not part of the initial Event Engine.
 *
 * When ready: `npm install @provablehq/sdk @provablehq/wasm`, then implement
 * `verifyComplianceProof` against the deployed compliance_proof.leo program
 * on testnet (program ID via ALEO_PROGRAM_ID env var).
 */

export interface ComplianceProofRecord {
  programId: string;
  transitionId: string;
  /** True once the proof has been verified against the deployed program. */
  verified: boolean;
}

export async function verifyComplianceProof(_transitionId: string): Promise<ComplianceProofRecord> {
  throw new Error(
    "Aleo integration not yet implemented. See lib/aleo.ts for what's needed before wiring this up."
  );
}
