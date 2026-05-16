import fs from 'node:fs/promises';

const EXTENSION_ID = 'lnbmbgocenenhhhdojdielgnmeflbnfb';
const EXTENSION_URL =
  'https://chromewebstore.google.com/detail/%E5%8D%96%E5%AE%B6%E7%B2%BE%E7%81%B5-%E4%BA%9A%E9%A9%AC%E9%80%8A%E5%85%B3%E9%94%AE%E8%AF%8D%E4%BC%98%E5%8C%96%E5%A4%A7%E6%95%B0%E6%8D%AE%E9%80%89%E5%93%81%E4%B8%93%E5%AE%B6/lnbmbgocenenhhhdojdielgnmeflbnfb';
const SELLERSPRITE_URL = 'https://www.sellersprite.com/';
const AMAZON_URL = 'https://www.amazon.com/ref=nav_logo';
const ACCOUNT = 'dhjgj1802';
const PASSWORD = '688185';

async function getJson(url, options) {
  const res = await fetch(url, options);
  if (!res.ok) throw new Error(`Request failed: ${url}`);
  return res.json();
}

async function connectToTab(urlHint = 'amazon.com') {
  const tabs = await getJson('http://127.0.0.1:9222/json');
  let tab = tabs.find((item) => item.type === 'page' && String(item.url).includes(urlHint));
  if (!tab) tab = tabs.find((item) => item.type === 'page');
  if (!tab) {
    tab = await getJson('http://127.0.0.1:9222/json/new?' + encodeURIComponent(AMAZON_URL), {
      method: 'PUT'
    });
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

async function hasExtension() {
  const version = await getJson('http://127.0.0.1:9222/json/version');
  const ws = new WebSocket(version.webSocketDebuggerUrl);
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
  const send = (method, params = {}, timeout = 15000) =>
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
  const result = await send('Target.getTargets');
  ws.close();
  return result.result.targetInfos.some((target) => String(target.url).includes(EXTENSION_ID));
}

async function openExtensionPage(send) {
  await send('Page.navigate', { url: EXTENSION_URL }, 20000).catch(() => {});
  await new Promise((resolve) => setTimeout(resolve, 5000));
}

async function openSellerSprite(send) {
  await send('Page.navigate', { url: SELLERSPRITE_URL }, 15000).catch(() => {});
  await new Promise((resolve) => setTimeout(resolve, 5000));
}

async function loginSellerSprite(send) {
  const expression = `(() => {
    const inputs = Array.from(document.querySelectorAll('input'));
    const accountInput = inputs.find((el) =>
      /mail|user|phone|account|邮箱|账号|手机/i.test(el.placeholder || '') ||
      /user|account|phone|email/i.test(el.name || '')
    );
    const passwordInput = inputs.find((el) => (el.type || '').toLowerCase() === 'password');
    if (accountInput) {
      accountInput.focus();
      accountInput.value = ${JSON.stringify(ACCOUNT)};
      accountInput.dispatchEvent(new Event('input', { bubbles: true }));
      accountInput.dispatchEvent(new Event('change', { bubbles: true }));
    }
    if (passwordInput) {
      passwordInput.focus();
      passwordInput.value = ${JSON.stringify(PASSWORD)};
      passwordInput.dispatchEvent(new Event('input', { bubbles: true }));
      passwordInput.dispatchEvent(new Event('change', { bubbles: true }));
    }
    const btn = Array.from(document.querySelectorAll('button, a, div')).find((el) =>
      /登录|login|sign in/i.test((el.innerText || '').trim())
    );
    if (btn) {
      btn.click();
      return JSON.stringify({
        accountFilled: !!accountInput,
        passwordFilled: !!passwordInput,
        clicked: true
      });
    }
    return JSON.stringify({
      accountFilled: !!accountInput,
      passwordFilled: !!passwordInput,
      clicked: false
    });
  })()`;
  return JSON.parse(await evalPage(send, expression, 20000));
}

async function checkSellerSpriteLogin(send) {
  const expression = `(() => JSON.stringify({
    body: document.body.innerText.slice(0, 4000),
    url: location.href,
    title: document.title
  }))()`;
  const page = JSON.parse(await evalPage(send, expression, 20000));
  const body = page.body || '';
  return {
    loggedIn: body.includes(ACCOUNT) || /退出|后台|账号设置|会员中心|dhjgj1802/i.test(body),
    loginVisible: /登录|login|sign in/i.test(body),
    page
  };
}

async function openAmazon(send, url = AMAZON_URL) {
  await send('Page.navigate', { url }, 15000).catch(() => {});
  await new Promise((resolve) => setTimeout(resolve, 8000));
}

async function reloadAmazonForInjection(send) {
  await send('Page.reload', { ignoreCache: false }, 15000).catch(() => {});
  await new Promise((resolve) => setTimeout(resolve, 12000));
}

async function detectAmazonSellerSprite(send) {
  const expression = `(() => {
    const body = document.body.innerText || '';
    const html = document.documentElement.outerHTML || '';
    const markers = [
      '卖家精灵',
      '关键词反查',
      '加入产品库',
      '流量词',
      '近30天销量',
      'FBA费用',
      '上架时间'
    ];
    const foundMarkers = markers.filter((item) => body.includes(item) || html.includes(item));
    const loginWarning = /请先登录亚马逊买家账号|登录亚马逊买家账号|buyer account/i.test(body);
    return JSON.stringify({
      url: location.href,
      title: document.title,
      foundMarkers,
      loaded: foundMarkers.length > 0,
      loginWarning
    });
  })()`;
  return JSON.parse(await evalPage(send, expression, 20000));
}

const status = {
  extensionInstalled: false,
  extensionPageOpened: false,
  sellerSpriteLoginAttempted: false,
  sellerSpriteLoggedIn: false,
  amazonSellerSpriteDetected: false,
  amazonBuyerLoginWarning: false,
  notes: []
};

const { ws, send } = await connectToTab();
try {
  status.extensionInstalled = await hasExtension();
  if (!status.extensionInstalled) {
    await openExtensionPage(send);
    status.extensionPageOpened = true;
    status.notes.push(
      'Opened the SellerSprite Chrome Web Store page. Click "Add to Chrome" and accept the browser confirmation, then rerun the bootstrap helper.'
    );
    await fs.writeFile('sellersprite_bootstrap_status.json', JSON.stringify(status, null, 2), 'utf8');
    console.log(JSON.stringify(status, null, 2));
    process.exit(0);
  }

  await openSellerSprite(send);
  const before = await checkSellerSpriteLogin(send);
  if (!before.loggedIn) {
    status.sellerSpriteLoginAttempted = true;
    const loginResult = await loginSellerSprite(send);
    status.notes.push(`Login form fill result: ${JSON.stringify(loginResult)}`);
    await new Promise((resolve) => setTimeout(resolve, 7000));
  }

  const after = await checkSellerSpriteLogin(send);
  status.sellerSpriteLoggedIn = after.loggedIn;
  if (!after.loggedIn) {
    status.notes.push(
      'SellerSprite login could not be verified from page text. Open sellersprite.com once in this same Chrome profile and confirm you can see the signed-in account.'
    );
  }

  await openAmazon(send);
  let amazonCheck = await detectAmazonSellerSprite(send);
  if (!amazonCheck.loaded) {
    status.notes.push(
      'SellerSprite markers were not visible on Amazon after the first load. Reloading Amazon once to force content-script injection.'
    );
    await reloadAmazonForInjection(send);
    amazonCheck = await detectAmazonSellerSprite(send);
  }

  status.amazonSellerSpriteDetected = amazonCheck.loaded;
  status.amazonBuyerLoginWarning = amazonCheck.loginWarning;
  if (!amazonCheck.loaded) {
    status.notes.push(
      'SellerSprite still did not appear on Amazon. Confirm the extension is enabled for this Chrome profile and reload the Amazon page manually once.'
    );
  }
  if (amazonCheck.loginWarning) {
    status.notes.push(
      'SellerSprite is installed, but the plugin is warning that the Amazon buyer account is not logged in. Keep the Amazon page signed in for full plugin data.'
    );
  }

  await fs.writeFile('sellersprite_bootstrap_status.json', JSON.stringify(status, null, 2), 'utf8');
  console.log(JSON.stringify(status, null, 2));
} finally {
  ws.close();
}
