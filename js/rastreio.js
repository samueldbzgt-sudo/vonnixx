(() => {
  'use strict';
  const form=document.getElementById('trackingForm');if(!form)return;
  const C=window.VONNIX_CONFIG,config=C?.tracking||{};
  const $=id=>document.getElementById(id);
  const input=$('trackingQuery'),submit=$('trackingSubmit');
  const codeTab=$('trackingCodeTab'),emailTab=$('trackingEmailTab');
  const pollDelay=Math.max(45000,Math.min(300000,Number(config.pollIntervalMs)||45000));
  const timeout=Math.max(3000,Math.min(30000,Number(config.requestTimeoutMs)||15000));
  let mode='code',currentCode=null,delivered=false,sequence=0,controller=null,pollTimer=null;
  const text=(id,value)=>{$(id).textContent=value??'';};
  const element=(tag,className,value)=>{const node=document.createElement(tag);if(className)node.className=className;if(value!==undefined)node.textContent=value;return node;};
  const normalizeCode=value=>String(value||'').trim().replace(/\s+/g,'').toUpperCase();
  const validCode=value=>/^[A-Z0-9][A-Z0-9-]{5,63}$/.test(value);
  const validEmail=value=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)&&value.length<=254;
  const dateText=value=>{if(typeof value!=='string'||!Number.isFinite(Date.parse(value)))return '';return new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',dateStyle:'short',timeStyle:'short'}).format(new Date(value));};

  function apiBase(){
    const value=config.apiBasePath;
    if(typeof value!=='string'||!value.startsWith('/')||value.startsWith('//')||value.includes('\\'))throw Error('unavailable');
    const url=new URL(value,location.origin);
    if(url.origin!==location.origin||url.search||url.hash)throw Error('unavailable');
    return url.href.replace(/\/$/,'');
  }
  function stopPolling(){clearTimeout(pollTimer);pollTimer=null;}
  function cancel(){sequence++;controller?.abort();controller=null;stopPolling();}
  function busy(value){submit.disabled=value;submit.setAttribute('aria-busy',String(value));submit.querySelector('span').textContent=value?'Consultando…':'Rastrear pedido';form.setAttribute('aria-busy',String(value));}
  function hideResults(){$('trackingMessage').hidden=true;$('trackingOrders').hidden=true;$('trackingResult').hidden=true;}
  function message(title,description){hideResults();text('trackingMessageTitle',title);text('trackingMessageText',description);$('trackingMessage').hidden=false;}
  function schedule(delay=pollDelay){stopPolling();if(!currentCode||delivered||document.hidden)return;pollTimer=setTimeout(()=>lookup('code',currentCode,true),delay);}
  async function request(kind,value,signal){
    const base=apiBase();
    const options={method:kind==='email'?'POST':'GET',headers:{Accept:'application/json'},cache:'no-store',credentials:'same-origin',redirect:'error',signal};
    if(kind==='email'){options.headers['Content-Type']='application/json';options.body=JSON.stringify({email:value});}
    const response=await fetch(base+(kind==='email'?'/by-email':'/'+encodeURIComponent(value)),options);
    if(!response.headers.get('content-type')?.includes('application/json'))throw Error('unavailable');
    let data;try{data=await response.json();}catch{throw Error('unavailable');}
    if(!response.ok){const error=Error(response.status===404?'not-found':response.status===429?'rate-limit':'unavailable');error.retryAfter=Math.max(45000,Math.min(300000,(Number(response.headers.get('Retry-After'))||60)*1000));throw error;}
    return data;
  }

  function renderOrders(data){
    const orders=Array.isArray(data?.orders)?data.orders.filter(item=>item&&validCode(normalizeCode(item.tracking_code))).slice(0,100):[];
    if(!orders.length){message('Nenhum pedido encontrado','Confira se informou o e-mail utilizado na compra. Se precisar de ajuda, fale com '+C.brand.email+'.');return;}
    const list=$('trackingOrders');list.replaceChildren(element('h2','tracking-order-heading',orders.length===1?'Encontramos seu pedido':'Encontramos '+orders.length+' pedidos'));
    for(const order of orders){
      const button=element('button','tracking-order');button.type='button';
      const symbol=element('span','tracking-order-icon');symbol.setAttribute('aria-hidden','true');symbol.append(document.querySelector('.tracking-symbol svg').cloneNode(true));
      const body=element('span','tracking-order-body');
      body.append(element('span','tracking-order-code',normalizeCode(order.tracking_code)));
      const date=dateText(order.created_at);if(date)body.append(element('span','tracking-order-meta','Pedido registrado em '+date));
      if(typeof order.status_label==='string')body.append(element('span','tracking-order-status',order.status_label));
      button.append(symbol,body);button.addEventListener('click',()=>lookup('code',normalizeCode(order.tracking_code)));
      list.append(button);
    }
    $('trackingMessage').hidden=true;$('trackingResult').hidden=true;list.hidden=false;
    text('trackingValidation',orders.length+' pedido(s) encontrado(s). Selecione um para acompanhar a entrega.');
  }
  function renderRecord(data){
    if(!data||!validCode(normalizeCode(data.tracking_code))||typeof data.current_status!=='string')throw Error('unavailable');
    const code=normalizeCode(data.tracking_code);currentCode=code;delivered=data.current_status==='entregue';
    let label=typeof data.current_status_label==='string'?data.current_status_label:data.current_status.replaceAll('_',' ');
    const nextAttempt=dateText(data.next_attempt_date);
    if(data.current_status==='falha_entrega'&&nextAttempt)label+=' · Nova tentativa: '+nextAttempt;
    text('trackingCode',code);text('trackingStatus',label);
    $('trackingDelivered').hidden=!delivered;
    const steps=$('trackingSteps');steps.replaceChildren();
    const milestones=Array.isArray(data.milestones)?data.milestones.filter(item=>typeof item?.short==='string').slice(0,12):[];
    milestones.forEach((item,index)=>{
      const step=element('li','tracking-step');step.dataset.done=String(item.completed===true);step.dataset.current=String(item.isCurrent===true);
      if(item.isCurrent===true)step.setAttribute('aria-current','step');
      step.append(element('span','tracking-step-circle',item.completed===true?'✓':String(index+1)),element('span','tracking-step-label',item.short));steps.append(step);
    });
    $('trackingProgressSection').hidden=!milestones.length;
    const timeline=$('trackingTimeline');timeline.replaceChildren();
    const events=Array.isArray(data.timeline)?data.timeline.filter(item=>typeof item?.label==='string').slice(0,100):[];
    events.forEach(item=>{
      const event=element('li','tracking-event');event.dataset.current=String(item.isCurrent===true);
      event.append(element('p','tracking-event-label',item.label));
      const formatted=dateText(item.timestamp);if(formatted){const time=element('time','tracking-event-time',formatted);time.dateTime=item.timestamp;event.append(time);}
      timeline.append(event);
    });
    timeline.hidden=!events.length;$('trackingNoEvents').hidden=!!events.length;
    text('trackingRefreshStatus',delivered?'Entrega concluída.':'Atualiza automaticamente a cada '+Math.round(pollDelay/1000)+' segundos.');
    $('trackingMessage').hidden=true;$('trackingOrders').hidden=true;$('trackingResult').hidden=false;
    text('trackingValidation','Pedido localizado. Status atual: '+label+'.');
    const url=new URL(location.href);url.searchParams.set('code',code);url.searchParams.delete('email');history.replaceState(null,'',url.pathname+url.search+url.hash);
    schedule();
  }
  async function lookup(kind,value,quiet=false){
    cancel();const id=sequence;const ownController=new AbortController();controller=ownController;const signal=ownController.signal;
    let timedOut=false;const timer=setTimeout(()=>{timedOut=true;ownController.abort();},timeout);
    if(!quiet){hideResults();busy(true);currentCode=null;delivered=false;}
    try{
      const data=await request(kind,value,signal);if(id!==sequence)return;
      if(kind==='email')renderOrders(data);else renderRecord(data);
    }catch(error){
      if(id!==sequence)return;
      if(quiet){text('trackingRefreshStatus',error.message==='rate-limit'?'Aguarde um instante para atualizar a consulta.':'A consulta será atualizada novamente em instantes.');schedule(error.retryAfter||pollDelay);}
      else if(error.message==='not-found')message(kind==='email'?'Nenhum pedido encontrado':'Código não encontrado',kind==='email'?'Confira o e-mail utilizado na compra. Se precisar de ajuda, fale com '+C.brand.email+'.':'Confira o código recebido por e-mail. Se precisar de ajuda, fale com '+C.brand.email+'.');
      else if(error.message==='rate-limit')message('Muitas consultas seguidas','Aguarde um instante antes de tentar novamente.');
      else if(timedOut)message('A consulta demorou mais que o esperado','Tente novamente em instantes ou fale com '+C.brand.email+'.');
      else message('Consulta temporariamente indisponível','Tente novamente em instantes. Para acompanhar seu pedido com nosso atendimento, escreva para '+C.brand.email+'.');
    }finally{clearTimeout(timer);if(id===sequence){busy(false);controller=null;}}
  }
  function setMode(next){
    cancel();mode=next;currentCode=null;delivered=false;busy(false);hideResults();
    for(const [tab,kind] of [[codeTab,'code'],[emailTab,'email']]){const selected=kind===mode;tab.setAttribute('aria-selected',String(selected));tab.tabIndex=selected?0:-1;}
    $('trackingPanel').setAttribute('aria-labelledby',mode==='email'?'trackingEmailTab':'trackingCodeTab');
    input.value='';input.type=mode==='email'?'email':'text';input.maxLength=mode==='email'?254:64;input.autocomplete=mode==='email'?'email':'off';input.inputMode=mode==='email'?'email':'text';input.placeholder=mode==='email'?'seuemail@exemplo.com':'AP123456789BR';input.removeAttribute('aria-invalid');
    text('trackingLabel',mode==='email'?'E-mail do pedido':'Código de rastreio');text('trackingHint',mode==='email'?'Use o e-mail informado no momento da compra.':'O código de rastreio está no e-mail de confirmação do seu pedido.');text('trackingValidation','');input.focus();
  }
  form.addEventListener('submit',event=>{
    event.preventDefault();const value=mode==='email'?input.value.trim().toLowerCase():normalizeCode(input.value);
    if(mode==='email'?!validEmail(value):!validCode(value)){
      cancel();busy(false);input.setAttribute('aria-invalid','true');const description=mode==='email'?'Informe um e-mail válido para consultar seu pedido.':'Informe um código de rastreio com 6 a 64 letras, números ou hífens.';text('trackingValidation',description);message('Confira os dados informados',description);input.focus();return;
    }
    input.removeAttribute('aria-invalid');input.value=value;lookup(mode,value);
  });
  input.addEventListener('input',()=>{if(mode==='code')input.value=input.value.toUpperCase();input.removeAttribute('aria-invalid');});
  codeTab.addEventListener('click',()=>setMode('code'));emailTab.addEventListener('click',()=>setMode('email'));
  [codeTab,emailTab].forEach(tab=>tab.addEventListener('keydown',event=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){event.preventDefault();const next=event.key==='Home'?'code':event.key==='End'?'email':mode==='code'?'email':'code';setMode(next);(next==='code'?codeTab:emailTab).focus();}}));
  $('trackingRetry').addEventListener('click',()=>{$('trackingMessage').hidden=true;input.focus();});
  $('trackingRefresh').addEventListener('click',()=>{if(currentCode)lookup('code',currentCode,true);});
  $('trackingCopy').addEventListener('click',async()=>{
    const code=$('trackingCode').textContent;if(!code)return;
    try{if(!navigator.clipboard)throw Error('clipboard');await navigator.clipboard.writeText(code);text('trackingCopy','Copiado!');setTimeout(()=>text('trackingCopy','Copiar'),2000);}
    catch{$('trackingCode').focus();const selection=window.getSelection();selection.removeAllRanges();const range=document.createRange();range.selectNodeContents($('trackingCode'));selection.addRange(range);text('trackingRefreshStatus','Código selecionado. Use a opção Copiar do seu dispositivo.');}
  });
  document.addEventListener('visibilitychange',()=>{if(document.hidden)stopPolling();else schedule();});
  window.addEventListener('pagehide',cancel);
  const prefill=normalizeCode(new URLSearchParams(location.search).get('code'));
  if(prefill){input.value=prefill;if(validCode(prefill))lookup('code',prefill);}
})();
