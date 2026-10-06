/* 求职备考管理软件 V1.0 · 备考资料视图
   功能：资料库的卡片展示、分类/状态筛选、搜索、新增/编辑/删除、学习进度。 */
'use strict';

Router.register('materials', {
  _category: '',
  _status: '',
  _keyword: '',

  async render() {
    const [listData, progressData] = await Promise.all([
      API.get('/api/materials'),
      API.get('/api/stats/material_progress'),
    ]);
    this._all = listData.items;
    this._progress = progressData.progress;
    return `
    <div class="page-head">
      <div>
        <div class="page-title">备考资料</div>
        <div class="page-desc">书籍、讲义、真题、课程…统一管理学习进度</div>
      </div>
      <div class="page-actions">
        <button class="btn btn-primary" id="material-add">＋ 新增资料</button>
      </div>
    </div>

    <div class="card">
      <div class="card-title">📊 分类学习进度</div>
      <div class="bar-chart" id="mat-progress"></div>
    </div>

    <div class="card">
      <div class="filter-bar">
        <select id="mat-category-filter" class="form-select">
          <option value="">全部分类</option>
          ${Util.options(AppState.MATERIAL_CATEGORIES, '')}
        </select>
        <select id="mat-status-filter" class="form-select">
          <option value="">全部状态</option>
          ${Util.options(AppState.MATERIAL_STATUS, '')}
        </select>
        <input id="mat-keyword" class="form-input search-input" placeholder="搜索标题 / 备注">
        <span style="font-size:13px;color:#6b7a90" id="mat-count"></span>
      </div>
      <div class="material-grid" id="mat-grid"></div>
      <div id="mat-empty"></div>
    </div>`;
  },

  afterRender(root) {
    this.renderProgress();
    this.renderGrid();
    root.querySelector('#material-add').addEventListener('click', () => this.openForm());
    root.querySelector('#mat-category-filter').addEventListener('change', e => {
      this._category = e.target.value; this.renderGrid();
    });
    root.querySelector('#mat-status-filter').addEventListener('change', e => {
      this._status = e.target.value; this.renderGrid();
    });
    const kw = root.querySelector('#mat-keyword');
    kw.addEventListener('input', Util.debounce(() => {
      this._keyword = kw.value.trim(); this.renderGrid();
    }));
  },

  renderProgress() {
    const el = document.getElementById('mat-progress');
    if (!this._progress.length) {
      el.innerHTML = '<div class="empty">暂无数据</div>';
      return;
    }
    el.innerHTML = this._progress.map(p => {
      const width = Math.round(p.rate * 100);
      return `<div class="bar-row">
        <div>${Util.esc(p.category)}</div>
        <div class="bar-track"><div class="bar-fill green" style="width:${width}%"></div></div>
        <div class="bar-val">${p.done}/${p.total} · ${Util.pct(p.rate)}</div>
      </div>`;
    }).join('');
  },

  filtered() {
    return this._all.filter(m => {
      if (this._category && m.category !== this._category) return false;
      if (this._status && m.status !== this._status) return false;
      if (this._keyword) {
        const kw = this._keyword.toLowerCase();
        if (!((m.title + ' ' + (m.notes || '')).toLowerCase().includes(kw))) return false;
      }
      return true;
    });
  },

  renderGrid() {
    const rows = this.filtered();
    const grid = document.getElementById('mat-grid');
    document.getElementById('mat-count').textContent = '共 ' + rows.length + ' 份';
    document.getElementById('mat-empty').innerHTML =
      rows.length ? '' : '<div class="empty"><div class="big">📚</div>还没有资料，新增第一份备考资料吧</div>';
    grid.innerHTML = rows.map(m => `
      <div class="material-card">
        <div class="material-title">${Util.esc(m.title)}</div>
        <div class="material-meta">
          <span class="badge blue">${Util.esc(m.category)}</span>
          <span class="badge gray">${Util.esc(m.mtype || '书籍')}</span>
          ${Util.statusBadge(m.status)}
        </div>
        ${m.location ? '<div class="material-meta">📍 ' + Util.esc(m.location) + '</div>' : ''}
        <div>${Util.stars(m.rating)}</div>
        ${m.notes ? '<div class="material-notes">' + Util.esc(m.notes) + '</div>' : ''}
        <div style="margin-top:6px">
          <button class="link-btn" data-act="edit" data-id="${m.id}">编辑</button>
          <button class="link-btn" data-act="status" data-id="${m.id}">更新状态</button>
          <button class="link-btn danger" data-act="del" data-id="${m.id}">删除</button>
        </div>
      </div>`).join('');
    grid.querySelectorAll('button').forEach(btn => {
      const id = parseInt(btn.dataset.id, 10);
      btn.addEventListener('click', () => {
        const act = btn.dataset.act;
        if (act === 'edit') this.openForm(id);
        else if (act === 'del') this.confirmDelete(id);
        else if (act === 'status') this.cycleStatus(id);
      });
    });
  },

  // 一键流转学习状态：未开始 → 学习中 → 已完成
  async cycleStatus(id) {
    const item = this._all.find(m => m.id === id);
    if (!item) return;
    const order = AppState.MATERIAL_STATUS;
    const next = order[(order.indexOf(item.status) + 1) % order.length];
    try {
      await API.put('/api/materials/' + id, { status: next });
      Toast.show('状态已更新为：' + next);
      await this.refresh();
    } catch (e) { Toast.show(e.message); }
  },

  openForm(id) {
    const item = id ? this._all.find(m => m.id === id) : null;
    Modal.form(item ? '编辑资料' : '新增备考资料', [
      { name: 'title', label: '资料标题', required: true,
        value: item ? item.title : '', placeholder: '如：行测模块宝典（2026版）' },
      { name: 'category', label: '资料分类', type: 'select',
        options: AppState.MATERIAL_CATEGORIES,
        value: item ? item.category : '行测' },
      { name: 'mtype', label: '资料类型', type: 'select',
        options: ['书籍', '讲义', '真题', '课程', '文档', '视频', '其他'],
        value: item ? (item.mtype || '书籍') : '书籍' },
      { name: 'location', label: '存放位置', value: item ? item.location : '',
        placeholder: '如：书架第一层 / D:/备考/讲义' },
      { name: 'status', label: '学习状态', type: 'select',
        options: AppState.MATERIAL_STATUS,
        value: item ? item.status : '未开始' },
      { name: 'rating', label: '推荐指数（0-5）', type: 'number',
        value: item ? item.rating : '0', placeholder: '0 表示未评分' },
      { name: 'notes', label: '备注', type: 'textarea',
        value: item ? item.notes : '', placeholder: '使用心得、配套资源…' },
    ], async data => {
      try {
        if (item) await API.put('/api/materials/' + id, data);
        else await API.post('/api/materials', data);
        Toast.show(item ? '已保存修改' : '资料已加入资料库');
        await this.refresh();
      } catch (e) { Toast.show(e.message); return false; }
    });
  },

  confirmDelete(id) {
    const item = this._all.find(m => m.id === id);
    Modal.confirm('删除确认', '确定删除资料「' + item.title + '」吗？此操作不可恢复。',
      async () => {
        try {
          await API.del('/api/materials/' + id);
          Toast.show('已删除');
          await this.refresh();
        } catch (e) { Toast.show(e.message); return false; }
      });
  },

  async refresh() {
    const [listData, progressData] = await Promise.all([
      API.get('/api/materials'),
      API.get('/api/stats/material_progress'),
    ]);
    this._all = listData.items;
    this._progress = progressData.progress;
    this.renderProgress();
    this.renderGrid();
  },
});
