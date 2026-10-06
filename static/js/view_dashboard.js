/* 求职备考管理软件 V1.0 · 数据总览视图
   展示：核心指标卡、求职漏斗、笔试趋势折线图、模块正确率条形图、
         今日三件事、临近考试、近期截止投递。 */
'use strict';

Router.register('dashboard', {
  async render() {
    const data = await API.get('/api/stats/overview');
    const s = data.stats;
    return `
    <div class="page-head">
      <div>
        <div class="page-title">数据总览</div>
        <div class="page-desc">求职与备考的关键指标一览 · 数据更新于 ${Util.esc(s.generated_at)}</div>
      </div>
    </div>

    <div class="grid grid-4">
      ${statCard('blue', '投递总数', s.jobs.total + '<small> 家</small>',
                 '进行中 ' + s.jobs.active + ' 家 · Offer 率 ' + Util.pct(s.jobs.offer_rate))}
      ${statCard('green', '累计刷题', s.practice.total_questions + '<small> 题</small>',
                 '总体正确率 ' + Util.pct(s.practice.overall_accuracy) +
                 ' · 近7天 ' + s.practice.week_questions + ' 题')}
      ${statCard('orange', '待办事项', s.todos.undone + '<small> 项未完成</small>',
                 s.todos.overdue > 0
                   ? '其中 <b style="color:#e05252">' + s.todos.overdue + ' 项已逾期</b>'
                   : '暂无逾期事项，继续保持')}
      ${statCard('red', '备考资料', s.materials.total + '<small> 份</small>',
                 '已完成 ' + Util.pct(s.materials.done_rate))}
    </div>

    <div class="grid grid-2">
      <div class="card">
        <div class="card-title">🎯 求职漏斗</div>
        ${funnelHTML(s.jobs.by_stage)}
        <div style="margin-top:12px;font-size:13px;color:#6b7a90">
          ${s.practice.weakest_module
            ? '💡 笔试薄弱模块：<b>' + Util.esc(s.practice.weakest_module) +
              '</b>，建议优先补强'
            : '💡 暂无笔试记录，去记录一次练习吧'}
        </div>
      </div>
      <div class="card">
        <div class="card-title">📈 近7天刷题趋势</div>
        ${lineChart(s.practice.daily_trend)}
      </div>
    </div>

    <div class="grid grid-2">
      <div class="card">
        <div class="card-title">📊 各模块正确率</div>
        ${moduleBars(s.practice.by_module)}
      </div>
      <div class="card">
        <div class="card-title">⭐ 今日三件事</div>
        ${top3HTML(s.todos.top3)}
      </div>
    </div>

    <div class="grid grid-2">
      <div class="card">
        <div class="card-title">📅 临近考试（30天内）</div>
        ${upcomingExamsHTML(s.exams.upcoming)}
      </div>
      <div class="card">
        <div class="card-title">⏰ 投递截止提醒（14天内）</div>
        ${deadlinesHTML(s.jobs.upcoming_deadlines)}
      </div>
    </div>`;
  },
});

/* ---------- 局部渲染函数 ---------- */

function statCard(color, label, value, hint) {
  return `<div class="card stat-card ${color}">
    <div class="stat-label">${label}</div>
    <div class="stat-value">${value}</div>
    <div class="stat-hint">${hint}</div>
  </div>`;
}

function funnelHTML(byStage) {
  const order = ['待投递', '已投递', '笔试', '面试', 'Offer'];
  const max = Math.max(1, ...order.map(s => byStage[s] || 0));
  let prev = null;
  const rows = order.map(stage => {
    const c = byStage[stage] || 0;
    const width = Math.max(8, Math.round((c / max) * 100));
    const rate = prev === null ? '—'
      : (prev > 0 ? Util.pct(c / prev) : '0%');
    prev = c;
    return `<div class="funnel-row">
      <div class="funnel-label">${stage}</div>
      <div class="funnel-bar" style="width:${width}%">${c}</div>
      <div class="funnel-rate">转化 ${rate}</div>
    </div>`;
  }).join('');
  return `<div class="funnel">${rows}</div>`;
}

