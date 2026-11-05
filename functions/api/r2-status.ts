// 临时诊断：只返回绑定名和类型，不返回值。上线确认 R2 变量名后删除。
import { r2Bucket } from '../lib/r2';

const TOKEN = 'r2diag-7c1f9a3e';

export const onRequestGet = async ({ env, request }: any) => {
  const url = new URL(request.url);
  if (url.searchParams.get('t') !== TOKEN) return new Response('not found', { status: 404 });
  const out: any = { hasR2: !!r2Bucket(env), bindings: {} };
  for (const k of Object.keys(env || {})) {
    const v = env[k];
    out.bindings[k] = {
      type: v === null ? 'null' : typeof v,
      put: typeof v?.put === 'function',
      get: typeof v?.get === 'function',
      list: typeof v?.list === 'function',
    };
  }
  return new Response(JSON.stringify(out, null, 2), {
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
};
