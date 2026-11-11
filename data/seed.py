"""Build data/finco.db: synthetic loan book of a fictional finance company.

Deterministic (seed 42). Report date 2026-09-30. Violations are planted on
purpose so the policy checks have something to find:
- Can Tho branch NPL ratio above 3 %, Hai Phong just below.
- One corporate customer above 10 % of capital, one related party above 5 %.
- Some consumer loans above the 20 % rate cap, some LTV breaches, stale appraisals.
"""
import random
import sqlite3
from datetime import date, timedelta
from pathlib import Path

DB = Path(__file__).with_name("finco.db")
REPORT = date(2026, 9, 30)
rng = random.Random(42)

SCHEMA = """
CREATE TABLE branches (branch_id INTEGER PRIMARY KEY, name TEXT NOT NULL, region TEXT NOT NULL);
CREATE TABLE customers (
  customer_id INTEGER PRIMARY KEY, full_name TEXT NOT NULL,
  segment TEXT NOT NULL CHECK (segment IN ('ca_nhan','doanh_nghiep')),
  branch_id INTEGER NOT NULL REFERENCES branches, monthly_income INTEGER,
  related_party INTEGER NOT NULL DEFAULT 0 CHECK (related_party IN (0,1)));
CREATE TABLE loans (
  loan_id INTEGER PRIMARY KEY, customer_id INTEGER NOT NULL REFERENCES customers,
  branch_id INTEGER NOT NULL REFERENCES branches,
  product TEXT NOT NULL CHECK (product IN ('tieu_dung','oto','the_chap_bds','sxkd')),
  principal INTEGER NOT NULL, -- VND
  outstanding INTEGER NOT NULL, -- VND, 0 when closed
  interest_rate REAL NOT NULL, -- percent per year: 18.5 means 18.5%/năm
  disbursed_date TEXT NOT NULL, maturity_date TEXT NOT NULL,
  days_past_due INTEGER NOT NULL, -- as of report date
  status TEXT NOT NULL CHECK (status IN ('active','closed')));
CREATE TABLE collaterals (
  collateral_id INTEGER PRIMARY KEY, loan_id INTEGER NOT NULL REFERENCES loans,
  type TEXT NOT NULL CHECK (type IN ('bat_dong_san','o_to','so_tiet_kiem')),
  appraised_value INTEGER NOT NULL, -- VND
  appraisal_date TEXT NOT NULL);
CREATE TABLE repayments (
  repayment_id INTEGER PRIMARY KEY, loan_id INTEGER NOT NULL REFERENCES loans,
  due_date TEXT NOT NULL, paid_date TEXT, amount_due INTEGER NOT NULL, amount_paid INTEGER NOT NULL);
CREATE TABLE capital (as_of_date TEXT PRIMARY KEY, equity INTEGER NOT NULL); -- equity in VND, one row per quarter end
CREATE INDEX ix_loans_branch ON loans(branch_id);
CREATE INDEX ix_loans_customer ON loans(customer_id);
CREATE INDEX ix_coll_loan ON collaterals(loan_id);
CREATE INDEX ix_rep_loan ON repayments(loan_id);
CREATE INDEX ix_rep_due ON repayments(due_date);
CREATE INDEX ix_rep_paid ON repayments(paid_date);
"""

BRANCHES = [(1, "Hà Nội", "Bắc"), (2, "Hải Phòng", "Bắc"), (3, "Đà Nẵng", "Trung"),
            (4, "Nha Trang", "Trung"), (5, "TP.HCM", "Nam"), (6, "Cần Thơ", "Nam")]
# probability that a loan in this branch is non-performing (dpd > 90)
NPL_P = {1: 0.012, 2: 0.017, 3: 0.012, 4: 0.016, 5: 0.010, 6: 0.035}
TY = 1_000_000_000  # 1 ty VND
TR = 1_000_000      # 1 trieu VND
HO = ["Nguyễn", "Trần", "Lê", "Phạm", "Hoàng", "Vũ", "Đặng", "Bùi", "Đỗ", "Hồ"]
TEN = ["An", "Bình", "Chi", "Dũng", "Giang", "Hà", "Khánh", "Linh", "Minh", "Nam", "Phương", "Quân", "Thảo", "Tuấn"]


def months_between(a: date, b: date) -> int:
    return (b.year - a.year) * 12 + b.month - a.month


def add_months(d: date, n: int) -> date:
    y, m = divmod(d.month - 1 + n, 12)
    return date(d.year + y, m + 1, min(d.day, 28))


def dpd_for(branch: int) -> int:
    if rng.random() < NPL_P[branch]:
        return rng.choice([rng.randint(91, 180), rng.randint(181, 360), rng.randint(361, 500)])
    if rng.random() < 0.06:
        return rng.randint(10, 90)
    return rng.choice([0] * 9 + [rng.randint(1, 9)])