// SVG 折线图：每日刷题量
function lineChart(trend) {
  if (!trend || !trend.length) {
    return '<div class="empty">暂无数据</div>';
  }
  const W = 560, H = 220, P = { l: 36, r: 12, t: 14, b: 30 };
  const maxV = Math.max(1, ...trend.map(d => d.total));
  const n = trend.length;
  const x = i => P.l + (i * (W - P.l - P.r)) / Math.max(1, n - 1);
  const y = v => H - P.b - (v / maxV) * (H - P.t - P.b);
  const pts = trend.map((d, i) => x(i).toFixed(1) + ',' + y(d.total).toFixed(1)).join(' ');
  const area = `${P.l},${H - P.b} ${pts} ${x(n - 1).toFixed(1)},${H - P.b}`;
  // 网格线
  let grid = '';
  for (let g = 0; g <= 4; g++) {
    const gy = P.t + (g * (H - P.t - P.b)) / 4;
    const val = Math.round(maxV * (1 - g / 4));
    grid += `<line class="grid-line" x1="${P.l}" y1="${gy}" x2="${W - P.r}" y2="${gy}"/>` +
            `<text class="tick-label" x="${P.l - 6}" y="${gy + 4}" text-anchor="end">${val}</text>`;
  }
  const dots = trend.map((d, i) =>
    `<circle class="data-dot" cx="${x(i).toFixed(1)}" cy="${y(d.total).toFixed(1)}" r="4">` +
    `<title>${Util.esc(d.date)}：${d.total}题，正确率${Util.pct(d.accuracy)}</title></circle>`
  ).join('');
  const labels = trend.map((d, i) => {
    if (n > 10 && i % 2 === 1) return '';
    return `<text class="tick-label" x="${x(i).toFixed(1)}" y="${H - 10}" text-anchor="middle">` +
           `${Util.esc(d.date.slice(5))}</text>`;
  }).join('');
  return `<svg class="line-chart" viewBox="0 0 ${W} ${H}">
    ${grid}
    <polygon class="data-area" points="${area}"/>
    <polyline class="data-line" points="${pts}"/>
    ${dots}${labels}
  </svg>`;
}

function moduleBars(byModule) {
  const mods = AppState.PRACTICE_MODULES;
  const rows = mods.map(m => {
    const v = byModule[m];
    const acc = v ? v.accuracy : 0;
    const width = Math.round(acc * 100);
    const cls = acc >= 0.8 ? 'green' : (acc >= 0.6 ? '' : 'orange');
    const val = v ? `${v.correct}/${v.total}题 · ${Util.pct(acc)}` : '暂无记录';
    return `<div class="bar-row">
      <div>${Util.esc(m)}</div>
      <div class="bar-track"><div class="bar-fill ${cls}" style="width:${width}%"></div></div>
      <div class="bar-val">${val}</div>
    </div>`;
  }).join('');
  return `<div class="bar-chart">${rows}</div>`;
}

function top3HTML(items) {
  if (!items.length) {
    return '<div class="empty"><div class="big">🎯</div>今日三件事还没有安排<br>' +
           '<span style="font-size:13px">去「待办清单」把最重要的 3 件事标出来吧</span></div>';
  }
  return items.map((t, i) => `
    <div class="todo-item">
      <div style="font-size:20px">${['🥇', '🥈', '🥉'][i] || '▫️'}</div>
      <div class="todo-main">
        <div class="todo-title">${Util.esc(t.title)}</div>
        <div class="todo-meta"><span>${Util.esc(t.category)}</span>
        ${t.due_date ? '<span>截止 ' + Util.md(t.due_date) + '</span>' : ''}</div>
      </div>
      ${Util.priorityBadge(t.priority)}
    </div>`).join('') +
    '<div style="text-align:right;margin-top:8px"><a href="#/todos">去管理待办 →</a></div>';
}

function upcomingExamsHTML(items) {
  if (!items.length) {
    return '<div class="empty"><div class="big">📅</div>30 天内暂无考试安排</div>';
  }
  return items.map(e => {
    const d = /^(\d{4})-(\d{2})-(\d{2})/.exec(e.exam_date) || [];
    return `<div class="exam-card" style="margin-bottom:12px">
      <div class="exam-date-box ${e.days_left <= 7 ? 'urgent' : ''}">
        <div class="d">${d[3] ? parseInt(d[3], 10) : '—'}</div>
        <div class="m">${d[2] ? parseInt(d[2], 10) + '月' : ''}</div>
      </div>
      <div class="exam-info">
        <div class="exam-name">${Util.esc(e.name)}</div>
        <div class="exam-meta">${Util.esc(e.location || '地点待定')}</div>
      </div>
      <div class="countdown ${e.days_left <= 7 ? '' : ''}">还剩 ${e.days_left} 天</div>
    </div>`;
  }).join('');
}

function deadlinesHTML(items) {
  if (!items.length) {
    return '<div class="empty"><div class="big">🎉</div>14 天内没有截止的投递</div>';
  }
  return `<table class="data"><thead><tr>
      <th>公司</th><th>岗位</th><th>截止日期</th><th>状态</th></tr></thead><tbody>` +
    items.slice(0, 6).map(j => {
      const cd = Util.countdown(j.deadline);
      return `<tr><td>${Util.esc(j.company)}</td><td>${Util.esc(j.position)}</td>` +
        `<td>${Util.md(j.deadline)}</td>` +
        `<td>${cd ? '<span class="' + (cd.urgent ? 'overdue-tag' : '') + '">' +
          Util.esc(cd.text) + '</span>' : '—'}</td></tr>`;
    }).join('') + '</tbody></table>';
}
