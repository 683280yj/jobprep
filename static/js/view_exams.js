/* 求职备考管理软件 V1.0 · 考试日程视图
   功能：笔试 / 面试等关键时间节点的增删改查与倒计时展示。 */
'use strict';

Router.register('exams', {
  async render() {
    const data = await API.get('/api/exams');
    this._all = data.items;
    return `
    <div class="page-head">
      <div>
        <div class="page-title">考试日程</div>
        <div class="page-desc">笔试、面试…关键时间节点一个都不漏</div>
      </div>
      <div class="page-actions">
        <button class="btn btn-primary" id="exam-add">＋ 新增考试</button>
      </div>
    </div>
    <div class="card">
      <div class="card-title">🗓️ 全部日程（按日期排序）</div>
      <div id="exam-list"></div>
    </div>`;
  },

  afterRender(root) {
    this.renderList();
    root.querySelector('#exam-add').addEventListener('click', () => this.openForm());
  },

  renderList() {
    const el = document.getElementById('exam-list');
    if (!this._all.length) {
      el.innerHTML = '<div class="empty"><div class="big">📅</div>还没有考试安排，新增一个开始倒计时吧</div>';
      return;
    }
    el.innerHTML = this._all.map(e => {
      const d = /^(\d{4})-(\d{2})-(\d{2})/.exec(e.exam_date) || [];
      const urgent = e.days_left !== null && e.days_left >= 0 && e.days_left <= 7;
      const passed = e.days_left !== null && e.days_left < 0;
      const cdText = e.days_left === null ? '日期未知'
        : passed ? '已过去 ' + (-e.days_left) + ' 天'
        : e.days_left === 0 ? '就是今天！'
        : '还剩 ' + e.days_left + ' 天';
      return `<div class="exam-card" style="padding:12px 0;border-bottom:1px solid #e3e8f0">
        <div class="exam-date-box ${urgent ? 'urgent' : ''}">
          <div class="d">${d[3] ? parseInt(d[3], 10) : '—'}</div>
          <div class="m">${d[2] ? parseInt(d[2], 10) + '月' : ''}</div>
        </div>
        <div class="exam-info">
          <div class="exam-name">${Util.esc(e.name)}</div>
          <div class="exam-meta">
            ${e.location ? '📍 ' + Util.esc(e.location) + '　' : ''}
            ${e.registration_deadline ? '报名截止 ' + Util.md(e.registration_deadline) + '　' : ''}
          </div>
          ${e.notes ? '<div class="exam-meta">📝 ' + Util.esc(e.notes) + '</div>' : ''}
        </div>
        <div class="countdown ${passed ? 'passed' : ''}">${cdText}</div>
        <div class="todo-ops">
          <button class="link-btn" data-act="edit" data-id="${e.id}">编辑</button>
          <button class="link-btn danger" data-act="del" data-id="${e.id}">删除</button>
        </div>
      </div>`;
    }).join('');
    el.querySelectorAll('button').forEach(btn => {
      const id = parseInt(btn.dataset.id, 10);
      btn.addEventListener('click', () => {
        if (btn.dataset.act === 'edit') this.openForm(id);
        else this.confirmDelete(id);
      });
    });
  },

  openForm(id) {
    const item = id ? this._all.find(e => e.id === id) : null;
    Modal.form(item ? '编辑考试' : '新增考试日程', [
      { name: 'name', label: '考试名称', required: true,
        value: item ? item.name : '', placeholder: '如：国家公务员考试（笔试）' },
      { name: 'exam_date', label: '考试日期', type: 'date', required: true,
        value: item ? (item.exam_date || '') : '' },
      { name: 'location', label: '考试地点', value: item ? item.location : '',
        placeholder: '如：合肥考区 / 线上' },
      { name: 'registration_deadline', label: '报名截止日期', type: 'date',
        value: item ? (item.registration_deadline || '') : '' },
      { name: 'notes', label: '备注', type: 'textarea',
        value: item ? item.notes : '', placeholder: '考试科目、携带物品…' },
    ], async data => {
      try {
        if (item) await API.put('/api/exams/' + id, data);
        else await API.post('/api/exams', data);
        Toast.show(item ? '已保存修改' : '考试日程已新增');
        await this.refresh();
      } catch (e) { Toast.show(e.message); return false; }
    });
  },

  confirmDelete(id) {
    Modal.confirm('删除确认', '确定删除这个考试日程吗？此操作不可恢复。',
      async () => {
        try {
          await API.del('/api/exams/' + id);
          Toast.show('已删除');
          await this.refresh();
        } catch (e) { Toast.show(e.message); return false; }
      });
  },

  async refresh() {
    const data = await API.get('/api/exams');
    this._all = data.items;
    this.renderList();
  },
});
