# -*- coding: utf-8 -*-
"""
求职备考管理软件 V1.0
演示数据播种：写入一组贴近真实使用场景的示例数据。

用途：
  1. 新用户首次运行时一键体验全部功能
  2. 为使用手册截图提供统一的演示数据
  3. 自动化测试的基准数据集

注意：演示数据中的公司 / 人名均为虚构，仅用于功能演示。
调用时若 clear_first=True，会先清空五张业务表再写入。
"""

from datetime import datetime, timedelta

from models import (ExamStore, JobStore, MaterialStore, PracticeStore,
                    TodoStore)


def _days_ago(n):
    return (datetime.now() - timedelta(days=n)).strftime("%Y-%m-%d")


def _days_later(n):
    return (datetime.now() + timedelta(days=n)).strftime("%Y-%m-%d")


# ---------------------------------------------------------------------------
# 各实体的演示数据
# ---------------------------------------------------------------------------

DEMO_JOBS = [
    {"company": "星云科技", "position": "产品经理", "city": "杭州",
     "stage": "面试", "source": "校园招聘", "applied_date": _days_ago(20),
     "deadline": _days_later(5), "salary_range": "18-25K", "priority": "高",
     "notes": "一面已通过，等待二面通知，提前准备产品分析案例。"},
    {"company": "蓝桥软件", "position": "产品助理", "city": "合肥",
     "stage": "笔试", "source": "招聘网站", "applied_date": _days_ago(12),
     "deadline": _days_later(3), "salary_range": "12-16K", "priority": "高",
     "notes": "笔试为行测+产品案例分析，重点复习逻辑判断模块。"},
    {"company": "恒信证券", "position": "金融科技岗", "city": "上海",
     "stage": "已投递", "source": "公司官网", "applied_date": _days_ago(6),
     "deadline": _days_later(10), "salary_range": "20-28K", "priority": "中",
     "notes": "网申已提交，留意短信与邮件通知。"},
    {"company": "云启数据", "position": "数据产品经理", "city": "北京",
     "stage": "已投递", "source": "内推", "applied_date": _days_ago(4),
     "deadline": "", "salary_range": "22-30K", "priority": "高",
     "notes": "学长内推，已确认简历进入筛选环节。"},
    {"company": "晨光文具", "position": "运营专员", "city": "上海",
     "stage": "Offer", "source": "校园招聘", "applied_date": _days_ago(45),
     "deadline": "", "salary_range": "10-14K", "priority": "低",
     "notes": "已收到 Offer，作为保底选项，答复截止下周。"},
    {"company": "远方物流", "position": "管培生", "city": "合肥",
     "stage": "已拒绝", "source": "招聘网站", "applied_date": _days_ago(50),
     "deadline": "", "salary_range": "8-12K", "priority": "低",
     "notes": "一面未通过，反思：对行业理解准备不足。"},
    {"company": "智行汽车", "position": "产品经理", "city": "合肥",
     "stage": "待投递", "source": "校园招聘", "applied_date": "",
     "deadline": _days_later(7), "salary_range": "15-20K", "priority": "中",
     "notes": "网申截止临近，需针对性优化项目经历描述。"},
    {"company": "安信银行", "position": "金融科技管培生", "city": "杭州",
     "stage": "待投递", "source": "公司官网", "applied_date": "",
     "deadline": _days_later(12), "salary_range": "18-24K", "priority": "中",
     "notes": ""},
]

DEMO_PRACTICE = [
    # (模块， 题量， 答对， 时长分钟， N天前， 备注)
    ("图形推理", 20, 15, 25, 13, "折叠展开类错误较多"),
    ("逻辑判断", 20, 14, 30, 13, "加强削弱题型需总结"),
    ("数量分析", 15, 9, 35, 12, "工程问题公式不熟"),
    ("图形推理", 20, 17, 22, 11, "有进步"),
    ("资料分析", 20, 16, 30, 11, "速算技巧见效"),
    ("言语理解", 20, 15, 25, 10, ""),
    ("逻辑判断", 25, 19, 35, 9, "翻译推理基本掌握"),
    ("数量分析", 20, 13, 40, 8, "行程问题仍是短板"),
    ("图形推理", 25, 21, 28, 7, ""),
    ("常识判断", 20, 12, 20, 6, "法律常识欠缺"),
    ("资料分析", 25, 21, 32, 5, "正确率稳定在 80%+"),
    ("逻辑判断", 20, 17, 30, 4, ""),
    ("数量分析", 20, 15, 35, 3, "错题本回顾有效"),
    ("图形推理", 20, 18, 24, 2, ""),
    ("言语理解", 25, 20, 30, 1, "中心理解题全对"),
    ("逻辑判断", 20, 18, 28, 0, "今日练习"),
]

