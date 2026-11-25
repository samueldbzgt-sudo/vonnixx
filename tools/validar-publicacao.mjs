import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const context={window:{}};
vm.runInNewContext(fs.readFileSync(path.join(root,'js/vonnix-config.js'),'utf8'),context,{timeout:1000});
const C=context.window.VONNIX_CONFIG;
export function validatePublication(config=C) {
  const issues=[];
  const https=value=>{try{const u=new URL(value);return u.protocol==='https:'&&!u.port&&!u.username&&!u.password?u:null;}catch{return null;}};
  const official=value=>{const u=https(value);return !!u&&[new URL(config.brand.domain).hostname,'www.'+new URL(config.brand.domain).hostname].includes(u.hostname);};
  for(const [key,label] of Object.entries({commercialApproved:'Validar preços, descontos, parcelamentos e meios de pagamento',policiesApproved:'Confirmar políticas oficiais',productSpecsApproved:'Confirmar especificações com o fornecedor',assetRightsApproved:'Confirmar autorização dos recursos reutilizados',businessIdentityApproved:'Confirmar os dados empresariais obrigatórios com o proprietário'}))if(config.publication[key]!==true)issues.push(label);
  if(!https(config.publication.canonicalUrl))issues.push('Definir a URL definitiva do funil em publication.canonicalUrl');
  if(!config.business?.legalName||!config.business?.cnpj||!config.business?.address)issues.push('Preencher somente dados empresariais confirmados em business');
  for(const kit of config.offers.items){const u=https(config.checkout.urls[kit.key]);if(!u||!config.checkout.allowedHosts.includes(u.hostname))issues.push('Configurar checkout VONNIX autorizado: '+kit.key);if(!Number.isFinite(kit.price)||kit.price<=0)issues.push('Preço inválido: '+kit.key);}
  for(const [key,policy] of Object.entries(config.policies))if(!policy.paragraphs.length&&!official(policy.officialUrl))issues.push('Adicionar texto oficial ou URL oficial da política: '+key);
  for(const [id,item] of Object.entries(config.assets)){
    if(!item.active)continue;
    if(item.needsReplacement&&(item.path===item.originalPath||item.approved!==true))issues.push((item.reviewNote?'Corrigir o texto incorporado da arte ':'Substituir e aprovar a arte ')+id+': '+item.path);
    const file=path.resolve(root,item.path);
    if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile())issues.push('Arquivo local ausente ou fora do projeto: '+id);
  }
  if(config.promotion.mode==='loop')issues.push('Contagem em ciclo não permitida: configure uma data real ou desative a promoção');
  if(config.promotion.endsAt!==null&&(!/(?:Z|[+-]\d{2}:\d{2})$/.test(config.promotion.endsAt)||!Number.isFinite(Date.parse(config.promotion.endsAt))))issues.push('Usar data real com fuso horário em promotion.endsAt, ou null');
  return issues;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const issues=validatePublication();
  if(issues.length){console.log('Publicação indisponível: '+issues.length+' pendências.\n\n'+issues.map(issue=>'• '+issue).join('\n'));process.exitCode=1;}
  else console.log('Configuração validada. Este comando não publica nem realiza pagamentos.');
}
