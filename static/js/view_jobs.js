/* 求职备考管理软件 V1.0 · 求职投递视图
   功能：投递列表（筛选/搜索）、阶段看板、新增/编辑/删除、阶段流转。 */
'use strict';

Router.register('jobs', {
  _stage: '',
  _keyword: '',

  async render() {
    const data = await API.get('/api/jobs');
    this._all = data.items;
    return `
    <div class="page-head">
      <div>
        <div class="page-title">求职投递</div>
        <div class="page-desc">跟踪每一次投递的全流程：从网申到 Offer</div>
      </div>
      <div class="page-actions">
        <button class="btn btn-primary" id="job-add">＋ 新增投递</button>
      </div>
    </div>

    <div class="card">
      <div class="card-title">📌 阶段看板</div>
      <div class="stage-board" id="stage-board"></div>
    </div>

    <div class="card">
      <div class="filter-bar">
        <select id="job-stage-filter" class="form-select">
          <option value="">全部阶段</option>
          ${Util.options(AppState.JOB_STAGES, '')}
        </select>
        <input id="job-keyword" class="form-input search-input" placeholder="搜索公司 / 岗位 / 城市">
        <span style="font-size:13px;color:#6b7a90" id="job-count"></span>
      </div>
      <div class="table-wrap"><table class="data">
        <thead><tr>
          <th>公司</th><th>岗位</th><th>城市</th><th>阶段</th>
          <th>投递日期</th><th>截止日期</th><th>优先级</th><th>操作</th>
        </tr></thead>
        <tbody id="job-tbody"></tbody>
      </table></div>
      <div id="job-empty"></div>
    </div>`;
  },

  afterRender(root) {
    this.renderBoard();
    this.renderTable();
    root.querySelector('#job-add').addEventListener('click', () => this.openForm());
    root.querySelector('#job-stage-filter').addEventListener('change', e => {
      this._stage = e.target.value;
      this.renderTable();
    });
    const kwInput = root.querySelector('#job-keyword');
    kwInput.addEventListener('input', Util.debounce(() => {
      this._keyword = kwInput.value.trim();
      this.renderTable();
    }));
  },

  /* ----- 数据筛选 ----- */
  filtered() {
    return this._all.filter(j => {
      if (this._stage && j.stage !== this._stage) return false;
      if (this._keyword) {
        const kw = this._keyword.toLowerCase();
        const hay = (j.company + ' ' + j.position + ' ' + j.city).toLowerCase();
        if (!hay.includes(kw)) return false;
      }
      return true;
    });
  },

  /* ----- 阶段看板 ----- */
  renderBoard() {
    const board = document.getElementById('stage-board');
    const groups = {};
    AppState.JOB_STAGES.forEach(s => { groups[s] = []; });
    this._all.forEach(j => { (groups[j.stage] || groups['待投递']).push(j); });
    board.innerHTML = AppState.JOB_STAGES.map(s => `
      <div class="stage-col">
        <div class="stage-head"><span>${s}</span>
          <span class="stage-count">${groups[s].length}</span></div>
        ${groups[s].slice(0, 4).map(j => `
          <div class="job-mini" data-id="${j.id}">
            <div class="c">${Util.esc(j.company)}</div>
            <div class="p">${Util.esc(j.position)}</div>
          </div>`).join('')}
        ${groups[s].length > 4
          ? '<div style="font-size:12px;color:#6b7a90">还有 ' +
            (groups[s].length - 4) + ' 家…</div>' : ''}
      </div>`).join('');
    board.querySelectorAll('.job-mini').forEach(el => {
      el.addEventListener('click', () => this.openForm(parseInt(el.dataset.id, 10)));
    });
  },

  /* ----- 列表 ----- */
  renderTable() {
    const rows = this.filtered();
    const tb = document.getElementById('job-tbody');
    document.getElementById('job-count').textContent = '共 ' + rows.length + ' 条';
    document.getElementById('job-empty').innerHTML =
      rows.length ? '' : '<div class="empty"><div class="big">💼</div>还没有投递记录，点击右上角新增一条吧</div>';
    tb.innerHTML = rows.map(j => {
      const cd = j.deadline ? Util.countdown(j.deadline) : null;
      return `<tr>
        <td><b>${Util.esc(j.company)}</b></td>
        <td>${Util.esc(j.position)}</td>
        <td>${Util.esc(j.city || '—')}</td>
        <td>${Util.stageBadge(j.stage)}</td>
        <td>${j.applied_date ? Util.md(j.applied_date) : '—'}</td>
        <td>${j.deadline ? Util.md(j.deadline) +
          (cd && !cd.passed ? ' <span class="' + (cd.urgent ? 'overdue-tag' : '') +
            '" style="font-size:12px">(' + Util.esc(cd.text) + ')</span>' : '') : '—'}</td>
        <td>${Util.priorityBadge(j.priority)}</td>
        <td class="table-ops">
          <button class="link-btn" data-act="advance" data-id="${j.id}">推进阶段</button>
          <button class="link-btn" data-act="edit" data-id="${j.id}">编辑</button>
          <button class="link-btn danger" data-act="del" data-id="${j.id}">删除</button>
        </td>
      </tr>`;
    }).join('');
    tb.querySelectorAll('button').forEach(btn => {
      const id = parseInt(btn.dataset.id, 10);
      const act = btn.dataset.act;
      btn.addEventListener('click', () => {
        if (act === 'edit') this.openForm(id);
        else if (act === 'del') this.confirmDelete(id);
        else if (act === 'advance') this.advanceStage(id);
      });
    });
  },

  /* ----- 新增 / 编辑表单 ----- */
  openForm(id) {
    const item = id ? this._all.find(j => j.id === id) : null;
    Modal.form(item ? '编辑投递' : '新增投递', [
      { name: 'company', label: '公司名称', required: true,
        value: item ? item.company : '', placeholder: '如：星云科技' },
      { name: 'position', label: '投递岗位', required: true,
        value: item ? item.position : '', placeholder: '如：产品经理' },
      { name: 'city', label: '工作城市', value: item ? item.city : '',
        placeholder: '如：杭州' },
      { name: 'stage', label: '当前阶段', type: 'select',
        options: AppState.JOB_STAGES, value: item ? item.stage : '待投递' },
      { name: 'source', label: '投递渠道', value: item ? item.source : '',
        placeholder: '如：校园招聘 / 招聘网站 / 内推' },
      { name: 'applied_date', label: '投递日期', type: 'date',
        value: item ? (item.applied_date || '') : Util.today() },
      { name: 'deadline', label: '截止日期', type: 'date',
        value: item ? (item.deadline || '') : '' },
      { name: 'salary_range', label: '薪资范围', value: item ? item.salary_range : '',
        placeholder: '如：18-25K' },
      { name: 'priority', label: '优先级', type: 'select',
        options: AppState.PRIORITIES, value: item ? item.priority : '中' },
      { name: 'notes', label: '备注', type: 'textarea',
        value: item ? item.notes : '', placeholder: '面试准备要点、联系人等' },
    ], async data => {
      try {
        if (item) await API.put('/api/jobs/' + id, data);
        else await API.post('/api/jobs', data);
        Toast.show(item ? '已保存修改' : '投递记录已新增');
        await this.refresh();
      } catch (e) { Toast.show(e.message); return false; }
    });
  },

  /* ----- 阶段推进：按流程顺序进入下一阶段 ----- */
  async advanceStage(id) {
    const item = this._all.find(j => j.id === id);
    if (!item) return;
    const order = AppState.JOB_STAGES;
    const idx = order.indexOf(item.stage);
    if (idx < 0 || idx >= order.length - 1) {
      Toast.show('已是最终阶段');
      return;
    }
    const next = order[idx + 1];
    Modal.open('推进阶段',
      `<p style="font-size:14px">将「${Util.esc(item.company)} · ` +
      `${Util.esc(item.position)}」从 ${Util.stageBadge(item.stage)} ` +
      `推进到 ${Util.stageBadge(next)}？</p>`,
      async () => {
        try {
          await API.put('/api/jobs/' + id, { stage: next });
          Toast.show('已推进到：' + next);
          await this.refresh();
        } catch (e) { Toast.show(e.message); return false; }
      });
  },

  confirmDelete(id) {
    const item = this._all.find(j => j.id === id);
    Modal.confirm('删除确认',
      '确定删除「' + item.company + ' · ' + item.position + '」的投递记录吗？此操作不可恢复。',
      async () => {
        try {
          await API.del('/api/jobs/' + id);
          Toast.show('已删除');
          await this.refresh();
        } catch (e) { Toast.show(e.message); return false; }
      });
  },

  async refresh() {
    const data = await API.get('/api/jobs');
    this._all = data.items;
    this.renderBoard();
    this.renderTable();
  },
});