DEMO_MATERIALS = [
    {"title": "行测模块宝典（2026 版）", "category": "行测",
     "mtype": "书籍", "location": "书架第一层", "status": "学习中",
     "rating": 5, "notes": "按模块刷题，每天一章。"},
    {"title": "粉笔 980 系统班讲义", "category": "行测",
     "mtype": "讲义", "location": "D:/备考/讲义", "status": "学习中",
     "rating": 4, "notes": "配合视频课程使用。"},
    {"title": "近五年国考真题套卷", "category": "行测",
     "mtype": "真题", "location": "D:/备考/真题", "status": "未开始",
     "rating": 5, "notes": "考前一个月开始模考。"},
    {"title": "申论范文 100 篇", "category": "申论",
     "mtype": "书籍", "location": "书架第二层", "status": "未开始",
     "rating": 4, "notes": ""},
    {"title": "半月谈时政热点合集", "category": "申论",
     "mtype": "课程", "location": "在线课程", "status": "学习中",
     "rating": 4, "notes": "每天积累 3 个金句。"},
    {"title": "产品经理面试题库", "category": "面试",
     "mtype": "文档", "location": "D:/求职/面试", "status": "已完成",
     "rating": 5, "notes": "高频题已背熟。"},
    {"title": "简历优化指南", "category": "简历",
     "mtype": "书籍", "location": "书架第一层", "status": "已完成",
     "rating": 4, "notes": ""},
    {"title": "计量经济学（第七版）", "category": "专业课",
     "mtype": "书籍", "location": "图书馆借阅", "status": "学习中",
     "rating": 3, "notes": "结合论文选题阅读。"},
]

DEMO_TODOS = [
    {"title": "完成蓝桥软件笔试", "category": "求职",
     "priority": "高", "due_date": _days_later(3),
     "done": 0, "is_top3": 1},
    {"title": "刷逻辑判断 20 题并整理错题", "category": "备考",
     "priority": "高", "due_date": _days_later(0),
     "done": 0, "is_top3": 1},
    {"title": "优化智行汽车网申简历", "category": "求职",
     "priority": "中", "due_date": _days_later(6),
     "done": 0, "is_top3": 1},
    {"title": "背诵 3 个申论金句", "category": "备考",
     "priority": "中", "due_date": _days_later(0),
     "done": 1, "is_top3": 0},
    {"title": "整理本周笔试错题本", "category": "备考",
     "priority": "中", "due_date": _days_later(2),
     "done": 0, "is_top3": 0},
    {"title": "给导师发论文进度邮件", "category": "其他",
     "priority": "低", "due_date": _days_later(5),
     "done": 0, "is_top3": 0},
    {"title": "缴纳下季度房租", "category": "生活",
     "priority": "高", "due_date": _days_ago(1),
     "done": 0, "is_top3": 0},
    {"title": "晨跑 5 公里", "category": "生活",
     "priority": "低", "due_date": _days_ago(2),
     "done": 1, "is_top3": 0},
]

DEMO_EXAMS = [
    {"name": "蓝桥软件产品助理笔试", "exam_date": _days_later(3),
     "location": "线上", "registration_deadline": _days_ago(2),
     "notes": "行测 60 分钟 + 产品案例分析 30 分钟"},
    {"name": "国家公务员考试（笔试）", "exam_date": _days_later(54),
     "location": "合肥考区", "registration_deadline": _days_later(9),
     "notes": "行测 + 申论，报名后开始套卷模考"},
    {"name": "星云科技产品经理二面", "exam_date": _days_later(6),
     "location": "杭州市滨江区", "registration_deadline": "",
     "notes": "准备 15 分钟产品方案展示"},
]


# ---------------------------------------------------------------------------
# 播种入口
# ---------------------------------------------------------------------------

def seed_demo_data(db, clear_first=False):
    """写入演示数据，返回各表写入条数统计。"""
    jobs = JobStore(db)
    practice = PracticeStore(db)
    materials = MaterialStore(db)
    todos = TodoStore(db)
    exams = ExamStore(db)

    if clear_first:
        conn = db.connect()
        cur = conn.cursor()
        for t in ("job_applications", "practice_sessions", "materials",
                  "todos", "exams"):
            cur.execute("DELETE FROM %s" % t)
        conn.commit()

    counts = {"jobs": 0, "practice": 0, "materials": 0,
              "todos": 0, "exams": 0}

    for j in DEMO_JOBS:
        item, err = jobs.create(j)
        if item:
            counts["jobs"] += 1

    for module, total, correct, minutes, ago, notes in DEMO_PRACTICE:
        item, err = practice.create({
            "module": module, "question_count": total,
            "correct_count": correct, "duration_min": minutes,
            "practiced_at": _days_ago(ago), "notes": notes})
        if item:
            counts["practice"] += 1

    for m in DEMO_MATERIALS:
        item, err = materials.create(m)
        if item:
            counts["materials"] += 1

    for t in DEMO_TODOS:
        item, err = todos.create(t)
        if item:
            counts["todos"] += 1

    for e in DEMO_EXAMS:
        item, err = exams.create(e)
        if item:
            counts["exams"] += 1

    db.log("写入演示数据", "database", str(counts))
    return counts
