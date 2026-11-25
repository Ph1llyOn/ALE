import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { makeUser, cleanup, link, adminClient, anonClient } from './helpers.mjs';

let ale, phill, stranger;
before(async () => {
  ale = await makeUser('alessia', 'Ale');
  phill = await makeUser('phill', 'Phill');
  stranger = await makeUser('phill', 'Estraneo');
  await link(ale, phill);
});
after(cleanup);

const inOneDay = () => new Date(Date.now() + 864e5).toISOString();

test('biglietti: Phill crea, modifica ed elimina; Alessia li riceve', async () => {
  const c = await phill.client.from('messages').insert({ sender_id: phill.id, recipient_id: ale.id, title: 'Buongiorno', body: 'Ti penso\ne ti auguro una bella giornata' }).select().single();
  assert.equal(c.error, null, c.error?.message);
  assert.equal(c.data.edited_at, null);
  assert.ok(!('read_at' in c.data), 'nessuno stato di lettura sul messaggio');

  const seen = await ale.client.from('messages').select('title, body, sent_at, edited_at, sender_id').eq('id', c.data.id).single();
  assert.equal(seen.data.body, 'Ti penso\ne ti auguro una bella giornata');
  assert.equal(seen.data.sender_id, phill.id);

  const ed = await phill.client.from('messages').update({ title: 'Buongiorno amore', body: 'Testo corretto' }).eq('id', c.data.id).select().single();
  assert.equal(ed.error, null);
  assert.ok(ed.data.edited_at, 'la modifica è marcata dal server');
  assert.equal((await ale.client.from('messages').select('body').eq('id', c.data.id).single()).data.body, 'Testo corretto', 'Alessia vede la versione corretta');

  assert.equal((await stranger.client.from('messages').select('id').eq('id', c.data.id)).data.length, 0);
  assert.equal((await stranger.client.from('messages').update({ body: 'Hack' }).eq('id', c.data.id).select()).data.length, 0);
  assert.equal((await stranger.client.from('messages').delete().eq('id', c.data.id).select()).data.length, 0);
  assert.equal((await ale.client.from('messages').delete().eq('id', c.data.id).select()).data.length, 0, 'la destinataria non elimina i biglietti di Phill');

  assert.equal((await phill.client.from('messages').delete().eq('id', c.data.id).select()).data.length, 1);
  assert.equal((await ale.client.from('messages').select('id').eq('id', c.data.id)).data.length, 0, 'eliminato: sparisce anche per lei');
});

test('PRIVACY di chi riceve: lettura e archivio sono solo di Alessia e Phill non li vede mai', async () => {
  const m = (await phill.client.from('messages').insert({ sender_id: phill.id, recipient_id: ale.id, title: 'Per te', body: 'Un pensiero' }).select().single()).data;
  // Alessia segna come letto e archivia
  const read = await ale.client.from('message_receipts').insert({ message_id: m.id, recipient_id: ale.id, read_at: new Date().toISOString() });
  assert.equal(read.error, null, read.error?.message);
  const arch = await ale.client.from('message_receipts').update({ archived_at: new Date().toISOString() }).eq('message_id', m.id).select();
  assert.equal(arch.data.length, 1);
  // Phill non vede ricevute, non può chiedere read_at, non può crearne
  assert.equal((await phill.client.from('message_receipts').select('*')).data.length, 0);
  const ask = await phill.client.from('messages').select('read_at').eq('id', m.id);
  assert.ok(ask.error, 'la colonna read_at non esiste più');
  assert.ok((await phill.client.from('message_receipts').insert({ message_id: m.id, recipient_id: ale.id, read_at: new Date().toISOString() })).error);
  assert.ok((await phill.client.from('message_receipts').insert({ message_id: m.id, recipient_id: phill.id })).error, 'non si crea una ricevuta per un messaggio non proprio');
  assert.equal((await phill.client.from('message_receipts').update({ archived_at: null }).eq('message_id', m.id).select()).data.length, 0);
  assert.equal((await stranger.client.from('message_receipts').select('*')).data.length, 0);
  // la cronologia di Phill resta intatta anche se Alessia ha archiviato
  assert.equal((await phill.client.from('messages').select('id').eq('id', m.id)).data.length, 1);
  // l'embed lato destinatario funziona; lato mittente non rivela nulla
  const emb = await ale.client.from('messages').select('id, message_receipts(read_at, archived_at)').eq('id', m.id).single();
  assert.ok(emb.data.message_receipts?.archived_at || emb.data.message_receipts?.[0]?.archived_at);
  const embP = await phill.client.from('messages').select('id, message_receipts(read_at, archived_at)').eq('id', m.id).single();
  assert.ok(!embP.data.message_receipts || (Array.isArray(embP.data.message_receipts) ? embP.data.message_receipts.length === 0 : false), 'Phill non deve ricevere ricevute dall\'embed');
  // ripristino
  assert.equal((await ale.client.from('message_receipts').update({ archived_at: null }).eq('message_id', m.id).select()).data.length, 1);
});

