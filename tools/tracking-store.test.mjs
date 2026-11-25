import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createLocalServer,root } from './local-server.mjs';
import { normalizeTrackingRecords } from './tracking-store.mjs';

// Registros exclusivos de teste, em pasta interna bloqueada pelo servidor.
const fixtures=[
 {tracking_code:'QA000000001BR',email:'cliente-qa@example.invalid',current_status:'em_transito',current_status_label:'Em trânsito',created_at:'2026-11-01T12:00:00-03:00',updated_at:'2026-11-02T12:00:00-03:00',milestones:[{short:'Confirmado',completed:true},{short:'Em trânsito',isCurrent:true}],timeline:[{label:'Objeto em trânsito',status:'em_transito',timestamp:'2026-11-02T12:00:00-03:00',isCurrent:true}],customer_name:'Dado interno que não pode aparecer',pix:{qr_code:'não exibir'}},
 {tracking_code:'QA000000002BR',email:'cliente-qa@example.invalid',current_status:'entregue',current_status_label:'Entregue',milestones:[],timeline:[]},
 {tracking_code:'QA000000003BR',email:'outro-qa@example.invalid',current_status:'postado',timeline:[]}
];
async function withServer(run,{data=fixtures,missing=false,raw}={}){
 const directory=await fs.mkdtemp(path.join(root,'.rebranding','api-rastreio-'));
 const file=path.join(directory,'pedidos-teste.json');
 if(!missing)await fs.writeFile(file,raw??JSON.stringify(data));
 const server=createLocalServer({trackingDataFile:file});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const origin='http://127.0.0.1:'+server.address().port;
 try{await run(origin);}finally{await new Promise(resolve=>server.close(resolve));}
}

test('consulta por código retorna somente dados da entrega',()=>withServer(async origin=>{
 const response=await fetch(origin+'/api/rastreio/qa000000001br');const data=await response.json();
 assert.equal(response.status,200);assert.equal(data.current_status,'em_transito');assert.equal(data.timeline[0].label,'Objeto em trânsito');
 for(const field of ['email','customer_name','pix'])assert.equal(data[field],undefined);
 assert.match(response.headers.get('cache-control'),/no-store/);
}));
test('busca por e-mail usa POST e retorna somente os pedidos correspondentes',()=>withServer(async origin=>{
 const response=await fetch(origin+'/api/rastreio/by-email',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:' CLIENTE-QA@EXAMPLE.INVALID '})});
 const data=await response.json();assert.equal(response.status,200);assert.equal(data.orders.length,2);
 assert.deepEqual(data.orders.map(item=>item.tracking_code),['QA000000001BR','QA000000002BR']);
 assert.equal(JSON.stringify(data).includes('cliente-qa@example.invalid'),false);
 assert.equal((await fetch(origin+'/api/rastreio/by-email?email=cliente-qa@example.invalid')).status,405);
}));
test('base vazia ou código desconhecido retorna ausência real',()=>withServer(async origin=>{
 assert.equal((await fetch(origin+'/api/rastreio/QA000000001BR')).status,404);
},{missing:true}));
test('entrada inválida e JSON inválido são rejeitados',()=>withServer(async origin=>{
 assert.equal((await fetch(origin+'/api/rastreio/x')).status,400);
 for(const body of ['null','{','{"email":"email-invalido"}']){
  const response=await fetch(origin+'/api/rastreio/by-email',{method:'POST',headers:{'Content-Type':'application/json'},body});assert.equal(response.status,400);
 }
}));
test('origem externa não pode enviar consulta por e-mail',()=>withServer(async origin=>{
 const response=await fetch(origin+'/api/rastreio/by-email',{method:'POST',headers:{Origin:'https://outro-site.example','Content-Type':'application/json'},body:JSON.stringify({email:'cliente-qa@example.invalid'})});assert.equal(response.status,403);
}));
test('base privada e arquivos internos não são servidos como arquivos públicos',()=>withServer(async origin=>{
 for(const url of ['/.data/rastreios.json','/.rebranding/antes.json','/tools/tracking-store.mjs'])assert.equal((await fetch(origin+url)).status,404);
 assert.equal((await fetch(origin+'/rastreio')).status,200);
 const trailing=await fetch(origin+'/rastreio/',{redirect:'manual'});assert.equal(trailing.status,308);assert.equal(trailing.headers.get('location'),'/rastreio');
}));
test('erro da base é informado como indisponibilidade, sem expor detalhes',()=>withServer(async origin=>{
 const response=await fetch(origin+'/api/rastreio/QA000000001BR');assert.equal(response.status,503);const body=await response.text();assert.equal(body.includes('pedidos-teste'),false);
},{raw:'JSON inválido'}));
test('limite de consultas retorna 429 e Retry-After',()=>withServer(async origin=>{
 for(let i=0;i<20;i++)assert.equal((await fetch(origin+'/api/rastreio/QA000000001BR')).status,200);
 const response=await fetch(origin+'/api/rastreio/QA000000001BR');assert.equal(response.status,429);assert.ok(Number(response.headers.get('retry-after'))>0);
}));
test('importação valida dados e rejeita códigos repetidos',()=>{
 assert.equal(normalizeTrackingRecords(fixtures).length,3);
 assert.throws(()=>normalizeTrackingRecords([fixtures[0],fixtures[0]]),/repetidos/);
 assert.throws(()=>normalizeTrackingRecords([{tracking_code:'inválido',current_status:'entregue'}]),/inválido/);
 assert.throws(()=>normalizeTrackingRecords([{tracking_code:'QA000000001BR'}]),/current_status/);
});
