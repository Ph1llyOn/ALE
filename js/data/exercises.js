// Catalogo degli esercizi per il frontend: la parte pura sta in exercises-core.js (condivisa con il server).
import { resolve } from '../config.js';
import { exerciseById } from './exercises-core.js';

export * from './exercises-core.js';
export const exerciseImage = (id) => (exerciseById(id) ? resolve(`assets/exercises/${id}.svg`) : null);
