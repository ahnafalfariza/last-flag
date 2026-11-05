import { CONTRACT_ID, DEV_ACCOUNT, DEV_KEY, NETWORK, RPC_URL } from './config';

/** One way to sign: a NEAR wallet through near-connect, or a local key on the sandbox. */
export interface Signer {
  accountId: string;
  /** Calls the game contract. Resolves with the method's JSON return, throws the panic text. */
  call<T = unknown>(method: string, args: object, depositYocto?: bigint, tgas?: number): Promise<T>;
  signOut(): Promise<void>;
}

const GAS = (tgas: number) => (BigInt(tgas) * 10n ** 12n).toString();

/** Pulls the contract's panic text out of a failed outcome, so players see "below current minimum". */
export const panicText = (e: unknown): string => {
  const raw = e instanceof Error ? e.message : typeof e === 'string' ? e : JSON.stringify(e);
  const m = /Smart contract panicked: ([^"\\]+)/.exec(raw);
  if (m) return m[1].trim();
  if (/reject|cancel|denied|closed/i.test(raw)) return 'Cancelled in the wallet.';
  return raw.length > 160 ? `${raw.slice(0, 157)}...` : raw;
};

interface Outcome {
  status?: { SuccessValue?: string; Failure?: unknown } | string;
  receipts_outcome?: { outcome: { status: { Failure?: unknown } } }[];
}

const decodeOutcome = <T>(o: Outcome): T => {
  const status = typeof o.status === 'object' ? o.status : undefined;
  const failure = status?.Failure ?? o.receipts_outcome?.find((r) => r.outcome.status.Failure)?.outcome.status.Failure;
  if (failure) throw new Error(JSON.stringify(failure));
  const v = status?.SuccessValue;
  if (!v) return undefined as T;
  const text = new TextDecoder().decode(Uint8Array.from(atob(v), (c) => c.charCodeAt(0)));
  try { return JSON.parse(text) as T; } catch { return text as T; }
};

/* ---------- near-connect (testnet, mainnet) ---------- */

type Connector = import('@hot-labs/near-connect').NearConnector;
let connector: Promise<Connector> | null = null;

const getConnector = () => {
  connector ??= import('@hot-labs/near-connect').then(({ NearConnector }) =>
    new NearConnector({
      network: NETWORK === 'mainnet' ? 'mainnet' : 'testnet',
      features: { signAndSendTransaction: true, ...(NETWORK === 'testnet' ? { testnet: true } : {}) },
      footerBranding: null,
    }),
  );
  return connector;
};

const walletSigner = async (c: Connector, accountId: string): Promise<Signer> => {
  const wallet = await c.wallet();
  return {
    accountId,
    async call<T>(method: string, args: object, depositYocto = 0n, tgas = 100) {
      const outcome = await wallet.signAndSendTransaction({
        receiverId: CONTRACT_ID!,
        actions: [{ type: 'FunctionCall', params: { methodName: method, args, gas: GAS(tgas), deposit: depositYocto.toString() } }],
      });
      return decodeOutcome<T>(outcome as Outcome);
    },
    signOut: () => c.disconnect(),
  };
};

/* ---------- local key (sandbox only) ---------- */

const devSigner = async (): Promise<Signer> => {
  const { Account, JsonRpcProvider } = await import('near-api-js');
  const provider = new JsonRpcProvider({ url: RPC_URL });
  const account = new Account(DEV_ACCOUNT!, provider, DEV_KEY as `ed25519:${string}`);
  return {
    accountId: DEV_ACCOUNT!,
    async call<T>(method: string, args: object, depositYocto = 0n, tgas = 100) {
      const outcome = await account.callFunctionRaw({
        contractId: CONTRACT_ID!,
        methodName: method,
        args,
        deposit: depositYocto,
        gas: GAS(tgas),
      });
      return decodeOutcome<T>(outcome as unknown as Outcome);
    },
    signOut: async () => {},
  };
};

const usesDevKey = () => NETWORK === 'sandbox';

/** Opens the wallet picker (or uses the sandbox key). Resolves once someone is signed in. */
export async function signIn(): Promise<Signer> {
  if (usesDevKey()) {
    if (!DEV_ACCOUNT || !DEV_KEY) throw new Error('Sandbox needs VITE_DEV_ACCOUNT and VITE_DEV_KEY.');
    return devSigner();
  }
  const c = await getConnector();
  await c.whenManifestLoaded;
  const wallet = await c.connect();
  const [acc] = await wallet.getAccounts();
  if (!acc) throw new Error('The wallet returned no account.');
  return walletSigner(c, acc.accountId);
}

/** A session left over from a previous visit, if any. Never opens a popup. */
export async function restore(): Promise<Signer | null> {
  if (usesDevKey()) return null;
  try {
    const c = await getConnector();
    const { accounts } = await c.getConnectedWallet();
    return accounts[0] ? walletSigner(c, accounts[0].accountId) : null;
  } catch {
    return null;
  }
}
