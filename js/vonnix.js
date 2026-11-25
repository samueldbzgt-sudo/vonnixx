/* Funil local VONNIX. Não carrega APIs, pixels ou configuração remota. */
(() => {
  'use strict';
  const C = window.VONNIX_CONFIG;
  if (!C) return;
  if (window.VONNIX_REVIEWS) C.socialProof = window.VONNIX_REVIEWS;
  const $ = selector => document.querySelector(selector);
  const all = selector => [...document.querySelectorAll(selector)];
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const text = (selector, value) => all(selector).forEach(el => { el.textContent = value ?? ''; });
  const html = (selector, value) => { const el = $(selector); if (el) el.innerHTML = value; };
  const money = value => Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const icon = (name, cls = 'w-5 h-5') => '<svg aria-hidden="true" viewBox="0 0 24 24" class="ic ' + cls + '">' + (window.VONNIX_ICONS?.[name] || '') + '</svg>';
  const asset = id => C.assets[id];
  function localAssetPath(id) {
    const value = asset(id)?.path;
    if (typeof value !== 'string' || !value || /^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(value) || value.includes('..') || value.startsWith('/')) return '';
    return value;
  }
  function image(id, attributes = '', sizes = '(max-width: 480px) calc(100vw - 32px), 448px') {
    const item = asset(id), src = localAssetPath(id);
    if (!item || !src) return '';
    const versions = (item.versions || []).filter(v => typeof v.path === 'string' && !/^(?:[a-z][a-z\d+.-]*:|\/\/|\/)/i.test(v.path) && !v.path.includes('..'));
    const preferred = versions.find(v => v.width === 480)?.path || src;
    return '<img src="' + escape(preferred) + '"' + (versions.length ? ' srcset="' + versions.map(v => escape(v.path) + ' ' + Number(v.width) + 'w').join(', ') + '" sizes="' + escape(sizes) + '"' : '') + ' data-asset="' + escape(id) + '" alt="' + escape(item.alt) + '" width="' + item.width + '" height="' + item.height + '" decoding="async" ' + attributes + '>';
  }
  function validHttps(value) {
    try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password && !url.port && !/[\u0000-\u0020]/.test(value) ? url : null; }
    catch { return null; }
  }
  function publicationBlockers() {
    const flags = { commercialApproved: 'Ofertas e pagamentos', policiesApproved: 'Políticas oficiais', productSpecsApproved: 'Especificações do fornecedor', assetRightsApproved: 'Autorização dos recursos', businessIdentityApproved: 'Identificação da empresa' };
    const blockers = Object.entries(flags).filter(([key]) => C.publication[key] !== true).map(([, label]) => label);
    if (!validHttps(C.publication.canonicalUrl)) blockers.push('URL definitiva do funil');
    if (!C.business?.legalName || !C.business?.cnpj || !C.business?.address) blockers.push('Dados empresariais confirmados');
    Object.entries(C.assets).forEach(([id, item]) => {
      if (item.active && item.needsReplacement && (item.path === item.originalPath || item.approved !== true)) blockers.push('Nova arte ' + id);
    });
    Object.keys(C.policies).forEach(key => {
      const policy = C.policies[key];
      if (!policy.paragraphs.length && !validOfficialUrl(policy.officialUrl)) blockers.push('Conteúdo da política: ' + key);
    });
    return blockers;
  }
  function checkoutUrl(key) {
    const url = validHttps(C.checkout.urls[key]);
    if (!url || !C.offers.items.some(item => item.key === key) || !C.checkout.allowedHosts.includes(url.hostname)) return null;
    return url;
  }
  function validOfficialUrl(value) {
    const url = validHttps(value), official = new URL(C.brand.domain).hostname;
    return url && (url.hostname === official || url.hostname === 'www.' + official) ? url : null;
  }
  function updateBuyButtons() {
    const ready = !!checkoutUrl(selectedKit?.key);
    all('.buy').forEach(button => {
      button.disabled = !ready; button.setAttribute('aria-disabled', String(!ready));
      button.title = ready ? '' : 'Compras temporariamente indisponíveis. Fale com a VONNIX.';
    });
    text('#checkoutStatus', ready ? '' : 'Compras temporariamente indisponíveis. Fale com a VONNIX: ' + C.brand.email + '.');
  }

  text('[data-marca], [data-marca-inline]', C.brand.name);
  text('#storeBadgeText', C.brand.storeBadge || 'SITE OFICIAL');
  text('[data-email]', C.brand.email);
  text('[data-year]', new Date().getFullYear());
  all('a[href^="mailto:"]').forEach(link => { link.href = 'mailto:' + C.brand.email; });
  all('[data-brand-logo]').forEach(img => {
    const id = img.dataset.brandLogo === 'dark' ? C.brand.logoDark : C.brand.logoLight;
    img.src = localAssetPath(id); img.alt = C.brand.name;
  });
  all('img[data-asset]').forEach(img => {
    const item = asset(img.dataset.asset); if (!item) return;
    img.src = item.versions?.find(v => v.width === 480)?.path || localAssetPath(img.dataset.asset);
    if (item.versions?.length) { img.srcset = item.versions.map(v => v.path + ' ' + v.width + 'w').join(', '); img.sizes = '(max-width: 480px) calc(100vw - 32px), 448px'; }
    img.alt = item.alt; img.width = item.width; img.height = item.height;
  });
  const footerLogo = $('footer .brand-logo');
  if (footerLogo && !$('[data-footer-slogan]')) { const p = document.createElement('p'); p.dataset.footerSlogan = ''; p.textContent = C.brand.slogan; footerLogo.parentElement.after(p); }
  if (C.publication.businessIdentityApproved === true && C.business.legalName && C.business.cnpj && C.business.address) {
    html('#empresaBox', '<p class="font-semibold text-ink">' + escape(C.business.legalName) + '</p><p>CNPJ: ' + escape(C.business.cnpj) + '</p><p>' + escape(C.business.address) + '</p>' + (C.business.phone ? '<p>' + escape(C.business.phone) + '</p>' : '') + '<p class="mt-2">© ' + new Date().getFullYear() + ' ' + escape(C.brand.name) + '. Todos os direitos reservados.</p>');
  }

  const P = C.product;
  text('#tituloH1, [data-product-name]', P.tituloH1);
  text('.buy', C.offers.ctaLabel || 'COMPRAR COM DESCONTO');
  const ratingSummary = P.ratingSummary, ratingRow = $('.product-rating-row');
  if (ratingRow && Number(ratingSummary?.rating) >= 1 && Number(ratingSummary.rating) <= 5 && Number.isInteger(ratingSummary.count) && ratingSummary.count > 0) {
    text('#notaTxt', Number(ratingSummary.rating).toFixed(1));
    text('#qtdTxt', '(' + ratingSummary.count.toLocaleString('pt-BR') + ')');
    text('#vendidosTxt', ratingSummary.sold || '');
    $('#vendidosTxt').hidden = !ratingSummary.sold;
    ratingRow.hidden = false; ratingRow.setAttribute('role', 'group');
    ratingRow.setAttribute('aria-label', 'Nota ' + String(ratingSummary.rating).replace('.', ',') + ' de 5, ' + ratingSummary.count.toLocaleString('pt-BR') + ' avaliações');
    ratingRow.querySelector('.text-gold')?.setAttribute('aria-hidden', 'true');
    text('#reviewsEmpty', 'Comentários e fotos das avaliações ainda não estão disponíveis nesta página.');
  }

  text('#avisoSeguranca', P.avisoSeguranca); text('#specsNota', P.specsNota);
  const tickerItems = [{ icone: 'truck', texto: P.barraFrete }, ...P.beneficios.map(b => ({ icone: b.icone, texto: b.titulo.toUpperCase() })), { icone: 'sparkle', texto: P.barraDesconto }].filter(item => item.texto);
  const tickerGroup = tickerItems.map(item => '<span class="product-ticker-item">' + icon(item.icone) + '<span>' + escape(item.texto) + '</span></span>').join('');
  html('#productTickerTrack', '<div class="product-ticker-group">' + tickerGroup + '</div><div class="product-ticker-group" aria-hidden="true">' + tickerGroup + '</div>');
  const badge = $('#badgeDesc');
  if (badge) { badge.textContent = P.badgeDesconto; badge.hidden = !P.badgeDesconto; }
  text('[data-cta1]', P.ctaPrincipal); text('[data-cta2]', P.ctaOferta); text('[data-cta3]', P.ctaProva); text('[data-cta4]', P.ctaSticky);
  text('#descTitulo', P.descricaoTitulo); text('#descTexto', P.descricaoTexto);
  text('#descriptionHeadline', P.descriptionIntro?.title); text('#descriptionSubtitle', P.descriptionIntro?.subtitle);
  if (P.descriptionIntro?.kit) html('#descriptionKit', image(P.descriptionIntro.kit, 'loading="lazy"'));
  if (P.descriptionIntro?.animation) html('#descriptionDemo', image(P.descriptionIntro.animation, 'loading="lazy"', '320px'));
  html('#beneficiosGrid', P.beneficios.map(b => '<div class="benefit-glow border border-line rounded-2xl p-3.5"><span class="w-10 h-10 rounded-xl bg-brand text-white flex items-center justify-center shadow-sm">' + icon(b.icone) + '</span><p class="font-extrabold text-sm mt-3 leading-tight">' + escape(b.titulo) + '</p><p class="text-xs leading-relaxed text-muted mt-1">' + escape(b.desc) + '</p></div>').join(''));
  html('#passosBox', P.passos.map((p, i) => '<div class="flex gap-3"><div class="w-8 h-8 rounded-full bg-brand text-white flex items-center justify-center font-bold shrink-0">' + (i + 1) + '</div><div><p class="font-bold text-sm">' + escape(p.titulo) + '</p><p class="text-sm text-muted">' + escape(p.desc) + '</p></div></div>').join(''));
  html('#infoBox', P.infograficos.map(entry => {
    if (typeof entry === 'string') return image(entry, 'loading="lazy" class="w-full rounded-2xl"');
    return '<figure><div class="detail-crop" style="aspect-ratio:' + Number(entry.width) + '/' + Number(entry.height) + ';--crop-top:' + (-Number(entry.top) / Number(entry.height) * 100) + '%">' + image(entry.id, 'loading="lazy"') + '</div><figcaption class="text-sm text-muted mt-2">' + escape(entry.caption) + '</figcaption></figure>';
  }).join('') + (P.descriptionIntro?.showNote === false ? '' : '<p class="text-sm text-muted text-center px-4">' + escape(P.infoNota) + '</p>'));
  html('#brindeBox', P.brinde?.confirmed === true ? '<div class="product-gift">' + image(P.brinde.image, 'loading="lazy"', '64px') + '<p><strong>' + escape(P.brinde.titulo) + '</strong>' + escape(P.brinde.texto) + '</p></div>' : '');
  html('#detalhesBox', P.detalhes.map((d, i) => '<details' + (i === 0 ? ' open' : '') + '><summary class="flex justify-between items-center px-4 py-3 font-semibold text-sm">' + escape(d.t) + '<span class="chev transition" aria-hidden="true">⌄</span></summary><div class="px-4 pb-4 text-sm text-muted">' + escape(d.c) + '</div></details>').join(''));
  text('#compTitulo', P.comparacao.titulo); text('#compSub', P.comparacao.sub); text('#compColA', P.comparacao.colA); text('#compColB', P.comparacao.colB);
  const yes = '<svg aria-label="Incluído" role="img" viewBox="0 0 20 20" class="w-5 h-5 inline-block align-middle"><circle cx="10" cy="10" r="10" fill="#DCFCE7"/><path d="M5.8 10.4l2.6 2.6L14 7.2" fill="none" stroke="#16A34A" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const no = '<svg aria-label="Ausente" role="img" viewBox="0 0 20 20" class="w-5 h-5 inline-block align-middle"><circle cx="10" cy="10" r="10" fill="#FEE2E2"/><path d="M7 7l6 6M13 7l-6 6" stroke="#DC2626" stroke-width="2" stroke-linecap="round"/></svg>';
  const compareValue = value => value === true ? yes : value === false ? no : escape(value);
  html('#compareBody', P.comparacao.linhas.map(row => '<tr class="border-t border-line"><td class="px-3 py-2.5">' + escape(row.label) + '</td><td class="text-center px-2 py-2.5">' + compareValue(row.a) + '</td><td class="text-center px-2 py-2.5">' + compareValue(row.b) + '</td></tr>').join(''));
  html('#casosBox', P.casos.map(c => '<div class="bg-white border border-line rounded-xl p-3 flex items-center gap-2.5"><span class="text-brand shrink-0">' + icon(c.icone) + '</span><span>' + escape(c.texto) + '</span></div>').join(''));
  html('#faqBox', P.faq.map(f => '<details><summary class="flex justify-between items-center px-4 py-3 font-semibold text-sm">' + escape(f.q) + '<span class="chev transition" aria-hidden="true">⌄</span></summary><div class="px-4 pb-4 text-sm text-muted">' + escape(f.a) + '</div></details>').join(''));

  let selectedKit = C.offers.items.find(k => k.key === C.offers.defaultKey) || C.offers.items[0];
  function renderPrice() {
    if (!selectedKit || !$('#precoBox')) return;
    const k = selectedKit, discount = k.compare > k.price ? Math.round((1 - k.price / k.compare) * 100) : 0;
    const payment = C.offers.payment;
    const paymentAmount = payment?.calculation === 'priceMultiplier' && Number.isInteger(payment.count) && payment.count > 1 && Number(payment.cardMultiplier) > 0 ? Math.round(k.price * Number(payment.cardMultiplier) / payment.count * 100) / 100 : Number(payment?.amount);
    const installments = payment?.confirmed === true && Number.isInteger(payment.count) && payment.count > 1 && paymentAmount > 0 ? payment.count + 'x de ' + money(paymentAmount) + ' no cartão' : '';
    const pixLabel = payment?.confirmed === true ? payment.pixLabel || '' : '';
    const paymentText = pixLabel ? pixLabel + (installments ? ' · ou ' + installments : '') : installments || 'Condições de pagamento no checkout.';
    const paymentHtml = pixLabel ? '<span class="product-payment-pix">' + escape(pixLabel) + '</span>' + (installments ? '<span class="product-payment-card"> · ou ' + escape(installments) + '</span>' : '') : escape(paymentText);
    const discountHtml = discount ? '<span class="bg-accent font-bold text-xs px-2 py-1 rounded-full mb-0.5">' + discount + '% OFF</span>' : '';
    const comparison = k.compare > k.price ? '<span class="text-muted line-through text-sm">' + money(k.compare) + '</span>' : '';
    html('#precoBox', comparison + '<div class="product-price-line"><span class="product-price-current">' + money(k.price) + '</span>' + discountHtml + '</div><p class="product-payment-line">' + paymentHtml + '</p>');
    html('#precoOferta', comparison + discountHtml + '<b class="block text-ink text-2xl mt-1">' + money(k.price) + '</b><span class="block mt-1">' + escape(paymentText) + '</span>');
    text('#stickyDe', k.compare > k.price ? money(k.compare) : ''); text('#stickyDesconto', discount ? discount + '% OFF' : ''); text('#stickyPor', money(k.price)); text('#stickyParcelas', installments || 'Condições no checkout');
    const specs = k.specs || P.specs;
    html('#specsBox', specs.map(([label, value]) => '<div class="flex justify-between gap-4 py-2.5"><dt class="text-muted">' + escape(label) + '</dt><dd class="font-semibold text-right">' + escape(value) + '</dd></div>').join(''));
    all('[data-kit]').forEach(button => { const on = button.dataset.kit === k.key; button.setAttribute('aria-pressed', String(on)); button.querySelector('.kit-action').textContent = on ? 'SELECIONADO' : 'ESCOLHER'; });
    updateBuyButtons();
  }
  const single = C.offers.items.length === 1;
  html('#variacaoBox', '<div class="kit-picker"><h2>' + (single ? 'Escolha seu kit' : 'Escolha sua oferta') + '</h2><div class="kit-options" data-count="' + C.offers.items.length + '">' + C.offers.items.map(k => '<' + (single ? 'article class="kit-option"' : 'button class="kit-option" type="button" data-kit="' + escape(k.key) + '" aria-pressed="' + (k.key === selectedKit.key) + '"') + '><span class="kit-badge">' + escape(k.label) + '</span><span class="kit-photo">' + image(k.image, 'loading="lazy"', single ? '92px' : '74px') + '</span><strong class="kit-name">' + escape(k.name) + '</strong><span class="kit-unit">' + escape(k.subtitle) + '</span>' + (k.compare > k.price ? '<del>' + money(k.compare) + '</del>' : '') + '<strong class="kit-total">' + money(k.price) + '</strong>' + (single ? '' : '<span class="kit-action">' + (k.key === selectedKit.key ? 'SELECIONADO' : 'ESCOLHER') + '</span>') + '</' + (single ? 'article' : 'button') + '>').join('') + '</div></div>');
  all('[data-kit]').forEach(button => button.addEventListener('click', () => {
    selectedKit = C.offers.items.find(k => k.key === button.dataset.kit); renderPrice();
    window.dispatchEvent(new CustomEvent('vonnix:offer-selected', { detail: { key: selectedKit.key, price: selectedKit.price, currency: 'BRL' } }));
  }));
  renderPrice();


  let lightbox;
  function openLightbox(items, initial = 0) {
    if (!items.length) return;
    if (!lightbox) {
      lightbox = document.createElement('dialog'); lightbox.id = 'produtoLightbox'; lightbox.className = 'product-lightbox';
      lightbox.setAttribute('aria-label', 'Visualização ampliada da imagem');
      lightbox.innerHTML = '<div class="lightbox-controls"><button type="button" data-lightbox="prev" aria-label="Imagem anterior">‹</button><span data-lightbox-count></span><button type="button" data-lightbox="next" aria-label="Próxima imagem">›</button><button type="button" data-lightbox="close" aria-label="Fechar imagem">✕</button></div><figure><img alt=""><figcaption></figcaption></figure>';
      document.body.append(lightbox);
      lightbox.addEventListener('click', event => { if (event.target === lightbox) lightbox.close(); });
    }
    let current = initial;
    const render = () => {
      const entry = items[current], item = asset(entry.id), img = lightbox.querySelector('img');
      img.src = localAssetPath(entry.id); img.alt = item.alt; img.width = item.width; img.height = item.height;
      lightbox.querySelector('figcaption').textContent = entry.caption || item.alt;
      lightbox.querySelector('[data-lightbox-count]').textContent = (current + 1) + ' / ' + items.length;
      lightbox.querySelector('[data-lightbox="prev"]').hidden = items.length < 2;
      lightbox.querySelector('[data-lightbox="next"]').hidden = items.length < 2;
    };
    const go = delta => { current = (current + delta + items.length) % items.length; render(); };
    lightbox.querySelector('[data-lightbox="prev"]').onclick = () => go(-1);
    lightbox.querySelector('[data-lightbox="next"]').onclick = () => go(1);
    lightbox.querySelector('[data-lightbox="close"]').onclick = () => lightbox.close();
    lightbox.onkeydown = event => {
      if (event.key === 'Escape') { event.preventDefault(); lightbox.close(); }
      else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); go(event.key === 'ArrowLeft' ? -1 : 1); }
    };
    render(); lightbox.showModal();
  }

  function initGallery() {
    const main = $('#mainImg'), thumbs = $('#thumbs'), dots = $('#dots');
    if (!main || !thumbs || !dots) return;
    const gallery = P.galeria.filter(localAssetPath); let current = 0;
    if (!gallery.length) return;
    main.parentElement.setAttribute('role', 'region'); main.parentElement.setAttribute('aria-label', 'Imagens do produto');
    main.tabIndex = 0; main.style.touchAction = 'pan-y'; main.setAttribute('role', 'button'); main.setAttribute('aria-label', 'Ampliar imagem do produto');
    thumbs.innerHTML = gallery.map((id, i) => '<button type="button" class="gallery-thumb" data-thumb="' + i + '" aria-label="Ver imagem ' + (i + 1) + ': ' + escape(asset(id).alt) + '" aria-pressed="false">' + image(id, 'loading="lazy"', '64px') + '</button>').join('');
    dots.innerHTML = gallery.map((_, i) => '<button type="button" aria-label="Imagem ' + (i + 1) + '" class="w-2 h-2 rounded-full bg-line"></button>').join('');
    const render = () => {
      main.innerHTML = image(gallery[current], 'class="w-full h-full object-contain" fetchpriority="high"');
      [...dots.children].forEach((dot, i) => { dot.className = 'w-2 h-2 rounded-full ' + (i === current ? 'bg-brand' : 'bg-line'); dot.setAttribute('aria-current', String(i === current)); });
      [...thumbs.children].forEach((thumb, i) => thumb.setAttribute('aria-pressed', String(i === current)));
    };
    const go = index => { current = (index + gallery.length) % gallery.length; render(); };
    [...thumbs.children].forEach((thumb, i) => thumb.addEventListener('click', () => go(i)));
    [...dots.children].forEach((dot, i) => dot.addEventListener('click', () => go(i)));
    $('[data-gal="prev"]').addEventListener('click', () => go(current - 1));
    $('[data-gal="next"]').addEventListener('click', () => go(current + 1));
    main.addEventListener('keydown', event => { if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') { event.preventDefault(); go(current + (event.key === 'ArrowRight' ? 1 : -1)); } });
    let start, swiped = false;
    main.addEventListener('click', () => { if (!swiped) openLightbox(gallery.map(id => ({ id })), current); swiped = false; });
    main.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openLightbox(gallery.map(id => ({ id })), current); } });
    main.addEventListener('pointerdown', event => { start = [event.clientX, event.clientY]; });
    main.addEventListener('pointerup', event => { if (!start) return; const dx = event.clientX - start[0], dy = event.clientY - start[1]; start = null; if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) { swiped = true; go(current + (dx < 0 ? 1 : -1)); } });
    main.addEventListener('pointercancel', () => { start = null; });
    render();
  }
  initGallery();

  function initDrawer() {
    const drawer = $('#drawer'), button = $('#menuBtn'); if (!drawer || !button) return;
    const panel = drawer.querySelector('[role="dialog"]'); let previous;
    const background = all('body > header, body > main, body > footer, #stickyBar');
    const close = () => { drawer.classList.add('hidden'); document.body.classList.remove('drawer-open'); button.setAttribute('aria-expanded', 'false'); background.forEach(el => { el.inert = false; }); previous?.focus(); };
    button.addEventListener('click', () => { previous = button; drawer.classList.remove('hidden'); document.body.classList.add('drawer-open'); button.setAttribute('aria-expanded', 'true'); background.forEach(el => { el.inert = true; }); panel.querySelector('button').focus(); });
    drawer.querySelectorAll('[data-close]').forEach(el => el.addEventListener('click', close));
    drawer.addEventListener('keydown', event => {
      if (event.key === 'Escape') { event.preventDefault(); close(); }
      if (event.key !== 'Tab') return;
      const focusable = [...panel.querySelectorAll('a[href],button:not(:disabled),input')].filter(el => !el.hidden && el.getClientRects().length);
      const first = focusable[0], last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    });
  }
  initDrawer();

  let busy = false;
  window.iniciarCheckout = window.comprarProduto = async () => {
    const url = checkoutUrl(selectedKit?.key);
    if (busy) return { blocked: true };
    if (!url) {
      updateBuyButtons();
      text('#checkoutStatus', 'As compras estão temporariamente indisponíveis. Fale com a VONNIX pelo e-mail ' + C.brand.email + '.');
      return { blocked: true };
    }
    busy = true; all('.buy, [data-kit]').forEach(button => { button.disabled = true; });
    // Repassa somente atribuição de campanha; parâmetros comerciais do checkout são preservados.
    const incoming = new URLSearchParams(window.location.search);
    const clickIds = new Set(['gclid', 'gbraid', 'wbraid', 'fbclid', 'msclkid', 'ttclid', 'sck', 'src']);
    for (const [key, value] of incoming) {
      if ((/^utm_[a-z0-9_]+$/i.test(key) || clickIds.has(key)) && value.length <= 2048 && !url.searchParams.has(key)) url.searchParams.set(key, value);
    }
    window.dispatchEvent(new CustomEvent('vonnix:checkout', { detail: { key: selectedKit.key, price: selectedKit.price, currency: 'BRL' } }));
    window.location.assign(url.href);
    return { blocked: false };
  };
  all('.buy').forEach(button => button.addEventListener('click', window.iniciarCheckout));
  window.addEventListener('pageshow', () => {
    busy = false;
    all('[data-kit]').forEach(button => { button.disabled = false; });
    updateBuyButtons();
  });
  window.VONNIX_PUBLICATION_BLOCKERS = publicationBlockers;

  function initCountdown() {
    const value = C.promotion.endsAt;
    const deadline = typeof value === 'string' && /(?:Z|[+-]\d{2}:\d{2})$/.test(value) ? Date.parse(value) : NaN;
    const locations = all('[data-bf-countdown]');
    const units = ['days', 'hours', 'minutes', 'seconds'];
    let timer;
    function tick() {
      const remaining = deadline - Date.now(), active = Number.isFinite(deadline) && remaining > 0;
      locations.forEach(el => { el.hidden = !active; }); if (!active) return;
      const seconds = Math.ceil(remaining / 1000);
      const values = [Math.floor(seconds / 86400), Math.floor(seconds % 86400 / 3600), Math.floor(seconds % 3600 / 60), seconds % 60];
      units.forEach((unit, i) => text('[data-countdown-unit="' + unit + '"]', String(values[i]).padStart(2, '0')));
      locations.forEach(el => el.setAttribute('aria-label', 'Black Friday acaba em ' + values[0] + ' dias, ' + values[1] + ' horas, ' + values[2] + ' minutos e ' + values[3] + ' segundos'));
      timer = setTimeout(tick, 1000);
    }
    const refresh = () => { clearTimeout(timer); tick(); };
    document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
    window.addEventListener('pageshow', refresh);
    tick();
  }
  initCountdown();

  function initReviews() {
    if (!$('#avaliacoes')) return;
    const social = C.socialProof;
    // Nunca usa avaliações de outro produto ou totais sem registros verificáveis.
    if (!social.authorized || social.source?.productHandle !== P.sourceHandle) return;
    const testimonials = social.testimonials.filter(item => item.name && item.text && Number.isInteger(item.rating) && item.rating >= 1 && item.rating <= 5);
    if (!testimonials.length) return;
    const count = testimonials.length, average = testimonials.reduce((sum, item) => sum + item.rating, 0) / count;
    const rating = average.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }), stars = value => '★'.repeat(value) + '☆'.repeat(5 - value);
    const distribution = [5, 4, 3, 2, 1].map(value => testimonials.filter(item => item.rating === value).length);
    text('#notaTxt', average.toFixed(1)); text('#badgeNota', rating); text('#qtdTxt', '(' + count.toLocaleString('pt-BR') + ')');
    $('.product-rating-row').hidden = false; $('#galleryRating').hidden = false;
    $('.product-rating-row').setAttribute('aria-label', 'Nota ' + rating + ' de 5, ' + count.toLocaleString('pt-BR') + ' avaliações');
    $('#galleryRating').setAttribute('aria-label', 'Nota do produto: ' + rating + ' de 5');
    html('#reviewHeadline', '<span class="rating-stars" aria-hidden="true">' + stars(Math.round(average)) + '</span><strong>' + rating + '</strong><span class="text-muted">— ' + count.toLocaleString('pt-BR') + ' avaliações</span>');
    $('#reviewHeadline').hidden = false;
    html('#reviewsSummary', '<div class="flex items-center gap-4"><div class="review-score"><div class="review-score-value">' + rating + '</div><div class="text-gold text-sm mt-1" aria-label="' + rating + ' de 5 estrelas">' + stars(Math.round(average)) + '</div><div class="review-score-count">' + count.toLocaleString('pt-BR') + ' avaliações</div></div><div class="review-distribution space-y-1">' + distribution.map((number, i) => '<div class="flex items-center gap-2 text-xs" aria-label="' + (5 - i) + ' estrelas: ' + number + '"><span>' + (5 - i) + '★</span><div class="flex-1 h-2 rounded-full bg-line overflow-hidden"><div class="h-full bg-gold" style="width:' + number / count * 100 + '%"></div></div><span>' + number + '</span></div>').join('') + '</div></div>');
    $('#reviewsSummary').hidden = false;
    const photoEntries = testimonials.flatMap(item => (item.photos || []).filter(localAssetPath).map(id => ({ id, caption: 'Foto da avaliação de ' + item.name })));
    const photoButton = (entry, index) => '<button type="button" class="review-photo-button" data-review-photo="' + index + '" aria-label="Ampliar ' + escape(entry.caption) + '">' + image(entry.id, 'loading="lazy"', '132px') + '</button>';
    if (photoEntries.length) {
      const seenPhotos = new Set();
      const track = $('#avaliacoesTrack'); track.innerHTML = photoEntries.map((entry, index) => {
        const path = localAssetPath(entry.id); if (seenPhotos.has(path)) return ''; seenPhotos.add(path); return photoButton(entry, index);
      }).join(''); track.hidden = false;
      track.setAttribute('role', 'region'); track.setAttribute('aria-label', 'Fotos reais das avaliações do produto'); track.tabIndex = 0;
    }
    const withPhotos = testimonials.filter(item => (item.photos || []).some(localAssetPath));
    let visible = 6, selected = testimonials;
    const filters = $('#reviewsFilters');
    text('[data-review-filter="all"]', 'Todas (' + count.toLocaleString('pt-BR') + ')');
    text('[data-review-filter="photos"]', 'Com fotos (' + withPhotos.length.toLocaleString('pt-BR') + ')');
    filters.hidden = false;
    $('[data-review-filter="photos"]').disabled = !withPhotos.length;
    const dateLabel = value => { if (!value) return ''; const date = new Date(value); return Number.isFinite(date.getTime()) ? date.toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : ''; };
    const render = () => {
      html('#depoimentosBox', selected.slice(0, visible).map(item => '<article class="bg-white border border-line rounded-xl p-4"' + (item.sourceReviewId ? ' data-source-review-id="' + escape(item.sourceReviewId) + '"' : '') + '><div class="review-person"><div><p class="review-person-name font-bold text-sm">' + escape(item.name) + (item.verified === true && item.verificationEvidence ? '<span class="review-verification">' + icon('check') + escape(social.verificationLabel || 'Compra verificada na origem') + '</span>' : '') + '</p>' + (item.date ? '<time class="review-card-date" datetime="' + escape(item.date) + '">' + escape(dateLabel(item.date)) + '</time>' : '') + '</div></div><p class="review-card-stars" aria-label="' + item.rating + ' de 5 estrelas">' + stars(item.rating) + '</p><p class="text-sm text-muted mt-1">' + escape(item.text).replace(/\r?\n/g, '<br>') + '</p>' + ((item.photos || []).length ? '<div class="review-photos">' + (item.photos || []).filter(localAssetPath).map(id => { const index = photoEntries.findIndex(entry => entry.id === id && entry.caption === 'Foto da avaliação de ' + item.name); return photoButton(photoEntries[index], index); }).join('') + '</div>' : '') + (item.response ? '<p class="text-sm text-muted mt-3"><strong>Resposta da loja de origem:</strong> ' + escape(item.response) + '</p>' : '') + '</article>').join(''));
      $('#depoimentosBox').hidden = false; $('#reviewsMore').hidden = visible >= selected.length;
      text('#reviewsResultCount', 'Mostrando ' + Math.min(visible, selected.length) + ' de ' + selected.length.toLocaleString('pt-BR') + ' avaliações');
      $('#reviewsResultCount').hidden = false;
    };
    filters.addEventListener('click', event => {
      const button = event.target.closest('[data-review-filter]'); if (!button || button.disabled) return;
      selected = button.dataset.reviewFilter === 'photos' ? withPhotos : testimonials; visible = 6;
      all('[data-review-filter]').forEach(item => item.setAttribute('aria-pressed', String(item === button))); render();
    });
    $('#reviewsMore').addEventListener('click', () => { visible += 6; render(); });
    $('#avaliacoes').addEventListener('click', event => { const button = event.target.closest('[data-review-photo]'); if (button) openLightbox(photoEntries, Number(button.dataset.reviewPhoto)); });
    text('#reviewsAttribution', social.source.attribution); $('#reviewsAttribution').hidden = !social.source.attribution;
    $('#reviewsEmpty').hidden = true; render();
  }
  initReviews();

  const bar = $('#stickyBar');
  if (bar) { const update = () => bar.classList.toggle('translate-y-full', window.scrollY <= 600); window.addEventListener('scroll', update, { passive: true }); update(); }

  let canonical = validHttps(C.publication.canonicalUrl);
  const filename = window.location.pathname.split('/').pop();
  if (canonical && filename && filename !== 'index.html' && filename.endsWith('.html')) canonical = new URL(filename, canonical);
  if (canonical) {
    const link = document.createElement('link'); link.rel = 'canonical'; link.href = canonical.href; document.head.append(link);
    const og = document.createElement('meta'); og.setAttribute('property', 'og:url'); og.content = canonical.href; document.head.append(og);
    all('meta[property="og:image"],meta[name="twitter:image"]').forEach(meta => { meta.content = new URL(localAssetPath($('#tituloH1') ? P.galeria[0] : C.brand.logoLight), canonical).href; });
  }
  if (C.publication.indexable === true && publicationBlockers().length === 0 && C.offers.items.every(k => checkoutUrl(k.key))) $('meta[name="robots"]').content = 'index, follow';
  const appendSchema = value => { const script = document.createElement('script'); script.type = 'application/ld+json'; script.textContent = JSON.stringify(value); document.head.append(script); };
  appendSchema({ '@context': 'https://schema.org', '@type': 'Organization', name: C.brand.name, url: C.brand.domain, email: C.brand.email, slogan: C.brand.slogan });
  if ($('#tituloH1')) {
    const productSchema = { '@context': 'https://schema.org', '@type': 'Product', name: P.tituloH1, description: P.subtitulo + ' ' + P.descricaoTexto, brand: { '@type': 'Brand', name: C.brand.name }, image: P.galeria.map(id => new URL(localAssetPath(id), canonical || window.location.href).href), additionalProperty: P.specs.map(([name, value]) => ({ '@type': 'PropertyValue', name, value })) };
    if (canonical) productSchema.url = canonical.href;
    if (C.publication.commercialApproved === true && checkoutUrl(selectedKit?.key)) {
      productSchema.offers = { '@type': 'Offer', priceCurrency: 'BRL', price: selectedKit.price.toFixed(2), url: canonical?.href || window.location.href };
      if (['InStock', 'OutOfStock', 'PreOrder'].includes(selectedKit.availability)) productSchema.offers.availability = 'https://schema.org/' + selectedKit.availability;
    }
    const social = C.socialProof, valid = social.authorized && social.source?.productHandle === P.sourceHandle ? social.testimonials.filter(r => r.name && r.text && Number.isInteger(r.rating) && r.rating >= 1 && r.rating <= 5) : [];
    if (valid.length) productSchema.aggregateRating = { '@type': 'AggregateRating', ratingValue: valid.reduce((sum, r) => sum + r.rating, 0) / valid.length, reviewCount: valid.length, bestRating: 5, worstRating: 1 };
    appendSchema(productSchema);
  }

  const policyKey = document.body.dataset.policy;
  if (policyKey && C.policies[policyKey]) {
    const policy = C.policies[policyKey], official = validOfficialUrl(policy.officialUrl);
    if (policy.paragraphs.length) html('#policyContent', policy.paragraphs.map(paragraph => '<p>' + escape(paragraph) + '</p>').join('') + (official ? '<p><a href="' + escape(official.href) + '" rel="noopener">Consultar o texto integral na loja VONNIX</a></p>' : ''));
    else if (official) html('#policyContent', '<p>Consulte o conteúdo oficial da VONNIX.</p><p><a href="' + escape(official.href) + '" rel="noopener">Ler a política na loja VONNIX</a></p>');
  }
  const trackingLink = $('#trackingOfficialLink'), tracking = validOfficialUrl(C.tracking.url);
  if (trackingLink && tracking) { trackingLink.href = tracking.href; trackingLink.hidden = false; }
})();
