// Copia la libreria dei pensieri del mattino (frontend) nella cartella condivisa delle Edge Functions.
import { copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
for (const f of ['motivation.js', 'exercises-core.js', 'exercise-catalog.js', 'planner-core.js']) copyFileSync(join(root, 'js/data', f), join(root, 'supabase/functions/_shared', f));
console.log('motivation.js ed exercises-core.js sincronizzati con supabase/functions/_shared/');
