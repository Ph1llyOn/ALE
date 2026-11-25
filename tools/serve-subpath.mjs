// Server statico che serve il progetto sotto un sottopercorso (default /ALE/),
// come GitHub Pages. Fuori dal sottopercorso risponde 404.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(import.meta.url), '..', '..');
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.webmanifest': 'application/manifest+json', '.json': 'application/json',
  '.png': 'image/png', '.svg': 'image/svg+xml',
};

export function startServer({ port = 8080, base = '/ALE/' } = {}) {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    const notFound = async () => {
      res.writeHead(404, { 'content-type': 'text/html; charset=utf-8' });
      try { res.end(await readFile(join(ROOT, '404.html'))); } catch { res.end('404'); }
    };
    if (!url.pathname.startsWith(base)) return notFound();
    let rel = decodeURIComponent(url.pathname.slice(base.length)) || 'index.html';
    if (rel.endsWith('/')) rel += 'index.html';
    const file = normalize(join(ROOT, rel));
    if (!file.startsWith(ROOT + sep)) return notFound();
    const relNorm = file.slice(ROOT.length + 1).split(sep);
    if (relNorm[0].startsWith('.') && relNorm[0] !== '.nojekyll') return notFound(); // no dotfiles
    if (['node_modules', 'supabase', 'tests', 'tools', 'docs'].includes(relNorm[0])) return notFound();
    try {
      if (!(await stat(file)).isFile()) return notFound();
      res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache' });
      res.end(await readFile(file));
    } catch { return notFound(); }
  });
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve(server)));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 8080);
  await startServer({ port });
  console.log(`ALE. su http://localhost:${port}/ALE/`);
}
