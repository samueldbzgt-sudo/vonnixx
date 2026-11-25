import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTrackingHandler } from './tracking-store.mjs';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.woff': 'font/woff' };

export function createLocalServer({ qa = false, trackingDataFile } = {}) {
  const tracking=createTrackingHandler({dataFile:trackingDataFile});
  return http.createServer(async(req, res) => {
    if(await tracking(req,res))return;
    let pathname;
    try { pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); }
    catch { res.writeHead(400).end(); return; }
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405).end(); return; }
    if(pathname==='/rastreio/'){res.writeHead(308,{Location:'/rastreio'+new URL(req.url,'http://localhost').search}).end();return;}
    if(pathname==='/rastreio')pathname='/rastreio.html';
    if (qa && pathname === '/_qa/original.html') pathname = '/.rebranding/original.html';
    else if (pathname.split('/').some(part => part.startsWith('.')) || pathname.startsWith('/tools/')) { res.writeHead(404).end(); return; }
    if (pathname === '/') pathname = '/index.html';
    const filename = path.resolve(root, '.' + pathname);
    if (!filename.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
    fs.stat(filename, (error, stat) => {
      if (error || !stat.isFile()) { res.writeHead(404).end('Arquivo não encontrado'); return; }
      res.writeHead(200, { 'Content-Type': types[path.extname(filename)] || 'application/octet-stream', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
      if (req.method === 'HEAD') res.end(); else fs.createReadStream(filename).pipe(res);
    });
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const server = createLocalServer();
  server.listen(4173, '127.0.0.1', () => console.log('VONNIX: http://127.0.0.1:4173'));
}
