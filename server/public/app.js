const state = { page: 'overview', orders: [], products: [], stores: [], query: '', store: 'all', selected: null, connected: false };
const labels = { overview: 'Panoramica', orders: 'Ordini', products: 'Prodotti', stores: 'Negozi' };
const descriptions = {
  overview: 'Gli ordini inviati dall’app compaiono qui automaticamente.',
  orders: 'Ordini demo ricevuti in tempo reale dall’app CASA & TE.',
  products: 'Catalogo dimostrativo disponibile nell’app.',
  stores: 'Le cinque sedi configurate per questa demo.',
};
const $ = (selector) => document.querySelector(selector);
const safe = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const euro = (value) => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(Number(value) || 0);
const date = (value) => { const parsed = new Date(value); return Number.isNaN(parsed.getTime()) ? '—' : new Intl.DateTimeFormat('it-IT', { dateStyle: 'medium', timeStyle: 'short' }).format(parsed); };
const fulfilment = (order) => order.fulfilment === 'home' ? 'Consegna a domicilio' : order.fulfilment === 'store' ? 'Ritiro in negozio' : 'Punto di ritiro demo';
const status = () => '<span class="badge">Confermato</span>';

function setConnection(connected) {
  state.connected = connected;
  const node = $('#connection');
  node.className = `connection ${connected ? 'online' : 'offline'}`;
  node.innerHTML = `<span class="pulse"></span> ${connected ? 'Sincronizzato' : 'Servizio non raggiungibile'}`;
}

function setPage(page) {
  state.page = page;
  state.query = '';
  state.store = 'all';
  document.querySelectorAll('[data-page]').forEach((button) => button.classList.toggle('active', button.dataset.page === page));
  $('#breadcrumb-page').textContent = labels[page];
  $('#page-title').textContent = labels[page];
  $('#page-description').textContent = descriptions[page];
  render();
}

function metrics() {
  const home = state.orders.filter((order) => order.fulfilment === 'home').length;
  return `<div class="grid metric-grid">
    <div class="metric"><span class="metric-icon">▤</span><span class="label">Ordini ricevuti</span><strong>${state.orders.length}</strong><small>Ordini demo condivisi</small></div>
    <div class="metric"><span class="metric-icon">◷</span><span class="label">Da preparare</span><strong>${state.orders.filter((order) => order.status === 'confirmed').length}</strong><small>Stato confermato</small></div>
    <div class="metric"><span class="metric-icon">⌂</span><span class="label">Consegne a domicilio</span><strong>${home}</strong><small>${state.orders.length - home} ordini con ritiro</small></div>
  </div>`;
}

function overview() {
  const rows = state.orders.slice(0, 5).map((order) => `<button class="order-row" data-id="${safe(order.id)}">
    <div><div class="order-number">${safe(order.id)}</div><div class="order-meta">${safe(date(order.createdAt))}</div></div>
    <div><div class="order-cell-title">${safe(fulfilment(order))}</div><div class="order-cell-sub">${safe(order.store)}</div></div>
    <div class="order-amount">${euro(order.total)}</div></button>`).join('');
  return `${metrics()}<div class="split"><section class="panel"><div class="panel-header"><h2>Ordini recenti</h2><button class="text-button" data-page="orders">Vedi tutti →</button></div>${rows || '<div class="empty"><strong>Nessun ordine ricevuto</strong><p>Conferma un ordine nell’app: comparirà qui automaticamente.</p></div>'}</section>
    <aside class="panel info-panel"><div class="mini">SINCRONIZZAZIONE ATTIVA</div><h2>Dall’app alla console, nello stesso momento.</h2><p>Questa console legge gli ordini dal servizio demo condiviso. I dati di pagamento e le giacenze reali non sono collegati.</p><div class="decor"><span></span><span></span><span></span><span></span></div></aside></div>`;
}

