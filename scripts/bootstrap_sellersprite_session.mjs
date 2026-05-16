import fs from 'node:fs/promises';

const EXTENSION_ID = 'lnbmbgocenenhhhdojdielgnmeflbnfb';
const EXTENSION_URL = `https://chromewebstore.google.com/detail/${EXTENSION_ID}`;
const SELLERSPRITE_URL = 'https://www.sellersprite.com/';
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
    tab = await getJson('http://127.0.0.1:9222/json/new?' + encodeURIComponent('https://www.amazon.com/ref=nav_logo'), { method: 'PUT' });
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
  const response = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, timeout);
  if (response.result?.exceptionDetails) {
    throw new Error(response.result.exceptionDetails.exception?.description || response.result.exceptionDetails.text);
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
  await send('Page.navigate', { url: EXTENSION_URL }, 12000).catch(() => {});
}

async function openSellerSprite(send) {
  await send('Page.navigate', { url: SELLERSPRITE_URL }, 12000).catch(() => {});
  await new Promise((resolve) => setTimeout(resolve, 5000));
}

async function loginSellerSprite(send) {
  const expression = `(() => {
    const inputs = Array.from(document.querySelectorAll('input'));
    const accountInput = inputs.find((el) => /mail|user|phone|account|邮箱|账号|手机/i.test(el.placeholder || '') || /user|account/i.test(el.name || ''));
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
    const btn = Array.from(document.querySelectorAll('button, a, div')).find((el) => /登录|login|sign in/i.test((el.innerText || '').trim()));
    if (btn) {
      btn.click();
      return JSON.stringify({ accountFilled: !!accountInput, passwordFilled: !!passwordInput, clicked: true });
    }
    return JSON.stringify({ accountFilled: !!accountInput, passwordFilled: !!passwordInput, clicked: false });
  })()`;
  return JSON.parse(await evalPage(send, expression, 20000));
}

async function checkSellerSpriteLogin(send) {
  const expression = `(() => JSON.stringify({ body: document.body.innerText.slice(0, 4000), url: location.href, title: document.title }))()`;
  const page = JSON.parse(await evalPage(send, expression, 20000));
  const body = page.body || '';
  return {
    loggedIn: body.includes('dhjgj1802') || /子账号|退出|后台|dhjgj1802/i.test(body),
    loginVisible: /登录|login|sign in/i.test(body),
    page
  };
}

const status = {
  extensionInstalled: false,
  extensionPageOpened: false,
  sellerSpriteLoginAttempted: false,
  sellerSpriteLoggedIn: false,
  notes: []
};

const { ws, send } = await connectToTab();
try {
  status.extensionInstalled = await hasExtension();
  if (!status.extensionInstalled) {
    await openExtensionPage(send);
    status.extensionPageOpened = true;
    status.notes.push('Opened Chrome Web Store listing for SellerSprite. Final install confirmation may still require browser interaction.');
  }
  await openSellerSprite(send);
  const before = await checkSellerSpriteLogin(send);
  if (!before.loggedIn) {
    status.sellerSpriteLoginAttempted = true;
    const loginResult = await loginSellerSprite(send);
    status.notes.push(`Login form fill result: ${JSON.stringify(loginResult)}`);
    await new Promise((resolve) => setTimeout(resolve, 6000));
  }
  const after = await checkSellerSpriteLogin(send);
  status.sellerSpriteLoggedIn = after.loggedIn;
  if (!after.loggedIn) {
    status.notes.push('SellerSprite login could not be verified from page text. Manual check may still be needed.');
  }
  await fs.writeFile('sellersprite_bootstrap_status.json', JSON.stringify(status, null, 2), 'utf8');
  console.log(JSON.stringify(status, null, 2));
} finally {
  ws.close();
}
