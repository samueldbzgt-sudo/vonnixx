import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createLocalServer,root } from './local-server.mjs';
import { openBrowser } from './browser.mjs';

// Base temporária exclusiva de QA. Não é importada para a base real da VONNIX.
const fixture=[
 {tracking_code:'QA000000001BR',email:'cliente-qa@example.invalid',current_status:'em_transito',current_status_label:'Em trânsito',created_at:'2026-11-01T12:00:00-03:00',milestones:[{short:'Confirmado',completed:true},{short:'Preparado',completed:true},{short:'Em trânsito',isCurrent:true},{short:'Entregue',completed:false}],timeline:[{label:'Objeto em trânsito',timestamp:'2026-11-02T12:00:00-03:00',isCurrent:true},{label:'<script>window.__trackingXss=true</script>',timestamp:'2026-11-01T12:00:00-03:00'}]},
 {tracking_code:'QA000000002BR',email:'cliente-qa@example.invalid',current_status:'entregue',current_status_label:'Entregue',milestones:[{short:'Confirmado',completed:true},{short:'Entregue',completed:true}],timeline:[{label:'Entrega concluída',timestamp:'2026-11-04T12:00:00-03:00',isCurrent:true}]}
];
const directory=fs.mkdtempSync(path.join(root,'.rebranding','rastreio-browser-'));
const dataFile=path.join(directory,'pedidos-qa.json');fs.writeFileSync(dataFile,JSON.stringify(fixture));
const server=createLocalServer({trackingDataFile:dataFile});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin='http://127.0.0.1:'+server.address().port;
const result={checks:[],viewports:[],errors:[],externalRequests:[],apiRequests:[]};
const check=(name,condition)=>{result.checks.push({name,passed:!!condition});assert.ok(condition,name);};
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let browser;
try{
 browser=await openBrowser();const {page}=browser;
 page.on('Runtime.exceptionThrown',event=>result.errors.push(event.exceptionDetails.exception?.description||event.exceptionDetails.text));
 page.on('Network.requestWillBeSent',event=>{const url=event.request.url;if(/^https?:/.test(url)&&new URL(url).origin!==origin)result.externalRequests.push(url);if(url.startsWith(origin+'/api/rastreio'))result.apiRequests.push({method:event.request.method,path:new URL(url).pathname});});
 async function until(expression){for(let i=0;i<80;i++){if(await page.evaluate(expression))return;await wait(50);}throw Error('Condição não atendida: '+expression);}
 async function search(value){await page.evaluate(`document.querySelector('#trackingQuery').value=${JSON.stringify(value)};document.querySelector('#trackingForm').requestSubmit()`);await until(`document.querySelector('#trackingSubmit').disabled===false`);}
 await page.send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
 await page.send('Page.navigate',{url:origin+'/rastreio.html'});await until(`document.readyState==='complete'`);await page.evaluate('document.fonts.ready.then(()=>true)');
 check('Título e identidade VONNIX',await page.evaluate(`document.title==='Rastrear Pedido | VONNIX'&&document.querySelector('#trackingTitle').textContent==='Rastrear pedido'`));
 check('Busca inicial por código',await page.evaluate(`document.querySelector('#trackingCodeTab').getAttribute('aria-selected')==='true'&&document.querySelector('#trackingQuery').type==='text'`));
 check('Fonte local carregada',await page.evaluate(`[...document.fonts].some(font=>font.family.includes('Plus Jakarta Sans')&&font.status==='loaded')`));
 check('Botão com cores oficiais',await page.evaluate(`getComputedStyle(document.querySelector('#trackingSubmit')).backgroundColor==='rgb(245, 106, 0)'&&getComputedStyle(document.querySelector('#trackingSubmit')).color==='rgb(21, 21, 21)'`));
 check('Nenhuma consulta automática sem código',result.apiRequests.length===0);
 await page.screenshot(path.join(root,'.rebranding/rastreio-desktop.png'));
 for(const width of [320,360,390,430,768,1024,1440,1920]){
  await page.send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false});
  const layout=await page.evaluate(`({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,mainWidth:document.querySelector('main').getBoundingClientRect().width,formWidth:document.querySelector('#trackingForm').getBoundingClientRect().width})`);result.viewports.push(layout);check('Busca sem rolagem horizontal '+width,layout.scrollWidth<=width);
  if(width===390)await page.screenshot(path.join(root,'.rebranding/rastreio-mobile.png'));
 }
 const initialCount=result.apiRequests.length;await search('');
 check('Validação de entrada vazia',await page.evaluate(`document.querySelector('#trackingQuery').getAttribute('aria-invalid')==='true'&&!document.querySelector('#trackingMessage').hidden`));
 check('Entrada inválida não consulta a API',result.apiRequests.length===initialCount);
 await search('QA999999999BR');
 check('Código inexistente tem resposta honesta',await page.evaluate(`document.querySelector('#trackingMessageTitle').textContent==='Código não encontrado'&&document.querySelector('#trackingResult').hidden`));
 await search('qa000000001br');
 check('Consulta por código mostra status real da base',await page.evaluate(`!document.querySelector('#trackingResult').hidden&&document.querySelector('#trackingStatus').textContent==='Em trânsito'&&document.querySelector('#trackingCode').textContent==='QA000000001BR'`));
 check('Etapas e histórico renderizados',await page.evaluate(`document.querySelectorAll('#trackingSteps li').length===4&&document.querySelectorAll('#trackingTimeline li').length===2`));
 check('Dados da API tratados como texto',await page.evaluate(`!window.__trackingXss&&document.querySelector('#trackingTimeline').textContent.includes('<script>')&&!document.querySelector('#trackingTimeline script')`));
 await page.evaluate(`document.querySelector('#trackingCopy').click()`);await wait(100);
 check('Copiar código funciona ou oferece seleção',await page.evaluate(`document.querySelector('#trackingCopy').textContent==='Copiado!'||window.getSelection().toString()==='QA000000001BR'`));
 for(const width of [320,390,768,1440]){await page.send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false});check('Resultado sem rolagem horizontal '+width,await page.evaluate('document.documentElement.scrollWidth<=innerWidth'));}
 await page.evaluate(`document.querySelector('#trackingEmailTab').click()`);
 check('Aba de e-mail ajusta o campo',await page.evaluate(`document.querySelector('#trackingQuery').type==='email'&&document.querySelector('#trackingLabel').textContent==='E-mail do pedido'`));
 const emailBefore=result.apiRequests.length;await search('email-invalido');check('E-mail inválido não é enviado',result.apiRequests.length===emailBefore);
 await search('CLIENTE-QA@EXAMPLE.INVALID');
 check('E-mail lista os pedidos correspondentes',await page.evaluate(`!document.querySelector('#trackingOrders').hidden&&document.querySelectorAll('#trackingOrders button').length===2`));
 check('E-mail é consultado por POST',result.apiRequests.some(item=>item.method==='POST'&&item.path==='/api/rastreio/by-email'));
 check('E-mail não aparece no endereço da página',await page.evaluate(`!location.href.includes('cliente-qa')&&!location.href.toLowerCase().includes('email=')`));
 await page.evaluate(`document.querySelector('#trackingOrders button:nth-of-type(2)').click()`);await until(`document.querySelector('#trackingStatus').textContent==='Entregue'`);
 check('Pedido selecionado mostra entrega concluída',await page.evaluate(`!document.querySelector('#trackingDelivered').hidden&&document.querySelector('#trackingCode').textContent==='QA000000002BR'`));
 fs.writeFileSync(dataFile,'JSON de teste inválido');await page.evaluate(`document.querySelector('#trackingCodeTab').click()`);await search('QA000000001BR');
 check('Falha da API não é apresentada como pedido inexistente',await page.evaluate(`document.querySelector('#trackingMessageTitle').textContent==='Consulta temporariamente indisponível'`));
 fs.writeFileSync(dataFile,JSON.stringify(fixture));
 await page.send('Page.navigate',{url:origin+'/rastreio?code=QA000000001BR'});await until(`document.querySelector('#trackingStatus')?.textContent==='Em trânsito'`);
 check('URL curta com código preenche e consulta',await page.evaluate(`document.querySelector('#trackingQuery').value==='QA000000001BR'&&!document.querySelector('#trackingResult').hidden`));
 check('Sem armazenamento de dados de visitantes',await page.evaluate('document.cookie===\'\'&&localStorage.length===0&&sessionStorage.length===0'));
 check('Sem exceções JavaScript',result.errors.length===0);check('Nenhuma requisição para a operação anterior ou terceiros',result.externalRequests.length===0);
 result.success=true;
}catch(error){result.success=false;result.failure=error.stack;console.error(error.stack);process.exitCode=1;}
finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));fs.writeFileSync(path.join(root,'.rebranding/testes-rastreio.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({success:result.success,checks:result.checks.length,viewports:result.viewports,errors:result.errors,externalRequests:result.externalRequests},null,2));}
