// Trasporto verso la Cloud Function che fa da proxy a Fatture in Cloud.
//
// Le API FIC non espongono header CORS, quindi il browser non può chiamarle
// direttamente: ogni operazione passa dalla callable `fattureincloud`, che
// custodisce il token. Questo è l'unico file che sa dove vive il proxy —
// cambiare host domani significa riscrivere solo qui.

import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions';
import { FirebaseError } from 'firebase/app';
import { firebaseApp } from '@/lib/firebase';
import type {
  FicCompany,
  FicCreatedDocument,
  FicEntity,
  FicIssuedDocument,
  FicPaymentMethod,
  FicVatType,
} from '@/lib/fattureincloud';

const functions = getFunctions(firebaseApp, 'europe-west1');

if (import.meta.env.DEV && import.meta.env.VITE_FUNCTIONS_EMULATOR === 'true') {
  connectFunctionsEmulator(functions, '127.0.0.1', 5001);
}

type FicOp =
  | { op: 'companies'; token?: string }
  | { op: 'entities'; companyId: number }
  | { op: 'vatTypes'; companyId: number }
  | { op: 'paymentMethods'; companyId: number }
  | { op: 'createInvoice'; companyId: number; document: FicIssuedDocument };

const call = httpsCallable<FicOp, unknown>(functions, 'fattureincloud');

async function run<T>(payload: FicOp): Promise<T> {
  const res = await call(payload);
  return res.data as T;
}

/** `token` serve solo a validare un token appena incollato, prima di
 *  salvarlo: senza, una verifica fallita sovrascriverebbe quello buono. */
export function ficCompanies(token?: string): Promise<FicCompany[]> {
  return run<FicCompany[]>({ op: 'companies', token });
}

export function ficEntities(companyId: number): Promise<FicEntity[]> {
  return run<FicEntity[]>({ op: 'entities', companyId });
}

export function ficVatTypes(companyId: number): Promise<FicVatType[]> {
  return run<FicVatType[]>({ op: 'vatTypes', companyId });
}

export function ficPaymentMethods(companyId: number): Promise<FicPaymentMethod[]> {
  return run<FicPaymentMethod[]>({ op: 'paymentMethods', companyId });
}

export function ficCreateInvoice(
  companyId: number,
  document: FicIssuedDocument,
): Promise<FicCreatedDocument> {
  return run<FicCreatedDocument>({ op: 'createInvoice', companyId, document });
}

interface ValidationDetails {
  validationResult?: Record<string, string[] | string> | null;
}

// Fratello di `extractErrorMessage` per gli errori che arrivano dalla
// callable: i codici sono quelli di Firebase Functions, i messaggi vanno
// resi in italiano e — sui 422 di FIC — arricchiti coi campi rifiutati.
export function ficErrorMessage(err: unknown): string {
  if (!(err instanceof FirebaseError)) {
    return err instanceof Error ? err.message : String(err);
  }
  const code = err.code.replace(/^functions\//, '');
  switch (code) {
    case 'unauthenticated':
      return 'Sessione scaduta: rientra e riprova.';
    case 'permission-denied':
      return err.message || 'Token non valido o permessi insufficienti.';
    case 'failed-precondition':
      return 'Integrazione Fatture in Cloud non configurata.';
    case 'invalid-argument': {
      // `details` esiste su FunctionsError, che è un'interfaccia: a runtime
      // resta un FirebaseError, quindi la si legge con un cast.
      const details = (err as { details?: unknown }).details as ValidationDetails | undefined;
      const fields = validationFields(details);
      return fields ? `${err.message} (${fields})` : err.message;
    }
    case 'resource-exhausted':
      return 'Troppe richieste a Fatture in Cloud: riprova tra poco.';
    case 'deadline-exceeded':
    case 'unavailable':
      return 'Fatture in Cloud non risponde. Verifica sul loro sito prima di riprovare.';
    default:
      return err.message;
  }
}

function validationFields(details: ValidationDetails | undefined): string {
  const result = details?.validationResult;
  if (!result || typeof result !== 'object') return '';
  return Object.keys(result).join(', ');
}
