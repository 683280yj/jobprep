# -*- coding: utf-8 -*-
"""
求职备考管理软件 V1.0
数据访问层：基于 SQLite 的全部数据表定义与 CRUD 操作。

本模块负责：
  1. 数据库文件初始化与表结构创建（含版本升级兼容）
  2. 用户账号（单用户本地登录）的密码哈希与校验
  3. 六大业务实体（求职投递 / 笔试练习 / 备考资料 / 待办事项 / 考试日程 / 操作日志）
     的增删改查与条件查询
  4. 为统计模块提供聚合查询原语

设计原则：
  - 零外部依赖，仅使用 Python 标准库 sqlite3 / hashlib / json / datetime
  - 所有写操作均在事务中完成，异常时回滚
  - 时间统一使用 ISO8601 字符串（YYYY-MM-DD 或 YYYY-MM-DD HH:MM:SS），便于排序与展示
"""

import hashlib
import json
import os
import sqlite3
import time
from datetime import datetime


# ---------------------------------------------------------------------------
# 常量定义：业务字典（与前端下拉选项保持一致）
# ---------------------------------------------------------------------------

# 求职投递所处阶段（按求职流程先后排序）
JOB_STAGES = ["待投递", "已投递", "笔试", "面试", "Offer", "已拒绝"]

# 笔试练习模块（覆盖行测主要题型）
PRACTICE_MODULES = ["图形推理", "逻辑判断", "数量分析", "资料分析", "言语理解", "常识判断"]

# 备考资料分类
MATERIAL_CATEGORIES = ["行测", "申论", "专业课", "面试", "简历", "其他"]

# 备考资料学习状态
MATERIAL_STATUS = ["未开始", "学习中", "已完成"]

# 待办事项分类
TODO_CATEGORIES = ["求职", "备考", "生活", "其他"]

# 待办优先级
TODO_PRIORITIES = ["高", "中", "低"]

# 数据库结构版本：用于未来升级时做迁移判断
SCHEMA_VERSION = 1


# ---------------------------------------------------------------------------
# 底层连接管理
# ---------------------------------------------------------------------------

