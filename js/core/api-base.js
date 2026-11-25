import { dataMessage } from './errors.js';

export class AppError extends Error {
  constructor(message, cause) { super(message); this.name = 'AppError'; this.cause = cause; }
}

/** Trasforma un errore tecnico di Supabase in un AppError con messaggio in italiano. */
export const fail = (error) => { throw new AppError(dataMessage(error), error); };