function filteredOrders() {
  const query = state.query.toLocaleLowerCase('it-IT');
  return state.orders.filter((order) => (state.store === 'all' || order.store === state.store) &&
    (!query || [order.id, order.store, order.address?.name, order.fulfilment].some((part) => String(part ?? '').toLocaleLowerCase('it-IT').includes(query))));
}

function orderTable() {
  const orders = filteredOrders();
  return `<section class="panel"><div class="table-wrap"><table class="table"><thead><tr><th>ORDINE</th><th>DATA</th><th>CONSEGNA</th><th>NEGOZIO</th><th>STATO</th><th>TOTALE</th></tr></thead><tbody>
    ${orders.map((order) => `<tr data-id="${safe(order.id)}" tabindex="0"><td><span class="order-number">${safe(order.id)}</span><div class="order-cell-sub">${order.itemCount} articoli</div></td><td>${safe(date(order.createdAt))}</td><td>${safe(fulfilment(order))}</td><td>${safe(order.store)}</td><td>${status()}</td><td class="money">${euro(order.total)}</td></tr>`).join('')}
    </tbody></table>${orders.length ? '' : '<div class="empty"><strong>Nessun ordine trovato</strong><p>Prova un’altra ricerca oppure conferma un ordine nell’app.</p></div>'}</div></section>`;
}

function orders() {
  return `<div class="toolbar"><label class="search"><input id="order-search" type="search" placeholder="Cerca numero, negozio o nome" value="${safe(state.query)}" aria-label="Cerca ordini"></label><button class="filter ${state.store === 'all' ? 'active' : ''}" data-store="all">Tutti i negozi</button>${state.stores.map((store) => `<button class="filter ${state.store === store ? 'active' : ''}" data-store="${safe(store)}">${safe(store)}</button>`).join('')}<span class="toolbar-count">${filteredOrders().length} ordini</span></div>${orderTable()}`;
}

function productTable() {
  return `<div class="notice">Catalogo dimostrativo in sola lettura. Prezzi e disponibilità non sono collegati a un gestionale reale.</div><section class="panel"><div class="table-wrap"><table class="table"><thead><tr><th>PRODOTTO</th><th>CATEGORIA</th><th>PESO</th><th>DISPONIBILITÀ DEMO</th><th>PREZZO</th></tr></thead><tbody>${state.products.map((product) => `<tr><td><strong>${safe(product.emoji)} &nbsp; ${safe(product.name)}</strong><div class="order-cell-sub">${safe(product.id)}</div></td><td>${safe(product.category)}</td><td>${safe(product.weightKg)} kg</td><td>${product.available ? '<span class="badge">Disponibile</span>' : 'Non disponibile'}</td><td class="money">${euro(product.price)}</td></tr>`).join('')}</tbody></table></div></section>`;
}

function stores() {
  return `<div class="notice">Solo nomi delle sedi configurate. Indirizzi, contatti e inventario non fanno parte della demo.</div><div class="store-list">${state.stores.map((store, index) => `<div class="store-card"><div class="store-symbol">⌂</div><div><strong>${safe(store)}</strong><small>Sede ${String(index + 1).padStart(2, '0')} · ${state.orders.filter((order) => order.store === store).length} ordini demo</small></div></div>`).join('')}</div>`;
}

function render() {
  $('#nav-count').textContent = state.orders.length;
  $('#view').innerHTML = state.page === 'overview' ? overview() : state.page === 'orders' ? orders() : state.page === 'products' ? productTable() : stores();
  if (state.selected) renderDrawer();
}

