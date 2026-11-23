const setInput = (el, v) => {
  Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(el, v);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
};
const byPlaceholder = (p) => [...document.querySelectorAll('input')].find((i) => i.placeholder === p);
const byText = (sel, t) => [...document.querySelectorAll(sel)].find((el) => el.textContent.trim().includes(t));
const waitFor = (fn, ms = 6000) =>
  new Promise((resolve, reject) => {
    const t0 = Date.now();
    const iv = setInterval(() => {
      const r = fn();
      if (r) { clearInterval(iv); resolve(r); }
      else if (Date.now() - t0 > ms) { clearInterval(iv); reject(new Error('timeout')); }
    }, 200);
  });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    switch (msg.type) {
      case 'sendCode': {
        if (byText('a', '秒后重试')) throw new Error('验证码已发送，请等待倒计时结束');
        const phone = await waitFor(() => byPlaceholder('请输入您的手机号')).catch(() => {
          throw new Error('未找到手机号输入框（请确认已在登录页）');
        });
        setInput(phone, msg.phone);
        await sleep(600);
        const a = await waitFor(() => byText('a', '发送验证码')).catch(() => {
          throw new Error('未找到发送验证码按钮');
        });
        a.click();
        return { ok: true };
      }
      case 'login': {
        const code = await waitFor(() => byPlaceholder('请输入6位验证码')).catch(() => {
          throw new Error('未找到验证码输入框（请确认已在登录页）');
        });
        setInput(code, msg.code);
        await sleep(600);
        const btn = await waitFor(() => byText('button', '登录/注册')).catch(() => {
          throw new Error('未找到登录按钮');
        });
        if (btn.disabled) throw new Error('登录按钮不可用：请先发送验证码并填写');
        btn.click();
        return { ok: true };
      }
      case 'getTokens': {
        const out = {};
        for (const k of Object.keys(sessionStorage)) {
          if (/token/i.test(k)) out[k] = sessionStorage.getItem(k);
        }
        return out;
      }
    }
  })()
    .then(sendResponse)
    .catch((e) => sendResponse({ ok: false, err: e.message }));
  return true;
});