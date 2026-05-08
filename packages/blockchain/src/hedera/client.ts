import {
  Client,
  AccountId,
  PrivateKey,
  Hbar,
} from '@hashgraph/sdk';

export interface HederaConfig {
  accountId: string;
  privateKey: string;
  network: 'mainnet' | 'testnet' | 'previewnet';
}

let _client: Client | null = null;

export function getHederaClient(config?: HederaConfig): Client {
  if (_client) return _client;

  const accountId = config?.accountId ?? process.env['HEDERA_ACCOUNT_ID'];
  const privateKey = config?.privateKey ?? process.env['HEDERA_PRIVATE_KEY'];
  const network = config?.network ?? (process.env['HEDERA_NETWORK'] as HederaConfig['network']) ?? 'testnet';

  if (!accountId || !privateKey) {
    throw new Error('HEDERA_ACCOUNT_ID and HEDERA_PRIVATE_KEY must be set');
  }

  if (network === 'mainnet') {
    _client = Client.forMainnet();
  } else if (network === 'previewnet') {
    _client = Client.forPreviewnet();
  } else {
    _client = Client.forTestnet();
  }

  _client.setOperator(
    AccountId.fromString(accountId),
    PrivateKey.fromStringDer(privateKey),
  );

  // Conservative defaults — keep costs predictable
  _client.setDefaultMaxTransactionFee(new Hbar(2));
  _client.setMaxQueryPayment(new Hbar(1));

  return _client;
}

export function resetHederaClient(): void {
  _client = null;
}
