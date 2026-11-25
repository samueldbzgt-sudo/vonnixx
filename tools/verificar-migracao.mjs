import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {createLocalServer,root} from './local-server.mjs';
import {openBrowser} from './browser.mjs';
import {prepareReviews,readExport,productHandle} from './importar-avaliacoes.mjs';
import {validatePublication} from './validar-publicacao.mjs';

const result={date:'2026-11-24',checks:[],viewports:[],runtimeErrors:[],httpErrors:[],checkoutIntents:[]};
const check=(name,condition,detail)=>{result.checks.push({name,passed:!!condition,...(detail===undefined?{}:{detail})});assert.ok(condition,name+' '+(detail===undefined?'':JSON.stringify(detail)));};
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const readConfig=()=>{const context={window:{}};vm.runInNewContext(fs.readFileSync(path.join(root,'js/vonnix-config.js'),'utf8'),context);vm.runInNewContext(fs.readFileSync(path.join(root,'js/vonnix-avaliacoes.js'),'utf8'),context);if(context.window.VONNIX_REVIEWS)context.window.VONNIX_CONFIG.socialProof=context.window.VONNIX_REVIEWS;return context.window.VONNIX_CONFIG;};
const C=readConfig(),inventory=JSON.parse(fs.readFileSync(path.join(root,'assets/images/produto/inventario.json'),'utf8'));
const baselineFile=path.join(root,'.rebranding/inventario-local-antes-migracao.json');
const baseline=fs.existsSync(baselineFile)?JSON.parse(fs.readFileSync(baselineFile,'utf8')):null;
const server=createLocalServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin='http://127.0.0.1:'+server.address().port;
const photoPath='assets/images/avaliacoes/qa-review.png';let browser,injection,checkoutPhase=false;
try{
 check('Inventário de 15 originais únicos, com hashes íntegros',inventory.items.length===15&&new Set(inventory.items.map(i=>i.sha256)).size===15&&inventory.items.every(i=>crypto.createHash('sha256').update(fs.readFileSync(path.join(root,i.path))).digest('hex')===i.sha256));
 check('Versões responsivas locais presentes',inventory.items.every(i=>i.versions.length>=2&&i.versions.every(v=>fs.existsSync(path.join(root,v.path)))));
 check('Uma oferta vinculada ao checkout VONNIX fornecido',C.offers.items.length===1&&C.offers.items[0].key==='macaco5em1'&&C.checkout.urls.macaco5em1==='https://seguro.vonnix.store/api/public/shopify?product=51074763751621&store=41507'&&Object.keys(C.checkout.urls).length===1);
 check('Brinde confirmado, sem autonomia inventada',C.product.brinde.confirmed===true&&C.product.brinde.titulo==='Bateria extra de brinde'&&!/\d+\s*(mAh|Ah)/i.test(JSON.stringify(C.product)));
 check('699 avaliações autorizadas do produto exato, identificadas pela origem',C.socialProof.authorized===true&&C.socialProof.source.productHandle===productHandle&&C.socialProof.source.productId==='9203183812834'&&C.socialProof.count===699&&C.socialProof.testimonials.length===699&&new Set(C.socialProof.testimonials.map(r=>r.sourceReviewId)).size===699);
 const reviewInventory=JSON.parse(fs.readFileSync(path.join(root,'assets/images/avaliacoes/inventario.json'),'utf8'));
 const photoReviews=C.socialProof.testimonials.filter(r=>r.photos.length);
 check('31 avaliações com fotos, 81 vínculos e 41 originais íntegros',photoReviews.length===31&&photoReviews.flatMap(r=>r.photos).length===81&&new Set(photoReviews.flatMap(r=>r.photos).map(id=>C.assets[id].path)).size===41&&reviewInventory.files.length===41&&reviewInventory.files.every(i=>crypto.createHash('sha256').update(fs.readFileSync(path.join(root,i.path))).digest('hex')===i.sha256));
 check('Miniaturas locais presentes; datas e verificação de compra não inventadas',photoReviews.flatMap(r=>r.photos).every(id=>C.assets[id].versions.length===2&&C.assets[id].versions.every(v=>fs.existsSync(path.join(root,v.path))))&&C.socialProof.testimonials.every(r=>!r.date&&!r.verified&&!r.verificationEvidence));
 const sameText={authorized:true,source:{productHandle},reviews:[1,2].map(i=>({productHandle,sourceReviewId:'public-'+i,name:'QA',rating:5,text:'Mesmo texto, IDs públicos distintos.'}))};
 check('Importador preserva IDs distintos e rejeita ID repetido',prepareReviews(sameText).count===2&&(()=>{try{prepareReviews({...sameText,reviews:[sameText.reviews[0],sameText.reviews[0]]});return false;}catch{return true;}})());
 if(baseline){
  const preserved=['logo preta.png','logo branca.png','css/theme1.css','css/vonnix.css','css/kits.css','js/rastreio.js','js/pixel.js','js/latest.js','tools/tracking-store.mjs'];
  check('Logos, tema, scripts auxiliares e rastreamento com hashes preservados',preserved.every(file=>baseline.files.find(f=>f.path===file)?.sha256===crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex')));
  check('Políticas, marca e configuração de rastreio preservadas',JSON.stringify(C.policies)===JSON.stringify(baseline.policies)&&JSON.stringify(C.brand)===JSON.stringify(baseline.brand)&&JSON.stringify(C.tracking)===JSON.stringify(baseline.tracking));
 }
 const files=[...fs.readdirSync(root).filter(n=>n.endsWith('.html')),...fs.readdirSync(path.join(root,'js')).filter(n=>n.endsWith('.js')).map(n=>'js/'+n)];
 const old=/sacos?\s+(?:a\s+v[áa]cuo|organizador)|bomba\s+(?:sem\s+fio|recarreg[áa]vel)|kit(?:15|30|45)|51024891084997|51024891117765|51024891150533|z[íi]per\s+duplo|nexbag|guarda-roupa/i;
 check('HTML e scripts comerciais sem referências ao produto anterior',files.every(file=>!old.test(fs.readFileSync(path.join(root,file),'utf8'))));
 const publication=validatePublication(C);check('Validador impede publicação com dependências reais',!publication.some(i=>i.includes('Configurar checkout VONNIX'))&&publication.some(i=>i.includes('especificações'))&&publication.some(i=>i.includes('preços')));
 const invalidProduct={authorized:true,source:{productHandle},reviews:[{product_handle:'outro-produto',name:'QA',rating:5,body:'Registro de teste'}]};
 check('Importador rejeita avaliações de outro produto',(()=>{try{prepareReviews(invalidProduct);return false;}catch{return true;}})());
 check('Importador rejeita exportação sem autorização',(()=>{try{prepareReviews({authorized:false,source:{productHandle},reviews:[]});return false;}catch{return true;}})());
 const csvFile=path.join(root,'.rebranding/avaliacoes-qa.csv');
 fs.writeFileSync(csvFile,'product_handle,reviewer_name,rating,body,created_at,email\n'+productHandle+',QA,4,"Linha 1, com vírgula\nLinha 2",2026-11-01,privado@example.invalid\n');
 const parsed=prepareReviews(readExport(csvFile,{authorized:true}));
 check('CSV preserva vírgulas e linhas e descarta dados de contato',parsed.testimonials[0].text==='Linha 1, com vírgula\nLinha 2'&&!JSON.stringify(parsed).includes('privado@example.invalid'));

 browser=await openBrowser();const {page}=browser;
 page.on('Runtime.exceptionThrown',e=>result.runtimeErrors.push(e.exceptionDetails.exception?.description||e.exceptionDetails.text));
 page.on('Network.responseReceived',e=>{if(!checkoutPhase&&e.response.url.startsWith(origin)&&e.response.status>=400)result.httpErrors.push({url:e.response.url,status:e.response.status});});
 page.on('Network.requestWillBeSent',e=>{if(!e.request.url.startsWith(origin)&&/^https?:/.test(e.request.url)){if(checkoutPhase)result.checkoutIntents.push(e.request.url);else result.httpErrors.push({unexpectedExternal:e.request.url});}});
 const navigate=async(url=origin+'/')=>{await page.send('Page.navigate',{url});await wait(180);await page.evaluate('document.fonts.ready.then(()=>true)');};
 await navigate();
 check('Título, H1 e metadados do novo produto',await page.evaluate(`document.title==='Macaco Hidráulico Elétrico 5 em 1 + BRINDE ESPECIAL! | VONNIX'&&document.querySelector('h1').textContent==='Macaco Hidráulico Elétrico 5 em 1 + BRINDE ESPECIAL!'&&document.querySelector('meta[property="og:image"]').content.includes('prod-01')`));
 check('13 seções na ordem original',await page.evaluate(`JSON.stringify([...document.querySelectorAll('main>section')].map(s=>s.id))===${JSON.stringify(JSON.stringify(['','comprar','','','','','','','','oferta','','avaliacoes','faq']))}`));
 check('Fonte e cores oficiais preservadas',await page.evaluate(`document.fonts.check('800 22px "Plus Jakarta Sans"')&&getComputedStyle(document.documentElement).getPropertyValue('--brand-primary').trim()==='#F56A00'&&getComputedStyle(document.documentElement).getPropertyValue('--brand-secondary').trim()==='#151515'`));
 check('Card único sem seletores fictícios',await page.evaluate(`document.querySelectorAll('#variacaoBox article').length===1&&document.querySelectorAll('#variacaoBox button').length===0&&document.querySelector('.kit-options').dataset.count==='1'`));
 check('Preços e desconto sincronizados',await page.evaluate(`['#precoBox','#precoOferta','#stickyBar','#variacaoBox'].every(s=>document.querySelector(s).textContent.includes('99,90'))&&['#precoBox','#precoOferta','#stickyBar'].every(s=>document.querySelector(s).textContent.includes('399,90')&&document.querySelector(s).textContent.includes('75%'))`));
 check('Pix e parcelamento preservados, com prazo fixo da Black Friday',await page.evaluate(`VONNIX_CONFIG.offers.payment.confirmed===true&&document.querySelector('#precoBox').textContent.includes('à vista no Pix')&&['#precoBox','#precoOferta','#stickyBar'].every(s=>document.querySelector(s).textContent.includes('5x de')&&document.querySelector(s).textContent.includes('23,38'))&&VONNIX_CONFIG.promotion.endsAt==='2026-11-27T23:59:59-03:00'&&document.querySelector('#offerCountdown').hidden===(Date.now()>=Date.parse(VONNIX_CONFIG.promotion.endsAt))&&document.querySelector('.black-live-clock').hidden===document.querySelector('#offerCountdown').hidden`));
 check('Todos os botões de compra habilitados com checkout configurado',await page.evaluate(`document.querySelectorAll('.buy').length>5&&[...document.querySelectorAll('.buy')].every(b=>!b.disabled&&b.getAttribute('aria-disabled')==='false'&&b.textContent==='COMPRAR COM DESCONTO')`));
 check('Checkout ausente continua bloqueado sem navegação',await page.evaluate(`(async()=>{const C=VONNIX_CONFIG,previous=C.checkout.urls.macaco5em1,url=location.href;try{C.checkout.urls.macaco5em1='';const result=await iniciarCheckout();return result.blocked&&location.href===url&&[...document.querySelectorAll('.buy')].every(b=>b.disabled)}finally{C.checkout.urls.macaco5em1=previous;window.dispatchEvent(new Event('pageshow'))}})()`));
 check('Domínio da origem rejeitado como checkout',await page.evaluate(`(async()=>{const C=VONNIX_CONFIG,previous=C.checkout.urls.macaco5em1;try{C.checkout.urls.macaco5em1='https://checkout-invalido.example/cart';return (await iniciarCheckout()).blocked}finally{C.checkout.urls.macaco5em1=previous;window.dispatchEvent(new Event('pageshow'))}})()`));
 check('Nove miniaturas e indicadores',await page.evaluate(`document.querySelectorAll('#thumbs button').length===9&&document.querySelectorAll('#dots button').length===9`));
 const first=await page.evaluate(`document.querySelector('#mainImg img').dataset.asset`);
 await page.evaluate(`document.querySelector('[data-gal="next"]').click()`);check('Seta próxima',await page.evaluate(`document.querySelector('#mainImg img').dataset.asset==='PROD-02'`));
 await page.evaluate(`document.querySelector('[data-gal="prev"]').click()`);check('Seta anterior',await page.evaluate(`document.querySelector('#mainImg img').dataset.asset===${JSON.stringify(first)}`));
 await page.evaluate(`document.querySelector('#dots button:nth-child(9)').click()`);check('Indicadores selecionam a bateria extra',await page.evaluate(`document.querySelector('#mainImg img').dataset.asset==='PROD-09'`));
 await page.evaluate(`document.querySelector('#thumbs button:nth-child(4)').click();document.querySelector('#mainImg').focus()`);
 await page.send('Input.dispatchKeyEvent',{type:'keyDown',key:'ArrowRight',code:'ArrowRight'});check('Miniaturas e teclado',await page.evaluate(`document.querySelector('#mainImg img').dataset.asset==='PROD-05'`));
 await page.evaluate(`{const e=document.querySelector('#mainImg');e.dispatchEvent(new PointerEvent('pointerdown',{clientX:250,clientY:100}));e.dispatchEvent(new PointerEvent('pointerup',{clientX:100,clientY:100}));}`);check('Navegação por gesto',await page.evaluate(`document.querySelector('#mainImg img').dataset.asset==='PROD-06'`));
 await page.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter'});check('Zoom abre o original',await page.evaluate(`document.querySelector('#produtoLightbox').open&&document.querySelector('#produtoLightbox img').src.endsWith('/prod-06.jpg')`));
 await page.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape'});check('Zoom fecha com Escape',await page.evaluate(`!document.querySelector('#produtoLightbox').open`));
 await page.evaluate(`document.querySelector('#faqBox summary').click()`);check('FAQ abre',await page.evaluate(`document.querySelector('#faqBox details').open`));
 await page.evaluate(`document.querySelector('#faqBox summary').click();document.querySelector('#menuBtn').click()`);check('Menu abre e controla o foco',await page.evaluate(`!document.querySelector('#drawer').classList.contains('hidden')&&document.querySelector('main').inert&&document.querySelector('#drawer').contains(document.activeElement)`));
 await page.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape'});check('Menu fecha e devolve o foco',await page.evaluate(`document.querySelector('#drawer').classList.contains('hidden')&&!document.querySelector('main').inert&&document.activeElement.id==='menuBtn'`));
 check('Aviso de segurança e ficha sem carga inventada',await page.evaluate(`document.querySelector('#avisoSeguranca').textContent.includes('Nunca entre ou trabalhe embaixo')&&!/\d+\s*(?:toneladas|ton|kg|cm|mm|watts|psi)/i.test(document.querySelector('#specsBox').textContent)`));
 check('Descrição segue a sequência solicitada, com Black Friday no final',await page.evaluate(`JSON.stringify([...document.querySelectorAll('#productDescription img')].map(img=>img.dataset.asset))===JSON.stringify(['DESC-KIT','DESC-ANIMACAO','DESC-BENEFICIOS','DESC-BLACK-FRIDAY'])&&document.querySelectorAll('#infoBox>img').length===2&&document.querySelectorAll('#infoBox .detail-crop').length===0&&document.querySelector('#descriptionHeadline').textContent==='LEVANTE SEU CARRO EM POUCOS SEGUNDOS'`));
 check('Resumo do produto e seis comentários iniciais',await page.evaluate(`document.querySelector('#reviewsEmpty').hidden&&!document.querySelector('#reviewsSummary').hidden&&!document.querySelector('.product-rating-row').hidden&&document.querySelector('#notaTxt').textContent==='5.0'&&document.querySelector('#qtdTxt').textContent==='(699)'&&document.querySelector('#vendidosTxt').textContent==='Mais de 3 mil vendidos'&&document.querySelectorAll('#depoimentosBox article').length===6&&document.querySelectorAll('#avaliacoesTrack button').length===41&&document.querySelector('#reviewsAttribution').hidden`));
 await page.evaluate(`document.querySelector('[data-review-filter="photos"]').click()`);
 check('Filtro com fotos seleciona seis registros e informa 31',await page.evaluate(`document.querySelector('[data-review-filter="photos"]').getAttribute('aria-pressed')==='true'&&document.querySelector('[data-review-filter="photos"]').textContent==='Com fotos (31)'&&document.querySelectorAll('#depoimentosBox article').length===6&&[...document.querySelectorAll('#depoimentosBox article')].every(a=>a.querySelector('.review-photos img'))`));
 await page.evaluate(`for(let i=0;i<5;i++)document.querySelector('#reviewsMore').click()`);
 check('Todas as fotos permanecem vinculadas aos 31 comentários corretos',await page.evaluate(`(()=>{const actual=[...document.querySelectorAll('#depoimentosBox article')],expected=VONNIX_CONFIG.socialProof.testimonials.filter(r=>r.photos.length);return actual.length===31&&document.querySelector('#reviewsMore').hidden&&actual.every((a,i)=>a.dataset.sourceReviewId===expected[i].sourceReviewId&&JSON.stringify([...a.querySelectorAll('.review-photos img')].map(img=>img.dataset.asset))===JSON.stringify(expected[i].photos))})()`));
 const expectedPhoto=await page.evaluate(`(()=>{const img=document.querySelector('#depoimentosBox .review-photos img');return {path:VONNIX_CONFIG.assets[img.dataset.asset].path,name:VONNIX_CONFIG.socialProof.testimonials.find(r=>r.photos.includes(img.dataset.asset)).name}})()`);
 await page.evaluate(`document.querySelector('#depoimentosBox [data-review-photo]').click()`);
 check('Foto real abre original e autor correspondentes',await page.evaluate(`document.querySelector('#produtoLightbox').open&&document.querySelector('#produtoLightbox img').src.endsWith(${JSON.stringify(expectedPhoto.path)})&&document.querySelector('#produtoLightbox figcaption').textContent.includes(${JSON.stringify(expectedPhoto.name)})`));
 await page.evaluate(`document.querySelector('[data-lightbox="close"]').click();document.querySelector('[data-review-filter="all"]').click()`);
 check('Filtro Todas restaura a ordem e paginação das 699 avaliações',await page.evaluate(`document.querySelectorAll('#depoimentosBox article').length===6&&document.querySelector('#depoimentosBox article').dataset.sourceReviewId===VONNIX_CONFIG.socialProof.testimonials[0].sourceReviewId&&!document.querySelector('#reviewsMore').hidden&&document.querySelector('[data-review-filter="all"]').getAttribute('aria-pressed')==='true'`));
 check('Schema Product usa a média dos 699 registros e preserva aprovação comercial',await page.evaluate(`(()=>{const p=[...document.querySelectorAll('script[type="application/ld+json"]')].map(s=>JSON.parse(s.textContent)).find(p=>p['@type']==='Product');return p.name==='Macaco Hidráulico Elétrico 5 em 1 + BRINDE ESPECIAL!'&&p.brand.name==='VONNIX'&&p.aggregateRating.reviewCount===699&&Math.abs(p.aggregateRating.ratingValue-3490/699)<1e-12&&!p.offers})()`));
 await page.evaluate('Promise.all([...document.images].map(async img=>{img.loading="eager";try{await img.decode()}catch{}}))');
 check('Nenhuma imagem quebrada',await page.evaluate(`[...document.images].filter(i=>i.getClientRects().length).every(i=>i.complete&&i.naturalWidth>0)`));
 for(const width of [320,360,390,430,768,1024,1440,1920]){
  await page.send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<768});
  await page.evaluate(`document.documentElement.style.scrollBehavior='auto';window.scrollTo(0,0)`);await wait(60);
  const layout=await page.evaluate(`({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,sections:[...document.querySelectorAll('main>section')].map(e=>({left:e.getBoundingClientRect().left,right:e.getBoundingClientRect().right})),main:document.querySelector('main').getBoundingClientRect().width})`);
  result.viewports.push(layout);check('Responsividade '+width+' px',layout.scrollWidth<=width&&layout.sections.every(s=>s.left>=-.5&&s.right<=width+.5),layout);
  await page.evaluate(`window.scrollTo(0,900)`);await wait(60);
  check('Barra fixa cabe em '+width+' px',await page.evaluate(`!document.querySelector('#stickyBar').classList.contains('translate-y-full')&&document.querySelector('#stickyBar .buy').getBoundingClientRect().right<=innerWidth`));
 }
 await page.send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
 await navigate();await page.evaluate('Promise.all([...document.images].map(async img=>{img.loading="eager";try{await img.decode()}catch{}}))');
 await page.screenshot(path.join(root,'.rebranding/migracao-final-390.png'));await page.screenshot(path.join(root,'.rebranding/migracao-final-completa.png'),true);
 await page.send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});await page.screenshot(path.join(root,'.rebranding/migracao-final-1440.png'));

 // Fixtures existem somente no navegador de QA e em arquivo de imagem temporário.
 fs.mkdirSync(path.dirname(path.join(root,photoPath)),{recursive:true});
 assert.ok(!fs.existsSync(path.join(root,photoPath)),'Não sobrescrever arquivo de cliente');
 fs.writeFileSync(path.join(root,photoPath),Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6nS8AAAAASUVORK5CYII=','base64'));
 const qa={authorized:true,source:{productHandle,attribution:'Dados exclusivos de teste; não publicados.'},testimonials:Array.from({length:7},(_,i)=>({name:i===0?'QA <img src=x onerror="window.qaXss=true">':'QA '+i,rating:i===6?2:5,text:'Registro exclusivo de teste\nLinha preservada.',date:'2026-11-01',photos:i===0?['QA-REVIEW']:[],verified:i===0,verificationEvidence:i===0?'Fixture de teste':''})),count:9999,rating:1};
 injection=(await page.send('Page.addScriptToEvaluateOnNewDocument',{source:`Object.defineProperty(window,'VONNIX_CONFIG',{configurable:true,set(value){value.assets['QA-REVIEW']={path:${JSON.stringify(photoPath)},width:1,height:1,alt:'Pixel de QA'};value.promotion.endsAt=new Date(Date.now()+1800).toISOString();window.__qaConfig=value},get(){return window.__qaConfig}});Object.defineProperty(window,'VONNIX_REVIEWS',{configurable:true,set(){},get(){return ${JSON.stringify(qa)}}});`})).identifier;
 await navigate();
 check('Contador aceita data real futura',await page.evaluate(`!document.querySelector('#offerCountdown').hidden`));
 check('Resumo calculado somente dos registros importados',await page.evaluate(`document.querySelector('#qtdTxt').textContent==='(7)'&&document.querySelector('#notaTxt').textContent==='4.6'&&document.querySelectorAll('#depoimentosBox article').length===6`));
 check('Texto de avaliação escapado e data exibida',await page.evaluate(`!window.qaXss&&document.querySelector('#depoimentosBox').innerHTML.includes('&lt;img')&&document.querySelector('#depoimentosBox time').textContent==='01/11/2026'`));
 await page.evaluate(`document.querySelector('#reviewsMore').click()`);check('Mostrar mais exibe os demais registros',await page.evaluate(`document.querySelectorAll('#depoimentosBox article').length===7&&document.querySelector('#reviewsMore').hidden`));
 await page.evaluate(`document.querySelector('[data-review-photo]').click()`);check('Foto da avaliação abre com atribuição correta',await page.evaluate(`document.querySelector('#produtoLightbox').open&&document.querySelector('#produtoLightbox figcaption').textContent.includes('QA <img')`));
 await page.evaluate(`document.querySelector('[data-lightbox="close"]').click()`);
 for(let attempt=0;attempt<40;attempt++){if(await page.evaluate(`document.querySelector('#offerCountdown').hidden&&document.querySelector('.black-live-clock').hidden`))break;await wait(100);}
 check('Contador encerra e não reinicia',await page.evaluate(`document.querySelector('#offerCountdown').hidden&&document.querySelector('.black-live-clock').hidden`));
 await page.send('Page.removeScriptToEvaluateOnNewDocument',{identifier:injection});injection=null;

 checkoutPhase=true;
 const expectedCheckout=new URL(C.checkout.urls.macaco5em1);
 await navigate(origin+'/?utm_source=qa&utm_campaign=teste&fbclid=qa123&product=ALHEIO&store=ALHEIA&redirect=ALHEIO');
 const buttonCount=await page.evaluate("document.querySelectorAll('.buy').length");
 for(let i=0;i<buttonCount;i++){
  if(i)await navigate(origin+'/?utm_source=qa&utm_campaign=teste&fbclid=qa123&product=ALHEIO&store=ALHEIA&redirect=ALHEIO');
  const firstIntent=result.checkoutIntents.length;
  await page.evaluate("document.querySelectorAll('.buy')["+i+"].click()");await wait(150);
  const intent=result.checkoutIntents.slice(firstIntent).find(value=>value.startsWith(expectedCheckout.origin+'/'));
  const destination=intent?new URL(intent):null;
  check('CTA '+(i+1)+' usa checkout fornecido e atribuição correta, com rede externa bloqueada',destination&&destination.origin===expectedCheckout.origin&&destination.pathname===expectedCheckout.pathname&&destination.searchParams.get('product')===expectedCheckout.searchParams.get('product')&&destination.searchParams.get('store')===expectedCheckout.searchParams.get('store')&&destination.searchParams.get('utm_source')==='qa'&&destination.searchParams.get('utm_campaign')==='teste'&&destination.searchParams.get('fbclid')==='qa123'&&!destination.searchParams.has('redirect'));
 }
 checkoutPhase=false;
 await navigate();check('Configuração real habilita todos os botões no produto correto',await page.evaluate("[...document.querySelectorAll('.buy')].every(b=>!b.disabled)&&VONNIX_CONFIG.checkout.urls.macaco5em1==="+JSON.stringify(C.checkout.urls.macaco5em1)+"&&VONNIX_CONFIG.socialProof.authorized===true&&VONNIX_CONFIG.socialProof.count===699"));
 check('Console sem exceções relevantes',result.runtimeErrors.length===0,result.runtimeErrors);
 check('Rede local sem arquivos ausentes nem requisições externas inesperadas',result.httpErrors.length===0,result.httpErrors);
 console.log(JSON.stringify({passed:result.checks.length,failed:result.checks.filter(c=>!c.passed).length,viewports:result.viewports.map(v=>v.width),report:'.rebranding/testes-migracao.json'},null,2));
}finally{
 if(browser)await browser.close();server.closeAllConnections();server.close();
 if(fs.existsSync(path.join(root,photoPath)))fs.unlinkSync(path.join(root,photoPath));
 fs.writeFileSync(path.join(root,'.rebranding/testes-migracao.json'),JSON.stringify(result,null,2)+'\n');
}
