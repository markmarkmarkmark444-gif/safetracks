/**
 * Pinata IPFS Storage Client
 * https://docs.pinata.cloud
 *
 * Replaces Bethelnet for v1 pilot. Pinata is a proven IPFS pinning service
 * with a documented REST API, free tier (1 GB), and production track record.
 *
 * Files are pinned to IPFS and retrievable at:
 *   https://gateway.pinata.cloud/ipfs/{CID}
 *
 * Only the CID + SHA-256 hash are stored in our DB / anchored on Hedera.
 * The file itself lives on IPFS — content-addressed and immutable.
 */

import { sha256Hex } from '@safetracks/shared';

export interface StorageUploadResult {
  cid: string;
  sizeBytes: number;
  sha256Hash: string;
  uploadedAt: string;
  retrievalUrl: string;
  provider: 'pinata';
}

export interface StorageUploadOptions {
  filename: string;
  mimeType: string;
  tags?: string[];
  metadata?: Record<string, string>;
}

class PinataClient {
  private readonly jwt: string;
  private readonly gateway: string;

  constructor() {
    this.jwt = process.env['PINATA_JWT'] ?? '';
    this.gateway = process.env['PINATA_GATEWAY'] ?? 'https://gateway.pinata.cloud';
  }

  private headers() {
    return { Authorization: `Bearer ${this.jwt}` };
  }

  async uploadBuffer(data: Buffer, options: StorageUploadOptions): Promise<StorageUploadResult> {
    if (!this.jwt) throw new Error('PINATA_JWT is not configured');

    const sha256Hash = sha256Hex(data);

    const form = new FormData();
    form.append('file', new Blob([data], { type: options.mimeType }), options.filename);
    form.append(
      'pinataMetadata',
      JSON.stringify({
        name: options.filename,
        keyvalues: {
          ...options.metadata,
          ...(options.tags?.length ? { tags: options.tags.join(',') } : {}),
        },
      }),
    );

    const res = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
      method: 'POST',
      headers: this.headers(),
      body: form,
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Pinata upload failed (${res.status}): ${text}`);
    }

    const result = (await res.json()) as { IpfsHash: string; PinSize: number };

    return {
      cid: result.IpfsHash,
      sizeBytes: result.PinSize,
      sha256Hash,
      uploadedAt: new Date().toISOString(),
      retrievalUrl: `${this.gateway}/ipfs/${result.IpfsHash}`,
      provider: 'pinata',
    };
  }

  async uploadJson(content: unknown, name: string, metadata?: Record<string, string>): Promise<StorageUploadResult> {
    if (!this.jwt) throw new Error('PINATA_JWT is not configured');

    const res = await fetch('https://api.pinata.cloud/pinning/pinJSONToIPFS', {
      method: 'POST',
      headers: { ...this.headers(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pinataContent: content,
        pinataMetadata: { name, keyvalues: metadata ?? {} },
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Pinata JSON upload failed (${res.status}): ${text}`);
    }

    const result = (await res.json()) as { IpfsHash: string; PinSize: number };
    const sha256Hash = sha256Hex(Buffer.from(JSON.stringify(content)));

    return {
      cid: result.IpfsHash,
      sizeBytes: result.PinSize,
      sha256Hash,
      uploadedAt: new Date().toISOString(),
      retrievalUrl: `${this.gateway}/ipfs/${result.IpfsHash}`,
      provider: 'pinata',
    };
  }

  getRetrievalUrl(cid: string): string {
    return `${this.gateway}/ipfs/${cid}`;
  }

  async testConnection(): Promise<boolean> {
    try {
      const res = await fetch('https://api.pinata.cloud/data/testAuthentication', {
        headers: this.headers(),
      });
      return res.ok;
    } catch {
      return false;
    }
  }
}

let _client: PinataClient | null = null;

export function getStorageClient(): PinataClient {
  if (!_client) _client = new PinataClient();
  return _client;
}

export { PinataClient };
