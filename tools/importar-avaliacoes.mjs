// Importa somente campos públicos de avaliações autorizadas do produto exato.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export const productHandle='macaco-hidraulico-eletrico-5-em-1';
function parseCSV(input){
  const rows=[];let row=[],cell='',quoted=false;
  for(let i=0;i<input.length;i++){
    const c=input[i];
    if(c==='"'){if(quoted&&input[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}
    else if(c===','&&!quoted){row.push(cell);cell='';}
    else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&input[i+1]==='\n')i++;row.push(cell);if(row.some(Boolean))rows.push(row);row=[];cell='';}
    else cell+=c;
  }
  if(quoted)throw new Error('CSV com aspas não fechadas.');
  if(cell||row.length){row.push(cell);rows.push(row);}
  const headers=rows.shift()||[];
  if(new Set(headers).size!==headers.length)throw new Error('Cabeçalhos duplicados no CSV.');
  return rows.map(values=>{if(values.length!==headers.length)throw new Error('Quantidade de colunas incorreta no CSV.');return Object.fromEntries(headers.map((h,i)=>[h,values[i]]));});
}
function mediaPath(value){
  if(typeof value!=='string'||!value.startsWith('assets/images/avaliacoes/')||value.includes('..')||value.includes('\\'))throw new Error('Foto deve ser local em assets/images/avaliacoes/.');
  const absolute=path.resolve(root,value);
  if(!absolute.startsWith(path.join(root,'assets/images/avaliacoes')+path.sep)||!fs.existsSync(absolute)||!fs.statSync(absolute).isFile())throw new Error('Foto local não encontrada: '+value);
  return value;
}
export function prepareReviews(input){
  if(input.authorized!==true)throw new Error('Informe authorized: true somente para uma exportação com reutilização autorizada.');
  if(input.source?.productHandle!==productHandle)throw new Error('A exportação deve corresponder ao produto exato.');
  if(!Array.isArray(input.reviews))throw new Error('reviews deve ser um array.');
  const assets={},testimonials=[],seen=new Set();
  for(const [index,review] of input.reviews.entries()){
    const handle=review.productHandle??review.product_handle;
    if(handle!==productHandle)throw new Error('Produto incorreto ou não identificado na avaliação '+(index+1));
    const name=review.name??review.reviewer_name, text=review.text??review.body;
    const rating=Number(review.rating), date=review.date??review.created_at??'';
    if(typeof name!=='string'||!name.trim()||typeof text!=='string'||!text.trim()||!Number.isInteger(rating)||rating<1||rating>5)throw new Error('Nome, texto ou nota inválidos na avaliação '+(index+1));
    if(date&&(!/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(date)||!Number.isFinite(Date.parse(date))||new Date(date.slice(0,10)+'T00:00:00Z').toISOString().slice(0,10)!==date.slice(0,10)))throw new Error('Data inválida na avaliação '+(index+1));
    const sourceReviewId=review.sourceReviewId;
    if(sourceReviewId!==undefined&&(typeof sourceReviewId!=='string'||!sourceReviewId.trim()))throw new Error('Identificador público inválido na avaliação '+(index+1));
    const key=sourceReviewId?'id:'+sourceReviewId:JSON.stringify([name,text,rating,date]);
    if(seen.has(key))throw new Error('Avaliação duplicada: linha '+(index+1));seen.add(key);
    const photos=[];
    const entries=typeof review.photos==='string'?(review.photos?JSON.parse(review.photos):[]):review.photos||[];
    if(!Array.isArray(entries))throw new Error('photos deve ser um array de objetos locais.');
    for(const [photoIndex,photo] of entries.entries()){
      if(!photo||!Number.isInteger(photo.width)||!Number.isInteger(photo.height)||photo.width<=0||photo.height<=0)throw new Error('Foto sem dimensões válidas.');
      const id='REVIEW-'+(index+1)+'-'+(photoIndex+1),file=mediaPath(photo.path);
      assets[id]={path:file,originalPath:file,width:photo.width,height:photo.height,alt:'Foto anexada à avaliação de '+name,approved:true,active:true,needsReplacement:false,reviewSource:'importacao-autorizada'};
      if(photo.versions){
        if(!Array.isArray(photo.versions)||!photo.versions.length)throw new Error('Versões da foto devem ser um array não vazio.');
        assets[id].versions=photo.versions.map(version=>{
          if(!Number.isInteger(version.width)||!Number.isInteger(version.height)||version.width<=0||version.height<=0)throw new Error('Miniatura sem dimensões válidas.');
          return {path:mediaPath(version.path),width:version.width,height:version.height};
        });
      }else if(photo.thumbnail){const thumb=mediaPath(photo.thumbnail);assets[id].versions=[{path:thumb,width:photo.thumbnailWidth||160,height:photo.thumbnailHeight||Math.round(photo.height*160/photo.width)}];}
      photos.push(id);
    }
    const verified=review.verified===true||review.verified_purchase===true||review.verified_purchase==='true';
    const evidence=typeof review.verificationEvidence==='string'?review.verificationEvidence:typeof review.verification_evidence==='string'?review.verification_evidence:'';
    testimonials.push({...(sourceReviewId?{sourceReviewId}:{}),name,rating,text,...(date?{date}:{}),photos,verified:verified&&!!evidence,...(verified&&evidence?{verificationEvidence:evidence}:{}),...(typeof review.response==='string'&&review.response?{response:review.response}:{})});
  }
  return {assets,authorized:true,source:{productHandle,...(typeof input.source.app==='string'?{app:input.source.app}:{}),...(typeof input.source.productId==='string'?{productId:input.source.productId}:{})},verificationLabel:'Compra verificada',testimonials,photos:testimonials.flatMap(r=>r.photos),count:testimonials.length,rating:testimonials.length?testimonials.reduce((sum,r)=>sum+r.rating,0)/testimonials.length:null,distribution:[5,4,3,2,1].map(value=>testimonials.filter(r=>r.rating===value).length)};
}
export function readExport(filename,{authorized=false}={}){
  const data=fs.readFileSync(filename,'utf8').replace(/^\uFEFF/,'');
  return filename.toLowerCase().endsWith('.csv')?{authorized,source:{productHandle},reviews:parseCSV(data)}:JSON.parse(data);
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const filename=process.argv[2];if(!filename)throw new Error('Uso: node tools/importar-avaliacoes.mjs arquivo.json|arquivo.csv [--authorized] [--dry-run]');
  const prepared=prepareReviews(readExport(filename,{authorized:process.argv.includes('--authorized')}));
  if(process.argv.includes('--dry-run'))console.log('Exportação válida: '+prepared.count+' avaliações e '+prepared.photos.length+' fotos. Nenhum arquivo alterado.');
  else{
    const context={window:{}};vm.runInNewContext(fs.readFileSync(path.join(root,'js/vonnix-config.js'),'utf8'),context);
    const C=context.window.VONNIX_CONFIG;
    for(const [id,item] of Object.entries(C.assets))if(item.reviewSource)delete C.assets[id];
    Object.assign(C.assets,prepared.assets);delete prepared.assets;
    if(prepared.count){C.product.ratingSummary={...C.product.ratingSummary,rating:Number(prepared.rating.toFixed(1)),count:prepared.count,source:'Calculado das avaliações deste produto.',soldSource:C.product.ratingSummary?.soldSource||'Informado pelo proprietário.'};delete C.product.ratingSummary.sourceUrl;}
    fs.writeFileSync(path.join(root,'js/vonnix-config.js'),'/* Configuração VONNIX; checkout vazio bloqueia compras. */\nwindow.VONNIX_CONFIG = '+JSON.stringify(C,null,2)+';\n');
    fs.writeFileSync(path.join(root,'js/vonnix-avaliacoes.js'),'/* Exportação pública autorizada do produto exato. Sem contatos ou dados privados. */\nwindow.VONNIX_REVIEWS = '+JSON.stringify(prepared,null,2)+';\n');
    console.log('Importadas '+prepared.count+' avaliações e '+prepared.photos.length+' fotos, na ordem da exportação.');
  }
}
