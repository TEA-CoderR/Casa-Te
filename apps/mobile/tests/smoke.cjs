const { chromium } = require(process.argv[2] || process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.setDefaultTimeout(20000);
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') console.error(message.text()); });
  page.on('requestfailed', (request) => console.error('Request failed:', request.url(), request.failure()?.errorText));
  fs.mkdirSync('test-results', { recursive: true });
  try {
    await page.goto('http://localhost:8081', { timeout: 180000 });
    if (process.argv.includes('--inspect')) {
      await page.waitForLoadState('networkidle');
      console.log(await page.content());
      console.log('Page errors:', errors);
      return;
    }
    await page.getByText('La casa, più semplice.').waitFor({ timeout: 45000 });
    await page.waitForFunction(() => [...document.images].every((image) => image.complete && image.naturalWidth > 0));
    await page.screenshot({ path: 'test-results/home-390.png', fullPage: true });
    await page.getByText('Cerca prodotti, categorie...').click();
    await page.getByPlaceholder('Cerca prodotti...').fill('lavatrice');
    await page.getByText('Detergente lavatrice 40 lavaggi', { exact: true }).last().click();
    await page.getByText('Aggiungi al carrello', { exact: true }).click();
    await page.getByText('1 articoli', { exact: true }).waitFor();
    await page.getByLabel('Aumenta quantità Detergente lavatrice 40 lavaggi', { exact: true }).click();
    await page.getByText('2 articoli', { exact: true }).waitFor();
    await page.reload();
    await page.getByText('2 articoli', { exact: true }).waitFor();
    await page.getByText('4.4 kg', { exact: true }).waitFor();
    await page.getByText('Vai al checkout', { exact: true }).click();
    await page.getByText('Conferma ordine demo', { exact: true }).click();
    await page.getByText('Inserisci nome, indirizzo, città e un CAP di 5 cifre.').waitFor();
    await page.getByRole('radio', { name: /Ritiro in negozio/ }).click();
    assert.equal(await page.getByPlaceholder('Indirizzo', { exact: true }).count(), 0);
    await page.getByRole('radio', { name: 'Lucca 2', exact: true }).click();
    await page.getByRole('radio', { name: 'Contanti demo', exact: true }).click();
    await page.screenshot({ path: 'test-results/checkout-390.png', fullPage: true });
    await page.getByText('Conferma ordine demo', { exact: true }).click();
    await page.getByText('Vedi il mio ordine', { exact: true }).waitFor();
    await page.getByText('Vedi il mio ordine', { exact: true }).click();
    await page.getByText('Pagamento simulato', { exact: true }).waitFor();
    await page.reload();
    await page.getByText('Pagamento simulato', { exact: true }).waitFor();
    const saved = await page.evaluate(() => ({
      orders: JSON.parse(localStorage.getItem('casa-te-orders')).state.orders,
      cart: JSON.parse(localStorage.getItem('casa-te-cart')).state.items,
    }));
    assert.equal(saved.orders.length, 1);
    assert.equal(saved.orders[0].total, 15.98);
    assert.equal(saved.orders[0].store, 'Lucca 2');
    assert.equal(saved.orders[0].payment, 'cash-demo');
    assert.deepEqual(saved.cart, {});
    for (const width of [360, 430]) {
      await page.setViewportSize({ width, height: 844 });
      await page.screenshot({ path: `test-results/orders-${width}.png`, fullPage: true });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    }
    await page.goto('http://localhost:8081/product/missing');
    await page.getByText('Prodotto non trovato.', { exact: true }).waitFor();
    await page.goto('http://localhost:8081/checkout');
    await page.getByText('Il carrello è vuoto.', { exact: true }).waitFor();
    await page.goto('http://localhost:8081/profile');
    await page.getByRole('radio', { name: 'Lucca 2', exact: true }).waitFor();
    assert.equal(await page.getByRole('radio', { name: 'Lucca 2', exact: true }).getAttribute('aria-checked'), 'true');
    await page.goto('http://localhost:8081/product/contenitori-cucina');
    for (let i = 1; i < 7; i++) await page.getByLabel('Aumenta quantità', { exact: true }).click();
    await page.getByText('Aggiungi al carrello', { exact: true }).click();
    await page.getByText('Spedizione gratuita raggiunta!', { exact: true }).waitFor();
    await page.getByText('Vai al checkout', { exact: true }).click();
    for (const name of [/Consegna a domicilio/, /Punto di ritiro/, /Ritiro in negozio/])
      assert.match(await page.getByRole('radio', { name }).innerText(), /Gratis/);
    await page.getByRole('radio', { name: /Punto di ritiro/ }).click();
    await page.getByText('Punto di ritiro dimostrativo: nessun locker reale prenotato.').waitFor();
    await page.getByRole('radio', { name: /Consegna a domicilio/ }).click();
    await page.getByPlaceholder('Nome e cognome').fill('Test demo');
    await page.getByPlaceholder('Indirizzo', { exact: true }).fill('Indirizzo di prova');
    await page.getByPlaceholder('CAP', { exact: true }).fill('00000');
    await page.getByPlaceholder('Città', { exact: true }).fill('Città demo');
    await page.getByText('Conferma ordine demo', { exact: true }).click();
    await page.getByText('Vedi il mio ordine', { exact: true }).waitFor();
    await page.goto('http://localhost:8081/product/detergente-lavatrice');
    for (let i = 1; i < 5; i++) await page.getByLabel('Aumenta quantità', { exact: true }).click();
    await page.getByText('Aggiungi al carrello', { exact: true }).click();
    await page.getByText('Vai al checkout', { exact: true }).click();
    assert.match(await page.getByRole('radio', { name: /Consegna a domicilio/ }).innerText(), /12,90/);
    assert.match(await page.getByRole('radio', { name: /Punto di ritiro/ }).innerText(), /9,90/);
    await page.getByText('Oltre 10 kg: tariffa provvisoria demo.', { exact: true }).waitFor();
    await page.goto('http://localhost:8081/cart');
    await page.getByText('Rimuovi', { exact: true }).click();
    await page.getByText('Il carrello è vuoto', { exact: true }).waitFor();
    if (process.argv.includes('--visual')) {
      for (const width of [360, 390, 430]) {
        await page.setViewportSize({ width, height: 844 });
        for (const [route, title, name] of [
          ['/', 'Ogni spazio, una cura.', 'home'],
          ['/catalog', 'Tutto quello che fa casa.', 'catalog'],
          ['/product/contenitori-cucina', 'Scegli ciò che ti serve', 'product'],
          ['/profile', 'Il tuo spazio', 'profile'],
          ['/orders', 'I miei ordini', 'orders'],
        ]) {
          await page.goto('http://localhost:8081' + route);
          await page.getByText(title, { exact: true }).waitFor();
          await page.waitForFunction(() => [...document.images].every((image) => image.complete && image.naturalWidth > 0));
          await page.screenshot({ path: `test-results/app-${name}-${width}.png` });
          assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        }
        await page.goto('http://localhost:8081/product/contenitori-cucina');
        await page.getByText('Aggiungi al carrello', { exact: true }).click();
        await page.getByText('Vai al checkout', { exact: true }).waitFor();
        await page.screenshot({ path: `test-results/app-cart-${width}.png` });
        await page.getByText('Vai al checkout', { exact: true }).click();
        await page.getByRole('radio', { name: /Ritiro in negozio/ }).click();
        await page.screenshot({ path: `test-results/app-checkout-${width}.png` });
      }
      // Expo Go connection QR, using the LAN address advertised by the running server.
      const connectionHost = process.argv.find((arg) => arg.startsWith('--expo-host='))?.slice('--expo-host='.length);
      const manifest = await (await fetch('http://' + (connectionHost || 'localhost:8081'), {
        headers: { 'expo-platform': 'android', accept: 'application/expo+json' },
      })).json();
      const host = manifest.extra?.expoGo?.debuggerHost || manifest.extra?.expoClient?.hostUri;
      if (host && !/^(localhost|127\.)/.test(host)) {
        const url = 'exp://' + host;
        const { toQR } = require('toqr');
        const qr = toQR(url);
        const extent = Math.sqrt(qr.length);
        let cells = '';
        for (let y = 0; y < extent; y++) for (let x = 0; x < extent; x++)
          if (qr[y * extent + x]) cells += `<rect x="${x + 4}" y="${y + 4}" width="1" height="1"/>`;
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${extent + 8} ${extent + 8}" width="320" height="320"><rect width="100%" height="100%" fill="white"/><g fill="#214B27">${cells}</g></svg>`;
        fs.writeFileSync('test-results/expo-go.svg', svg);
        fs.writeFileSync('test-results/expo-go-url.txt', url);
        const qrPage = await browser.newPage({ viewport: { width: 320, height: 320 } });
        await qrPage.setContent('<body style="margin:0">' + svg + '</body>');
        await qrPage.screenshot({ path: 'test-results/expo-go.png' });
        console.log('Expo Go: ' + url);
      }
    }
    assert.deepEqual(errors, []);
    console.log('PASS: browse, search, product, cart editing/removal/reload, checkout validation, store persistence, mock payment, confirmation, orders/reload, free shipping, >10kg rates, all fulfilment choices, home delivery order, empty routes, mobile widths; no page errors.');
  } catch (error) {
    await page.screenshot({ path: 'test-results/failure.png', fullPage: true });
    console.error((await page.locator('body').innerText()).slice(0, 5000));
    throw error;
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });


