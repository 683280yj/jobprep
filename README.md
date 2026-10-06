# 求职备考管理软件 V1.0

为求职季与备考季打造的本地化管理工具：求职投递跟踪、笔试练习记录、
备考资料管理、待办清单、考试日程五大模块，数据仅保存在本机 SQLite，
无需联网，开箱即用。

## 功能一览

- 🏠 **数据总览**：投递漏斗、刷题趋势、模块正确率、今日三件事、考试倒计时
- 💼 **求职投递**：全流程阶段看板（待投递→已投递→笔试→面试→Offer），截止提醒
- ✍️ **笔试练习**：按模块记录刷题，能力雷达定位薄弱项，8 周进步曲线
- 📚 **备考资料**：书籍 / 讲义 / 真题统一入库，学习进度一目了然
- ✅ **待办清单**：今日三件事聚焦，逾期提醒，分类管理
- 📅 **考试日程**：关键时间节点倒计时
- ⚙️ **设置**：改密、演示数据、JSON 备份导出 / 恢复

## 快速开始

```bash
pip install -r requirements.txt
python run.py --init-demo     # 写入演示数据并启动
# 浏览器打开 http://127.0.0.1:5000
# 默认账号 admin / 123456（首次登录后请立即修改）
```

常用参数：`--port 8080` 指定端口，`--host 0.0.0.0` 允许局域网访问。

## 技术栈

Python 3 + Flask + SQLite（标准库），前端为原生 HTML / CSS / JavaScript，
图表均为手绘 SVG / CSS 实现，无第三方前端依赖。

## 目录结构

```
jobprep/
  backend/    app.py（路由） models.py（数据层） stats.py（统计） seed.py（演示数据）
  templates/  index.html（单页应用壳）
  static/     css/style.css  js/（核心 + 7 个业务视图）
  data/       jobprep.db（运行时自动创建）
  run.py      启动入口
```

## 版本历史

- V1.0（2026-10）：首个正式版本，五大功能模块上线。

## 附：手册截图辅助

设置环境变量 `JOBPREP_AUTO_LOGIN=admin` 后启动，可免登录直接进入主界面，
仅用于制作使用手册截图，日常使用请勿开启：

```bash
JOBPREP_AUTO_LOGIN=admin python run.py --port 5055
```
