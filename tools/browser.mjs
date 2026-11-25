import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { root } from './local-server.mjs';

class CDP {
  constructor(socket) {
    this.socket = socket; this.nextId = 0; this.pending = new Map(); this.handlers = new Map();
    socket.addEventListener('message', event => {
      const data = JSON.parse(event.data);
      if (data.id) { const p = this.pending.get(data.id); if (!p) return; clearTimeout(p.timer); this.pending.delete(data.id); data.error ? p.reject(new Error(data.error.message)) : p.resolve(data.result); }
      else for (const handler of this.handlers.get(data.method) || []) handler(data.params);
    });
  }
  on(method, handler) { this.handlers.set(method, [...(this.handlers.get(method) || []), handler]); }
  send(method, params = {}) { return new Promise((resolve, reject) => { const id = ++this.nextId; const timer=setTimeout(()=>{this.pending.delete(id);reject(new Error('CDP timeout: '+method));},20000); this.pending.set(id, { resolve, reject, timer }); this.socket.send(JSON.stringify({ id, method, params })); }); }
  async evaluate(expression) { const result = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (result.exceptionDetails) throw new Error(result.exceptionDetails.text + ': ' + (result.exceptionDetails.exception?.description || '')); return result.result.value; }
  async screenshot(filename, full = false) { const params = { format: 'png', captureBeyondViewport: full }; if (full) { const { cssContentSize } = await this.send('Page.getLayoutMetrics'); params.clip = { x: 0, y: 0, width: cssContentSize.width, height: cssContentSize.height, scale: 1 }; } const result = await this.send('Page.captureScreenshot', params); fs.writeFileSync(filename, Buffer.from(result.data, 'base64')); }
  close() { this.socket.close(); }
}
async function connect(url) { const socket = new WebSocket(url); await new Promise((resolve, reject) => { const timer=setTimeout(()=>{socket.close();reject(new Error('Timeout de conexão CDP'));},10000); socket.addEventListener('open', ()=>{clearTimeout(timer);resolve();}, { once: true }); socket.addEventListener('error', event=>{clearTimeout(timer);reject(new Error('Conexão CDP: '+(event.message||'falhou')));}, { once: true }); }); return new CDP(socket); }
export async function openBrowser() {
  const executable = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(p => fs.existsSync(p));
  if (!executable) throw new Error('Navegador Chromium local não encontrado.');
  const profile = path.join(root, '.rebranding', 'browser-profile-' + Date.now());
  const process = spawn(executable, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-background-networking', '--disable-component-update', '--disable-sync', '--disable-extensions', '--metrics-recording-only', '--password-store=basic', '--remote-debugging-port=0', '--remote-debugging-address=127.0.0.1', '--user-data-dir=' + profile, 'about:blank'], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  const endpoint = await new Promise((resolve, reject) => { let output = ''; const timer = setTimeout(() => reject(new Error('Timeout ao iniciar Chromium')), 20000); process.stderr.on('data', chunk => { output += chunk; const match = output.match(/DevTools listening on (ws:\/\/[^\s]+)/); if (match) { clearTimeout(timer); resolve(match[1]); } }); process.on('error', reject); process.on('exit', code => { clearTimeout(timer); reject(new Error('Chromium encerrou: ' + code)); }); });
  const browser = await connect(endpoint);
  console.log('Chromium local iniciado.');
  const { targetId } = await browser.send('Target.createTarget', { url: 'about:blank' });
  const targets = await (await fetch('http://' + new URL(endpoint).host + '/json/list')).json();
  const page = await connect(targets.find(t => t.id === targetId).webSocketDebuggerUrl);
  await page.send('Page.enable'); await page.send('Runtime.enable'); await page.send('Network.enable');
  await page.send('Network.setCacheDisabled', { cacheDisabled: true });
  await page.send('Fetch.enable', { patterns: [{ urlPattern: '*', requestStage: 'Request' }] });
  page.on('Fetch.requestPaused', data => { const url = new URL(data.request.url); const local = ['127.0.0.1', 'localhost'].includes(url.hostname) || ['data:', 'about:'].includes(url.protocol); page.send(local ? 'Fetch.continueRequest' : 'Fetch.failRequest', local ? { requestId: data.requestId } : { requestId: data.requestId, errorReason: 'BlockedByClient' }).catch(() => {}); });
  return { page, async close() { page.close(); try { await browser.send('Browser.close'); } catch {} browser.close(); process.kill(); } };
}
