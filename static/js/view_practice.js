/* 求职备考管理软件 V1.0 · 笔试练习视图
   功能：练习记录的新增/编辑/删除、模块正确率、每日趋势、8周进步曲线、能力雷达。 */
'use strict';

Router.register('practice', {
  _module: '',

  async render() {
    const [listData, radarData, weeklyData] = await Promise.all([
      API.get('/api/practice'),
      API.get('/api/stats/radar'),
      API.get('/api/stats/weekly?weeks=8'),
    ]);
    this._all = listData.items;
    this._radar = radarData.radar;
    this._weekly = weeklyData.weeks;
    return `
    <div class="page-head">
      <div>
        <div class="page-title">笔试练习</div>
        <div class="page-desc">记录每一次刷题，用数据找到薄弱模块</div>
      </div>
      <div class="page-actions">
        <button class="btn btn-primary" id="practice-add">＋ 记录一次练习</button>
      </div>
    </div>

    <div class="grid grid-2">
      <div class="card">
        <div class="card-title">🎯 能力雷达（各模块熟练度）</div>
        ${this.radarSVG()}
        <div class="radar-legend" style="margin-top:10px">
          熟练度 = 正确率 × 题量系数（200 题为满系数），帮你定位最该补的模块。
        </div>
      </div>
      <div class="card">
        <div class="card-title">📈 近8周进步曲线（每周题量）</div>
        ${this.weeklyBars()}
      </div>
    </div>

    <div class="card">
      <div class="filter-bar">
        <select id="practice-module-filter" class="form-select">
          <option value="">全部模块</option>
          ${Util.options(AppState.PRACTICE_MODULES, '')}
        </select>
        <span style="font-size:13px;color:#6b7a90" id="practice-count"></span>
      </div>
      <div class="table-wrap"><table class="data">
        <thead><tr>
          <th>练习日期</th><th>模块</th><th>题量</th><th>答对</th>
          <th>正确率</th><th>用时(分钟)</th><th>备注</th><th>操作</th>
        </tr></thead>
        <tbody id="practice-tbody"></tbody>
      </table></div>
      <div id="practice-empty"></div>
    </div>`;
  },

  afterRender(root) {
    this.renderTable();
    root.querySelector('#practice-add').addEventListener('click', () => this.openForm());
    root.querySelector('#practice-module-filter').addEventListener('change', e => {
      this._module = e.target.value;
      this.renderTable();
    });
  },

  /* ----- 六边形雷达图 ----- */
  radarSVG() {
    const mods = this._radar;
    const size = 300, cx = 150, cy = 150, R = 105;
    const angle = i => (Math.PI * 2 * i) / mods.length - Math.PI / 2;
    const pt = (i, r) => {
      const a = angle(i);
      return (cx + r * Math.cos(a)).toFixed(1) + ',' +
             (cy + r * Math.sin(a)).toFixed(1);
    };
    // 背景网格（4 层）
    let gridPolys = '';
    [0.25, 0.5, 0.75, 1].forEach(f => {
      gridPolys += '<polygon points="' + mods.map((_, i) => pt(i, R * f)).join(' ') +
        '" fill="none" stroke="#e3e8f0" stroke-width="1"/>';
    });
    // 轴线与标签
    let axes = '', labels = '';
    mods.forEach((m, i) => {
      axes += `<line x1="${cx}" y1="${cy}" x2="${pt(i, R).split(',')[0]}" ` +
              `y2="${pt(i, R).split(',')[1]}" stroke="#e3e8f0"/>`;
      const a = angle(i);
      const lx = cx + (R + 26) * Math.cos(a), ly = cy + (R + 26) * Math.sin(a);
      labels += `<text x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" text-anchor="middle" ` +
                `dominant-baseline="middle" font-size="12" fill="#243447">${m.module}</text>`;
    });
    // 数据多边形
    const dataPts = mods.map((m, i) => pt(i, R * m.proficiency)).join(' ');
    const dots = mods.map((m, i) => {
      const [dx, dy] = pt(i, R * m.proficiency).split(',');
      return `<circle cx="${dx}" cy="${dy}" r="4" fill="#f0852c">` +
        `<title>${m.module}：正确率${Util.pct(m.accuracy)}，累计${m.total}题</title></circle>`;
    }).join('');
    return `<div class="radar-wrap"><svg class="radar-svg" viewBox="0 0 ${size} ${size}">
      ${gridPolys}${axes}
      <polygon points="${dataPts}" fill="rgba(240,133,44,.25)"
               stroke="#f0852c" stroke-width="2"/>
      ${dots}${labels}
    </svg>
    <ul class="radar-legend">` + mods.map((m, i) => {
      const color = ['#f0852c', '#3d7bd6', '#22a06b', '#6a4fc7', '#e05252', '#e6a23c'][i % 6];
      return `<li><span class="radar-dot" style="background:${color}"></span>` +
        `${m.module}：${Util.pct(m.accuracy)}（${m.total}题）</li>`;
    }).join('') + '</ul></div>';
  },

  /* ----- 周进步条形图 ----- */
  weeklyBars() {
    const weeks = this._weekly;
    if (!weeks.length) return '<div class="empty">暂无数据</div>';
    const maxV = Math.max(1, ...weeks.map(w => w.total));
    return '<div class="bar-chart">' + weeks.map(w => {
      const width = Math.max(4, Math.round((w.total / maxV) * 100));
      return `<div class="bar-row">
        <div>${Util.esc(w.week_start.slice(5))} 当周</div>
        <div class="bar-track"><div class="bar-fill" style="width:${width}%"></div></div>
        <div class="bar-val">${w.total}题 · ${Util.pct(w.accuracy)}</div>
      </div>`;
    }).join('') + '</div>';
  },

  /* ----- 记录列表 ----- */
  renderTable() {
    const rows = this._all.filter(s => !this._module || s.module === this._module);
    const tb = document.getElementById('practice-tbody');
    document.getElementById('practice-count').textContent = '共 ' + rows.length + ' 条';
    document.getElementById('practice-empty').innerHTML =
      rows.length ? '' : '<div class="empty"><div class="big">✍️</div>还没有练习记录，记录一次开始积累吧</div>';
    tb.innerHTML = rows.map(s => {
      const acc = s.question_count ? s.correct_count / s.question_count : 0;
      const cls = acc >= 0.8 ? 'green' : (acc >= 0.6 ? 'blue' : 'orange');
      return `<tr>
        <td>${Util.md(s.practiced_at)}</td>
        <td><span class="badge purple">${Util.esc(s.module)}</span></td>
        <td>${s.question_count}</td>
        <td>${s.correct_count}</td>
        <td><span class="badge ${cls}">${Util.pct(acc)}</span></td>
        <td>${s.duration_min || '—'}</td>
        <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"
            title="${Util.esc(s.notes || '')}">${Util.esc(s.notes || '—')}</td>
        <td class="table-ops">
          <button class="link-btn" data-act="edit" data-id="${s.id}">编辑</button>
          <button class="link-btn danger" data-act="del" data-id="${s.id}">删除</button>
        </td>
      </tr>`;
    }).join('');
    tb.querySelectorAll('button').forEach(btn => {
      const id = parseInt(btn.dataset.id, 10);
      btn.addEventListener('click', () => {
        if (btn.dataset.act === 'edit') this.openForm(id);
        else this.confirmDelete(id);
      });
    });
  },

  /* ----- 新增 / 编辑 ----- */
  openForm(id) {
    const item = id ? this._all.find(s => s.id === id) : null;
    Modal.form(item ? '编辑练习记录' : '记录一次练习', [
      { name: 'module', label: '练习模块', type: 'select',
        options: AppState.PRACTICE_MODULES,
        value: item ? item.module : '图形推理' },
      { name: 'question_count', label: '练习题量', type: 'number', required: true,
        value: item ? item.question_count : '20', placeholder: '本次共做多少题' },
      { name: 'correct_count', label: '答对题数', type: 'number', required: true,
        value: item ? item.correct_count : '', placeholder: '答对多少题' },
      { name: 'duration_min', label: '用时（分钟）', type: 'number',
        value: item ? (item.duration_min || '') : '', placeholder: '可选' },
      { name: 'practiced_at', label: '练习日期', type: 'date',
        value: item ? (item.practiced_at || '') : Util.today() },
      { name: 'notes', label: '复盘备注', type: 'textarea',
        value: item ? item.notes : '', placeholder: '错题类型、心得体会…' },
    ], async data => {
      try {
        if (item) await API.put('/api/practice/' + id, data);
        else await API.post('/api/practice', data);
        Toast.show('练习记录已保存');
        await this.refresh();
      } catch (e) { Toast.show(e.message); return false; }
    });
  },

  confirmDelete(id) {
    Modal.confirm('删除确认', '确定删除这条练习记录吗？此操作不可恢复。',
      async () => {
        try {
          await API.del('/api/practice/' + id);
          Toast.show('已删除');
          await this.refresh();
        } catch (e) { Toast.show(e.message); return false; }
      });
  },

  async refresh() {
    const [listData, radarData, weeklyData] = await Promise.all([
      API.get('/api/practice'),
      API.get('/api/stats/radar'),
      API.get('/api/stats/weekly?weeks=8'),
    ]);
    this._all = listData.items;
    this._radar = radarData.radar;
    this._weekly = weeklyData.weeks;
    Router.render();
  },
});
