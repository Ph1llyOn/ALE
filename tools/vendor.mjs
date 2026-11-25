// Copia il bundle UMD di supabase-js (versione bloccata da package-lock.json) in js/vendor/.
// Il frontend non dipende da CDN: il file è servito dallo stesso sito e messo in cache dal service worker.
import { copyFileSync, readFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(join(root, 'node_modules/@supabase/supabase-js/package.json'), 'utf8'));
mkdirSync(join(root, 'js/vendor'), { recursive: true });
copyFileSync(join(root, 'node_modules/@supabase/supabase-js/dist/umd/supabase.js'), join(root, 'js/vendor/supabase.umd.js'));
console.log(`Copiato supabase-js ${pkg.version} (licenza ${pkg.license}) in js/vendor/supabase.umd.js`);
