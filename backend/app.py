# -*- coding: utf-8 -*-
"""
求职备考管理软件 V1.0
Web 服务入口：Flask 应用、路由注册、会话鉴权与演示数据播种。

运行方式：
    python run.py            # 开发模式，监听 127.0.0.1:5000
    python run.py --port 8080 --init-demo   # 指定端口并写入演示数据

目录结构约定：
    jobprep/
      backend/      本目录：app.py / models.py / stats.py / seed.py
      templates/    index.html（单页应用壳）
      static/       css 与 js 前端资源
      data/        SQLite 数据库文件（首次运行时自动创建）
"""

import functools
import json
import os
import sys

from flask import (Flask, jsonify, redirect, render_template, request,
                   send_from_directory, session)

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from models import (Database, ExamStore, JobStore, MaterialStore,
                    PracticeStore, TodoStore, UserStore, export_all,
                    import_all)
import stats as stats_mod
from seed import seed_demo_data

# ---------------------------------------------------------------------------
# 应用与存储初始化
# ---------------------------------------------------------------------------

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(BASE_DIR, "data")
DB_PATH = os.path.join(DATA_DIR, "jobprep.db")

APP_NAME = "求职备考管理软件"
APP_VERSION = "V1.0"


def create_app(db_path=DB_PATH):
    """应用工厂：创建 Flask 实例并装配全部路由。"""
    app = Flask(__name__,
                template_folder=os.path.join(BASE_DIR, "templates"),
                static_folder=os.path.join(BASE_DIR, "static"))
    # 会话密钥：首次运行随机生成并持久化，避免重启后会话失效
    app.secret_key = _load_or_create_secret()

    db = Database(db_path)
    users = UserStore(db)
    jobs = JobStore(db)
    practice = PracticeStore(db)
    materials = MaterialStore(db)
    todos = TodoStore(db)
    exams = ExamStore(db)

    # 挂到 app 上，便于测试与扩展访问
    app.db = db
    app.stores = {"users": users, "jobs": jobs, "practice": practice,
                  "materials": materials, "todos": todos, "exams": exams}

    # ------------------------------------------------------------------
    # 鉴权装饰器
    # ------------------------------------------------------------------
    def login_required(view):
        @functools.wraps(view)
        def wrapper(*args, **kwargs):
            if not session.get("username"):
                return jsonify({"ok": False, "error": "未登录",
                                "code": "NOT_LOGGED_IN"}), 401
            return view(*args, **kwargs)
        return wrapper

    # ------------------------------------------------------------------
    # 页面路由
    # ------------------------------------------------------------------
    @app.route("/")
    def index():
        # 单页应用壳；前端按登录态渲染登录页或主界面
        # 截图辅助：设置环境变量 JOBPREP_AUTO_LOGIN=admin 后，可免登录
        # 直接进入主界面，仅用于制作使用手册截图，生产环境请勿开启
        if (os.environ.get("JOBPREP_AUTO_LOGIN") == "admin"
                and not session.get("username")):
            session["username"] = UserStore.DEFAULT_USERNAME
        return render_template("index.html", app_name=APP_NAME,
                               app_version=APP_VERSION)

    @app.route("/health")
    def health():
        return jsonify({"ok": True, "app": APP_NAME,
                        "version": APP_VERSION})

    # ------------------------------------------------------------------
    # 账号接口
    # ------------------------------------------------------------------
    @app.route("/api/login", methods=["POST"])
    def api_login():
        data = request.get_json(force=True, silent=True) or {}
        username = (data.get("username") or "").strip()
        password = data.get("password") or ""
        user = users.verify(username, password)
        if not user:
            return jsonify({"ok": False, "error": "用户名或密码不正确"}), 400
        session["username"] = user["username"]
        session.permanent = True
        return jsonify({"ok": True, "user": user})

    @app.route("/api/logout", methods=["POST"])
    def api_logout():
        session.pop("username", None)
        return jsonify({"ok": True})

    @app.route("/api/me")
    def api_me():
        if not session.get("username"):
            return jsonify({"ok": True, "user": None})
        return jsonify({"ok": True,
                        "user": {"username": session["username"]}})

    @app.route("/api/change_password", methods=["POST"])
    @login_required
    def api_change_password():
        data = request.get_json(force=True, silent=True) or {}
        ok, msg = users.change_password(session["username"],
                                        data.get("old_password", ""),
                                        data.get("new_password", ""))
        return jsonify({"ok": ok, "error": None if ok else msg,
                        "message": msg if ok else None})

    # ------------------------------------------------------------------
    # 通用 CRUD 路由生成器
    # ------------------------------------------------------------------
    def crud_routes(prefix, store, list_kwargs=()):
        """为一个 Store 批量注册 list/get/create/update/delete 路由。"""

        @app.route("/api/%s" % prefix, methods=["GET"],
                   endpoint="list_" + prefix)
        @login_required
        def _list(store=store, list_kwargs=list_kwargs):
            kwargs = {}
            for key in list_kwargs:
                if key in request.args:
                    kwargs[key] = request.args.get(key)
            try:
                items = store.list(**kwargs)
            except TypeError:
                items = store.list()
            return jsonify({"ok": True, "items": items})

        @app.route("/api/%s/<int:rid>" % prefix, methods=["GET"],
                   endpoint="get_" + prefix)
        @login_required
        def _get(rid, store=store):
            item = store.get(rid)
            if not item:
                return jsonify({"ok": False, "error": "记录不存在"}), 404
            return jsonify({"ok": True, "item": item})

        @app.route("/api/%s" % prefix, methods=["POST"],
                   endpoint="create_" + prefix)
        @login_required
        def _create(store=store):
            data = request.get_json(force=True, silent=True) or {}
            item, err = store.create(data)
            if err:
                return jsonify({"ok": False, "error": err}), 400
            return jsonify({"ok": True, "item": item})

        @app.route("/api/%s/<int:rid>" % prefix, methods=["PUT"],
                   endpoint="update_" + prefix)
        @login_required
        def _update(rid, store=store):
            data = request.get_json(force=True, silent=True) or {}
            item, err = store.update(rid, data)
            if err:
                return jsonify({"ok": False, "error": err}), 400
            return jsonify({"ok": True, "item": item})

        @app.route("/api/%s/<int:rid>" % prefix, methods=["DELETE"],
                   endpoint="delete_" + prefix)
        @login_required
        def _delete(rid, store=store):
            ok, err = store.delete(rid)
            if not ok:
                return jsonify({"ok": False, "error": err}), 400
            return jsonify({"ok": True})

    crud_routes("jobs", jobs)
    crud_routes("practice", practice)
    crud_routes("materials", materials)
    crud_routes("todos", todos)
    crud_routes("exams", exams)

    # ------------------------------------------------------------------
    # 各实体的扩展接口
    # ------------------------------------------------------------------
    @app.route("/api/todos/<int:rid>/toggle", methods=["POST"])
    @login_required
    def api_todo_toggle(rid):
        item, err = todos.toggle_done(rid)
        if err:
            return jsonify({"ok": False, "error": err}), 400
        return jsonify({"ok": True, "item": item})

    @app.route("/api/todos/top3", methods=["GET"])
    @login_required
    def api_todo_top3():
        return jsonify({"ok": True, "items": todos.top3()})

    @app.route("/api/todos/overdue", methods=["GET"])
    @login_required
    def api_todo_overdue():
        return jsonify({"ok": True, "items": todos.overdue()})

    @app.route("/api/jobs/by_stage", methods=["GET"])
    @login_required
    def api_jobs_by_stage():
        return jsonify({"ok": True, "counts": jobs.count_by_stage()})

    @app.route("/api/jobs/upcoming_deadlines", methods=["GET"])
    @login_required
    def api_jobs_deadlines():
        days = int(request.args.get("days", 14))
        return jsonify({"ok": True,
                        "items": jobs.upcoming_deadlines(days=days)})

    @app.route("/api/practice/accuracy_by_module", methods=["GET"])
    @login_required
    def api_practice_accuracy():
        return jsonify({"ok": True,
                        "modules": practice.accuracy_by_module()})

    @app.route("/api/practice/daily_trend", methods=["GET"])
    @login_required
    def api_practice_trend():
        days = int(request.args.get("days", 30))
        return jsonify({"ok": True, "trend": practice.daily_trend(days=days)})

    @app.route("/api/materials/by_status", methods=["GET"])
    @login_required
    def api_materials_status():
        return jsonify({"ok": True, "counts": materials.count_by_status()})

    # ------------------------------------------------------------------
    # 统计看板接口
    # ------------------------------------------------------------------
    @app.route("/api/stats/overview", methods=["GET"])
    @login_required
    def api_stats_overview():
        data = stats_mod.overview(db, jobs, practice, materials, todos, exams)
        return jsonify({"ok": True, "stats": data})

    @app.route("/api/stats/funnel", methods=["GET"])
    @login_required
    def api_stats_funnel():
        return jsonify({"ok": True,
                        "funnel": stats_mod.job_funnel(jobs)})

    @app.route("/api/stats/weekly", methods=["GET"])
    @login_required
    def api_stats_weekly():
        weeks = int(request.args.get("weeks", 8))
        return jsonify({"ok": True,
                        "weeks": stats_mod.practice_weekly_report(
                            practice, weeks=weeks)})

    @app.route("/api/stats/radar", methods=["GET"])
    @login_required
    def api_stats_radar():
        return jsonify({"ok": True,
                        "radar": stats_mod.module_radar(practice)})

    @app.route("/api/stats/material_progress", methods=["GET"])
    @login_required
    def api_stats_mat_progress():
        return jsonify({"ok": True, "progress":
                        stats_mod.material_progress_by_category(db,
                                                               materials)})

    # ------------------------------------------------------------------
    # 数据备份与恢复
    # ------------------------------------------------------------------
    @app.route("/api/backup", methods=["GET"])
    @login_required
    def api_backup():
        return jsonify({"ok": True, "backup": export_all(db)})

    @app.route("/api/restore", methods=["POST"])
    @login_required
    def api_restore():
        data = request.get_json(force=True, silent=True) or {}
        ok, msg = import_all(db, data.get("backup") or {})
        return jsonify({"ok": ok, "error": None if ok else msg,
                        "message": msg if ok else None})

    @app.route("/api/seed_demo", methods=["POST"])
    @login_required
    def api_seed_demo():
        """一键写入演示数据（已存在数据时先清空）。"""
        count = seed_demo_data(db, clear_first=True)
        return jsonify({"ok": True, "message": "已写入演示数据",
                        "count": count})

    # ------------------------------------------------------------------
    # 静态资源兜底（便于直接用文件服务器预览）
    # ------------------------------------------------------------------
    @app.route("/favicon.ico")
    def favicon():
        return send_from_directory(
            os.path.join(BASE_DIR, "static"), "favicon.ico",
            mimetype="image/x-icon")

    return app


