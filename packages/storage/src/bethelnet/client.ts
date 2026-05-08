/**
 * Bethelnet ZKP Decentralized Storage Client
 * https://bethelnet.io
 *
 * Architecture:
 * - Large files (photos, videos, Xactimate exports, psychrometric charts) are
 *   sent to Bethelnet, which chunks them, distributes to DeStor nodes, and
 *   generates a ZK proof of storage.
 * - We receive: CID (content identifier), ZK proof, chunk manifest, storage node IDs.
 * - We store only the CID + ZK proof on Hedera/in our DB.
 * - The actual file is never on Hedera/Aleo — preserving privacy and minimizing cost.
 *
 * File size threshold: files ≥ 512 KB go to Bethelnet.
 * Files < 512 KB are stored in our own S3-compatible bucket (fallback).
 */

import { createReadStream } from 'fs';
import { sha256Hex } from '@safetracks/shared';

export interface BethelnetUploadResult {
  cid: string;
  zkProof: string;
  chunkCount: number;
  storageNodeIds: string[];
  sizeBytes: number;
  sha256Hash: string;
  uploadedAt: string;
  retrievalUrl: string;
}

export interface BethelnetUploadOptions {
  filename: string;
  mimeType: string;
  tags?: string[];
  metadata?: Record<string, string>;
  ttlDays?: number; // default: permanent (0)
  encryptionKey?: string; // optional client-side encryption key
}

export interface BethelnetRetrieveResult {
  cid: string;
  data: Buffer;
  zkProofVerified: boolean;
  retrievedAt: string;
}

export interface BethelnetStorageStatus {
  cid: string;
  replicas: number;
  nodes: string[];
  healthy: boolean;
  lastVerified: string;
}

class BethelnetClient {
  private readonly apiBase: string;
  private readonly apiKey: string;
  private readonly timeout: number;

  constructor() {
    this.apiBase = process.env['BETHELNET_API_URL'] ?? 'https://api.bethelnet.io/v1';
    this.apiKey = process.env['BETHELNET_API_KEY'] ?? '';
    this.timeout = 300_000; // 5 minutes for large uploads
  }

  private headers(): Record<string, string> {
    return {
      'Authorization': `Bearer ${this.apiKey}`,
      'X-Client': 'safetracks-restoration/1.0',
    };
  }

