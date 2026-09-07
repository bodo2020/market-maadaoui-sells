// Run with Node 24+. Executes the actual service with mocked auth/network/storage.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';

const memory = new Map([['currentBranchId', 'branch']]);
globalThis.localStorage = {
  getItem: key => memory.get(key) ?? null,
  setItem: (key, value) => memory.set(key, value),
  removeItem: key => memory.delete(key)
};
let response = { data: null, error: { message: 'network unavailable', code: '' } };
const requests = [];
globalThis.saleTestClient = {
  auth: { getUser: async () => ({ data: { user: { id: 'cashier' } } }) },
  rpc: async (name, args) => { requests.push({ name, ...args }); return response; }
};
let source = await readFile(new URL('../src/services/supabase/saleService.ts', import.meta.url), 'utf8');
source = source.replace(/^import .*;$/gm, '');
const js = stripTypeScriptTypes('const supabase = globalThis.saleTestClient;\n' + source);
const { createSale, clearConfirmedSale } = await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'));
const sale = { invoice_number: 'invoice-1', date: 'today', items: [], subtotal: 10, discount: 0, total: 10, payment_method: 'cash', cash_amount: 10 };
await assert.rejects(createSale(sale, undefined, 'cart'));
const first = requests.at(-1);
clearConfirmedSale('cashier', 'branch', 'cart');
response = { data: { id: first.p_request_id }, error: null };
await createSale({ ...sale, invoice_number: 'invoice-2', date: 'later' }, undefined, 'cart');
assert.equal(requests.at(-1).p_request_id, first.p_request_id);
assert.equal(requests.at(-1).p_sale.invoice_number, 'invoice-1');
const beforeConflict = requests.length;
await assert.rejects(createSale({ ...sale, total: 20 }, undefined, 'cart'));
assert.equal(requests.length, beforeConflict);
clearConfirmedSale('cashier', 'branch', 'cart');
await createSale(sale, undefined, 'cart');
assert.notEqual(requests.at(-1).p_request_id, first.p_request_id);
response = { data: null, error: { code: '22023', message: 'INSUFFICIENT_STOCK' } };
await assert.rejects(createSale(sale, undefined, 'rejected-cart'), /مخزون/);
const rejectedId = requests.at(-1).p_request_id;
response = { data: { id: 'saved' }, error: null };
await createSale({ ...sale, total: 5, subtotal: 5, cash_amount: 5 }, undefined, 'rejected-cart');
assert.notEqual(requests.at(-1).p_request_id, rejectedId);
const beforeStorageFailure = requests.length;
localStorage.setItem = () => { throw new Error('storage unavailable'); };
await assert.rejects(createSale(sale, undefined, 'unsaved-cart'), /storage unavailable/);
assert.equal(requests.length, beforeStorageFailure);
console.log('PASS: lost-response retry, original invoice, changed-cart conflict, confirmed reset, validation recovery, storage failure before dispatch');
