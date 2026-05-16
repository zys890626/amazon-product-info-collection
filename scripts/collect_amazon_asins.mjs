import fs from 'node:fs/promises';

function parseArgs(argv) {
  const out = {
    asins: [],
    file: null,
    out: 'amazon_asin_results.json'
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--file') {
      out.file = argv[++i];
    } else if (arg === '--out') {
      out.out = argv[++i];
    } else {
      out.asins.push(arg.trim());
    }
  }
  return out;
}

async function loadAsins(args) {
  const values = new Set(args.asins.filter(Boolean));
  if (args.file) {
    const text = await fs.readFile(args.file, 'utf8');
    for (const line of text.split(/\r?\n/)) {
      const value = line.trim();
      if (value) values.add(value);
    }
  }
  return Array.from(values);
}

async function ensureDebugSession() {
  const response = await fetch('http://127.0.0.1:9222/json');
  if (!response.ok) {
    throw new Error('Chrome remote debugging is unavailable on port 9222');
  }
  const tabs = await response.json();
  let tab = tabs.find((item) => item.type === 'page' && String(item.url).includes('amazon.com'));
  if (!tab) {
    const create = await fetch(
      'http://127.0.0.1:9222/json/new?' + encodeURIComponent('https://www.amazon.com/ref=nav_logo'),
      { method: 'PUT' }
    );
    tab = await create.json();
  }
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  let id = 0;
  const pending = new Map();
  ws.addEventListener('message', (event) => {
    const msg = JSON.parse(String(event.data));
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id).resolve(msg);
      pending.delete(msg.id);
    }
  });
  await new Promise((resolve) => ws.addEventListener('open', resolve, { once: true }));
  const send = (method, params = {}, timeout = 45000) =>
    new Promise((resolve, reject) => {
      const callId = ++id;
      pending.set(callId, { resolve, reject });
      ws.send(JSON.stringify({ id: callId, method, params }));
      setTimeout(() => {
        if (pending.has(callId)) {
          pending.delete(callId);
          reject(new Error(`timeout ${method}`));
        }
      }, timeout);
    });
  return { ws, send };
}

function parseNumber(value) {
  if (!value) return null;
  const match = String(value).replace(/,/g, '').match(/[0-9]+(?:\.[0-9]+)?/);
  return match ? Number(match[0]) : null;
}

function extractSellerSprite(body, asin) {
  const idx = body.indexOf(asin);
  const around = idx >= 0 ? body.slice(Math.max(0, idx - 1400), idx + 3200) : body.slice(0, 4200);
  const pick = (patterns) => {
    for (const pattern of patterns) {
      const match = around.match(pattern);
      if (match) return match[1]?.trim();
    }
    return null;
  };
  const inventoryMatch = around.match(/剩余库存\s*([0-9,]+)/);
  return {
    sellerSpriteLoaded:
      /卖家精灵|数据来源：卖家精灵|近30天销量|销量\(父\)|销量\(父体\)|FBA费用|上架时间|关键词反查/.test(
        around
      ),
    sellerSpriteMasked:
      /近30天销量[\s\S]{0,40}\*{2,}|销量\(父(?:体)?\)[\s\S]{0,40}\*{2,}|Listing销售额[\s\S]{0,40}\*{2,}|FBA费用[\s\S]{0,40}\*{2,}/.test(
        around
      ),
    snippet: around,
    ssSalesParent: parseNumber(
      pick([/近30天销量(?:\(父体\)|\(父\))?[:：]?\s*([0-9,]+)/, /销量\(父\)[:：]?\s*([0-9,]+)/])
    ),
    ssRevenue: parseNumber(
      pick([/Listing销售额[:：]?\s*\$?([0-9,.]+)/, /销售额[:：]?\s*\$?([0-9,.]+)/])
    ),
    ssFbaFee: parseNumber(pick([/FBA费用[:：]?\s*\$?([0-9.]+)/])),
    ssListedDate: pick([/上架时间[:：]?\s*(\d{4}-\d{2}-\d{2})/]),
    ssBrand: pick([/品牌[:：]?\s*([^\s]+)/]),
    ssSeller: pick([/卖家[:：]?\s*([^\s]+)/]),
    ssInventory: inventoryMatch ? parseNumber(inventoryMatch[1]) : null
  };
}

async function evalPage(send, expression, timeout = 45000) {
  const response = await send(
    'Runtime.evaluate',
    { expression, returnByValue: true, awaitPromise: true },
    timeout
  );
  if (response.result?.exceptionDetails) {
    throw new Error(
      response.result.exceptionDetails.exception?.description || response.result.exceptionDetails.text
    );
  }
  return response.result.result.value;
}