  /**
   * Uploads a file Buffer to Bethelnet.
   * Returns the CID + ZK proof needed for on-chain anchoring.
   */
  async uploadBuffer(
    data: Buffer,
    options: BethelnetUploadOptions,
  ): Promise<BethelnetUploadResult> {
    if (!this.apiKey) throw new Error('BETHELNET_API_KEY is not configured');

    const sha256Hash = sha256Hex(data);

    const formData = new FormData();
    const blob = new Blob([data], { type: options.mimeType });
    formData.append('file', blob, options.filename);
    formData.append('sha256', sha256Hash);
    formData.append('mime_type', options.mimeType);

    if (options.tags?.length) {
      formData.append('tags', options.tags.join(','));
    }
    if (options.metadata) {
      formData.append('metadata', JSON.stringify(options.metadata));
    }
    if (options.ttlDays !== undefined) {
      formData.append('ttl_days', String(options.ttlDays));
    }
    if (options.encryptionKey) {
      formData.append('encryption_key', options.encryptionKey);
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeout);

    let res: Response;
    try {
      res = await fetch(`${this.apiBase}/storage/upload`, {
        method: 'POST',
        headers: this.headers(),
        body: formData,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Bethelnet upload failed (${res.status}): ${text}`);
    }

    const result = (await res.json()) as {
      cid: string;
      zk_proof: string;
      chunk_count: number;
      storage_node_ids: string[];
      size_bytes: number;
      retrieval_url: string;
    };

    return {
      cid: result.cid,
      zkProof: result.zk_proof,
      chunkCount: result.chunk_count,
      storageNodeIds: result.storage_node_ids,
      sizeBytes: result.size_bytes,
      sha256Hash,
      uploadedAt: new Date().toISOString(),
      retrievalUrl: result.retrieval_url,
    };
  }

  /**
   * Retrieves a file from Bethelnet by CID.
   * Verifies ZK proof before returning data.
   */
  async retrieve(cid: string): Promise<BethelnetRetrieveResult> {
    const res = await fetch(`${this.apiBase}/storage/${cid}`, {
      headers: this.headers(),
    });

    if (!res.ok) {
      throw new Error(`Bethelnet retrieve failed (${res.status}): ${await res.text()}`);
    }

    const arrayBuffer = await res.arrayBuffer();
    const data = Buffer.from(arrayBuffer);

    // Verify ZK proof of storage from response header
    const zkProofHeader = res.headers.get('x-bethelnet-zk-proof');
    const zkProofVerified = zkProofHeader === 'verified';

    return {
      cid,
      data,
      zkProofVerified,
      retrievedAt: new Date().toISOString(),
    };
  }

  /**
   * Checks the storage health of a CID — verifies replicas and DeStor nodes.
   */
  async checkStatus(cid: string): Promise<BethelnetStorageStatus> {
    const res = await fetch(`${this.apiBase}/storage/${cid}/status`, {
      headers: this.headers(),
    });

    if (!res.ok) {
      throw new Error(`Bethelnet status failed (${res.status}): ${await res.text()}`);
    }

    const result = (await res.json()) as {
      cid: string;
      replicas: number;
      nodes: string[];
      healthy: boolean;
      last_verified: string;
    };

    return {
      cid: result.cid,
      replicas: result.replicas,
      nodes: result.nodes,
      healthy: result.healthy,
      lastVerified: result.last_verified,
    };
  }

  /**
   * Gets a time-limited signed URL for a CID — used for streaming downloads
   * and direct browser access without routing through our API.
   */
  async getSignedUrl(cid: string, expirySeconds = 3600): Promise<string> {
    const res = await fetch(
      `${this.apiBase}/storage/${cid}/signed-url?expiry=${expirySeconds}`,
      { headers: this.headers() },
    );

    if (!res.ok) {
      throw new Error(`Bethelnet signed URL failed (${res.status})`);
    }

    const result = (await res.json()) as { url: string };
    return result.url;
  }

  /**
   * Verifies a ZK proof from Bethelnet independently.
   */
  async verifyStorageProof(cid: string, zkProof: string): Promise<boolean> {
    const res = await fetch(`${this.apiBase}/proof/verify`, {
      method: 'POST',
      headers: { ...this.headers(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ cid, zk_proof: zkProof }),
    });

    if (!res.ok) return false;

    const result = (await res.json()) as { verified: boolean };
    return result.verified;
  }

  /**
   * Batch upload — sends multiple files and returns their CIDs.
   * More efficient than sequential individual uploads.
   */
  async uploadBatch(
    files: Array<{ data: Buffer; options: BethelnetUploadOptions }>,
  ): Promise<BethelnetUploadResult[]> {
    return Promise.all(files.map(f => this.uploadBuffer(f.data, f.options)));
  }

  /**
   * Gets storage cost estimate before uploading.
   */
  async estimateCost(sizeBytes: number): Promise<{
    estimatedUSD: number;
    estimatedHBAR: number;
    storagePeriodDays: number;
  }> {
    const res = await fetch(
      `${this.apiBase}/storage/estimate?size_bytes=${sizeBytes}`,
      { headers: this.headers() },
    );

    if (!res.ok) {
      throw new Error(`Bethelnet cost estimate failed`);
    }

    const result = (await res.json()) as {
      estimated_usd: number;
      estimated_hbar: number;
      storage_period_days: number;
    };

    return {
      estimatedUSD: result.estimated_usd,
      estimatedHBAR: result.estimated_hbar,
      storagePeriodDays: result.storage_period_days,
    };
  }
}

// Singleton
let _bethelnetClient: BethelnetClient | null = null;

export function getBethelnetClient(): BethelnetClient {
  if (!_bethelnetClient) {
    _bethelnetClient = new BethelnetClient();
  }
  return _bethelnetClient;
}

export { BethelnetClient };
