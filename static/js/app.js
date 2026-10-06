/* 求职备考管理软件 V1.0 · 前端核心
   职责：API 封装、哈希路由、登录态管理、弹窗/轻提示、通用工具函数。
   各业务视图实现在 view_*.js 中，通过 window.Views 注册。 */
'use strict';

/* ================= API 客户端 ================= */
const API = {
  async request(method, path, body) {
    const opts = { method, headers: { 'Content-Type': 'application/json' } };
    if (body !== undefined) opts.body = JSON.stringify(body);
    const resp = await fetch(path, opts);
    let data = null;
    try { data = await resp.json(); } catch (e) { /* 非 JSON 响应 */ }
    if (resp.status === 401 && data && data.code === 'NOT_LOGGED_IN') {
      // 会话失效：回到登录页
      AppState.user = null;
      Router.go('login');
      throw new Error('登录已过期，请重新登录');
    }
    if (!resp.ok) {
      throw new Error((data && data.error) || ('请求失败(' + resp.status + ')'));
    }
    return data;
  },
  get(path)    { return this.request('GET', path); },
  post(path, b){ return this.request('POST', path, b); },
  put(path, b) { return this.request('PUT', path, b); },
  del(path)    { return this.request('DELETE', path); },
};

/* ================= 全局状态 ================= */
const AppState = {
  user: null,
  // 业务字典（与后端 models.py 保持一致）
  JOB_STAGES: ['待投递', '已投递', '笔试', '面试', 'Offer', '已拒绝'],
  PRACTICE_MODULES: ['图形推理', '逻辑判断', '数量分析', '资料分析', '言语理解', '常识判断'],
  MATERIAL_CATEGORIES: ['行测', '申论', '专业课', '面试', '简历', '其他'],
  MATERIAL_STATUS: ['未开始', '学习中', '已完成'],
  TODO_CATEGORIES: ['求职', '备考', '生活', '其他'],
  PRIORITIES: ['高', '中', '低'],
};

/* ================= 工具函数 ================= */
const Util = {
  // HTML 转义，防止 XSS
  esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  },
  // 日期格式化：YYYY-MM-DD → M月D日
  md(dateStr) {
    if (!dateStr) return '—';
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateStr);
    if (!m) return dateStr;
    return parseInt(m[2], 10) + '月' + parseInt(m[3], 10) + '日';
  },
  today() {
    const d = new Date();
    const p = n => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  },
  // 倒计时描述
  countdown(dateStr) {
    if (!dateStr) return null;
    const t = new Date(dateStr + 'T00:00:00');
    if (isNaN(t)) return null;
    const now = new Date(); now.setHours(0, 0, 0, 0);
    const diff = Math.round((t - now) / 86400000);
    if (diff < 0) return { text: '已过去 ' + (-diff) + ' 天', passed: true };
    if (diff === 0) return { text: '就是今天', urgent: true };
    return { text: '还剩 ' + diff + ' 天', urgent: diff <= 7 };
  },
  // 阶段徽标颜色映射
  stageBadge(stage) {
    const map = {
      '待投递': 'gray', '已投递': 'blue', '笔试': 'purple',
      '面试': 'orange', 'Offer': 'green', '已拒绝': 'red',
    };
    return '<span class="badge ' + (map[stage] || 'gray') + '">' +
           this.esc(stage) + '</span>';
  },
  priorityBadge(p) {
    const map = { '高': 'red', '中': 'orange', '低': 'gray' };
    return '<span class="badge ' + (map[p] || 'gray') + '">' +
           this.esc(p) + '优先级</span>';
  },
  statusBadge(s) {
    const map = { '未开始': 'gray', '学习中': 'blue', '已完成': 'green' };
    return '<span class="badge ' + (map[s] || 'gray') + '">' +
           this.esc(s) + '</span>';
  },
  // 百分比显示
  pct(v) { return (Math.round(v * 1000) / 10) + '%'; },
  // 星级显示
  stars(n) {
    n = Math.max(0, Math.min(5, parseInt(n, 10) || 0));
    return '<span class="stars">' + '★'.repeat(n) + '☆'.repeat(5 - n) + '</span>';
  },
  // 下拉选项生成
  options(list, selected) {
    return list.map(v =>
      '<option value="' + this.esc(v) + '"' +
      (v === selected ? ' selected' : '') + '>' + this.esc(v) + '</option>'
    ).join('');
  },
  // 防抖
  debounce(fn, ms) {
    let t = null;
    return function (...args) {
      clearTimeout(t);
      t = setTimeout(() => fn.apply(this, args), ms || 300);
    };
  },
};

