// Firefox 版：全部使用 browser.* 的 Promise 接口（Firefox 78+）
const $ = (id) => document.getElementById(id);
const DEFAULTS = { olUrl: '', olUser: '', olPass: '', olMount: '/联通云盘' };
let settings = { ...DEFAULTS };
let last = {};

async function ensureTab() {
  let [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (tab && /panservice\.mail\.wo\.cn\/h5\/wocloud_ai/.test(tab.url || '')) return tab;
  tab = await browser.tabs.create({ url: 'https://panservice.mail.wo.cn/h5/wocloud_ai/' });
  await new Promise((r) => {
    browser.tabs.onUpdated.addListener(function l(id, info) {
      if (id === tab.id && info.status === 'complete') {
        browser.tabs.onUpdated.removeListener(l);
        r();
      }
    });
  });
  return tab;
}

async function ask(msg) {
  const tab = await ensureTab();
  try {
    return (await browser.tabs.sendMessage(tab.id, msg)) || { ok: false, err: '无响应' };
  } catch (e) {
    return { ok: false, err: '页面未就绪，请稍后重试' };
  }
}

function status(s, err) {
  $('status').textContent = err ? s + '：' + err : s;
}

async function extract() {
  const t = await ask({ type: 'getTokens' });
  if (!t || !t.token) {
    $('access').value = '';
    $('refresh').value = '';
    return null;
  }
  last = { access_token: t.token, refresh_token: t.refreshToken || '' };
  $('access').value = last.access_token;
  $('refresh').value = last.refresh_token;
  return last;
}

function copy(text, msg) {
  navigator.clipboard.writeText(text).then(() => status(msg));
}

function saveSettings() {
  settings = {
    olUrl: $('olUrl').value.trim().replace(/\/+$/, ''),
    olUser: $('olUser').value.trim(),
    olPass: $('olPass').value,
    olMount: $('olMount').value.trim() || '/联通云盘',
  };
  browser.storage.local.set(settings);
}

async function loadSettings() {
  settings = { ...DEFAULTS, ...(await browser.storage.local.get(DEFAULTS)) };
  ['olUrl', 'olUser', 'olPass', 'olMount'].forEach((k) => ($(k).value = settings[k] || ''));
}

async function ensureNetPerm() {
  const p = await browser.permissions.getAll();
  if (p.origins.some((o) => o.includes('*'))) return true;
  return browser.permissions.request({ origins: ['http://*/*', 'https://*/*'] });
}

// Firefox 要求权限申请必须在用户手势内发起，所以放在点击事件第一行（弹窗里填了地址才申请）。
function grantNow() {
  return $('olUrl').value.trim() ? ensureNetPerm() : Promise.resolve(true);
}

async function olApi(path, { method = 'GET', body, token } = {}) {
  if (!settings.olUrl) throw new Error('请先填写 OpenList 地址');
  const r = await fetch(settings.olUrl + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: token } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (j.code !== 200) throw new Error(j.message || 'HTTP ' + r.status);
  return j.data;
}

async function writeToOpenlist(t, permP) {
  if (!(await (permP || ensureNetPerm()))) throw new Error('未授权访问 OpenList');
  const token = await olApi('/api/auth/login', {
    method: 'POST',
    body: { username: settings.olUser, password: settings.olPass },
  }).then((d) => d.token);
  const addition = JSON.stringify({
    root_folder_id: '0',
    family_id: '',
    access_token: t.access_token,
    refresh_token: t.refresh_token,
  });
  const list = await olApi('/api/admin/storage/list?page=1&per_page=100', { token });
  const items = Array.isArray(list) ? list : list.content || [];
  const mp = settings.olMount.replace(/\/+$/, '') || '/';
  const found = items.find(
    (s) => String(s.mount_path || '').replace(/\/+$/, '').toLowerCase() === mp.toLowerCase()
  );
  if (found) {
    if (
      found.driver !== 'WoPan' &&
      !confirm('已存在存储 ' + mp + '（驱动 ' + found.driver + '），改为 WoPan 将覆盖其配置，继续？')
    ) {
      throw new Error('已取消，未修改 ' + mp);
    }
    await olApi('/api/admin/storage/update', {
      method: 'POST',
      token,
      body: { ...found, driver: 'WoPan', addition, status: 'work', disabled: false },
    });
    return '已更新 OpenList 存储 ' + mp;
  }
  await olApi('/api/admin/storage/create', {
    method: 'POST',
    token,
    body: {
      mount_path: mp,
      driver: 'WoPan',
      order: 0,
      remark: '联通云盘',
      cache_expiration: 30,
      status: 'work',
      addition,
    },
  });
  return '已写入 OpenList：' + mp;
}

async function writeIfConfigured(t, permP) {
  if (!settings.olUrl || !settings.olUser) return 'token 已提取（未填 OpenList 设置，跳过写入）';
  try {
    return await writeToOpenlist(t, permP);
  } catch (e) {
    return 'token 已提取，但写入 OpenList 失败：' + e.message;
  }
}

$('send').onclick = async () => {
  const phone = $('phone').value.trim();
  if (!/^1\d{10}$/.test(phone)) return status('请输入正确的手机号');
  $('send').disabled = true;
  const r = await ask({ type: 'sendCode', phone });
  $('send').disabled = false;
  status(r.ok ? '验证码已发送，请查收短信' : '失败', r.err);
};

$('login').onclick = async () => {
  const permP = grantNow();
  const code = $('code').value.trim();
  if (!/^\d{6}$/.test(code)) return status('请输入6位验证码');
  $('login').disabled = true;
  const r = await ask({ type: 'login', code });
  if (!r.ok) {
    $('login').disabled = false;
    return status('登录失败', r.err);
  }
  status('登录中，等待跳转...');
  for (let i = 0; i < 15; i++) {
    await new Promise((res) => setTimeout(res, 1000));
    const t = await extract();
    if (t) {
      $('login').disabled = false;
      return status(await writeIfConfigured(t, permP));
    }
  }
  $('login').disabled = false;
  status('未检测到 token，请点击「重新提取」');
};

$('get').onclick = async () => {
  const permP = grantNow();
  const t = await extract();
  status(t ? await writeIfConfigured(t, permP) : '未找到 token（可能未登录）');
};

$('saveOl').onclick = () => {
  saveSettings();
  status('OpenList 设置已保存');
};

$('writeOl').onclick = async () => {
  const permP = grantNow();
  saveSettings();
  let t = last;
  if (!t.access_token) t = await extract();
  if (!t) return status('未提取到 token，请先登录联通云盘');
  try {
    status(await writeToOpenlist(t, permP));
  } catch (e) {
    status('写入失败', e.message);
  }
};

document.querySelectorAll('button.copy').forEach((b) => {
  b.onclick = () =>
    copy($(b.dataset.copy).value, '已复制 ' + (b.dataset.copy === 'access' ? '访问令牌' : '刷新令牌'));
});

loadSettings().then(() =>
  extract().then((t) => {
    if (t) status('已提取上次登录的 token');
  })
);
