import { createHash } from 'crypto';
import { PsychrometricReading } from '../types';

// ─── Psychrometric Calculations ───────────────────────────────────────────────

/**
 * Calculates dew point using Magnus approximation.
 */
export function calcDewPoint(tempF: number, rhPct: number): number {
  const tempC = (tempF - 32) * (5 / 9);
  const a = 17.625;
  const b = 243.04;
  const gamma = Math.log(rhPct / 100) + (a * tempC) / (b + tempC);
  const dewC = (b * gamma) / (a - gamma);
  return (dewC * 9) / 5 + 32;
}

/**
 * Calculates grains of moisture per pound of dry air.
 * Uses standard psychrometric formula.
 */
export function calcGrainsPerLb(tempF: number, rhPct: number): number {
  const tempC = (tempF - 32) * (5 / 9);
  // Saturation vapor pressure (kPa) — Antoine equation
  const pSat = 0.61078 * Math.exp((17.27 * tempC) / (tempC + 237.3));
  const pActual = (rhPct / 100) * pSat;
  // Humidity ratio (lb water / lb dry air)
  const humidityRatio = 0.621945 * (pActual / (101.325 - pActual));
  return humidityRatio * 7000; // grains per lb
}

/**
 * Full psychrometric calculation from temp and RH.
 */
export function calcPsychrometrics(
  tempF: number,
  rhPct: number,
  room: string,
  jobId: string,
  recordedBy: string,
): Omit<PsychrometricReading, 'id' | 'hederaTxId'> {
  return {
    jobId,
    recordedBy,
    timestamp: new Date().toISOString(),
    room,
    temperatureF: tempF,
    relativeHumidityPct: rhPct,
    dewPointF: calcDewPoint(tempF, rhPct),
    grainsPerLb: calcGrainsPerLb(tempF, rhPct),
  };
}

// ─── Hashing Utilities ────────────────────────────────────────────────────────

export function sha256Hex(data: Buffer | string): string {
  return createHash('sha256').update(data).digest('hex');
}

export function sha256Base64(data: Buffer | string): string {
  return createHash('sha256').update(data).digest('base64');
}

// ─── Job Number Generation ────────────────────────────────────────────────────

const JOB_TYPE_PREFIXES: Record<string, string> = {
  water: 'WTR',
  fire: 'FIR',
  mold: 'MLD',
  storm: 'STM',
  multi: 'MLT',
};

export function generateJobNumber(type: string): string {
  const prefix = JOB_TYPE_PREFIXES[type] ?? 'JOB';
  const year = new Date().getFullYear().toString().slice(-2);
  const rand = Math.floor(Math.random() * 900000) + 100000;
  return `${prefix}-${year}-${rand}`;
}

// ─── ID Generation ────────────────────────────────────────────────────────────

export function generateId(): string {
  const bytes = new Uint8Array(16);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    const { randomBytes } = require('crypto');
    randomBytes(16).copy(Buffer.from(bytes.buffer));
  }
  // UUID v4 format
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join('-');
}

// ─── QR Code Data Encoding ────────────────────────────────────────────────────

export interface QRCodePayload {
  v: number; // version
  jobId: string;
  hederaTopicId: string;
  checksum: string;
}

export function encodeQRPayload(jobId: string, hederaTopicId: string): QRCodePayload {
  const raw = `${jobId}:${hederaTopicId}`;
  return {
    v: 1,
    jobId,
    hederaTopicId,
    checksum: sha256Hex(raw).slice(0, 8),
  };
}

export function decodeQRPayload(payload: QRCodePayload): { jobId: string; hederaTopicId: string } | null {
  const raw = `${payload.jobId}:${payload.hederaTopicId}`;
  const expected = sha256Hex(raw).slice(0, 8);
  if (expected !== payload.checksum) return null;
  return { jobId: payload.jobId, hederaTopicId: payload.hederaTopicId };
}

// ─── Bethelnet MIME Routing ───────────────────────────────────────────────────

const LARGE_FILE_THRESHOLD_BYTES = 512 * 1024; // 512 KB

export function shouldUseBethelnet(fileSizeBytes: number): boolean {
  return fileSizeBytes >= LARGE_FILE_THRESHOLD_BYTES;
}

export function getMimeCategory(mimeType: string): 'image' | 'video' | 'document' | 'data' {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  if (['application/pdf', 'application/msword', 'application/vnd'].some(p => mimeType.startsWith(p))) return 'document';
  return 'data';
}