/* ================= 轻提示 ================= */
const Toast = {
  timer: null,
  show(msg, ms) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.remove('hidden');
    clearTimeout(this.timer);
    this.timer = setTimeout(() => el.classList.add('hidden'), ms || 2200);
  },
};

/* ================= 通用弹窗 ================= */
const Modal = {
  okHandler: null,
  open(title, bodyHTML, onOk) {
    document.getElementById('modal-title').textContent = title;
    document.getElementById('modal-body').innerHTML = bodyHTML;
    document.getElementById('modal-mask').classList.remove('hidden');
    this.okHandler = onOk || null;
    const first = document.querySelector('#modal-body .form-input, #modal-body .form-select');
    if (first) first.focus();
  },
  close() {
    document.getElementById('modal-mask').classList.add('hidden');
    this.okHandler = null;
  },
  // 读取弹窗内表单：按 name 属性收集值
  collect() {
    const data = {};
    document.querySelectorAll('#modal-body [name]').forEach(el => {
      if (el.type === 'checkbox') data[el.name] = el.checked ? 1 : 0;
      else data[el.name] = el.value;
    });
    return data;
  },
  // 快捷表单弹窗：fields 为 [{name,label,type,options,value,required,placeholder}]
  form(title, fields, onOk, okText) {
    const body = fields.map(f => {
      const req = f.required ? ' <span style="color:#e05252">*</span>' : '';
      let input = '';
      if (f.type === 'select') {
        input = '<select name="' + f.name + '" class="form-select">' +
                Util.options(f.options, f.value) + '</select>';
      } else if (f.type === 'textarea') {
        input = '<textarea name="' + f.name + '" class="form-textarea" placeholder="' +
                Util.esc(f.placeholder || '') + '">' + Util.esc(f.value || '') + '</textarea>';
      } else if (f.type === 'checkbox') {
        input = '<label style="display:flex;align-items:center;gap:8px;font-size:14px">' +
                '<input type="checkbox" name="' + f.name + '"' +
                (f.value ? ' checked' : '') + '> ' + Util.esc(f.checkLabel || '') + '</label>';
        return '<div style="margin:12px 0">' + input + '</div>';
      } else {
        input = '<input name="' + f.name + '" type="' + (f.type || 'text') +
                '" class="form-input" value="' + Util.esc(f.value || '') +
                '" placeholder="' + Util.esc(f.placeholder || '') + '">';
      }
      return '<label class="form-label">' + Util.esc(f.label) + req + '</label>' + input;
    }).join('');
    this.open(title, body, onOk);
    if (okText) document.getElementById('modal-ok').textContent = okText;
  },
  confirm(title, text, onOk) {
    this.open(title, '<p style="font-size:14px;padding:8px 0">' +
              Util.esc(text) + '</p>', onOk);
    document.getElementById('modal-ok').textContent = '确定删除';
  },
};

