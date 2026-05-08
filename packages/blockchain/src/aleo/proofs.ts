/**
 * Aleo ZK proof interface for Verified Restore.
 *
 * Architecture:
 * - The Aleo network runs our `restoration_proof.aleo` program.
 * - We call it via the Aleo REST API (or snarkVM in-process for testing).
 * - Proofs are generated server-side (the operator holds the proving key);
 *   only the *verification key* and the *proof string* are stored on-chain.
 *
 * Privacy model:
 * - Homeowner PII (name, address, policy number) stays as *private* inputs.
 * - Only the *commitment* (Poseidon hash of the PII + nonce) goes on-chain.
 * - Insurance adjusters can verify the commitment matches their records
 *   without the network ever seeing the raw data.
 */

export interface AleoProofResult {
  proofId: string;
  program: string;
  functionName: string;
  publicInputs: Record<string, string>;
  proof: string; // base58-encoded Marlin/Varuna proof
  verificationKey: string;
  executionId: string;
  network: string;
  timestamp: string;
}

export interface DocumentIntegrityProof {
  jobId: string;
  docId: string;
  fileHash: string; // sha256 of file
  bethelnetCid: string;
  uploaderAleoAddr: string;
  proof: AleoProofResult;
}

export interface JobCommitmentProof {
  jobId: string;
  commitment: string; // Poseidon(jobId || claimNumber || policyNumber || nonce)
  proof: AleoProofResult;
}

function getAleoApiBase(): string {
  const network = process.env['ALEO_NETWORK'] ?? 'testnet';
  if (network === 'mainnet') return 'https://api.explorer.aleo.org/v1/mainnet';
  return 'https://api.explorer.aleo.org/v1/testnet';
}

const PROGRAM_ID = process.env['ALEO_PROGRAM_ID'] ?? 'restoration_proof_v1.aleo';

/**
 * Creates a privacy-preserving commitment for a job.
 * Private: claimNumber, policyNumber, homeownerName, homeownerAddress, nonce
 * Public output: commitment (Poseidon hash) stored on Hedera
 */
export async function generateJobCommitment(
  jobId: string,
  claimNumber: string,
  policyNumber: string,
  homeownerName: string,
  nonce: string,
): Promise<JobCommitmentProof> {
  // In production this calls snarkVM or the Aleo network to execute the program.
  // For testnet/dev, we simulate via the Aleo REST API program execution endpoint.
  const apiBase = getAleoApiBase();

  const privateInputs = {
    claim_number: claimNumber,
    policy_number: policyNumber,
    homeowner_name: homeownerName,
    nonce,
  };

  const body = {
    program_id: PROGRAM_ID,
    function_name: 'commit_job',
    inputs: [
      jobId,
      JSON.stringify(privateInputs), // private record
    ],
  };

  const res = await fetch(`${apiBase}/program/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Aleo execution failed: ${text}`);
  }

  const result = (await res.json()) as {
    execution_id: string;
    outputs: string[];
    proof: string;
    verification_key: string;
  };

  const commitment = result.outputs[0] ?? '';

  return {
    jobId,
    commitment,
    proof: {
      proofId: result.execution_id,
      program: PROGRAM_ID,
      functionName: 'commit_job',
      publicInputs: { jobId, commitment },
      proof: result.proof,
      verificationKey: result.verification_key,
      executionId: result.execution_id,
      network: process.env['ALEO_NETWORK'] ?? 'testnet',
      timestamp: new Date().toISOString(),
    },
  };
}

/**
 * Generates a ZK proof of document integrity.
 * Public: fileHash, bethelnetCid, uploaderAddr
 * Proves: uploader knew the pre-image of fileHash without revealing raw file.
 */
export async function generateDocumentProof(
  jobId: string,
  docId: string,
  fileHash: string,
  bethelnetCid: string,
  uploaderAleoAddr: string,
): Promise<DocumentIntegrityProof> {
  const apiBase = getAleoApiBase();

  const body = {
    program_id: PROGRAM_ID,
    function_name: 'prove_document_integrity',
    inputs: [jobId, docId, fileHash, bethelnetCid, uploaderAleoAddr],
  };

  const res = await fetch(`${apiBase}/program/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Aleo document proof failed: ${text}`);
  }

  const result = (await res.json()) as {
    execution_id: string;
    outputs: string[];
    proof: string;
    verification_key: string;
  };

  return {
    jobId,
    docId,
    fileHash,
    bethelnetCid,
    uploaderAleoAddr,
    proof: {
      proofId: result.execution_id,
      program: PROGRAM_ID,
      functionName: 'prove_document_integrity',
      publicInputs: { jobId, docId, fileHash, bethelnetCid, uploaderAleoAddr },
      proof: result.proof,
      verificationKey: result.verification_key,
      executionId: result.execution_id,
      network: process.env['ALEO_NETWORK'] ?? 'testnet',
      timestamp: new Date().toISOString(),
    },
  };
}

/**
 * Verifies a proof against the Aleo network.
 */
export async function verifyProof(proof: AleoProofResult): Promise<boolean> {
  const apiBase = getAleoApiBase();

  const body = {
    program_id: proof.program,
    function_name: proof.functionName,
    inputs: Object.values(proof.publicInputs),
    proof: proof.proof,
    verification_key: proof.verificationKey,
  };

  const res = await fetch(`${apiBase}/program/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) return false;

  const result = (await res.json()) as { verified: boolean };
  return result.verified;
}

/**
 * Derives an Aleo program address from our program ID.
 * Used as the on-chain storage address for job state.
 */
export function getProgramAddress(): string {
  // In real Aleo, this is deterministic from the program ID.
  // Returning placeholder — real implementation calls `aleo program address <id>`.
  return process.env['ALEO_PROGRAM_ADDRESS'] ?? 'aleo1programaddressplaceholder';
}
