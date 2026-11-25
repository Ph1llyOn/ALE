// Copia la libreria dei pensieri del mattino (frontend) nella cartella condivisa delle Edge Functions.
import { copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
copyFileSync(join(root, 'js/data/motivation.js'), join(root, 'supabase/functions/_shared/motivation.js'));
console.log('motivation.js sincronizzato con supabase/functions/_shared/');
