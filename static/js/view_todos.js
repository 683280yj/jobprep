/* 求职备考管理软件 V1.0 · 待办清单视图
   功能：待办的新增/编辑/删除、完成切换、「今日三件事」标记、逾期提醒、分类筛选。 */
'use strict';

Router.register('todos', {
  _category: '',
  _showDone: true,

  async render() {
    const data = await API.get('/api/todos');
    this._all = data.items;
    const undone = data.items.filter(t => !t.done).length;
    const overdue = data.items.filter(t => {
      if (t.done || !t.due_date) return false;
      return t.due_date < Util.today();
    }).length;
    return `
    <div class="page-head">
      <div>
        <div class="page-title">待办清单</div>
        <div class="page-desc">把脑子里的事倒出来，每天只盯最重要的三件</div>
      </div>
      <div class="page-actions">
        <button class="btn btn-primary" id="todo-add">＋ 新增待办</button>
      </div>
    </div>

    ${overdue > 0 ? `<div class="card" style="border-left:4px solid #e05252">
      <div class="card-title" style="color:#e05252">⚠️ 有 ${overdue} 项待办已逾期</div>
      <div style="font-size:13px;color:#6b7a90">逾期的事项已在下方用红色标记，建议优先处理或调整截止日期。</div>
    </div>` : ''}

    <div class="card">
      <div class="card-title">⭐ 今日三件事</div>
      <div id="top3-list"></div>
    </div>

    <div class="card">
      <div class="filter-bar">
        <select id="todo-category-filter" class="form-select">
          <option value="">全部分类</option>
          ${Util.options(AppState.TODO_CATEGORIES, '')}
        </select>
        <label style="font-size:13px;display:flex;align-items:center;gap:6px">
          <input type="checkbox" id="todo-show-done" checked> 显示已完成
        </label>
        <span style="font-size:13px;color:#6b7a90" id="todo-count"></span>
      </div>
      <div id="todo-list"></div>
    </div>`;
  },

  afterRender(root) {
    this.renderTop3();
    this.renderList();
    root.querySelector('#todo-add').addEventListener('click', () => this.openForm());
    root.querySelector('#todo-category-filter').addEventListener('change', e => {
      this._category = e.target.value;
      this.renderList();
    });
    root.querySelector('#todo-show-done').addEventListener('change', e => {
      this._showDone = e.target.checked;
      this.renderList();
    });
  },

  isOverdue(t) {
    return !t.done && t.due_date && t.due_date < Util.today();
  },

  renderTop3() {
    const el = document.getElementById('top3-list');
    const top3 = this._all.filter(t => t.is_top3 && !t.done).slice(0, 3);
    if (!top3.length) {
      el.innerHTML = '<div class="empty" style="padding:20px">' +
        '还没有标记今日三件事 — 点击待办右侧的「设为今日三件事」开始聚焦</div>';
      return;
    }
    el.innerHTML = top3.map((t, i) => `
      <div class="todo-item">
        <div style="font-size:20px">${['🥇', '🥈', '🥉'][i]}</div>
        <div class="todo-main">
          <div class="todo-title">${Util.esc(t.title)}</div>
          <div class="todo-meta">${this.metaHTML(t)}</div>
        </div>
        <button class="btn btn-sm btn-accent" data-id="${t.id}" data-act="done">完成</button>
      </div>`).join('');
    el.querySelectorAll('button').forEach(b =>
      b.addEventListener('click', () => this.toggleDone(parseInt(b.dataset.id, 10))));
  },

  metaHTML(t) {
    const parts = [`<span>${Util.esc(t.category)}</span>`];
    if (t.due_date) {
      parts.push(this.isOverdue(t)
        ? '<span class="overdue-tag">逾期：' + Util.md(t.due_date) + '</span>'
        : '<span>截止 ' + Util.md(t.due_date) + '</span>');
    }
    if (t.is_top3 && !t.done) parts.push('<span class="top3-flag">★ 今日三件事</span>');
    return parts.join('');
  },

  renderList() {
    const el = document.getElementById('todo-list');
    const rows = this._all.filter(t => {
      if (this._category && t.category !== this._category) return false;
      if (!this._showDone && t.done) return false;
      return true;
    });
    // 排序：未完成优先 → 今日三件事 → 逾期 → 优先级 → 截止日期
    const pw = { '高': 0, '中': 1, '低': 2 };
    rows.sort((a, b) =>
      (a.done - b.done) || ((b.is_top3 || 0) - (a.is_top3 || 0)) ||
      ((this.isOverdue(b) ? 1 : 0) - (this.isOverdue(a) ? 1 : 0)) ||
      ((pw[a.priority] || 1) - (pw[b.priority] || 1)));
    document.getElementById('todo-count').textContent =
      '共 ' + rows.length + ' 项（未完成 ' +
      rows.filter(t => !t.done).length + '）';
    if (!rows.length) {
      el.innerHTML = '<div class="empty"><div class="big">✅</div>干干净净，没有待办</div>';
      return;
    }
    el.innerHTML = rows.map(t => `
      <div class="todo-item ${t.done ? 'done' : ''}">
        <div class="todo-check ${t.done ? 'on' : ''}" data-id="${t.id}" data-act="toggle">
          ${t.done ? '✓' : ''}</div>
        <div class="todo-main">
          <div class="todo-title">${Util.esc(t.title)}</div>
          <div class="todo-meta">${this.metaHTML(t)} ${Util.priorityBadge(t.priority)}</div>
        </div>
        <div class="todo-ops">
          ${!t.is_top3 && !t.done
            ? `<button class="link-btn" data-id="${t.id}" data-act="top3">设为今日三件事</button>` : ''}
          ${t.is_top3 ? `<button class="link-btn" data-id="${t.id}" data-act="untop3">取消标记</button>` : ''}
          <button class="link-btn" data-id="${t.id}" data-act="edit">编辑</button>
          <button class="link-btn danger" data-id="${t.id}" data-act="del">删除</button>
        </div>
      </div>`).join('');
    el.querySelectorAll('[data-act]').forEach(node => {
      const id = parseInt(node.dataset.id, 10);
      const act = node.dataset.act;
      node.addEventListener('click', () => {
        if (act === 'toggle') this.toggleDone(id);
        else if (act === 'edit') this.openForm(id);
        else if (act === 'del') this.confirmDelete(id);
        else if (act === 'top3' || act === 'untop3') this.setTop3(id, act === 'top3');
      });
    });
  },

  async toggleDone(id) {
    try {
      await API.post('/api/todos/' + id + '/toggle');
      await this.refresh();
      const item = this._all.find(t => t.id === id);
      if (item && item.done) Toast.show('🎉 又完成一件，继续保持');
    } catch (e) { Toast.show(e.message); }
  },

  async setTop3(id, on) {
    try {
      await API.put('/api/todos/' + id, { is_top3: on ? 1 : 0 });
      Toast.show(on ? '已加入今日三件事' : '已取消标记');
      await this.refresh();
    } catch (e) { Toast.show(e.message); }
  },

  openForm(id) {
    const item = id ? this._all.find(t => t.id === id) : null;
    const fields = [
      { name: 'title', label: '待办标题', required: true,
        value: item ? item.title : '', placeholder: '如：完成蓝桥软件笔试' },
      { name: 'category', label: '分类', type: 'select',
        options: AppState.TODO_CATEGORIES, value: item ? item.category : '其他' },
      { name: 'priority', label: '优先级', type: 'select',
        options: AppState.PRIORITIES, value: item ? item.priority : '中' },
      { name: 'due_date', label: '截止日期', type: 'date',
        value: item ? (item.due_date || '') : '' },
    ];
    if (!item) {
      fields.push({ name: 'is_top3', label: '', type: 'checkbox',
                    value: 0, checkLabel: '直接加入今日三件事' });
    }
    Modal.form(item ? '编辑待办' : '新增待办', fields, async data => {
      try {
        if (item) await API.put('/api/todos/' + id, data);
        else await API.post('/api/todos', data);
        Toast.show(item ? '已保存修改' : '待办已加入清单');
        await this.refresh();
      } catch (e) { Toast.show(e.message); return false; }
    });
  },

  confirmDelete(id) {
    Modal.confirm('删除确认', '确定删除这条待办吗？此操作不可恢复。',
      async () => {
        try {
          await API.del('/api/todos/' + id);
          Toast.show('已删除');
          await this.refresh();
        } catch (e) { Toast.show(e.message); return false; }
      });
  },

  async refresh() {
    const data = await API.get('/api/todos');
    this._all = data.items;
    Router.render();
  },
});
