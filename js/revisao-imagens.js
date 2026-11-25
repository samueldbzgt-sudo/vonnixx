(() => {
  'use strict';
  const assets = Object.entries(window.VONNIX_CONFIG.assets);
  const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const pending = item => item.active && item.needsReplacement && (item.path === item.originalPath || !item.approved);
  const group = item => pending(item) ? 'pending' : !item.active ? 'inactive' : item.reviewSource ? 'reviews' : item.path !== item.originalPath ? 'updated' : /logo |bandeiras/.test(item.originalPath) ? 'branding' : 'product';
  const label = item => pending(item) ? (item.reviewNote || 'Aguardar nova arte VONNIX') : !item.active ? (item.reviewNote || 'Desativada na página de vendas') : item.reviewSource ? 'Avaliação do produto — origem '+item.reviewSource : item.reviewNote || (item.path !== item.originalPath ? 'Nova arte aplicada' : item.originalPath.startsWith('logo ') ? 'Logo oficial aplicada' : item.approved ? 'Arquivo autorizado; original preservado' : 'Preservada; confirmar autorização de uso');
  function render() {
    const filter = document.getElementById('imageFilter').value;
    const entries = assets.filter(([, item]) => filter === 'all' || group(item) === filter);
    document.getElementById('imageCount').textContent = entries.length + ' imagem(ns)';
    document.getElementById('imageCatalog').innerHTML = entries.map(([id, item]) => '<figure data-pending="' + pending(item) + '"><a href="' + escape(item.path) + '" target="_blank" rel="noopener"><img src="' + escape(item.path) + '" width="' + item.width + '" height="' + item.height + '" alt="' + escape(item.alt) + '" loading="lazy"></a><figcaption><h2>' + escape(id) + ' · ' + escape(item.alt) + '</h2><p>' + escape(item.path) + '</p><p>Atual: ' + item.width + ' × ' + item.height + ' px</p>' + (item.originalWidth ? '<p>Original preservado: ' + item.originalWidth + ' × ' + item.originalHeight + ' px</p>' : '') + '<p class="status">' + escape(label(item)) + '</p></figcaption></figure>').join('');
  }
  document.getElementById('imageFilter').addEventListener('change', render);
  render();
})();