def _load_or_create_secret():
    """加载或生成 Flask 会话密钥，持久化在 data/secret.key。"""
    os.makedirs(DATA_DIR, exist_ok=True)
    key_file = os.path.join(DATA_DIR, "secret.key")
    if os.path.exists(key_file):
        with open(key_file, "rb") as f:
            return f.read().strip()
    secret = os.urandom(32)
    with open(key_file, "wb") as f:
        f.write(secret)
    try:
        os.chmod(key_file, 0o600)
    except OSError:
        pass
    return secret


def main(argv):
    """命令行入口：解析端口 / 演示数据等参数并启动服务。"""
    import argparse
    parser = argparse.ArgumentParser(
        description="%s %s" % (APP_NAME, APP_VERSION))
    parser.add_argument("--port", type=int, default=5000,
                        help="监听端口（默认 5000）")
    parser.add_argument("--host", default="127.0.0.1",
                        help="监听地址（默认 127.0.0.1）")
    parser.add_argument("--init-demo", action="store_true",
                        help="启动前写入演示数据（会先清空已有数据）")
    parser.add_argument("--debug", action="store_true",
                        help="开启 Flask 调试模式")
    args = parser.parse_args(argv)

    app = create_app()
    if args.init_demo:
        count = seed_demo_data(app.db, clear_first=True)
        print("演示数据已写入：%s" % json.dumps(count, ensure_ascii=False))
    print("%s %s 正在启动：http://%s:%d"
          % (APP_NAME, APP_VERSION, args.host, args.port))
    print("默认账号 admin / 123456（首次登录后请立即修改密码）")
    app.run(host=args.host, port=args.port, debug=args.debug)


if __name__ == "__main__":
    main(sys.argv[1:])