test('programmati: Phill crea, modifica, annulla ed elimina; Alessia non li vede', async () => {
  const s = await phill.client.from('scheduled_messages').insert({ sender_id: phill.id, recipient_id: ale.id, title: 'Domani', body: 'Sorpresa', send_at: inOneDay() }).select().single();
  assert.equal(s.error, null, s.error?.message);
  assert.equal(s.data.status, 'pending');
  assert.equal((await ale.client.from('scheduled_messages').select('id')).data.length, 0, 'la destinataria non li vede');
  assert.equal((await stranger.client.from('scheduled_messages').select('id')).data.length, 0);
  const later = new Date(Date.now() + 2 * 864e5).toISOString();
  const up = await phill.client.from('scheduled_messages').update({ body: 'Sorpresa più bella', send_at: later }).eq('id', s.data.id).select().single();
  assert.equal(up.error, null, up.error?.message);
  assert.equal(up.data.body, 'Sorpresa più bella');
  assert.ok((await phill.client.from('scheduled_messages').update({ send_at: new Date(Date.now() - 6e4).toISOString() }).eq('id', s.data.id)).error, 'non si sposta nel passato');
  assert.ok((await phill.client.from('scheduled_messages').update({ status: 'sent' }).eq('id', s.data.id)).error);
  assert.ok((await phill.client.from('scheduled_messages').update({ attempts: 0 }).eq('id', s.data.id)).error);
  assert.equal((await ale.client.from('scheduled_messages').update({ status: 'cancelled' }).eq('id', s.data.id).select()).data.length, 0);
  assert.equal((await phill.client.from('scheduled_messages').update({ status: 'cancelled' }).eq('id', s.data.id).select()).data.length, 1);
  assert.equal((await phill.client.from('scheduled_messages').update({ body: 'Dopo annullo' }).eq('id', s.data.id).select()).data.length, 0, 'un annullato non si modifica');
  assert.equal((await ale.client.from('scheduled_messages').delete().eq('id', s.data.id).select()).data.length, 0);
  assert.equal((await phill.client.from('scheduled_messages').delete().eq('id', s.data.id).select()).data.length, 1);
});

test('infrastruttura di invio: solo il server esegue; il messaggio arriva ad Alessia', async () => {
  // un messaggio "scaduto": lo creiamo come server (il client non può programmare nel passato)
  const admin = adminClient();
  const row = await admin.from('scheduled_messages').insert({
    sender_id: phill.id, recipient_id: ale.id, title: 'Programmato', body: 'Arrivato in orario', send_at: new Date(Date.now() - 60_000).toISOString(),
  }).select().single();
  assert.equal(row.error, null, row.error?.message);
  assert.equal((await ale.client.from('messages').select('id').eq('body', 'Arrivato in orario')).data.length, 0, 'non è ancora arrivato');

  for (const who of [ale, phill, stranger]) {
    assert.ok((await who.client.rpc('dispatch_due_scheduled_messages')).error, 'un utente non può far partire l\'invio');
  }
  assert.ok((await anonClient().rpc('dispatch_due_scheduled_messages')).error);

  const run = await admin.rpc('dispatch_due_scheduled_messages');
  assert.equal(run.error, null, run.error?.message);
  assert.ok(run.data >= 1);
  const arrived = await ale.client.from('messages').select('title, body, sender_id').eq('body', 'Arrivato in orario');
  assert.equal(arrived.data.length, 1);
  assert.equal(arrived.data[0].sender_id, phill.id);
  const st = await admin.from('scheduled_messages').select('status, message_id').eq('id', row.data.id).single();
  assert.equal(st.data.status, 'sent');
  assert.ok(st.data.message_id);
  assert.equal((await admin.rpc('dispatch_due_scheduled_messages')).data, 0, 'nessun doppio invio');
  const notif = await ale.client.from('notifications').select('kind, title, body').eq('kind', 'message');
  assert.ok(notif.data.length >= 1);
  assert.ok(notif.data.every((n) => n.body === null), 'le notifiche non contengono il testo');
});

test('dopo la fine del collegamento i programmati non partono più', async () => {
  const a2 = await makeUser('alessia');
  const p2 = await makeUser('phill');
  await link(a2, p2);
  const admin = adminClient();
  const row = (await admin.from('scheduled_messages').insert({ sender_id: p2.id, recipient_id: a2.id, body: 'Non deve partire', send_at: new Date(Date.now() - 60_000).toISOString() }).select().single()).data;
  assert.equal((await p2.client.rpc('end_partnership')).data.ok, true);
  await admin.rpc('dispatch_due_scheduled_messages');
  assert.equal((await a2.client.from('messages').select('id').eq('body', 'Non deve partire')).data.length, 0);
  assert.equal((await admin.from('scheduled_messages').select('status').eq('id', row.id).single()).data.status, 'cancelled');
});

test('archivio: si usano insert e update separati, perché un upsert riscriverebbe colonne non modificabili', async () => {
  const m = (await phill.client.from('messages').insert({ sender_id: phill.id, recipient_id: ale.id, body: 'Da nascondere' }).select().single()).data;
  // un upsert include message_id/recipient_id nell'UPDATE: il database lo rifiuta, ed è giusto
  const up = await ale.client.from('message_receipts').upsert({ message_id: m.id, recipient_id: ale.id, archived_at: new Date().toISOString() }, { onConflict: 'message_id' });
  assert.ok(up.error, 'upsert non accettato');
  // percorso corretto: prima update (nessuna riga), poi insert
  const none = await ale.client.from('message_receipts').update({ archived_at: new Date().toISOString() }).eq('message_id', m.id).select('message_id');
  assert.equal(none.error, null);
  assert.equal(none.data.length, 0);
  const ins = await ale.client.from('message_receipts').insert({ message_id: m.id, recipient_id: ale.id, archived_at: new Date().toISOString() });
  assert.equal(ins.error, null, ins.error?.message);
  const back = await ale.client.from('message_receipts').update({ archived_at: null }).eq('message_id', m.id).select('message_id, archived_at');
  assert.equal(back.error, null);
  assert.equal(back.data.length, 1);
  assert.equal(back.data[0].archived_at, null);
});
