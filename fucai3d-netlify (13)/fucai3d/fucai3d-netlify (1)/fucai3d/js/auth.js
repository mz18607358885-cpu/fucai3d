/**
 * 密码认证
 * - 主链接密码: 918918
 * - 副链接密码: 112233
 * 校验通过后写入 sessionStorage,刷新页面或切换 tab 不需要重输
 */
window.FucaiAuth = (function () {
  const MAIN_PWD = '918918';
  const SUB_PWD  = '112233';
  const STORE_KEY = 'fucai3d_auth';

  function check() {
    const saved = sessionStorage.getItem(STORE_KEY);
    if (saved) {
      try {
        const o = JSON.parse(saved);
        if (o && (o.role === 'main' || o.role === 'sub')) return o;
      } catch (e) {}
    }
    return null;
  }

  /** 登录:密码 + 期望角色 (main / sub) */
  function login(password, role) {
    const expect = role === 'main' ? MAIN_PWD : SUB_PWD;
    if (password !== expect) return { ok: false, msg: '密码错误,请核对后重输' };
    const data = { role, ts: Date.now() };
    sessionStorage.setItem(STORE_KEY, JSON.stringify(data));
    return { ok: true, data };
  }

  function logout() {
    sessionStorage.removeItem(STORE_KEY);
  }

  function makeLoginScreen(role) {
    return `
      <div class="login-mask">
        <div class="login-card">
          <div class="login-title">🔒 福彩3D杀号系统专业版</div>
          <div class="login-sub">请输入访问密码</div>
          <input id="pwdInput" type="password" class="login-input"
                 placeholder="输入 6 位数字密码" inputmode="numeric" maxlength="6" autocomplete="off" />
          <div id="pwdErr" class="login-err"></div>
          <button id="pwdBtn" class="login-btn">进入系统</button>
          <div class="login-tip">本系统只提供参考,不构成投资建议</div>
        </div>
      </div>
    `;
  }

  function bindLogin(role, onSuccess) {
    const btn = document.getElementById('pwdBtn');
    const input = document.getElementById('pwdInput');
    const err = document.getElementById('pwdErr');
    const submit = () => {
      const v = input.value.trim();
      const r = login(v, role);
      if (!r.ok) { err.textContent = r.msg; return; }
      const mask = document.querySelector('.login-mask');
      if (mask) mask.remove();
      onSuccess && onSuccess(r.data);
    };
    btn.addEventListener('click', submit);
    input.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });
    setTimeout(() => input.focus(), 50);
  }

  return { check, login, logout, makeLoginScreen, bindLogin, MAIN_PWD, SUB_PWD };
})();
