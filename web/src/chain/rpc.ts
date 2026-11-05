import { RPC_URL } from './config';

/** Minimal NEAR JSON-RPC for views: no library, one fetch per call. */

let rpcId = 0;

async function rpc<T>(method: string, params: unknown): Promise<T> {
  const res = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: ++rpcId, method, params }),
  });
  if (!res.ok) throw new Error(`RPC ${res.status}`);
  const body = await res.json();
  if (body.error) throw new Error(body.error.data ?? body.error.message ?? 'RPC error');
  if (body.result?.error) throw new Error(body.result.error);
  return body.result as T;
}

const toBase64 = (s: string) => btoa(String.fromCharCode(...new TextEncoder().encode(s)));

export async function view<T>(contractId: string, method: string, args: object = {}): Promise<T> {
  const r = await rpc<{ result: number[] }>('query', {
    request_type: 'call_function',
    finality: 'optimistic',
    account_id: contractId,
    method_name: method,
    args_base64: toBase64(JSON.stringify(args)),
  });
  return JSON.parse(new TextDecoder().decode(new Uint8Array(r.result))) as T;
}

/** Spendable balance in yoctoNEAR. */
export async function balanceOf(accountId: string): Promise<bigint> {
  const r = await rpc<{ amount: string }>('query', {
    request_type: 'view_account',
    finality: 'optimistic',
    account_id: accountId,
  });
  return BigInt(r.amount);
}

const YOCTO = 10n ** 24n;

/** yoctoNEAR string to NEAR as a float, for display. Exact to 1e-6 NEAR. */
export const toNear = (yocto: string | bigint) => {
  const y = BigInt(yocto);
  return Number(y / YOCTO) + Number((y % YOCTO) / 10n ** 18n) / 1e6;
};