def main() -> None:
    DB.unlink(missing_ok=True)
    con = sqlite3.connect(DB)
    con.executescript(SCHEMA)
    con.executemany("INSERT INTO branches VALUES (?,?,?)", BRANCHES)
    con.executemany("INSERT INTO capital VALUES (?,?)", [
        ("2026-03-31", 1_900 * TY), ("2026-06-30", 2_000 * TY), ("2026-09-30", 2_050 * TY)])

    customers, loans, colls, reps = [], [], [], []
    for cid in range(1, 4001):
        corp = cid > 3700
        name = (f"Công ty TNHH {rng.choice(TEN)} {rng.choice(TEN)} {cid}" if corp
                else f"{rng.choice(HO)} {rng.choice(TEN)} {cid}")
        customers.append([cid, name, "doanh_nghiep" if corp else "ca_nhan", rng.randint(1, 6),
                          None if corp else rng.randint(8, 80) * TR, 0])
    # planted customers
    customers[3998][1:] = ["Công ty CP Xây dựng Hưng Thịnh", "doanh_nghiep", 5, None, 0]
    customers[3999][1:] = ["Công ty TNHH Đầu tư Minh Long", "doanh_nghiep", 1, None, 1]
    for i in (3750, 3800, 3850, 3900):
        customers[i][5] = 1  # other related parties

    lid = 0

    def add_loan(cid, branch, product, outstanding, rate, dpd=None, closed=False, planted=False):
        nonlocal lid
        lid += 1
        disb = REPORT - timedelta(days=200 if planted else rng.randint(60, 1400))
        term = 60 if planted else (rng.choice([12, 24, 36, 60, 120]) if product != "tieu_dung" else rng.choice([6, 12, 24, 36]))
        mat = add_months(disb, term)
        closed = closed or mat < REPORT
        principal = int(outstanding * rng.uniform(1.05, 1.6))
        dpd = 0 if closed else (dpd_for(branch) if dpd is None else dpd)
        loans.append((lid, cid, branch, product, principal, 0 if closed else outstanding, rate,
                      disb.isoformat(), mat.isoformat(), dpd, "closed" if closed else "active"))
        if product in ("the_chap_bds", "oto", "sxkd"):
            ctype = "o_to" if product == "oto" else "bat_dong_san"
            limit = 0.60 if ctype == "o_to" else 0.70
            ltv = limit * rng.uniform(1.02, 1.25) if rng.random() < 0.03 else rng.uniform(0.35, limit * 0.97)
            appraised = int(max(outstanding, principal * 0.8) / ltv) if not closed else int(principal / 0.5)
            stale = rng.random() < 0.08
            adate = REPORT - timedelta(days=rng.randint(380, 900) if stale else rng.randint(10, 360))
            colls.append((len(colls) + 1, lid, ctype, appraised, adate.isoformat()))
        # monthly schedule up to the report date; unpaid tail for overdue loans
        n = max(1, min(months_between(disb, REPORT), term))
        due_amt = principal // term
        for k in range(1, n + 1):
            due = add_months(disb, k)
            if due > REPORT:
                break
            overdue = (REPORT - due).days < dpd + 1 and dpd > 0
            paid = None if overdue else min(due + timedelta(days=rng.randint(-3, 5)), REPORT).isoformat()
            reps.append((len(reps) + 1, lid, due.isoformat(), paid, due_amt, 0 if overdue else due_amt))

    products = [("tieu_dung", 0.55), ("oto", 0.2), ("the_chap_bds", 0.25)]
    for c in customers[:3700]:
        for _ in range(rng.choice([1, 1, 1, 2, 2, 3])):
            p = rng.choices([p for p, _ in products], [w for _, w in products])[0]
            if p == "tieu_dung":
                amt, rate = rng.randint(20, 300) * TR, round(rng.uniform(21, 24) if rng.random() < 0.07 else rng.uniform(12, 20), 2)
            elif p == "oto":
                amt, rate = rng.randint(300, 1500) * TR, round(rng.uniform(8, 12), 2)
            else:
                amt, rate = rng.randint(800, 8000) * TR, round(rng.uniform(7, 11), 2)
            add_loan(c[0], c[3], p, amt, rate)
    for c in customers[3700:3998]:
        for _ in range(rng.choice([1, 2])):
            add_loan(c[0], c[3], "sxkd", rng.randint(5, 45) * TY, round(rng.uniform(7, 10), 2))
    # Hung Thinh: 3 loans, 228 ty total (> 10 % of 2,050 ty = 205 ty)
    for amt in (95, 78, 55):
        add_loan(3999, 5, "sxkd", amt * TY, 8.5, dpd=0, planted=True)
    # Minh Long, related party: 118 ty (> 5 % = 102.5 ty)
    for amt in (70, 48):
        add_loan(4000, 1, "sxkd", amt * TY, 8.2, dpd=0, planted=True)

    con.executemany("INSERT INTO customers VALUES (?,?,?,?,?,?)", customers)
    con.executemany("INSERT INTO loans VALUES (?,?,?,?,?,?,?,?,?,?,?)", loans)
    con.executemany("INSERT INTO collaterals VALUES (?,?,?,?,?)", colls)
    con.executemany("INSERT INTO repayments VALUES (?,?,?,?,?,?)", reps)
    con.commit()
    for t in ("branches", "customers", "loans", "collaterals", "repayments"):
        print(t, con.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0])
    print(con.execute("""
        SELECT b.name, ROUND(100.0*SUM(CASE WHEN l.days_past_due>90 THEN l.outstanding ELSE 0 END)/SUM(l.outstanding),2)
        FROM loans l JOIN branches b USING(branch_id) WHERE l.status='active' GROUP BY b.name""").fetchall())
    con.close()


if __name__ == "__main__":
    main()