async function collectOne(send, asin) {
  const url = `https://www.amazon.com/dp/${asin}`;
  await send('Page.navigate', { url }, 12000).catch(() => {});
  await new Promise((resolve) => setTimeout(resolve, 15000));
  const raw = await evalPage(
    send,
    `(() => {
      const text = (sel) => document.querySelector(sel)?.innerText?.trim() || '';
      const attr = (sel, name) => document.querySelector(sel)?.getAttribute(name) || '';
      const allText = (sel) => Array.from(document.querySelectorAll(sel)).map(e => e.innerText.trim()).filter(Boolean);
      const body = document.body.innerText || '';
      const bullets = allText('#feature-bullets li, #feature-bullets .a-list-item')
        .map(s => s.replace(/\\s+/g, ' '))
        .filter(s => s && !/Make sure this fits/i.test(s))
        .slice(0, 12);
      const imageUrls = Array.from(document.querySelectorAll('#altImages img, #landingImage, img.a-dynamic-image'))
        .map(img => img.src || img.getAttribute('data-old-hires') || '')
        .filter(Boolean)
        .slice(0, 12);
      const detailsText = [
        text('#detailBullets_feature_div'),
        text('#productDetails_detailBullets_sections1'),
        text('#productDetails_techSpec_section_1'),
        text('#prodDetails')
      ].filter(Boolean).join('\\n');
      const sellerSpritePanelText = Array.from(document.querySelectorAll('body *'))
        .map((el) => el.innerText?.trim() || '')
        .filter((value) => value && /卖家精灵|关键词反查|加入产品库|近30天销量|Listing销售额|FBA费用|上架时间|\*{2,}/.test(value))
        .slice(0, 30)
        .join('\\n');
      return JSON.stringify({
        finalUrl: location.href,
        pageTitle: document.title,
        title: text('#productTitle'),
        brandLine: text('#bylineInfo'),
        priceText: text('#corePrice_feature_div .a-price .a-offscreen') || text('.a-price .a-offscreen'),
        ratingText: attr('#acrPopover', 'title') || text('#acrPopover'),
        reviewText: text('#acrCustomerReviewText'),
        availability: text('#availability'),
        buybox: text('#tabular-buybox') || text('#merchant-info'),
        seller: text('#sellerProfileTriggerId'),
        categoryPath: allText('#wayfinding-breadcrumbs_feature_div a').join(' > '),
        bullets,
        imageUrls,
        productDetailsText: detailsText.replace(/\\s+/g, ' ').slice(0, 4000),
        sellerSpritePanelText,
        bodyText: body.slice(0, 20000)
      });
    })()`,
    45000
  );
  const page = JSON.parse(raw);
  const ss = extractSellerSprite(`${page.bodyText || ''}\n${page.sellerSpritePanelText || ''}`, asin);
  return {
    asin,
    url,
    finalUrl: page.finalUrl,
    status: page.title ? 'OK' : 'NO_TITLE',
    title: page.title || page.pageTitle,
    brand:
      ss.ssBrand ||
      (page.brandLine || '')
        .replace(/^Brand:\s*/i, '')
        .replace(/^Visit the\s+/i, '')
        .replace(/\s+Store$/i, ''),
    seller: ss.ssSeller || page.seller || page.buybox,
    price: parseNumber(page.priceText),
    rating: parseNumber(page.ratingText),
    reviewCount: parseNumber(page.reviewText),
    availability: page.availability,
    categoryPath: page.categoryPath,
    bullets: page.bullets,
    imageUrls: page.imageUrls,
    productDetailsText: page.productDetailsText,
    ssSalesParent: ss.ssSalesParent,
    ssRevenue: ss.ssRevenue,
    ssFbaFee: ss.ssFbaFee,
    ssListedDate: ss.ssListedDate,
    ssInventory: ss.ssInventory,
    sellerSpriteLoaded: ss.sellerSpriteLoaded,
    sellerSpriteMasked: ss.sellerSpriteMasked,
    sellerSpriteSnippet: ss.snippet.slice(0, 1500)
  };
}

const args = parseArgs(process.argv.slice(2));
const asins = await loadAsins(args);
if (!asins.length) {
  throw new Error('Provide ASINs as arguments or with --file');
}

const { ws, send } = await ensureDebugSession();
const results = [];
for (const asin of asins) {
  try {
    const record = await collectOne(send, asin);
    results.push(record);
    console.log(`${asin} ${record.status} ${record.title?.slice(0, 80) || ''}`);
  } catch (error) {
    results.push({ asin, status: 'ERROR', error: error.message });
    console.log(`${asin} ERROR ${error.message}`);
  }
  await fs.writeFile(
    args.out,
    JSON.stringify({ createdAt: new Date().toISOString(), total: asins.length, results }, null, 2),
    'utf8'
  );
}
ws.close();
