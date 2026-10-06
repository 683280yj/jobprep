# -*- coding: utf-8 -*-
"""
求职备考管理软件 V1.0
统计分析模块：为「数据总览」看板提供各类聚合指标。

本模块只做只读聚合计算，不修改任何业务数据。所有指标均由
models 层的基础查询组合而成，便于单元测试与复用。
"""

from datetime import datetime, timedelta


def _parse_date(s):
    """解析 YYYY-MM-DD，失败返回 None。"""
    try:
        return datetime.strptime((s or "")[:10], "%Y-%m-%d").date()
    except (ValueError, TypeError):
        return None


def overview(db, jobs, practice, materials, todos, exams):
    """首页总览看板的一站式数据包。

    返回字典包含：
      jobs:      求职投递总数 / 各阶段数量 / Offer 率 / 近 14 天新增
      practice:  累计练习题量 / 累计答对 / 总体正确率 / 累计时长 / 近 7 天题量
      materials: 资料总数 / 各状态数量 / 完成率
      todos:     待办总数 / 未完成数 / 逾期数 / 今日三件事完成情况
      exams:     临近考试（30 天内）列表
    """
    today = datetime.now().date()

    # ---- 求职投递 ----
    stage_counts = jobs.count_by_stage()
    total_jobs = sum(stage_counts.values())
    offer_count = stage_counts.get("Offer", 0)
    # Offer 率 = Offer 数 / 已出结果数（Offer + 已拒绝），避免分母为 0
    decided = offer_count + stage_counts.get("已拒绝", 0)
    offer_rate = round(offer_count / decided, 4) if decided else 0
    active_jobs = total_jobs - offer_count - stage_counts.get("已拒绝", 0)

    # ---- 笔试练习 ----
    acc_modules = practice.accuracy_by_module()
    total_q = sum(v["total"] for v in acc_modules.values())
    total_c = sum(v["correct"] for v in acc_modules.values())
    overall_acc = round(total_c / total_q, 4) if total_q else 0
    trend = practice.daily_trend(days=7)
    week_q = sum(d["total"] for d in trend)
    week_minutes = round(sum(d["minutes"] for d in trend), 1)
    # 正确率最低的模块 → 薄弱环节提示
    weakest = None
    if acc_modules:
        weakest = min(acc_modules.items(), key=lambda kv: kv[1]["accuracy"])[0]

    # ---- 备考资料 ----
    mat_status = materials.count_by_status()
    total_mat = sum(mat_status.values())
    mat_done_rate = (round(mat_status.get("已完成", 0) / total_mat, 4)
                     if total_mat else 0)

    # ---- 待办事项 ----
    all_todos = todos.list()
    undone = [t for t in all_todos if not t["done"]]
    overdue_list = todos.overdue()
    top3_list = todos.top3()

    # ---- 临近考试 ----
    upcoming_exams = []
    for e in exams.list(upcoming_only=True):
        if e["days_left"] is not None and e["days_left"] <= 30:
            upcoming_exams.append(e)

    return {
        "jobs": {
            "total": total_jobs,
            "active": active_jobs,
            "by_stage": stage_counts,
            "offer_rate": offer_rate,
            "upcoming_deadlines": jobs.upcoming_deadlines(days=14),
        },
        "practice": {
            "total_questions": total_q,
            "total_correct": total_c,
            "overall_accuracy": overall_acc,
            "week_questions": week_q,
            "week_minutes": week_minutes,
            "by_module": acc_modules,
            "weakest_module": weakest,
            "daily_trend": trend,
        },
        "materials": {
            "total": total_mat,
            "by_status": mat_status,
            "done_rate": mat_done_rate,
        },
        "todos": {
            "total": len(all_todos),
            "undone": len(undone),
            "overdue": len(overdue_list),
            "overdue_list": overdue_list[:5],
            "top3": top3_list,
        },
        "exams": {
            "upcoming": upcoming_exams,
        },
        "generated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
    }


def job_funnel(jobs):
    """求职漏斗：按阶段顺序返回各阶段数量与转化率。

    转化率口径：本阶段数量 / 上一阶段数量（首阶段为 100%）。
    """
    counts = jobs.count_by_stage()
    order = ["待投递", "已投递", "笔试", "面试", "Offer"]
    funnel = []
    prev = None
    for stage in order:
        c = counts.get(stage, 0)
        rate = 1.0 if prev is None else (round(c / prev, 4) if prev else 0)
        funnel.append({"stage": stage, "count": c, "rate": rate})
        prev = c
    funnel.append({"stage": "已拒绝", "count": counts.get("已拒绝", 0),
                   "rate": None})
    return funnel


def practice_weekly_report(practice, weeks=8):
    """按自然周聚合练习数据，用于周报式的进步曲线。

    返回最近 N 周每周的：题量 / 答对 / 正确率 / 时长（分钟）。
    """
    sessions = practice.list(limit=10000)
    buckets = {}
    for s in sessions:
        d = _parse_date(s.get("practiced_at"))
        if not d:
            continue
        # 以周一为一周的开始
        monday = d - timedelta(days=d.weekday())
        key = monday.strftime("%Y-%m-%d")
        b = buckets.setdefault(key, {"week_start": key, "total": 0,
                                     "correct": 0, "minutes": 0.0})
        b["total"] += s["question_count"] or 0
        b["correct"] += s["correct_count"] or 0
        b["minutes"] += s["duration_min"] or 0
    weeks_sorted = sorted(buckets.values(),
                          key=lambda x: x["week_start"], reverse=True)[:weeks]
    for w in weeks_sorted:
        total = w["total"]
        w["accuracy"] = round(w["correct"] / total, 4) if total else 0
        w["minutes"] = round(w["minutes"], 1)
    return list(reversed(weeks_sorted))


def module_radar(practice):
    """各模块能力雷达：题量与正确率，用于定位薄弱模块。"""
    acc = practice.accuracy_by_module()
    radar = []
    for module in ["图形推理", "逻辑判断", "数量分析",
                   "资料分析", "言语理解", "常识判断"]:
        v = acc.get(module, {"total": 0, "correct": 0, "accuracy": 0})
        radar.append({
            "module": module,
            "total": v["total"],
            "accuracy": v["accuracy"],
            # 熟练度综合分：正确率 * min(1, 题量/200)，题量不足则打折
            "proficiency": round(v["accuracy"] * min(1.0, v["total"] / 200), 4),
        })
    return radar


def material_progress_by_category(db, materials):
    """按分类统计资料完成情况。"""
    rows = db._fetch_all(
        """SELECT category,
                  COUNT(*) AS total,
                  SUM(CASE WHEN status='已完成' THEN 1 ELSE 0 END) AS done
           FROM materials GROUP BY category""")
    result = []
    for r in rows:
        total = r["total"] or 0
        done = r["done"] or 0
        result.append({
            "category": r["category"], "total": total, "done": done,
            "rate": round(done / total, 4) if total else 0,
        })
    return sorted(result, key=lambda x: x["total"], reverse=True)


def todo_completion_trend(db, days=14):
    """最近 N 天待办完成趋势（按 updated_at 且 done=1 聚合）。"""
    rows = db._fetch_all(
        """SELECT substr(updated_at, 1, 10) AS d, COUNT(*) AS c
           FROM todos WHERE done = 1 GROUP BY d
           ORDER BY d DESC LIMIT ?""", (days,))
    trend = [{"date": r["d"], "done_count": r["c"]} for r in reversed(rows)]
    return trend