function detail(label, value) { return `<div class="detail-row"><span>${safe(label)}</span><strong>${safe(value)}</strong></div>`; }
function renderDrawer() {
  const order = state.orders.find((item) => item.id === state.selected);
  if (!order) { closeDrawer(); return; }
  const address = order.address ? `${order.address.name}, ${order.address.address}, ${order.address.cap} ${order.address.city}` : '—';
  $('#order-drawer').innerHTML = `<div class="drawer-top"><div><span class="eyebrow">DETTAGLIO ORDINE</span><h2>${safe(order.id)}</h2></div><button class="close" id="drawer-close" aria-label="Chiudi">×</button></div><div class="drawer-body">
    <div class="drawer-section">${status()}${detail('Ricevuto', date(order.createdAt))}${detail('Modalità', fulfilment(order))}${detail('Negozio', order.store)}${order.fulfilment === 'home' ? detail('Destinazione', address) : ''}${detail('Pagamento', order.payment === 'card-demo' ? 'Carta demo' : 'Contanti demo')}</div>
    <div class="drawer-section"><h3>Articoli · ${order.itemCount}</h3>${(order.lines || []).map((line) => `<div class="line-item"><span class="item-icon">${safe(line.product.emoji)}</span><div><strong>${safe(line.product.name)}</strong><small>Quantità ${safe(line.quantity)} · ${safe(line.product.weightKg)} kg/unità</small></div><b>${euro(line.product.price * line.quantity)}</b></div>`).join('')}</div>
    <div class="drawer-section"><h3>Riepilogo</h3>${detail('Subtotale', euro(order.subtotal))}${detail('Consegna', euro(order.shipping))}${detail('Peso totale', `${order.totalWeightKg} kg`)}<div class="detail-row"><span>Totale demo</span><strong class="total-detail">${euro(order.total)}</strong></div></div>
    <div class="notice">Ordine dimostrativo. Nessun pagamento reale è stato eseguito.</div></div>`;
  $('#drawer-backdrop').hidden = false;
  $('#order-drawer').classList.add('open');
  $('#order-drawer').setAttribute('aria-hidden', 'false');
}
function closeDrawer() { state.selected = null; $('#drawer-backdrop').hidden = true; $('#order-drawer').classList.remove('open'); $('#order-drawer').setAttribute('aria-hidden', 'true'); }

document.addEventListener('click', (event) => {
  const page = event.target.closest('[data-page]');
  if (page) { setPage(page.dataset.page); return; }
  const store = event.target.closest('[data-store]');
  if (store) { state.store = store.dataset.store; render(); return; }
  const order = event.target.closest('[data-id]');
  if (order) { state.selected = order.dataset.id; renderDrawer(); return; }
  if (event.target.id === 'drawer-close' || event.target.id === 'drawer-backdrop') closeDrawer();
});
document.addEventListener('input', (event) => {
  if (event.target.id !== 'order-search') return;
  state.query = event.target.value;
  const start = event.target.selectionStart;
  render();
  const input = $('#order-search'); input.focus(); input.setSelectionRange(start, start);
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') closeDrawer();
  if (event.key === 'Enter' && event.target.matches('tr[data-id]')) { state.selected = event.target.dataset.id; renderDrawer(); }
});

let refreshing = false;
async function refresh() {
  if (refreshing || document.hidden) return;
  refreshing = true;
  try {
    const [ordersResponse, productsResponse, storesResponse] = await Promise.all([
      fetch('/api/orders', { cache: 'no-store' }), fetch('/api/products', { cache: 'no-store' }), fetch('/api/stores', { cache: 'no-store' }),
    ]);
    if (![ordersResponse, productsResponse, storesResponse].every((response) => response.ok)) throw new Error('API unavailable');
    const [ordersData, productsData, storesData] = await Promise.all([ordersResponse.json(), productsResponse.json(), storesResponse.json()]);
    const changed = JSON.stringify(state.orders) !== JSON.stringify(ordersData.orders) || !state.products.length || !state.stores.length;
    state.orders = ordersData.orders;
    state.products = productsData.products;
    state.stores = storesData.stores;
    setConnection(true);
    $('#last-update').textContent = `Aggiornato ${new Intl.DateTimeFormat('it-IT', { timeStyle: 'short' }).format(new Date())}`;
    if (changed) render();
  } catch { setConnection(false); }
  finally { refreshing = false; }
}
render(); refresh(); setInterval(refresh, 1200); document.addEventListener('visibilitychange', refresh);
