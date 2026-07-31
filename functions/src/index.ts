// Proxy autenticato verso le API Fatture in Cloud v2.
//
// Perché esiste: `api-v2.fattureincloud.it` non risponde con header CORS
// (preflight 204 senza Access-Control-Allow-Origin), quindi il browser non
// può chiamarlo. Questa è l'unica funzione server-side del progetto.
//
// Non è un proxy generico su path arbitrari: le operazioni ammesse sono
// un'unione discriminata chiusa. Il token FIC (che non scade mai) sta in
// `integrationSecrets/{uid}`, illeggibile dal client per regole — qui lo si
// legge con l'Admin SDK, che le regole non le applica.

// ⚠️ Importare SOLO da sottopercorsi stretti, mai da 'firebase-functions/v2':
// quel barrel carica tutti i provider, database compreso, che a catena
// pretende '@firebase/app' — una peer dependency che nel container di
// produzione non c'è. In locale il modulo si carica lo stesso (la peer è
// presente) e il container muore all'avvio con "Cannot find module
// '@firebase/app'". Stessa ragione per cui le opzioni stanno su `onCall`
// invece che in un `setGlobalOptions`.
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import * as logger from 'firebase-functions/logger';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// europe-west1: Firestore è in eur3, tenere la funzione vicina evita un
// giro transatlantico su ogni lettura del token.
const OPTIONS = { region: 'europe-west1', maxInstances: 3 } as const;

initializeApp();

const BASE = 'https://api-v2.fattureincloud.it';
const TIMEOUT_MS = 20_000;

// Anche in firestore.rules e in src/lib/config.ts — tenere i tre allineati.
const ADMIN_EMAIL = 'gepisolo@gmail.com';

// `integrationId` individua il connettore: i token stanno tutti nello stesso
// documento, un campo ciascuno, chiamato `<integrationId>Token`.
type FicOp =
  | { op: 'companies'; integrationId?: string; token?: string }
  | { op: 'entities'; integrationId: string; companyId: number }
  | { op: 'vatTypes'; integrationId: string; companyId: number }
  | { op: 'paymentMethods'; integrationId: string; companyId: number }
  | { op: 'createInvoice'; integrationId: string; companyId: number; document: unknown };

// Rispecchia `isAllowed()` di firestore.rules: admin, oppure invito presente
// in allowedUsers con email verificata.
async function assertAllowed(email: string | undefined, emailVerified: boolean): Promise<void> {
  if (!email) {
    throw new HttpsError('permission-denied', 'Account senza email.');
  }
  if (email === ADMIN_EMAIL) return;
  if (!emailVerified) {
    throw new HttpsError('permission-denied', 'Email non verificata.');
  }
  const snap = await getFirestore().doc(`allowedUsers/${email}`).get();
  if (!snap.exists) {
    throw new HttpsError('permission-denied', 'Account non autorizzato.');
  }
}

async function readToken(uid: string, integrationId: string): Promise<string> {
  const snap = await getFirestore().doc(`integrationSecrets/${uid}`).get();
  const token = snap.get(`${integrationId}Token`);
  if (typeof token !== 'string' || !token) {
    throw new HttpsError('failed-precondition', 'Token Fatture in Cloud non configurato.');
  }
  return token;
}

// Un solo punto di contatto con FIC: qui vive la mappatura degli status sui
// codici HttpsError e, sotto, lo sbustamento delle risposte.
async function ficFetch(path: string, token: string, init?: RequestInit): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...init?.headers,
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    const timedOut = err instanceof Error && err.name === 'TimeoutError';
    throw new HttpsError(
      timedOut ? 'deadline-exceeded' : 'unavailable',
      'Fatture in Cloud non risponde.',
    );
  }

  const text = await res.text();
  let body: Record<string, unknown> = {};
  try {
    body = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    // Una risposta non-JSON è sempre un errore lato loro: il messaggio
    // grezzo non va all'utente, resta nel log.
    logger.warn('fic non-json response', { status: res.status });
  }

  if (res.ok) return body;

  const error = (body.error ?? {}) as { message?: string; validation_result?: unknown };
  const message = error.message || `Errore Fatture in Cloud (HTTP ${res.status}).`;
  switch (res.status) {
    case 401:
      throw new HttpsError('permission-denied', 'Token Fatture in Cloud non valido.');
    case 403:
      throw new HttpsError('permission-denied', 'Permessi (scope) insufficienti sul token.');
    case 404:
      throw new HttpsError('not-found', message);
    case 422:
      throw new HttpsError('invalid-argument', message, {
        validationResult: error.validation_result ?? null,
      });
    case 429:
      throw new HttpsError('resource-exhausted', 'Troppe richieste a Fatture in Cloud.');
    default:
      throw new HttpsError('internal', message);
  }
}

// FIC annida diversamente a seconda dell'endpoint: `/user/companies` mette
// l'array sotto `data.companies`, gli altri direttamente sotto `data`.
function unwrap(body: unknown): unknown {
  return (body as { data?: unknown })?.data ?? null;
}

function unwrapCompanies(body: unknown): unknown {
  const data = unwrap(body);
  if (Array.isArray(data)) return data;
  const companies = (data as { companies?: unknown })?.companies;
  return Array.isArray(companies) ? companies : [];
}

// Le anagrafiche sono paginate. Il tetto di 5 pagine (500 clienti) è una
// rete di sicurezza, non un limite atteso.
async function listEntities(companyId: number, token: string): Promise<unknown[]> {
  const out: unknown[] = [];
  for (let page = 1; page <= 5; page++) {
    const body = (await ficFetch(
      `/c/${companyId}/entities/clients?per_page=100&page=${page}`,
      token,
    )) as { data?: unknown[]; last_page?: number };
    out.push(...(body.data ?? []));
    if (!body.last_page || page >= body.last_page) break;
  }
  return out;
}

export const fattureincloud = onCall<FicOp>(OPTIONS, async (request) => {
  const auth = request.auth;
  if (!auth) {
    throw new HttpsError('unauthenticated', 'Accesso richiesto.');
  }
  await assertAllowed(auth.token.email, auth.token.email_verified === true);

  const data = request.data;
  // Il token inline serve solo a validare un token appena incollato, prima
  // di salvarlo: senza questa deroga una verifica fallita sovrascriverebbe
  // il token buono già configurato, e su un connettore nuovo non ce n'è
  // ancora nessuno da leggere.
  let token: string;
  if (data.op === 'companies' && data.token) {
    token = data.token;
  } else {
    if (!data.integrationId) {
      throw new HttpsError('invalid-argument', 'Connettore non indicato.');
    }
    token = await readToken(auth.uid, data.integrationId);
  }

  logger.info('fic request', { op: data.op, uid: auth.uid });

  switch (data.op) {
    case 'companies':
      return unwrapCompanies(await ficFetch('/user/companies', token));
    case 'entities':
      return listEntities(data.companyId, token);
    case 'vatTypes':
      return unwrap(await ficFetch(`/c/${data.companyId}/info/vat_types`, token));
    case 'paymentMethods':
      return unwrap(await ficFetch(`/c/${data.companyId}/info/payment_methods`, token));
    case 'createInvoice':
      return unwrap(
        await ficFetch(`/c/${data.companyId}/issued_documents`, token, {
          method: 'POST',
          body: JSON.stringify({ data: data.document }),
        }),
      );
    default:
      throw new HttpsError('invalid-argument', 'Operazione non supportata.');
  }
});
