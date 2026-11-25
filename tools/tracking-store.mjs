import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export const defaultTrackingFile=path.join(root,'.data','rastreios.json');
const codePattern=/^[A-Z0-9][A-Z0-9-]{5,63}$/;
const emailPattern=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const cleanText=(value,limit=300)=>typeof value==='string'?value.trim().slice(0,limit):'';
export const normalizeCode=value=>cleanText(value,64).replace(/\s+/g,'').toUpperCase();
export const validCode=value=>codePattern.test(value);
export const normalizeEmail=value=>cleanText(value,254).toLowerCase();
export const validEmail=value=>emailPattern.test(value)&&value.length<=254;
const date=value=>typeof value==='string'&&Number.isFinite(Date.parse(value))?value:null;

export function normalizeTrackingRecord(input){
  if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Cada rastreio deve ser um objeto.');
  const code=normalizeCode(input.tracking_code);
  if(!validCode(code))throw Error('Código de rastreio inválido. Use de 6 a 64 letras, números ou hífens.');
  const email=normalizeEmail(input.email);
  if(email&&!validEmail(email))throw Error('E-mail do pedido inválido.');
  const status=cleanText(input.current_status,80);
  if(!status)throw Error('Informe current_status com o estado real da entrega.');
  if(input.milestones!==undefined&&!Array.isArray(input.milestones))throw Error('milestones deve ser uma lista.');
  if(input.timeline!==undefined&&!Array.isArray(input.timeline))throw Error('timeline deve ser uma lista.');
  const milestones=(input.milestones||[]).slice(0,12).map(item=>({short:cleanText(item.short||item.label,60),completed:item.completed===true,isCurrent:item.isCurrent===true})).filter(item=>item.short);
  const timeline=(input.timeline||[]).slice(0,100).map(item=>({label:cleanText(item.label||item.status,300),status:cleanText(item.status,80),timestamp:date(item.timestamp),isCurrent:item.isCurrent===true})).filter(item=>item.label);
  return {tracking_code:code,email,current_status:status,current_status_label:cleanText(input.current_status_label,160)||status.replaceAll('_',' '),created_at:date(input.created_at),updated_at:date(input.updated_at),next_attempt_date:date(input.next_attempt_date),milestones,timeline};
}

export function normalizeTrackingRecords(value){
  const records=Array.isArray(value)?value:value?.orders;
  if(!Array.isArray(records))throw Error('O arquivo deve conter uma lista de rastreios ou um objeto com orders.');
  if(records.length>50000)throw Error('O arquivo excede o limite de 50 mil rastreios.');
  const result=records.map(normalizeTrackingRecord);
  if(new Set(result.map(item=>item.tracking_code)).size!==result.length)throw Error('Há códigos de rastreio repetidos no arquivo.');
  return result;
}

export async function readTrackingRecords(file=defaultTrackingFile){
  try{return normalizeTrackingRecords(JSON.parse(await fs.readFile(file,'utf8')));}
  catch(error){if(error.code==='ENOENT')return [];throw error;}
}

export function publicTrackingRecord(record){
  const {email,created_at,...visible}=record;
  return visible;
}

const response=(res,status,payload,headers={})=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store, private','X-Content-Type-Options':'nosniff',...headers});res.end(JSON.stringify(payload));};
async function readJson(req){
  let body='';
  req.setEncoding('utf8');
  for await(const chunk of req){body+=chunk;if(Buffer.byteLength(body)>2048){const error=Error('Requisição muito grande.');error.status=413;throw error;}}
  try{return JSON.parse(body);}catch{const error=Error('Envie um JSON válido.');error.status=400;throw error;}
}

export function createTrackingHandler({dataFile=defaultTrackingFile}={}){
  const attempts=new Map();
  return async(req,res)=>{
    let url;try{url=new URL(req.url,'http://localhost');}catch{return false;}
    if(url.pathname!=='/api/rastreio'&&!url.pathname.startsWith('/api/rastreio/'))return false;
    const emailRoute=url.pathname==='/api/rastreio/by-email';
    if((emailRoute&&req.method!=='POST')||(!emailRoute&&req.method!=='GET')){response(res,405,{error:'Método não permitido.'},{Allow:emailRoute?'POST':'GET'});return true;}
    if(emailRoute){
      const origin=req.headers.origin;
      if(origin){let host;try{host=new URL(origin).host;}catch{}if(host!==req.headers.host){response(res,403,{error:'Consulta indisponível para esta origem.'});return true;}}
      if(!(req.headers['content-type']||'').toLowerCase().startsWith('application/json')){response(res,415,{error:'Envie a consulta como JSON.'});return true;}
    }
    const now=Date.now(),key=req.socket.remoteAddress||'local';
    for(const [address,bucket] of attempts)if(now-bucket.start>=60000)attempts.delete(address);
    const bucket=attempts.get(key)||{start:now,count:0};
    if(bucket.count>=20){response(res,429,{error:'Muitas consultas seguidas. Aguarde um instante.'},{'Retry-After':String(Math.ceil((60000-(now-bucket.start))/1000))});return true;}
    bucket.count++;attempts.set(key,bucket);
    try{
      if(emailRoute){
        const body=await readJson(req);
        if(!body||typeof body!=='object'||Array.isArray(body)){response(res,400,{error:'Envie um objeto com o e-mail do pedido.'});return true;}
        const email=normalizeEmail(body.email);
        if(!validEmail(email)){response(res,400,{error:'Informe um e-mail válido.'});return true;}
        const orders=(await readTrackingRecords(dataFile)).filter(item=>item.email===email).map(item=>({tracking_code:item.tracking_code,status_label:item.current_status_label,created_at:item.created_at}));
        response(res,orders.length?200:404,{orders});return true;
      }
      const encoded=url.pathname.slice('/api/rastreio/'.length);
      let code;try{code=normalizeCode(decodeURIComponent(encoded));}catch{}
      if(!code||!validCode(code)){response(res,400,{error:'Informe um código de rastreio válido.'});return true;}
      const record=(await readTrackingRecords(dataFile)).find(item=>item.tracking_code===code);
      response(res,record?200:404,record?publicTrackingRecord(record):{error:'Código não encontrado.'});return true;
    }catch(error){response(res,error.status||503,{error:error.status?error.message:'Não foi possível consultar o rastreio agora.'});return true;}
  };
}