class Database:
    """SQLite 连接封装：负责建表、升级与连接复用。"""

    def __init__(self, db_path):
        self.db_path = db_path
        # 目录不存在时自动创建，允许把数据库放在任意工作目录下
        parent = os.path.dirname(os.path.abspath(db_path))
        if parent and not os.path.exists(parent):
            os.makedirs(parent, exist_ok=True)
        self._conn = None
        self._init_schema()

    def connect(self):
        """获取数据库连接。

        Flask 开发服务器会为每个请求起新线程，而 sqlite3 连接默认绑定
        创建线程；此处关闭该检查（本软件为单用户本地应用，无并发写
        竞争），连接在进程内复用。
        """
        if self._conn is None:
            self._conn = sqlite3.connect(self.db_path,
                                         check_same_thread=False)
            # 返回字典型行，便于直接序列化为 JSON
            self._conn.row_factory = sqlite3.Row
        return self._conn

    def close(self):
        if self._conn is not None:
            self._conn.close()
            self._conn = None

    # -- 表结构 -------------------------------------------------------------
    def _init_schema(self):
        conn = self.connect()
        cur = conn.cursor()

        # 用户表：单用户本地账号，密码加盐哈希存储
        cur.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id            INTEGER PRIMARY KEY AUTOINCREMENT,
                username      TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                salt          TEXT NOT NULL,
                created_at    TEXT NOT NULL
            )
        """)

        # 求职投递表：记录每一次网申的全生命周期
        cur.execute("""
            CREATE TABLE IF NOT EXISTS job_applications (
                id           INTEGER PRIMARY KEY AUTOINCREMENT,
                company      TEXT NOT NULL,
                position     TEXT NOT NULL,
                city         TEXT DEFAULT '',
                stage        TEXT NOT NULL DEFAULT '待投递',
                source       TEXT DEFAULT '',
                applied_date TEXT DEFAULT '',
                deadline     TEXT DEFAULT '',
                salary_range TEXT DEFAULT '',
                priority     TEXT DEFAULT '中',
                notes        TEXT DEFAULT '',
                created_at   TEXT NOT NULL,
                updated_at   TEXT NOT NULL
            )
        """)

        # 笔试练习记录表：每一次刷题练习的量化记录
        cur.execute("""
            CREATE TABLE IF NOT EXISTS practice_sessions (
                id            INTEGER PRIMARY KEY AUTOINCREMENT,
                module        TEXT NOT NULL,
                question_count INTEGER NOT NULL,
                correct_count INTEGER NOT NULL,
                duration_min  REAL DEFAULT 0,
                practiced_at  TEXT NOT NULL,
                notes         TEXT DEFAULT '',
                created_at    TEXT NOT NULL
            )
        """)

        # 备考资料表：书籍 / 课程 / 讲义 / 真题等资料库
        cur.execute("""
            CREATE TABLE IF NOT EXISTS materials (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                title      TEXT NOT NULL,
                category   TEXT NOT NULL DEFAULT '行测',
                mtype      TEXT DEFAULT '书籍',
                location   TEXT DEFAULT '',
                status     TEXT NOT NULL DEFAULT '未开始',
                rating     INTEGER DEFAULT 0,
                notes      TEXT DEFAULT '',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
        """)

        # 待办事项表：支持「今日三件事」标记
        cur.execute("""
            CREATE TABLE IF NOT EXISTS todos (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                title      TEXT NOT NULL,
                category   TEXT NOT NULL DEFAULT '其他',
                priority   TEXT NOT NULL DEFAULT '中',
                due_date   TEXT DEFAULT '',
                done       INTEGER NOT NULL DEFAULT 0,
                is_top3    INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
        """)

        # 考试日程表：笔试 / 面试等关键时间节点
        cur.execute("""
            CREATE TABLE IF NOT EXISTS exams (
                id                   INTEGER PRIMARY KEY AUTOINCREMENT,
                name                 TEXT NOT NULL,
                exam_date            TEXT NOT NULL,
                location             TEXT DEFAULT '',
                registration_deadline TEXT DEFAULT '',
                notes                TEXT DEFAULT '',
                created_at           TEXT NOT NULL,
                updated_at           TEXT NOT NULL
            )
        """)

        # 操作日志表：记录关键数据变更，便于追溯
        cur.execute("""
            CREATE TABLE IF NOT EXISTS op_logs (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                action     TEXT NOT NULL,
                target     TEXT NOT NULL,
                detail     TEXT DEFAULT '',
                created_at TEXT NOT NULL
            )
        """)

        # 元信息表：存放 schema 版本等键值
        cur.execute("""
            CREATE TABLE IF NOT EXISTS meta (
                key   TEXT PRIMARY KEY,
                value TEXT NOT NULL
            )
        """)
        cur.execute(
            "INSERT OR IGNORE INTO meta (key, value) VALUES ('schema_version', ?)",
            (str(SCHEMA_VERSION),),
        )
        conn.commit()

    # -- 通用辅助 -------------------------------------------------------------
    @staticmethod
    def _now():
        return datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    @staticmethod
    def _today():
        return datetime.now().strftime("%Y-%m-%d")

    def _fetch_all(self, sql, params=()):
        cur = self.connect().cursor()
        cur.execute(sql, params)
        return [dict(row) for row in cur.fetchall()]

    def _fetch_one(self, sql, params=()):
        cur = self.connect().cursor()
        cur.execute(sql, params)
        row = cur.fetchone()
        return dict(row) if row else None

    def _execute(self, sql, params=()):
        conn = self.connect()
        cur = conn.cursor()
        try:
            cur.execute(sql, params)
            conn.commit()
            return cur.lastrowid
        except Exception:
            conn.rollback()
            raise

    def log(self, action, target, detail=""):
        """写入一条操作日志（内部调用，不对外暴露为 REST 资源）。"""
        try:
            self._execute(
                "INSERT INTO op_logs (action, target, detail, created_at)"
                " VALUES (?, ?, ?, ?)",
                (action, target, detail, self._now()),
            )
        except Exception:
            # 日志写入失败不应影响主业务流程
            pass


# ---------------------------------------------------------------------------
# 用户账号
# ---------------------------------------------------------------------------

def _hash_password(password, salt):
    """PBKDF2-HMAC-SHA256 密码哈希，20 万轮迭代。"""
    dk = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"),
                             salt.encode("utf-8"), 200000)
    return dk.hex()


class UserStore:
    """用户账号管理：首次运行创建默认账号，后续支持改密。"""

    DEFAULT_USERNAME = "admin"
    DEFAULT_PASSWORD = "123456"

    def __init__(self, db):
        self.db = db
        self._ensure_default_user()

    def _ensure_default_user(self):
        """数据库为空时创建默认账号 admin / 123456（首次登录后请立即修改）。"""
        existing = self.db._fetch_one("SELECT id FROM users LIMIT 1")
        if existing is None:
            salt = os.urandom(16).hex()
            self.db._execute(
                "INSERT INTO users (username, password_hash, salt, created_at)"
                " VALUES (?, ?, ?, ?)",
                (self.DEFAULT_USERNAME,
                 _hash_password(self.DEFAULT_PASSWORD, salt),
                 salt, self.db._now()),
            )

    def verify(self, username, password):
        """校验用户名密码，成功返回用户信息字典，失败返回 None。"""
        row = self.db._fetch_one(
            "SELECT * FROM users WHERE username = ?", (username,))
        if not row:
            return None
        if _hash_password(password, row["salt"]) == row["password_hash"]:
            return {"id": row["id"], "username": row["username"],
                    "created_at": row["created_at"]}
        return None

    def change_password(self, username, old_password, new_password):
        """修改密码：需先验证旧密码；新密码长度至少 6 位。"""
        if not new_password or len(new_password) < 6:
            return False, "新密码长度至少 6 位"
        user = self.verify(username, old_password)
        if not user:
            return False, "原密码不正确"
        salt = os.urandom(16).hex()
        self.db._execute(
            "UPDATE users SET password_hash = ?, salt = ? WHERE username = ?",
            (_hash_password(new_password, salt), salt, username),
        )
        self.db.log("修改密码", "users", username)
        return True, "密码修改成功"


# ---------------------------------------------------------------------------
# 求职投递
# ---------------------------------------------------------------------------

class JobStore:
    """求职投递记录的增删改查。"""

    def __init__(self, db):
        self.db = db

    def _validate(self, data):
        if not (data.get("company") or "").strip():
            return "公司名称不能为空"
        if not (data.get("position") or "").strip():
            return "投递岗位不能为空"
        if data.get("stage") and data["stage"] not in JOB_STAGES:
            return "投递阶段不合法"
        if data.get("priority") and data["priority"] not in TODO_PRIORITIES:
            return "优先级不合法"
        return None

    def create(self, data):
        err = self._validate(data)
        if err:
            return None, err
        now = self.db._now()
        rid = self.db._execute(
            """INSERT INTO job_applications
               (company, position, city, stage, source, applied_date, deadline,
                salary_range, priority, notes, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (data.get("company", "").strip(), data.get("position", "").strip(),
             data.get("city", ""), data.get("stage", "待投递"),
             data.get("source", ""), data.get("applied_date", ""),
             data.get("deadline", ""), data.get("salary_range", ""),
             data.get("priority", "中"), data.get("notes", ""), now, now),
        )
        self.db.log("新增", "job_applications",
                    "%s %s" % (data.get("company"), data.get("position")))
        return self.get(rid), None

    def get(self, rid):
        return self.db._fetch_one(
            "SELECT * FROM job_applications WHERE id = ?", (rid,))

    def list(self, stage=None, keyword=None, order="updated_at DESC"):
        """按阶段 / 关键字筛选投递记录。"""
        sql = "SELECT * FROM job_applications WHERE 1=1"
        params = []
        if stage:
            sql += " AND stage = ?"
            params.append(stage)
        if keyword:
            sql += " AND (company LIKE ? OR position LIKE ? OR city LIKE ?)"
            kw = "%%%s%%" % keyword
            params += [kw, kw, kw]
        sql += " ORDER BY " + order
        return self.db._fetch_all(sql, params)

    def update(self, rid, data):
        old = self.get(rid)
        if not old:
            return None, "记录不存在"
        merged = dict(old)
        merged.update({k: v for k, v in data.items()
                       if k in ("company", "position", "city", "stage", "source",
                                "applied_date", "deadline", "salary_range",
                                "priority", "notes")})
        err = self._validate(merged)
        if err:
            return None, err
        self.db._execute(
            """UPDATE job_applications SET company=?, position=?, city=?, stage=?,
               source=?, applied_date=?, deadline=?, salary_range=?, priority=?,
               notes=?, updated_at=? WHERE id=?""",
            (merged["company"], merged["position"], merged["city"],
             merged["stage"], merged["source"], merged["applied_date"],
             merged["deadline"], merged["salary_range"], merged["priority"],
             merged["notes"], self.db._now(), rid),
        )
        self.db.log("更新", "job_applications",
                    "%s %s -> %s" % (merged["company"], merged["position"],
                                     merged["stage"]))
        return self.get(rid), None

    def delete(self, rid):
        old = self.get(rid)
        if not old:
            return False, "记录不存在"
        self.db._execute("DELETE FROM job_applications WHERE id = ?", (rid,))
        self.db.log("删除", "job_applications",
                    "%s %s" % (old["company"], old["position"]))
        return True, None

    def count_by_stage(self):
        """各阶段投递数量统计，用于看板与漏斗图。"""
        rows = self.db._fetch_all(
            "SELECT stage, COUNT(*) AS c FROM job_applications GROUP BY stage")
        result = {s: 0 for s in JOB_STAGES}
        for r in rows:
            if r["stage"] in result:
                result[r["stage"]] = r["c"]
        return result

    def upcoming_deadlines(self, days=14):
        """未来 N 天内截止的投递（按截止日期升序）。"""
        today = self.db._today()
        rows = self.db._fetch_all(
            """SELECT * FROM job_applications
               WHERE deadline != '' AND deadline >= ?
                 AND stage NOT IN ('Offer', '已拒绝')
               ORDER BY deadline ASC""", (today,))
        return rows[:50]


# ---------------------------------------------------------------------------
# 笔试练习
# ---------------------------------------------------------------------------

class PracticeStore:
    """笔试练习记录的增删改查与正确率聚合。"""

    def __init__(self, db):
        self.db = db

    def _validate(self, data):
        if data.get("module") not in PRACTICE_MODULES:
            return "练习模块不合法"
        try:
            total = int(data.get("question_count", 0))
            correct = int(data.get("correct_count", 0))
        except (TypeError, ValueError):
            return "题量与答对数必须为整数"
        if total <= 0:
            return "练习题量必须大于 0"
        if not (0 <= correct <= total):
            return "答对数应在 0 到题量之间"
        return None

    def create(self, data):
        err = self._validate(data)
        if err:
            return None, err
        rid = self.db._execute(
            """INSERT INTO practice_sessions
               (module, question_count, correct_count, duration_min,
                practiced_at, notes, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (data["module"], int(data["question_count"]),
             int(data["correct_count"]),
             float(data.get("duration_min") or 0),
             data.get("practiced_at") or self.db._today(),
             data.get("notes", ""), self.db._now()),
        )
        self.db.log("新增", "practice_sessions",
                    "%s %s题" % (data["module"], data["question_count"]))
        return self.get(rid), None

    def get(self, rid):
        return self.db._fetch_one(
            "SELECT * FROM practice_sessions WHERE id = ?", (rid,))

    def list(self, module=None, limit=200):
        sql = "SELECT * FROM practice_sessions WHERE 1=1"
        params = []
        if module:
            sql += " AND module = ?"
            params.append(module)
        sql += " ORDER BY practiced_at DESC, id DESC LIMIT ?"
        params.append(limit)
        return self.db._fetch_all(sql, params)

    def update(self, rid, data):
        old = self.get(rid)
        if not old:
            return None, "记录不存在"
        merged = dict(old)
        merged.update({k: v for k, v in data.items()
                       if k in ("module", "question_count", "correct_count",
                                "duration_min", "practiced_at", "notes")})
        err = self._validate(merged)
        if err:
            return None, err
        self.db._execute(
            """UPDATE practice_sessions SET module=?, question_count=?,
               correct_count=?, duration_min=?, practiced_at=?, notes=?
               WHERE id=?""",
            (merged["module"], int(merged["question_count"]),
             int(merged["correct_count"]), float(merged["duration_min"] or 0),
             merged["practiced_at"], merged["notes"], rid),
        )
        return self.get(rid), None

    def delete(self, rid):
        if not self.get(rid):
            return False, "记录不存在"
        self.db._execute("DELETE FROM practice_sessions WHERE id = ?", (rid,))
        self.db.log("删除", "practice_sessions", "id=%s" % rid)
        return True, None

    def accuracy_by_module(self):
        """各模块累计正确率：答对总数 / 练习总数。"""
        rows = self.db._fetch_all(
            """SELECT module, SUM(question_count) AS total,
                      SUM(correct_count) AS correct
               FROM practice_sessions GROUP BY module""")
        result = {}
        for r in rows:
            total = r["total"] or 0
            result[r["module"]] = {
                "total": total,
                "correct": r["correct"] or 0,
                "accuracy": round((r["correct"] or 0) / total, 4)
                if total else 0,
            }
        return result

    def daily_trend(self, days=30):
        """最近 N 天每日练习量与正确率趋势。"""
        rows = self.db._fetch_all(
            """SELECT practiced_at AS d, SUM(question_count) AS total,
                      SUM(correct_count) AS correct,
                      SUM(duration_min) AS minutes
               FROM practice_sessions
               GROUP BY practiced_at ORDER BY practiced_at DESC LIMIT ?""",
            (days,))
        trend = []
        for r in reversed(rows):
            total = r["total"] or 0
            trend.append({
                "date": r["d"], "total": total,
                "correct": r["correct"] or 0,
                "minutes": round(r["minutes"] or 0, 1),
                "accuracy": round((r["correct"] or 0) / total, 4)
                if total else 0,
            })
        return trend


# ---------------------------------------------------------------------------
# 备考资料
# ---------------------------------------------------------------------------

class MaterialStore:
    """备考资料库的增删改查。"""

    def __init__(self, db):
        self.db = db

    def _validate(self, data):
        if not (data.get("title") or "").strip():
            return "资料标题不能为空"
        if data.get("category") and data["category"] not in MATERIAL_CATEGORIES:
            return "资料分类不合法"
        if data.get("status") and data["status"] not in MATERIAL_STATUS:
            return "学习状态不合法"
        return None

    def create(self, data):
        err = self._validate(data)
        if err:
            return None, err
        now = self.db._now()
        rid = self.db._execute(
            """INSERT INTO materials
               (title, category, mtype, location, status, rating, notes,
                created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (data["title"].strip(), data.get("category", "行测"),
             data.get("mtype", "书籍"), data.get("location", ""),
             data.get("status", "未开始"), int(data.get("rating") or 0),
             data.get("notes", ""), now, now),
        )
        return self.get(rid), None

    def get(self, rid):
        return self.db._fetch_one(
            "SELECT * FROM materials WHERE id = ?", (rid,))

    def list(self, category=None, status=None, keyword=None):
        sql = "SELECT * FROM materials WHERE 1=1"
        params = []
        if category:
            sql += " AND category = ?"
            params.append(category)
        if status:
            sql += " AND status = ?"
            params.append(status)
        if keyword:
            sql += " AND (title LIKE ? OR notes LIKE ?)"
            kw = "%%%s%%" % keyword
            params += [kw, kw]
        sql += " ORDER BY updated_at DESC"
        return self.db._fetch_all(sql, params)

    def update(self, rid, data):
        old = self.get(rid)
        if not old:
            return None, "记录不存在"
        merged = dict(old)
        merged.update({k: v for k, v in data.items()
                       if k in ("title", "category", "mtype", "location",
                                "status", "rating", "notes")})
        err = self._validate(merged)
        if err:
            return None, err
        self.db._execute(
            """UPDATE materials SET title=?, category=?, mtype=?, location=?,
               status=?, rating=?, notes=?, updated_at=? WHERE id=?""",
            (merged["title"], merged["category"], merged["mtype"],
             merged["location"], merged["status"],
             int(merged["rating"] or 0), merged["notes"],
             self.db._now(), rid),
        )
        return self.get(rid), None

    def delete(self, rid):
        if not self.get(rid):
            return False, "记录不存在"
        self.db._execute("DELETE FROM materials WHERE id = ?", (rid,))
        return True, None

    def count_by_status(self):
        rows = self.db._fetch_all(
            "SELECT status, COUNT(*) AS c FROM materials GROUP BY status")
        result = {s: 0 for s in MATERIAL_STATUS}
        for r in rows:
            if r["status"] in result:
                result[r["status"]] = r["c"]
        return result


# ---------------------------------------------------------------------------
# 待办事项
# ---------------------------------------------------------------------------

class TodoStore:
    """待办事项的增删改查，支持「今日三件事」标记与完成切换。"""

    def __init__(self, db):
        self.db = db

    def _validate(self, data):
        if not (data.get("title") or "").strip():
            return "待办标题不能为空"
        if data.get("category") and data["category"] not in TODO_CATEGORIES:
            return "待办分类不合法"
        if data.get("priority") and data["priority"] not in TODO_PRIORITIES:
            return "优先级不合法"
        return None

    def create(self, data):
        err = self._validate(data)
        if err:
            return None, err
        now = self.db._now()
        rid = self.db._execute(
            """INSERT INTO todos
               (title, category, priority, due_date, done, is_top3,
                created_at, updated_at)
               VALUES (?, ?, ?, ?, 0, ?, ?, ?)""",
            (data["title"].strip(), data.get("category", "其他"),
             data.get("priority", "中"), data.get("due_date", ""),
             1 if data.get("is_top3") else 0, now, now),
        )
        return self.get(rid), None

    def get(self, rid):
        return self.db._fetch_one("SELECT * FROM todos WHERE id = ?", (rid,))

    def list(self, done=None, category=None):
        sql = "SELECT * FROM todos WHERE 1=1"
        params = []
        if done is not None:
            sql += " AND done = ?"
            params.append(1 if done else 0)
        if category:
            sql += " AND category = ?"
            params.append(category)
        # 未完成的排前面：今日三件事优先，其次按优先级与截止日期
        sql += (" ORDER BY done ASC, is_top3 DESC,"
                " CASE priority WHEN '高' THEN 0 WHEN '中' THEN 1 ELSE 2 END,"
                " due_date ASC, updated_at DESC")
        return self.db._fetch_all(sql, params)

    def update(self, rid, data):
        old = self.get(rid)
        if not old:
            return None, "记录不存在"
        merged = dict(old)
        merged.update({k: v for k, v in data.items()
                       if k in ("title", "category", "priority", "due_date",
                                "done", "is_top3")})
        err = self._validate(merged)
        if err:
            return None, err
        self.db._execute(
            """UPDATE todos SET title=?, category=?, priority=?, due_date=?,
               done=?, is_top3=?, updated_at=? WHERE id=?""",
            (merged["title"], merged["category"], merged["priority"],
             merged["due_date"], 1 if merged["done"] else 0,
             1 if merged["is_top3"] else 0, self.db._now(), rid),
        )
        return self.get(rid), None

    def toggle_done(self, rid):
        old = self.get(rid)
        if not old:
            return None, "记录不存在"
        new_done = 0 if old["done"] else 1
        self.db._execute(
            "UPDATE todos SET done = ?, updated_at = ? WHERE id = ?",
            (new_done, self.db._now(), rid),
        )
        return self.get(rid), None

    def delete(self, rid):
        if not self.get(rid):
            return False, "记录不存在"
        self.db._execute("DELETE FROM todos WHERE id = ?", (rid,))
        return True, None

    def top3(self):
        """今日三件事：标记为 is_top3 且未完成的事项。"""
        return self.db._fetch_all(
            "SELECT * FROM todos WHERE is_top3 = 1 AND done = 0"
            " ORDER BY updated_at DESC LIMIT 3")

    def overdue(self):
        """已过期未完成的事项（截止日期早于今天）。"""
        today = self.db._today()
        return self.db._fetch_all(
            "SELECT * FROM todos WHERE done = 0 AND due_date != ''"
            " AND due_date < ? ORDER BY due_date ASC", (today,))


# ---------------------------------------------------------------------------
# 考试日程
# ---------------------------------------------------------------------------

class ExamStore:
    """笔试 / 面试等关键时间节点的增删改查。"""

    def __init__(self, db):
        self.db = db

    def _validate(self, data):
        if not (data.get("name") or "").strip():
            return "考试名称不能为空"
        if not (data.get("exam_date") or "").strip():
            return "考试日期不能为空"
        return None

    def create(self, data):
        err = self._validate(data)
        if err:
            return None, err
        now = self.db._now()
        rid = self.db._execute(
            """INSERT INTO exams
               (name, exam_date, location, registration_deadline, notes,
                created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (data["name"].strip(), data["exam_date"],
             data.get("location", ""),
             data.get("registration_deadline", ""),
             data.get("notes", ""), now, now),
        )
        return self.get(rid), None

    def get(self, rid):
        return self.db._fetch_one("SELECT * FROM exams WHERE id = ?", (rid,))

    def list(self, upcoming_only=False):
        sql = "SELECT * FROM exams"
        params = []
        if upcoming_only:
            sql += " WHERE exam_date >= ?"
            params.append(self.db._today())
        sql += " ORDER BY exam_date ASC"
        rows = self.db._fetch_all(sql, params)
        # 附加「距今天数」便于前端展示倒计时
        today = datetime.now().date()
        for r in rows:
            try:
                d = datetime.strptime(r["exam_date"][:10], "%Y-%m-%d").date()
                r["days_left"] = (d - today).days
            except (ValueError, TypeError):
                r["days_left"] = None
        return rows

    def update(self, rid, data):
        old = self.get(rid)
        if not old:
            return None, "记录不存在"
        merged = dict(old)
        merged.update({k: v for k, v in data.items()
                       if k in ("name", "exam_date", "location",
                                "registration_deadline", "notes")})
        err = self._validate(merged)
        if err:
            return None, err
        self.db._execute(
            """UPDATE exams SET name=?, exam_date=?, location=?,
               registration_deadline=?, notes=?, updated_at=? WHERE id=?""",
            (merged["name"], merged["exam_date"], merged["location"],
             merged["registration_deadline"], merged["notes"],
             self.db._now(), rid),
        )
        return self.get(rid), None

    def delete(self, rid):
        if not self.get(rid):
            return False, "记录不存在"
        self.db._execute("DELETE FROM exams WHERE id = ?", (rid,))
        return True, None


# ---------------------------------------------------------------------------
# 导出为 JSON（数据备份）
# ---------------------------------------------------------------------------

def export_all(db):
    """导出全部业务数据为字典，用于备份下载。"""
    tables = ["job_applications", "practice_sessions", "materials",
              "todos", "exams"]
    data = {"exported_at": db._now(), "tables": {}}
    for t in tables:
        data["tables"][t] = db._fetch_all("SELECT * FROM %s" % t)
    return data


def import_all(db, data):
    """从 export_all 的备份数据恢复（先清空再写入）。"""
    tables = ["job_applications", "practice_sessions", "materials",
              "todos", "exams"]
    payload = data.get("tables", {})
    conn = db.connect()
    cur = conn.cursor()
    try:
        for t in tables:
            rows = payload.get(t, [])
            if not rows:
                continue
            cur.execute("DELETE FROM %s" % t)
            cols = [c for c in rows[0].keys() if c != "id"]
            placeholders = ", ".join(["?"] * len(cols))
            for r in rows:
                cur.execute(
                    "INSERT INTO %s (%s) VALUES (%s)"
                    % (t, ", ".join(cols), placeholders),
                    [r[c] for c in cols],
                )
        conn.commit()
        db.log("导入备份", "database",
               "共 %d 张表" % sum(1 for t in tables if payload.get(t)))
        return True, "导入成功"
    except Exception as e:
        conn.rollback()
        return False, "导入失败：%s" % str(e)[:100]
