// service_attestation.leo — SafeTracks · Azimuth Foundation Inc.
// Aleo Halo2 ZK program for service status attestation (Phase 2 target).
// Phase 1 uses groth16-mock in zk-hcs-submit/index.ts; public_signals schema is identical.
//
// Proves without revealing:
//   (a) Worker has valid device-bound auth token (non-zero)
//   (b) Claim commitment matches BHP256 hash of private status claim
//   (c) Supply levels in valid categorical range 0-2
//   (d) Status category in valid range 0-4
//   (e) Time window internally consistent
//
// Upgrade: replace generateMockProof() in zk-hcs-submit/index.ts with aleoProve().
// No HCS payload, DB schema, or API changes required.

program service_attestation.aleo {

    const SUPPLY_OUT: u8          = 0u8;
    const SUPPLY_LOW: u8          = 1u8;
    const SUPPLY_WELL_STOCKED: u8 = 2u8;

    const STATUS_SCHEDULED: u8  = 0u8;
    const STATUS_ACTIVE: u8     = 1u8;
    const STATUS_DELAYED: u8    = 2u8;
    const STATUS_COMPLETED: u8  = 3u8;
    const STATUS_CANCELLED: u8  = 4u8;

    struct StatusClaim {
        route_code_hash:     field,
        window_start_ts:     u64,
        window_end_ts:       u64,
        narcan_level:        u8,
        syringe_level:       u8,
        fentanyl_test_level: u8,
        status_category:     u8,
    }

    transition attest_service_status(
        private worker_auth_token: field,
        private claim: StatusClaim,
        public commitment: field,
        public window_start: u64,
        public window_end: u64,
    ) -> field {
        assert_eq(claim.window_start_ts, window_start);
        assert_eq(claim.window_end_ts, window_end);
        assert(window_end > window_start);
        assert(claim.narcan_level <= SUPPLY_WELL_STOCKED);
        assert(claim.syringe_level <= SUPPLY_WELL_STOCKED);
        assert(claim.fentanyl_test_level <= SUPPLY_WELL_STOCKED);
        assert(claim.status_category <= STATUS_CANCELLED);
        let computed: field = BHP256::hash_to_field(claim);
        assert_eq(computed, commitment);
        assert_neq(worker_auth_token, 0field);
        return commitment;
    }

    transition verify_supply_update(
        private worker_auth_token: field,
        private narcan_level: u8,
        private syringe_level: u8,
        private fentanyl_test_level: u8,
        public supply_commitment: field,
    ) -> field {
        assert(narcan_level <= SUPPLY_WELL_STOCKED);
        assert(syringe_level <= SUPPLY_WELL_STOCKED);
        assert(fentanyl_test_level <= SUPPLY_WELL_STOCKED);
        assert_neq(worker_auth_token, 0field);
        let tuple_hash: field = BHP256::hash_to_field((narcan_level, syringe_level, fentanyl_test_level));
        assert_eq(tuple_hash, supply_commitment);
        return supply_commitment;
    }
}
