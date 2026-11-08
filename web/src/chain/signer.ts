import { CONTRACT_ID, DEV_ACCOUNT, DEV_KEY, NETWORK, RPC_URL } from './config';

/** One way to sign: a NEAR wallet through near-connect, or a local key on the sandbox. */
export interface Signer {
  accountId: string;
  /** Calls the game contract. Resolves with the method's JSON return, throws the panic text. */
  call<T = unknown>(method: string, args: object, depositYocto?: bigint, tgas?: number): Promise<T>;
  signOut(): Promise<void>;
  /** A purse bid: signed by the one-tap key when there is one, or by the wallet. */
  bid(roundId: number, maxYocto: bigint): Promise<string>;
  /** Whether a one-tap key is saved in this browser for this account. */
  oneTap(): boolean;
  /** Adds a key on the account that can only call `bid` on this game, and saves it here. */
  enableOneTap(): Promise<void>;
  /** Removes the key from the account and from this browser. */
  disableOneTap(): Promise<void>;
  /** Clears the key from this browser only. It stays on the account, but nobody holds it. */
  forgetOneTap(): void;
}

const GAS = (tgas: number) => (BigInt(tgas) * 10n ** 12n).toString();

/** A bid costs well under this; the allowance only ever pays gas, so it covers a long session. */
const BID_TGAS = 50;
const ONE_TAP_ALLOWANCE = 250_000_000_000_000_000_000_000n; // 0.25 NEAR

/* ---------- one-tap key, kept in this browser ---------- */

/**
 * Local storage is readable by any script on the page, which is why the key is scoped so
 * tightly on chain: it can only call `bid`, can't attach NEAR, and can't take anything out.
 */
const oneTapSlot = (accountId: string) => `lastflag:one-tap:${NETWORK}:${CONTRACT_ID}:${accountId}`;

const readOneTap = (accountId: string): string | null => {
  try { return localStorage.getItem(oneTapSlot(accountId)); } catch { return null; }
};
/** False if the browser refused, for example in a private window. */
const writeOneTap = (accountId: string, key: string | null) => {
  try {
    if (key) localStorage.setItem(oneTapSlot(accountId), key);
    else localStorage.removeItem(oneTapSlot(accountId));
    return true;
  } catch {
    return false;
  }
};

const errorText = (e: unknown) => (e instanceof Error ? e.message : typeof e === 'string' ? e : JSON.stringify(e));

/** The key is no longer on the account. Wallets relay protocol names, near-api-js has its own wording. */
const keyIsGone = (e: unknown) => /access key \S+ does not exist|AccessKeyNotFound|UNKNOWN_ACCESS_KEY|DeleteKeyDoesNotExist/i.test(errorText(e));
const outOfAllowance = (e: unknown) => /not\s*enough\s*allowance/i.test(errorText(e));

/** The one-tap half of a Signer. `addKey` and `removeKey` are how this signer changes account keys. */
const oneTapMethods = (
  accountId: string,
  call: Signer['call'],
  addKey: (publicKey: string) => Promise<unknown>,
  removeKey: (publicKey: string) => Promise<unknown>,
): Pick<Signer, 'bid' | 'oneTap' | 'enableOneTap' | 'disableOneTap' | 'forgetOneTap'> => ({
  oneTap: () => readOneTap(accountId) !== null,
  async bid(roundId, maxYocto) {
    const args = { round_id: roundId, max: maxYocto.toString() };
    const key = readOneTap(accountId);
    if (!key) return call<string>('bid', args, 0n, BID_TGAS);
    const { Account, JsonRpcProvider } = await import('near-api-js');
    const session = new Account(accountId, new JsonRpcProvider({ url: RPC_URL }), key as `ed25519:${string}`);
    try {
      const outcome = await session.callFunctionRaw({ contractId: CONTRACT_ID!, methodName: 'bid', args, gas: GAS(BID_TGAS) });
      return decodeOutcome<string>(outcome as unknown as Outcome);
    } catch (e) {
      // Removed elsewhere or out of allowance: forget it, so the next bid can use the wallet.
      // A nonce clash from two quick bids is not this, and the key must survive it.
      if (keyIsGone(e) || outOfAllowance(e)) {
        writeOneTap(accountId, null);
        throw new Error('The one-tap key no longer works. Turn one-tap on again.');
      }
      throw e;
    }
  },
  async enableOneTap() {
    const { KeyPair } = await import('near-api-js');
    const pair = KeyPair.fromRandom('ed25519');
    // Saved first: a key added on chain that this browser can't keep would be lost for good.
    if (!writeOneTap(accountId, pair.toString())) throw new Error("This browser is blocking storage, so one-tap can't stay on.");
    try {
      await addKey(pair.getPublicKey().toString());
    } catch (e) {
      writeOneTap(accountId, null);
      throw e;
    }
  },
  async disableOneTap() {
    const key = readOneTap(accountId);
    if (!key) return;
    const { KeyPair } = await import('near-api-js');
    try {
      await removeKey(KeyPair.fromString(key as `ed25519:${string}`).getPublicKey().toString());
    } catch (e) {
      // Already removed elsewhere is what was wanted. Anything else leaves the key in place.
      if (!keyIsGone(e)) throw e;
    }
    writeOneTap(accountId, null);
  },
  forgetOneTap() {
    writeOneTap(accountId, null);
  },
});

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
  const call: Signer['call'] = async <T,>(method: string, args: object, depositYocto = 0n, tgas = 100) => {
    const outcome = await wallet.signAndSendTransaction({
      receiverId: CONTRACT_ID!,
      actions: [{ type: 'FunctionCall', params: { methodName: method, args, gas: GAS(tgas), deposit: depositYocto.toString() } }],
    });
    return decodeOutcome<T>(outcome as Outcome);
  };
  return {
    accountId,
    call,
    signOut: () => c.disconnect(),
    ...oneTapMethods(
      accountId,
      call,
      (publicKey) => wallet.signAndSendTransaction({
        receiverId: accountId,
        actions: [{
          type: 'AddKey',
          params: {
            publicKey,
            accessKey: { permission: { receiverId: CONTRACT_ID!, methodNames: ['bid'], allowance: ONE_TAP_ALLOWANCE.toString() } },
          },
        }],
      }),
      (publicKey) => wallet.signAndSendTransaction({ receiverId: accountId, actions: [{ type: 'DeleteKey', params: { publicKey } }] }),
    ),
  };
};

/* ---------- local key (sandbox only) ---------- */

const devSigner = async (): Promise<Signer> => {
  const { Account, JsonRpcProvider } = await import('near-api-js');
  const provider = new JsonRpcProvider({ url: RPC_URL });
  const account = new Account(DEV_ACCOUNT!, provider, DEV_KEY as `ed25519:${string}`);
  const call: Signer['call'] = async <T,>(method: string, args: object, depositYocto = 0n, tgas = 100) => {
    const outcome = await account.callFunctionRaw({
      contractId: CONTRACT_ID!,
      methodName: method,
      args,
      deposit: depositYocto,
      gas: GAS(tgas),
    });
    return decodeOutcome<T>(outcome as unknown as Outcome);
  };
  return {
    accountId: DEV_ACCOUNT!,
    call,
    signOut: async () => {},
    ...oneTapMethods(
      DEV_ACCOUNT!,
      call,
      (publicKey) => account.addFunctionCallAccessKey({ publicKey, contractId: CONTRACT_ID!, methodNames: ['bid'], allowance: ONE_TAP_ALLOWANCE }),
      (publicKey) => account.deleteKey(publicKey),
    ),
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
