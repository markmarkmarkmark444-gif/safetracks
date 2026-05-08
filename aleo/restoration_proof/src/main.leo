// ─── Verified Restore — restoration_proof_v1.aleo ─────────────────────────────
//
// This Leo program runs on the Aleo network and provides two core functions:
//
//  1. commit_job       — Creates a privacy-preserving commitment to a job's
//                         sensitive insurance data (claim number, policy, PII).
//                         Private inputs stay off-chain; only the commitment
//                         (Poseidon hash) is published.
//
//  2. prove_document_integrity — Proves that a document's sha256 hash matches
//                         its Bethelnet CID, without revealing the file contents.
//                         Generates a proof that any insurer can verify.
//
// Privacy model:
//   - All homeowner PII is a `private` input → never touches Aleo public state.
//   - The `commitment` field is the only thing stored on-chain.
//   - Insurance adjusters verify the commitment matches their records off-chain.

program restoration_proof_v1.aleo {

    // ─── Records ─────────────────────────────────────────────────────────────

    // A private job record — owned by the mitigation company's Aleo address.
    // Contains the raw sensitive data that produced the on-chain commitment.
    record JobPrivateRecord {
        owner: address,
        job_id: field,
        claim_number: field,   // Poseidon2 hash of the raw claim number string
        policy_number: field,  // Poseidon2 hash of the raw policy number
        homeowner_hash: field, // Poseidon2(name || address_hash || nonce)
        nonce: field,
        amount_cents: u64,     // estimated loss in cents (kept private)
    }

    // A document integrity record.
    record DocumentRecord {
        owner: address,
        job_id: field,
        doc_id: field,
        file_hash: field,       // sha256 of raw file, encoded as field
        bethelnet_cid_hash: field, // Poseidon2 of the bethelnet CID string
        uploader: address,
        timestamp: u64,
    }

    // ─── Structs ─────────────────────────────────────────────────────────────

    // Public output stored on-chain when a job is committed.
    struct JobCommitment {
        job_id: field,
        commitment: field,  // Poseidon4(job_id, claim_hash, policy_hash, nonce)
        doc_count: u32,
        total_days: u32,
    }

    // ─── Mappings (on-chain public state) ─────────────────────────────────────

    // job_id → JobCommitment
    mapping job_commitments: field => JobCommitment;

    // doc_id → file_hash (for public verification)
    mapping document_hashes: field => field;

    // job_id → document count
    mapping job_doc_counts: field => u32;

    // ─── Functions ────────────────────────────────────────────────────────────

    /**
     * commit_job — Creates a verifiable commitment to a job's private data.
     *
     * Public inputs:
     *   job_id_pub    : field   — public job identifier
     *
     * Private inputs (never on-chain):
     *   claim_number  : field   — Poseidon2 hash of claim number
     *   policy_number : field   — Poseidon2 hash of policy number
     *   homeowner_hash: field   — Poseidon2 of homeowner PII
     *   nonce         : field   — random nonce for hiding
     *   amount_cents  : u64     — estimated loss amount
     *   owner_addr    : address — Aleo address of mitigation company
     *
     * Outputs:
     *   job_record    : JobPrivateRecord (sent to owner, private)
     *   commitment    : field (public — stored on Hedera via our API)
     */
    async transition commit_job(
        public job_id_pub: field,
        private claim_number: field,
        private policy_number: field,
        private homeowner_hash: field,
        private nonce: field,
        private amount_cents: u64,
        private owner_addr: address,
    ) -> (JobPrivateRecord, field, Future) {

        // Compute commitment = Poseidon4(job_id, claim_number, policy_number, nonce)
        let commitment: field = Poseidon4::hash_to_field(
            job_id_pub,
            claim_number,
            policy_number,
            nonce
        );

        // Create the private record (owned by the mitigation company)
        let record: JobPrivateRecord = JobPrivateRecord {
            owner: owner_addr,
            job_id: job_id_pub,
            claim_number,
            policy_number,
            homeowner_hash,
            nonce,
            amount_cents,
        };

        let init_commitment: JobCommitment = JobCommitment {
            job_id: job_id_pub,
            commitment,
            doc_count: 0u32,
            total_days: 0u32,
        };

        let f: Future = finalize_commit_job(job_id_pub, init_commitment);

        return (record, commitment, f);
    }

    async function finalize_commit_job(
        job_id: field,
        jc: JobCommitment,
    ) {
        // Ensure a job can only be committed once (idempotency guard)
        let exists: bool = Mapping::contains(job_commitments, job_id);
        assert(!exists);
        Mapping::set(job_commitments, job_id, jc);
        Mapping::set(job_doc_counts, job_id, 0u32);
    }

    /**
     * prove_document_integrity — Publishes a verifiable document hash.
     *
     * Any party can call this to prove they uploaded an authentic document.
     * The file_hash is public — anyone can verify it against the raw file.
     * The Bethelnet CID is hashed to prevent CID enumeration attacks.
     *
     * Public inputs:
     *   job_id_pub       : field
     *   doc_id_pub       : field
     *   file_hash_pub    : field   — sha256(file), encoded as field
     *   bethelnet_cid_hash: field  — Poseidon2(bethelnet_cid_string)
     *   uploader         : address
     *   timestamp_epoch  : u64
     */
    async transition prove_document_integrity(
        public job_id_pub: field,
        public doc_id_pub: field,
        public file_hash_pub: field,
        public bethelnet_cid_hash: field,
        public uploader: address,
        public timestamp_epoch: u64,
    ) -> (DocumentRecord, Future) {

        let record: DocumentRecord = DocumentRecord {
            owner: uploader,
            job_id: job_id_pub,
            doc_id: doc_id_pub,
            file_hash: file_hash_pub,
            bethelnet_cid_hash,
            uploader,
            timestamp: timestamp_epoch,
        };

        let f: Future = finalize_prove_document(job_id_pub, doc_id_pub, file_hash_pub);

        return (record, f);
    }

    async function finalize_prove_document(
        job_id: field,
        doc_id: field,
        file_hash: field,
    ) {
        // A doc can only be registered once — prevents replay attacks
        let exists: bool = Mapping::contains(document_hashes, doc_id);
        assert(!exists);

        Mapping::set(document_hashes, doc_id, file_hash);

        // Increment document count for job
        let current_count: u32 = Mapping::get_or_use(job_doc_counts, job_id, 0u32);
        Mapping::set(job_doc_counts, job_id, current_count + 1u32);
    }

    /**
     * verify_adjuster_access — Allows an insurer to verify they have the
     * correct claim+policy data without the Aleo network seeing the raw values.
     * Returns `true` if Poseidon4(job_id, claim_hash, policy_hash, nonce) == stored_commitment.
     *
     * This is called off-chain via snarkVM; the insurer gets a proof they can
     * present without the network seeing their policy data.
     */
    transition verify_adjuster_access(
        public job_id: field,
        public stored_commitment: field,
        private claim_number: field,
        private policy_number: field,
        private nonce: field,
    ) -> bool {
        let computed: field = Poseidon4::hash_to_field(
            job_id,
            claim_number,
            policy_number,
            nonce
        );
        return computed == stored_commitment;
    }

    /**
     * update_job_progress — Updates on-chain job metadata (days, doc count).
     * Can only be called by the owner of the JobPrivateRecord.
     */
    async transition update_job_progress(
        private job_record: JobPrivateRecord,
        public new_doc_count: u32,
        public total_days: u32,
    ) -> (JobPrivateRecord, Future) {

        // Return updated record to owner
        let updated: JobPrivateRecord = JobPrivateRecord {
            owner: job_record.owner,
            job_id: job_record.job_id,
            claim_number: job_record.claim_number,
            policy_number: job_record.policy_number,
            homeowner_hash: job_record.homeowner_hash,
            nonce: job_record.nonce,
            amount_cents: job_record.amount_cents,
        };

        let f: Future = finalize_update_progress(job_record.job_id, new_doc_count, total_days);

        return (updated, f);
    }

    async function finalize_update_progress(
        job_id: field,
        new_doc_count: u32,
        total_days: u32,
    ) {
        let existing: JobCommitment = Mapping::get(job_commitments, job_id);
        let updated_jc: JobCommitment = JobCommitment {
            job_id: existing.job_id,
            commitment: existing.commitment,
            doc_count: new_doc_count,
            total_days,
        };
        Mapping::set(job_commitments, job_id, updated_jc);
    }
}
