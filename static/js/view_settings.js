/* 求职备考管理软件 V1.0 · 设置视图
   功能：修改密码、演示数据管理、数据备份导出 / 恢复导入、关于。 */
'use strict';

Router.register('settings', {
  async render() {
    return `
    <div class="page-head">
      <div>
        <div class="page-title">设置</div>
        <div class="page-desc">账号安全与数据管理</div>
      </div>
    </div>

    <div class="card">
      <div class="card-title">🔐 账号安全</div>
      <div class="setting-row">
        <div>
          <div class="setting-label">修改登录密码</div>
          <div class="setting-desc">定期更换密码，保护本地数据安全</div>
        </div>
        <button class="btn" id="btn-change-pwd">修改密码</button>
      </div>
      <div class="setting-row">
        <div>
          <div class="setting-label">退出登录</div>
          <div class="setting-desc">清除当前浏览器会话</div>
        </div>
        <button class="btn" id="btn-logout">退出登录</button>
      </div>
    </div>

    <div class="card">
      <div class="card-title">💾 数据管理</div>
      <div class="setting-row">
        <div>
          <div class="setting-label">写入演示数据</div>
          <div class="setting-desc">一键填入示例数据，快速体验全部功能（会先清空现有数据）</div>
        </div>
        <button class="btn" id="btn-seed">写入演示数据</button>
      </div>
      <div class="setting-row">
        <div>
          <div class="setting-label">导出数据备份</div>
          <div class="setting-desc">将全部业务数据导出为 JSON 文件，妥善保存</div>
        </div>
        <button class="btn" id="btn-backup">导出备份</button>
      </div>
      <div class="setting-row">
        <div>
          <div class="setting-label">从备份恢复</div>
          <div class="setting-desc">选择之前导出的 JSON 备份文件进行恢复（会覆盖当前数据）</div>
        </div>
        <button class="btn" id="btn-restore">选择文件恢复</button>
        <input type="file" id="restore-file" accept=".json,application/json" class="hidden">
      </div>
    </div>

    <div class="card">
      <div class="card-title">ℹ️ 关于软件</div>
      <div class="about-box">
        <b>求职备考管理软件 V1.0</b><br>
        为求职季与备考季打造的本地化管理工具，覆盖求职投递跟踪、笔试练习记录、<br>
        备考资料管理、待办清单与考试日程五大场景，数据仅保存在本机，无需联网。<br>
        技术栈：Python Flask + SQLite + 原生 HTML / CSS / JavaScript。<br>
        开发完成日期：2026 年 10 月。
      </div>
    </div>`;
  },

  afterRender(root) {
    root.querySelector('#btn-change-pwd').addEventListener('click', () => {
      Modal.form('修改密码', [
        { name: 'old_password', label: '原密码', type: 'password', required: true },
        { name: 'new_password', label: '新密码（至少 6 位）', type: 'password', required: true },
        { name: 'new_password2', label: '确认新密码', type: 'password', required: true },
      ], async data => {
        if (data.new_password !== data.new_password2) {
          Toast.show('两次输入的新密码不一致');
          return false;
        }
        try {
          await API.post('/api/change_password', {
            old_password: data.old_password,
            new_password: data.new_password,
          });
          Toast.show('密码修改成功，请牢记新密码');
        } catch (e) { Toast.show(e.message); return false; }
      });
    });

    root.querySelector('#btn-logout').addEventListener('click', async () => {
      await API.post('/api/logout');
      AppState.user = null;
      Router.go('login');
    });

    root.querySelector('#btn-seed').addEventListener('click', () => {
      Modal.open('写入演示数据',
        '<p style="font-size:14px">将清空当前全部业务数据并写入演示数据，确定继续吗？</p>',
        async () => {
          try {
            await API.post('/api/seed_demo');
            Toast.show('演示数据已写入');
          } catch (e) { Toast.show(e.message); return false; }
        });
    });

    root.querySelector('#btn-backup').addEventListener('click', async () => {
      try {
        const data = await API.get('/api/backup');
        const blob = new Blob([JSON.stringify(data.backup, null, 2)],
                              { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = '求职备考管理软件_备份_' + Util.today() + '.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(a.href);
        Toast.show('备份文件已开始下载');
      } catch (e) { Toast.show(e.message); }
    });

    const fileInput = root.querySelector('#restore-file');
    root.querySelector('#btn-restore').addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', () => {
      const file = fileInput.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        let backup = null;
        try { backup = JSON.parse(reader.result); }
        catch (e) { Toast.show('备份文件格式不正确'); return; }
        Modal.open('从备份恢复',
          '<p style="font-size:14px">将用备份文件覆盖当前全部业务数据，确定继续吗？</p>',
          async () => {
            try {
              await API.post('/api/restore', { backup });
              Toast.show('数据恢复成功');
            } catch (e) { Toast.show(e.message); return false; }
          });
      };
      reader.readAsText(file);
      fileInput.value = '';
    });
  },
});