/* ================= 路由 ================= */
const Router = {
  routes: {},
  // 注册视图：Views 在各自文件中调用 Router.register('jobs', {...})
  register(name, view) { this.routes[name] = view; },
  current: null,
  go(name) {
    if (name === 'login') { location.hash = '#/login'; return; }
    location.hash = '#/' + name;
  },
  parse() {
    const h = location.hash || '#/dashboard';
    const m = /^#\/(\w+)/.exec(h);
    return (m && m[1]) || 'dashboard';
  },
  async render() {
    const name = this.parse();
    const loginPage = document.getElementById('login-page');
    const app = document.getElementById('app');
    // 未登录：强制登录页
    if (!AppState.user) {
      if (name !== 'login') { location.hash = '#/login'; return; }
      loginPage.classList.remove('hidden');
      app.classList.add('hidden');
      return;
    }
    if (name === 'login') { location.hash = '#/dashboard'; return; }
    loginPage.classList.add('hidden');
    app.classList.remove('hidden');
    // 高亮导航
    document.querySelectorAll('#main-nav .nav-item').forEach(a => {
      a.classList.toggle('active', a.dataset.route === name);
    });
    const view = this.routes[name] || this.routes.dashboard;
    this.current = name;
    const container = document.getElementById('view');
    container.innerHTML = '<div class="empty"><div class="big">⏳</div>加载中…</div>';
    try {
      container.innerHTML = await view.render();
      if (view.afterRender) view.afterRender(container);
    } catch (e) {
      container.innerHTML = '<div class="empty"><div class="big">⚠️</div>' +
        Util.esc(e.message) + '</div>';
    }
    window.scrollTo(0, 0);
  },
};

/* ================= 登录逻辑 ================= */
function bindLogin() {
  const doLogin = async () => {
    const username = document.getElementById('login-username').value.trim();
    const password = document.getElementById('login-password').value;
    const errBox = document.getElementById('login-error');
    errBox.classList.add('hidden');
    if (!username || !password) {
      errBox.textContent = '请输入用户名和密码';
      errBox.classList.remove('hidden');
      return;
    }
    try {
      const data = await API.post('/api/login', { username, password });
      AppState.user = data.user;
      document.getElementById('username-label').textContent = data.user.username;
      Toast.show('登录成功，欢迎回来');
      Router.go('dashboard');
    } catch (e) {
      errBox.textContent = e.message;
      errBox.classList.remove('hidden');
    }
  };
  document.getElementById('login-btn').addEventListener('click', doLogin);
  document.getElementById('login-password').addEventListener('keydown', e => {
    if (e.key === 'Enter') doLogin();
  });
  document.getElementById('logout-btn').addEventListener('click', async () => {
    await API.post('/api/logout');
    AppState.user = null;
    Router.go('login');
  });
}

/* ================= 弹窗事件绑定 ================= */
function bindModal() {
  document.getElementById('modal-close').addEventListener('click', () => Modal.close());
  document.getElementById('modal-cancel').addEventListener('click', () => Modal.close());
  document.getElementById('modal-mask').addEventListener('click', e => {
    if (e.target.id === 'modal-mask') Modal.close();
  });
  document.getElementById('modal-ok').addEventListener('click', async () => {
    const fn = Modal.okHandler;
    if (!fn) { Modal.close(); return; }
    try {
      const data = Modal.collect();
      const keep = await fn(data);
      if (keep !== false) {
        Modal.close();
        document.getElementById('modal-ok').textContent = '确定';
      }
    } catch (e) {
      Toast.show(e.message);
    }
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' &&
        !document.getElementById('modal-mask').classList.contains('hidden')) {
      Modal.close();
    }
  });
}

/* ================= 启动 ================= */
window.Views = {};
document.addEventListener('DOMContentLoaded', async () => {
  bindLogin();
  bindModal();
  // 恢复会话
  try {
    const data = await API.get('/api/me');
    if (data.user) {
      AppState.user = data.user;
      document.getElementById('username-label').textContent = data.user.username;
    }
  } catch (e) { /* 后端未启动时保持登录页 */ }
  window.addEventListener('hashchange', () => Router.render());
  Router.render();
});
