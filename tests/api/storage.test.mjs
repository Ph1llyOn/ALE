import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { makeUser, cleanup, link, anonClient, TINY_PNG, API_URL, PUBLISHABLE_KEY } from './helpers.mjs';

let ale, phill, stranger;
before(async () => {
  ale = await makeUser('alessia');
  phill = await makeUser('phill');
  stranger = await makeUser('phill');
  await link(ale, phill);
});
after(cleanup);

const bucket = (u) => u.client.storage.from('avatars');
const png = (extra = {}) => ({ contentType: 'image/png', ...extra });

test('avatar: upload nella propria cartella ok, lettura propria ok', async () => {
  const path = `${ale.id}/a1.png`;
  assert.equal((await bucket(ale).upload(path, TINY_PNG, png())).error, null);
  const dl = await bucket(ale).download(path);
  assert.equal(dl.error, null);
  assert.equal((await dl.data.arrayBuffer()).byteLength, TINY_PNG.length);
  const signed = await bucket(ale).createSignedUrl(path, 60);
  assert.equal(signed.error, null);
  assert.equal((await fetch(signed.data.signedUrl)).status, 200);
});

test('avatar: il partner può leggere, un estraneo e anon no', async () => {
  const path = `${ale.id}/a1.png`;
  assert.equal((await bucket(phill).download(path)).error, null, 'il partner deve poter leggere');
  assert.ok((await bucket(stranger).download(path)).error, 'un estraneo non deve poter leggere');
  assert.ok((await bucket(stranger).createSignedUrl(path, 60)).error);
  assert.ok((await anonClient().storage.from('avatars').download(path)).error);
  // il bucket è privato: l'URL pubblico non funziona
  const pub = await fetch(`${API_URL}/storage/v1/object/public/avatars/${path}`);
  assert.notEqual(pub.status, 200);
});

test('avatar: nessun upload/modifica/cancellazione nella cartella altrui', async () => {
  for (const actor of [phill, stranger]) {
    assert.ok((await bucket(actor).upload(`${ale.id}/evil.png`, TINY_PNG, png())).error, 'upload in cartella altrui');
    assert.ok((await bucket(actor).upload(`${ale.id}/a1.png`, TINY_PNG, png({ upsert: true }))).error, 'sovrascrittura');
    const rm = await bucket(actor).remove([`${ale.id}/a1.png`]);
    assert.ok(rm.error || (rm.data ?? []).length === 0, 'cancellazione file altrui');
    const mv = await bucket(actor).move(`${ale.id}/a1.png`, `${actor.id}/stolen.png`);
    assert.ok(mv.error, 'spostamento file altrui');
  }
  assert.equal((await bucket(ale).download(`${ale.id}/a1.png`)).error, null, 'il file è ancora al suo posto');
  assert.ok((await anonClient().storage.from('avatars').upload(`${ale.id}/anon.png`, TINY_PNG, png())).error);
});

test('avatar: path non validi e fuori cartella utente rifiutati', async () => {
  assert.ok((await bucket(ale).upload('senza-cartella.png', TINY_PNG, png())).error);
  assert.ok((await bucket(ale).upload(`${ale.id}/../${phill.id}/x.png`, TINY_PNG, png())).error);
});

test('avatar: solo immagini jpeg/png/webp, massimo 2 MiB', async () => {
  const text = await bucket(ale).upload(`${ale.id}/note.txt`, Buffer.from('ciao'), { contentType: 'text/plain' });
  assert.ok(text.error, 'text/plain deve essere rifiutato');
  const svg = await bucket(ale).upload(`${ale.id}/x.svg`, Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), { contentType: 'image/svg+xml' });
  assert.ok(svg.error, 'svg deve essere rifiutato (script possibili)');
  const big = await bucket(ale).upload(`${ale.id}/big.png`, Buffer.alloc(2 * 1024 * 1024 + 10), png());
  assert.ok(big.error, 'oltre 2 MiB deve essere rifiutato');
});

test('avatar: dopo la fine del collegamento il partner perde l\'accesso; il proprietario cancella', async () => {
  const path = `${ale.id}/a1.png`;
  assert.equal((await phill.client.rpc('end_partnership')).data.ok, true);
  assert.ok((await bucket(phill).download(path)).error, 'accesso revocato');
  assert.equal((await bucket(ale).download(path)).error, null);
  const rm = await bucket(ale).remove([path]);
  assert.equal(rm.error, null);
  assert.equal(rm.data.length, 1);
  assert.ok((await bucket(ale).download(path)).error);
});

test('API storage senza login: elenco e download negati', async () => {
  const r = await fetch(`${API_URL}/storage/v1/object/list/avatars`, {
    method: 'POST', headers: { apikey: PUBLISHABLE_KEY, 'content-type': 'application/json' }, body: JSON.stringify({ prefix: '', limit: 10 }),
  });
  const body = await r.json().catch(() => null);
  assert.ok(r.status >= 400 || (Array.isArray(body) && body.length === 0), `lista anonima: ${r.status} ${JSON.stringify(body)}`);
});
