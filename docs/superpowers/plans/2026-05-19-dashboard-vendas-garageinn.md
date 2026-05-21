# Dashboard Vendas Online — GarageINN Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir um dashboard web de vendas em tempo real para a GarageINN com gráfico mensal, KPIs diários, ranking de unidades e breakdown de produtos, atualizado automaticamente ao receber e-mails de confirmação de venda.

**Architecture:** Backend Python Flask serve o HTML e expõe dois endpoints: `GET /api/dashboard` (dados JSON) e `GET /api/stream` (Server-Sent Events). Um thread daemon lê e-mails via IMAP a cada 30s, faz parsing, grava no SQLite e notifica os clientes SSE. O frontend usa JS puro + Chart.js com um cliente SSE que re-renderiza todos os painéis a cada evento recebido.

**Tech Stack:** Python 3.10+, Flask 3.x, SQLite3 (stdlib), imaplib (stdlib), python-dotenv, Chart.js 4.x (CDN), HTML/CSS/JS vanilla

---

## Estrutura de Arquivos

```
dashboard-vendas/
├── backend/
│   ├── __init__.py          # vazio — marca o pacote
│   ├── app.py               # Flask app: rotas /, /api/dashboard, /api/stream + thread IMAP
│   ├── data_store.py        # init_db, insert_sale, get_monthly_totals, get_daily_kpis,
│   │                        # get_unit_rankings, get_product_totals, get_banner_data
│   ├── email_reader.py      # parse_sale_email, watch_inbox, start_watcher
│   └── seed_data.py         # script único: popula sales.db com dados fictícios
├── frontend/
│   ├── index.html           # estrutura HTML completa, sem lógica
│   ├── styles.css           # tema escuro, grid layout
│   └── dashboard.js         # SSE client, Chart.js, funções de render
├── tests/
│   ├── __init__.py          # vazio
│   ├── test_data_store.py   # testes unitários das funções do data_store
│   ├── test_email_reader.py # testes unitários do parser de e-mail
│   └── test_api.py          # testes de integração dos endpoints Flask
├── .env.example             # template de credenciais IMAP
└── requirements.txt
```

---

### Task 1: Project Setup

**Files:**
- Create: `dashboard-vendas/requirements.txt`
- Create: `dashboard-vendas/.env.example`
- Create: `dashboard-vendas/backend/__init__.py`
- Create: `dashboard-vendas/tests/__init__.py`

- [ ] **Step 1: Criar estrutura de diretórios**

Execute a partir de `C:/Users/Claudia Peluco/Documents/dashboard-vendas`:

```bash
mkdir -p backend frontend tests
```

- [ ] **Step 2: Criar requirements.txt**

Conteúdo do arquivo `requirements.txt`:
```
flask==3.0.3
python-dotenv==1.0.1
pytest==8.2.2
```

- [ ] **Step 3: Criar .env.example**

Conteúdo do arquivo `.env.example`:
```
IMAP_HOST=imap.gmail.com
IMAP_PORT=993
IMAP_USER=seu-email@gmail.com
IMAP_PASSWORD=sua-senha-de-app
IMAP_FOLDER=INBOX
IMAP_SUBJECT_FILTER=Confirmação de Venda
DB_PATH=backend/sales.db
```

- [ ] **Step 4: Criar arquivos __init__.py vazios**

```bash
type nul > backend/__init__.py
type nul > tests/__init__.py
```

- [ ] **Step 5: Instalar dependências**

```bash
pip install -r requirements.txt
```

Saída esperada: `Successfully installed flask-3.0.3 python-dotenv-1.0.1 pytest-8.2.2`

- [ ] **Step 6: Commit**

```bash
git init
git add requirements.txt .env.example backend/__init__.py tests/__init__.py
git commit -m "feat: project structure and dependencies"
```

---

### Task 2: data_store.py — SQLite Schema e Operações

**Files:**
- Create: `backend/data_store.py`
- Create: `tests/test_data_store.py`

- [ ] **Step 1: Escrever os testes falhando**

Criar `tests/test_data_store.py`:

```python
import pytest, sqlite3, os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))
from data_store import (init_db, insert_sale, get_monthly_totals, get_daily_kpis,
                        get_unit_rankings, get_product_totals, get_banner_data)

@pytest.fixture
def db(tmp_path):
    conn = init_db(str(tmp_path / "test.db"))
    yield conn
    conn.close()

def test_init_db_creates_sales_table(db):
    cur = db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='sales'")
    assert cur.fetchone() is not None

def test_insert_and_retrieve_sale(db):
    insert_sale(db, date="2026-05-19", unit="BERRINI", product="Carro", value=2500.0)
    row = db.execute("SELECT unit, product, value FROM sales WHERE date='2026-05-19'").fetchone()
    assert row == ("BERRINI", "Carro", 2500.0)

def test_get_monthly_totals(db):
    insert_sale(db, date="2026-05-10", unit="BERRINI", product="Carro", value=1000.0)
    insert_sale(db, date="2026-04-10", unit="BERRINI", product="Moto", value=500.0)
    result = get_monthly_totals(db, year=2026)
    months = [r["month"] for r in result]
    assert "2026-05" in months
    assert "2026-04" in months

def test_get_daily_kpis(db):
    insert_sale(db, date="2026-05-19", unit="BERRINI", product="Carro", value=1000.0)
    insert_sale(db, date="2026-05-19", unit="CUBO", product="Moto", value=2000.0)
    insert_sale(db, date="2026-05-18", unit="BERRINI", product="Carro", value=1500.0)
    r = get_daily_kpis(db, today="2026-05-19", yesterday="2026-05-18")
    assert r["today_total"] == 3000.0
    assert r["today_ticket"] == 1500.0
    assert r["yesterday_total"] == 1500.0
    assert r["yesterday_ticket"] == 1500.0

def test_get_unit_rankings_order(db):
    insert_sale(db, date="2026-05-19", unit="BERRINI", product="Carro", value=5000.0)
    insert_sale(db, date="2026-05-18", unit="BERRINI", product="Carro", value=4000.0)
    insert_sale(db, date="2026-05-19", unit="CUBO", product="Moto", value=3000.0)
    result = get_unit_rankings(db, month="2026-05", today="2026-05-19", yesterday="2026-05-18")
    assert result[0]["unit"] == "BERRINI"
    assert result[0]["month_total"] == 9000.0
    assert result[0]["today_total"] == 5000.0
    assert result[0]["yesterday_total"] == 4000.0
    assert result[0]["variation_pct"] == 25.0

def test_get_product_totals(db):
    insert_sale(db, date="2026-05-19", unit="BERRINI", product="Carro", value=1000.0)
    insert_sale(db, date="2026-05-19", unit="CUBO", product="Carro", value=500.0)
    insert_sale(db, date="2026-05-19", unit="IGUATEMI", product="Moto", value=800.0)
    result = get_product_totals(db, month="2026-05")
    by_product = {r["product"]: r["total"] for r in result}
    assert by_product["Carro"] == 1500.0
    assert by_product["Moto"] == 800.0

def test_get_banner_data(db):
    insert_sale(db, date="2026-05-10", unit="BERRINI", product="Carro", value=1000.0)
    insert_sale(db, date="2026-04-10", unit="BERRINI", product="Carro", value=800.0)
    r = get_banner_data(db, current_month="2026-05", previous_month="2026-04")
    assert r["current_total"] == 1000.0
    assert r["previous_total"] == 800.0
    assert r["variation_pct"] == 25.0
    assert r["variation_value"] == 200.0
```

- [ ] **Step 2: Rodar para confirmar que falha**

```bash
cd "C:/Users/Claudia Peluco/Documents/dashboard-vendas"
pytest tests/test_data_store.py -v
```

Saída esperada: `ModuleNotFoundError: No module named 'data_store'`

- [ ] **Step 3: Criar backend/data_store.py**

```python
import sqlite3
from typing import Optional


def init_db(db_path: str) -> sqlite3.Connection:
    conn = sqlite3.connect(db_path, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("""
        CREATE TABLE IF NOT EXISTS sales (
            id       INTEGER PRIMARY KEY AUTOINCREMENT,
            date     TEXT    NOT NULL,
            unit     TEXT    NOT NULL,
            product  TEXT    NOT NULL,
            value    REAL    NOT NULL,
            created_at TEXT  DEFAULT (datetime('now'))
        )
    """)
    conn.execute("CREATE INDEX IF NOT EXISTS idx_date ON sales(date)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_unit ON sales(unit)")
    conn.commit()
    return conn


def insert_sale(conn: sqlite3.Connection, date: str, unit: str,
                product: str, value: float) -> None:
    conn.execute(
        "INSERT INTO sales (date, unit, product, value) VALUES (?, ?, ?, ?)",
        (date, unit, product, value)
    )
    conn.commit()


def get_monthly_totals(conn: sqlite3.Connection, year: int) -> list:
    cur = conn.execute("""
        SELECT strftime('%Y-%m', date) AS month, SUM(value) AS total
        FROM sales
        WHERE strftime('%Y', date) = ?
        GROUP BY month
        ORDER BY month
    """, (str(year),))
    return [{"month": r["month"], "total": r["total"]} for r in cur.fetchall()]


def get_daily_kpis(conn: sqlite3.Connection, today: str, yesterday: str) -> dict:
    def stats(date: str) -> dict:
        r = conn.execute(
            "SELECT SUM(value) AS total, COUNT(*) AS cnt FROM sales WHERE date = ?",
            (date,)
        ).fetchone()
        total = r["total"] or 0.0
        cnt   = r["cnt"]   or 0
        return {"total": total, "count": cnt, "ticket": total / cnt if cnt else 0.0}

    t = stats(today)
    y = stats(yesterday)
    return {
        "today_total":     t["total"],
        "today_count":     t["count"],
        "today_ticket":    round(t["ticket"], 2),
        "yesterday_total": y["total"],
        "yesterday_count": y["count"],
        "yesterday_ticket": round(y["ticket"], 2),
    }


def get_unit_rankings(conn: sqlite3.Connection, month: str,
                      today: str, yesterday: str) -> list:
    cur = conn.execute("""
        SELECT
            unit,
            SUM(value)                                        AS month_total,
            COUNT(*)                                          AS month_count,
            SUM(CASE WHEN date = ? THEN value ELSE 0 END)    AS today_total,
            COUNT(CASE WHEN date = ? THEN 1 END)              AS today_count,
            SUM(CASE WHEN date = ? THEN value ELSE 0 END)    AS yesterday_total
        FROM sales
        WHERE strftime('%Y-%m', date) = ?
        GROUP BY unit
        ORDER BY month_total DESC
    """, (today, today, yesterday, month))

    rows = cur.fetchall()
    result = []
    for i, r in enumerate(rows, start=1):
        t   = r["today_total"]     or 0.0
        y   = r["yesterday_total"] or 0.0
        cnt = r["month_count"]     or 0
        var = round((t - y) / y * 100, 1) if y > 0 else 0.0
        result.append({
            "rank":         i,
            "unit":         r["unit"],
            "month_total":  r["month_total"],
            "month_ticket": round(r["month_total"] / cnt, 2) if cnt else 0.0,
            "today_total":  t,
            "yesterday_total": y,
            "variation_pct": var,
        })
    return result


def get_product_totals(conn: sqlite3.Connection, month: str) -> list:
    cur = conn.execute("""
        SELECT product, SUM(value) AS total
        FROM sales
        WHERE strftime('%Y-%m', date) = ?
        GROUP BY product
        ORDER BY total DESC
    """, (month,))
    return [{"product": r["product"], "total": r["total"]} for r in cur.fetchall()]


def get_banner_data(conn: sqlite3.Connection,
                    current_month: str, previous_month: str) -> dict:
    def month_sum(m: str) -> float:
        r = conn.execute(
            "SELECT SUM(value) AS total FROM sales WHERE strftime('%Y-%m', date) = ?",
            (m,)
        ).fetchone()
        return r["total"] or 0.0

    cur = month_sum(current_month)
    prev = month_sum(previous_month)
    var_pct = round((cur - prev) / prev * 100, 1) if prev > 0 else 0.0
    return {
        "current_total":  cur,
        "previous_total": prev,
        "variation_pct":  var_pct,
        "variation_value": round(cur - prev, 2),
    }
```

- [ ] **Step 4: Rodar para confirmar que passa**

```bash
pytest tests/test_data_store.py -v
```

Saída esperada: `7 passed`

- [ ] **Step 5: Commit**

```bash
git add backend/data_store.py tests/test_data_store.py
git commit -m "feat: SQLite data store with schema and all query operations"
```

---

### Task 3: seed_data.py — Popular DB com Dados Fictícios

**Files:**
- Create: `backend/seed_data.py`

- [ ] **Step 1: Criar backend/seed_data.py**

```python
"""
Popula o banco com dados fictícios alinhados ao design aprovado.
Execute uma vez: python backend/seed_data.py
"""
import sys, os, random, calendar
sys.path.insert(0, os.path.dirname(__file__))
from data_store import init_db, insert_sale

UNITS    = ["ACYR","ATRIUM II","BERRINI","COMOLATTI","CUBO",
            "IGUATEMI","JF100","JK28","MYKONOS","PARAISO"]
PRODUCTS = ["Carro","Moto","Bicicleta","Selos"]
PROD_W   = [0.35, 0.28, 0.22, 0.15]   # pesos de sorteo

# Meta mensal por unidade em Mai/2026 (mês atual)
MAY_TARGET = {
    "BERRINI":98200,"IGUATEMI":87500,"CUBO":73900,"JK28":62100,
    "PARAISO":54300,"MYKONOS":43200,"ATRIUM II":35700,"JF100":25400,
    "ACYR":18900,"COMOLATTI":14200,
}

# Totais mensais Jan–Abr distribuídos uniformemente entre unidades
HISTORY = {
    "2026-01": 620000, "2026-02": 710000,
    "2026-03": 790000, "2026-04": 830000,
}

# Valores por unidade para hoje (19/05) — somam 42.180
TODAY = {
    "BERRINI":8050,"IGUATEMI":7200,"CUBO":6080,"JK28":5100,
    "PARAISO":4470,"MYKONOS":3540,"ATRIUM II":2950,"JF100":2100,
    "ACYR":1560,"COMOLATTI":1130,
}  # 8050+7200+6080+5100+4470+3540+2950+2100+1560+1130 = 42.180

# Valores por unidade para ontem (18/05) — somam 35.860
YESTERDAY = {
    "BERRINI":6820,"IGUATEMI":6430,"CUBO":5580,"JK28":5580,
    "PARAISO":4250,"MYKONOS":3800,"ATRIUM II":3310,"JF100":2470,
    "ACYR":1930,"COMOLATTI":1690,
}  # 6820+6430+5580+5580+4250+3800+3310+2470+1930+1690 = 41.860 → ajuste abaixo


def _fix_sum(d: dict, target: float) -> dict:
    """Ajusta o primeiro item para que o dicionário some exatamente ao alvo."""
    total = sum(d.values())
    diff  = target - total
    first_key = next(iter(d))
    return {k: (v + diff if k == first_key else v) for k, v in d.items()}


def _gen_sales(conn, date: str, unit: str, target: float,
               lo: float = 400, hi: float = 2800):
    """Gera vendas individuais que somam aproximadamente `target`."""
    rem = target
    while rem > hi:
        v = round(random.uniform(lo, min(hi, rem * 0.6)), 2)
        p = random.choices(PRODUCTS, weights=PROD_W)[0]
        insert_sale(conn, date=date, unit=unit, product=p, value=v)
        rem -= v
    if rem > 10:
        p = random.choices(PRODUCTS, weights=PROD_W)[0]
        insert_sale(conn, date=date, unit=unit, product=p, value=round(rem, 2))


def seed(db_path: str = "backend/sales.db"):
    random.seed(42)
    conn = init_db(db_path)

    yesterday_fixed = _fix_sum(YESTERDAY, 35860)

    # Jan–Abr: distribuição uniforme entre unidades e dias do mês
    for month, total in HISTORY.items():
        y, m = month.split("-")
        days  = calendar.monthrange(int(y), int(m))[1]
        daily = total / days / len(UNITS)
        for day in range(1, days + 1):
            date = f"{month}-{day:02d}"
            for unit in UNITS:
                _gen_sales(conn, date, unit, daily * random.uniform(0.6, 1.4))

    # Mai dias 1–17: rateio proporcional às metas mensais
    for day in range(1, 18):
        date = f"2026-05-{day:02d}"
        for unit, target in MAY_TARGET.items():
            _gen_sales(conn, date, unit, target / 19 * random.uniform(0.7, 1.3))

    # Ontem (18/05) e Hoje (19/05) com valores exatos do seed
    for unit, val in yesterday_fixed.items():
        _gen_sales(conn, "2026-05-18", unit, val)
    for unit, val in TODAY.items():
        _gen_sales(conn, "2026-05-19", unit, val)

    print(f"Seed OK → {db_path}")
    conn.close()


if __name__ == "__main__":
    seed()
```

- [ ] **Step 2: Executar o script**

```bash
cd "C:/Users/Claudia Peluco/Documents/dashboard-vendas"
python backend/seed_data.py
```

Saída esperada: `Seed OK → backend/sales.db`

- [ ] **Step 3: Verificar os totais no DB**

```bash
python -c "
import sqlite3
c = sqlite3.connect('backend/sales.db')
print('Linhas:', c.execute('SELECT COUNT(*) FROM sales').fetchone()[0])
print('Mai total:', round(c.execute(\"SELECT SUM(value) FROM sales WHERE strftime('%Y-%m',date)='2026-05'\").fetchone()[0]))
print('Hoje:',      round(c.execute(\"SELECT SUM(value) FROM sales WHERE date='2026-05-19'\").fetchone()[0]))
print('Ontem:',     round(c.execute(\"SELECT SUM(value) FROM sales WHERE date='2026-05-18'\").fetchone()[0]))
"
```

Saída esperada (valores aproximados):
```
Linhas: ~8000
Mai total: ~847000
Hoje: ~42180
Ontem: ~35860
```

- [ ] **Step 4: Commit**

```bash
git add backend/seed_data.py
git commit -m "feat: seed script with fictional data for 10 units across 5 months"
```

---

### Task 4: email_reader.py — IMAP e Parser de E-mail

**Files:**
- Create: `backend/email_reader.py`
- Create: `tests/test_email_reader.py`

- [ ] **Step 1: Escrever os testes falhando**

Criar `tests/test_email_reader.py`:

```python
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))
from email_reader import parse_sale_email

def test_parse_valid_email():
    body = "Unidade: BERRINI\nProduto: Carro\nValor: R$ 2.500,00\nData: 19/05/2026"
    r = parse_sale_email(body)
    assert r is not None
    assert r["unit"]    == "BERRINI"
    assert r["product"] == "Carro"
    assert r["value"]   == 2500.0
    assert r["date"]    == "2026-05-19"

def test_parse_different_product():
    body = "Unidade: CUBO\nProduto: Moto\nValor: R$ 1.200,00\nData: 19/05/2026"
    r = parse_sale_email(body)
    assert r["unit"] == "CUBO"
    assert r["value"] == 1200.0

def test_parse_missing_fields_returns_none():
    assert parse_sale_email("Este email não tem campos de venda") is None

def test_parse_unknown_unit_returns_none():
    body = "Unidade: DESCONHECIDA\nProduto: Carro\nValor: R$ 1.000,00\nData: 19/05/2026"
    assert parse_sale_email(body) is None

def test_parse_unknown_product_returns_none():
    body = "Unidade: BERRINI\nProduto: Aviao\nValor: R$ 1.000,00\nData: 19/05/2026"
    assert parse_sale_email(body) is None
```

- [ ] **Step 2: Rodar para confirmar que falha**

```bash
pytest tests/test_email_reader.py -v
```

Saída esperada: `ModuleNotFoundError: No module named 'email_reader'`

- [ ] **Step 3: Criar backend/email_reader.py**

```python
import imaplib, email, re, os, time, threading
from datetime import datetime
from typing import Optional, Callable
from dotenv import load_dotenv

load_dotenv()

VALID_UNITS = {
    "ACYR","ATRIUM II","BERRINI","COMOLATTI","CUBO",
    "IGUATEMI","JF100","JK28","MYKONOS","PARAISO",
}
VALID_PRODUCTS = {"Carro","Moto","Bicicleta","Selos"}


def parse_sale_email(body: str) -> Optional[dict]:
    """Extrai campos de venda do corpo do e-mail. Retorna None se inválido."""
    unit_m    = re.search(r"Unidade:\s*(.+)",          body)
    product_m = re.search(r"Produto:\s*(.+)",           body)
    value_m   = re.search(r"Valor:\s*R\$\s*([\d.,]+)", body)
    date_m    = re.search(r"Data:\s*(\d{2}/\d{2}/\d{4})", body)

    if not all([unit_m, product_m, value_m, date_m]):
        return None

    unit    = unit_m.group(1).strip()
    product = product_m.group(1).strip()
    val_str = value_m.group(1).strip().replace(".", "").replace(",", ".")
    date_str = date_m.group(1).strip()

    if unit not in VALID_UNITS or product not in VALID_PRODUCTS:
        return None

    try:
        value = float(val_str)
        date  = datetime.strptime(date_str, "%d/%m/%Y").strftime("%Y-%m-%d")
    except ValueError:
        return None

    return {"unit": unit, "product": product, "value": value, "date": date}


def _body_from_msg(msg) -> str:
    if msg.is_multipart():
        for part in msg.walk():
            if part.get_content_type() == "text/plain":
                return part.get_payload(decode=True).decode("utf-8", errors="ignore")
    payload = msg.get_payload(decode=True)
    return payload.decode("utf-8", errors="ignore") if payload else ""


def watch_inbox(on_new_sale: Callable[[dict], None],
                poll_interval: int = 30) -> None:
    """Loop de polling IMAP. Roda em thread daemon; chama on_new_sale para cada venda parseada."""
    host    = os.getenv("IMAP_HOST", "imap.gmail.com")
    port    = int(os.getenv("IMAP_PORT", "993"))
    user    = os.getenv("IMAP_USER", "")
    pwd     = os.getenv("IMAP_PASSWORD", "")
    folder  = os.getenv("IMAP_FOLDER", "INBOX")
    subject = os.getenv("IMAP_SUBJECT_FILTER", "Confirmação de Venda")

    if not user or not pwd:
        print("[email] Credenciais IMAP não configuradas — watcher desativado.")
        return

    seen: set = set()
    while True:
        try:
            mail = imaplib.IMAP4_SSL(host, port)
            mail.login(user, pwd)
            mail.select(folder)
            _, data = mail.search(None, f'SUBJECT "{subject}"')
            for mid in data[0].split():
                if mid in seen:
                    continue
                seen.add(mid)
                _, msg_data = mail.fetch(mid, "(RFC822)")
                msg  = email.message_from_bytes(msg_data[0][1])
                body = _body_from_msg(msg)
                sale = parse_sale_email(body)
                if sale:
                    on_new_sale(sale)
            mail.logout()
        except Exception as e:
            print(f"[email] Erro: {e}")
        time.sleep(poll_interval)


def start_watcher(on_new_sale: Callable[[dict], None],
                  poll_interval: int = 30) -> threading.Thread:
    t = threading.Thread(target=watch_inbox,
                         args=(on_new_sale, poll_interval), daemon=True)
    t.start()
    return t
```

- [ ] **Step 4: Rodar para confirmar que passa**

```bash
pytest tests/test_email_reader.py -v
```

Saída esperada: `5 passed`

- [ ] **Step 5: Commit**

```bash
git add backend/email_reader.py tests/test_email_reader.py
git commit -m "feat: IMAP email reader with sale parser and background watcher thread"
```

---

### Task 5: app.py — Flask API + SSE

**Files:**
- Create: `backend/app.py`
- Create: `tests/test_api.py`

- [ ] **Step 1: Escrever os testes falhando**

Criar `tests/test_api.py`:

```python
import sys, os, json, importlib
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))
import pytest

@pytest.fixture
def client(tmp_path):
    os.environ["DB_PATH"] = str(tmp_path / "test.db")
    import app as app_mod
    importlib.reload(app_mod)
    app_mod.app.config["TESTING"] = True
    from data_store import insert_sale
    insert_sale(app_mod.conn, date="2026-05-19", unit="BERRINI", product="Carro", value=2500.0)
    insert_sale(app_mod.conn, date="2026-05-18", unit="BERRINI", product="Carro", value=2000.0)
    with app_mod.app.test_client() as c:
        yield c

def test_index_serves_html(client):
    resp = client.get("/")
    assert resp.status_code == 200
    assert b"GarageINN" in resp.data

def test_dashboard_returns_200(client):
    assert client.get("/api/dashboard").status_code == 200

def test_dashboard_has_all_keys(client):
    data = json.loads(client.get("/api/dashboard").data)
    for key in ["banner", "kpis", "monthly_chart", "products", "top5_best", "top5_worst"]:
        assert key in data, f"Chave ausente: {key}"

def test_dashboard_banner_keys(client):
    banner = json.loads(client.get("/api/dashboard").data)["banner"]
    for key in ["current_total", "previous_total", "variation_pct", "variation_value"]:
        assert key in banner

def test_dashboard_rankings_max_5(client):
    data = json.loads(client.get("/api/dashboard").data)
    assert len(data["top5_best"])  <= 5
    assert len(data["top5_worst"]) <= 5
```

- [ ] **Step 2: Rodar para confirmar que falha**

```bash
pytest tests/test_api.py -v
```

Saída esperada: `ModuleNotFoundError: No module named 'app'`

- [ ] **Step 3: Criar backend/app.py**

```python
import os, json, queue
from datetime import date, timedelta
from flask import Flask, Response, jsonify, send_from_directory
from data_store import (init_db, insert_sale, get_monthly_totals, get_daily_kpis,
                        get_unit_rankings, get_product_totals, get_banner_data)
from email_reader import start_watcher

DB_PATH      = os.getenv("DB_PATH", "backend/sales.db")
FRONTEND_DIR = os.path.join(os.path.dirname(__file__), "..", "frontend")

app  = Flask(__name__, static_folder=FRONTEND_DIR)
conn = init_db(DB_PATH)

_subscribers: list = []

MONTH_NAMES = {
    "01":"Janeiro","02":"Fevereiro","03":"Março","04":"Abril","05":"Maio",
    "06":"Junho","07":"Julho","08":"Agosto","09":"Setembro",
    "10":"Outubro","11":"Novembro","12":"Dezembro",
}
MONTH_SHORT = {
    "01":"Jan","02":"Fev","03":"Mar","04":"Abr","05":"Mai",
    "06":"Jun","07":"Jul","08":"Ago","09":"Set","10":"Out","11":"Nov","12":"Dez",
}
PRODUCT_ICONS = {"Carro":"🚗","Moto":"🏍","Bicicleta":"🚲","Selos":"📮"}


def _notify(payload: dict) -> None:
    dead = []
    for q in _subscribers:
        try:
            q.put_nowait(payload)
        except queue.Full:
            dead.append(q)
    for q in dead:
        _subscribers.remove(q)


def _on_new_sale(sale: dict) -> None:
    insert_sale(conn, date=sale["date"], unit=sale["unit"],
                product=sale["product"], value=sale["value"])
    _notify({"event": "sale"})


def _build_payload() -> dict:
    today     = date.today().isoformat()
    yesterday = (date.today() - timedelta(days=1)).isoformat()
    cur_month = today[:7]
    prev_date = date.today().replace(day=1) - timedelta(days=1)
    prev_month = prev_date.strftime("%Y-%m")
    year = date.today().year

    banner = get_banner_data(conn, current_month=cur_month, previous_month=prev_month)
    m_num  = cur_month.split("-")[1]
    banner["month_label"]          = f"{MONTH_NAMES.get(m_num, m_num)}/{year}"
    banner["previous_month_label"] = MONTH_NAMES.get(prev_date.strftime("%m"), "")

    kpis = get_daily_kpis(conn, today=today, yesterday=yesterday)

    monthly_raw = get_monthly_totals(conn, year=year)
    monthly_chart = [
        {"month": MONTH_SHORT.get(r["month"].split("-")[1], r["month"]),
         "total": r["total"],
         "is_current": r["month"] == cur_month}
        for r in monthly_raw
    ]

    products_raw   = get_product_totals(conn, month=cur_month)
    product_sum    = sum(p["total"] for p in products_raw) or 1
    products = [
        {"product": p["product"],
         "total":   p["total"],
         "pct":     round(p["total"] / product_sum * 100, 1),
         "icon":    PRODUCT_ICONS.get(p["product"], "📦")}
        for p in products_raw
    ]

    rankings   = get_unit_rankings(conn, month=cur_month,
                                   today=today, yesterday=yesterday)
    top5_best  = rankings[:5]
    top5_worst = rankings[-5:]   # mantém ordem rank 6→10

    return {
        "banner":        banner,
        "kpis":          kpis,
        "monthly_chart": monthly_chart,
        "products":      products,
        "top5_best":     top5_best,
        "top5_worst":    top5_worst,
    }


@app.route("/")
def index():
    return send_from_directory(FRONTEND_DIR, "index.html")


@app.route("/api/dashboard")
def dashboard():
    return jsonify(_build_payload())


@app.route("/api/stream")
def stream():
    def gen():
        q = queue.Queue(maxsize=10)
        _subscribers.append(q)
        try:
            yield f"data: {json.dumps(_build_payload())}\n\n"
            while True:
                try:
                    q.get(timeout=30)
                    yield f"data: {json.dumps(_build_payload())}\n\n"
                except queue.Empty:
                    yield ": heartbeat\n\n"
        except GeneratorExit:
            if q in _subscribers:
                _subscribers.remove(q)

    return Response(gen(), mimetype="text/event-stream",
                    headers={"Cache-Control": "no-cache",
                             "X-Accel-Buffering": "no"})


if __name__ == "__main__":
    start_watcher(_on_new_sale)
    app.run(host="0.0.0.0", port=5000, threaded=True)
```

- [ ] **Step 4: Rodar para confirmar que passa**

```bash
pytest tests/test_api.py -v
```

Saída esperada: `5 passed`

- [ ] **Step 5: Commit**

```bash
git add backend/app.py tests/test_api.py
git commit -m "feat: Flask API with /api/dashboard JSON and /api/stream SSE endpoint"
```

---

### Task 6: frontend/index.html — Estrutura HTML

**Files:**
- Create: `frontend/index.html`

- [ ] **Step 1: Criar frontend/index.html**

```html
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Dashboard Vendas Online — GarageINN</title>
  <link rel="stylesheet" href="styles.css">
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.3/dist/chart.umd.min.js"></script>
</head>
<body>
<div class="dashboard">

  <!-- Cabeçalho -->
  <header class="header">
    <div>
      <span class="title-main">DASHBOARD VENDAS ONLINE</span>
      <span class="title-sub">— GarageINN</span>
    </div>
    <span class="live-badge">🟢 AO VIVO</span>
  </header>

  <!-- Banner: Acumulado do Mês vs Mês Anterior -->
  <section class="banner">
    <div class="banner-left">
      <div class="banner-label" id="banner-label">Faturamento Acumulado</div>
      <div class="banner-value" id="banner-value">—</div>
    </div>
    <div class="banner-right">
      <div class="banner-variation" id="banner-variation">—</div>
      <div class="banner-prev"      id="banner-prev">—</div>
      <div class="banner-diff"      id="banner-diff">—</div>
    </div>
  </section>

  <!-- KPIs diários -->
  <section class="kpis">
    <div class="kpi-card" style="--accent:#38bdf8">
      <div class="kpi-label">Vendas Hoje</div>
      <div class="kpi-value" id="today-total">—</div>
      <div class="kpi-delta" id="today-delta">—</div>
    </div>
    <div class="kpi-card" style="--accent:#a78bfa">
      <div class="kpi-label">Vendas Ontem</div>
      <div class="kpi-value" id="yesterday-total">—</div>
      <div class="kpi-delta kpi-neutral">Dia anterior completo</div>
    </div>
    <div class="kpi-card" style="--accent:#fbbf24">
      <div class="kpi-label">Ticket Médio Hoje</div>
      <div class="kpi-value" id="today-ticket">—</div>
      <div class="kpi-delta" id="ticket-delta">—</div>
    </div>
    <div class="kpi-card" style="--accent:#fb923c">
      <div class="kpi-label">Ticket Médio Ontem</div>
      <div class="kpi-value" id="yesterday-ticket">—</div>
      <div class="kpi-delta kpi-neutral">Dia anterior completo</div>
    </div>
  </section>

  <!-- Gráfico mensal + Produtos -->
  <section class="middle-row">
    <div class="chart-card">
      <div class="card-header">
        <span>📈 Faturamento Mensal</span>
        <span class="acum-label">Acumulado: <strong id="acum-total">—</strong></span>
      </div>
      <canvas id="monthlyChart" height="120"></canvas>
    </div>
    <div class="products-card">
      <div class="card-header">📦 Vendas por Produto</div>
      <div class="products-list" id="products-list"></div>
    </div>
  </section>

  <!-- Rankings -->
  <section class="rankings-row">
    <div class="ranking-card">
      <div class="card-header ranking-green">🏆 Top 5 Melhores Unidades</div>
      <table class="rtable">
        <thead><tr><th>#</th><th>Unidade</th><th>Faturamento</th><th>Ticket Médio</th><th>Var%</th></tr></thead>
        <tbody id="top5-best"></tbody>
      </table>
    </div>
    <div class="ranking-card">
      <div class="card-header ranking-red">⚠️ Top 5 Piores Unidades</div>
      <table class="rtable">
        <thead><tr><th>#</th><th>Unidade</th><th>Faturamento</th><th>Ticket Médio</th><th>Var%</th></tr></thead>
        <tbody id="top5-worst"></tbody>
      </table>
    </div>
  </section>

</div>
<script src="dashboard.js"></script>
</body>
</html>
```

- [ ] **Step 2: Commit**

```bash
git add frontend/index.html
git commit -m "feat: dashboard HTML layout with all sections and IDs for JS binding"
```

---

### Task 7: frontend/styles.css — Tema Escuro

**Files:**
- Create: `frontend/styles.css`

- [ ] **Step 1: Criar frontend/styles.css**

```css
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

body {
  background: #0f172a;
  color: #e2e8f0;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  min-height: 100vh;
  padding: 16px;
}

.dashboard { max-width: 1280px; margin: 0 auto; display: flex; flex-direction: column; gap: 12px; }

/* Cabeçalho */
.header { display: flex; justify-content: space-between; align-items: center; }
.title-main { color: #38bdf8; font-size: 1.25rem; font-weight: 700; letter-spacing: 1px; }
.title-sub  { color: #64748b; font-size: .9rem; margin-left: 8px; }
.live-badge { background: #22c55e22; color: #22c55e; padding: 4px 12px; border-radius: 999px; font-size: .75rem; font-weight: 600; }

/* Banner */
.banner {
  background: linear-gradient(90deg, #1e3a2f, #1e293b);
  border: 1px solid #4ade8033;
  border-radius: 10px;
  padding: 14px 20px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.banner-label     { color: #94a3b8; font-size: .7rem; text-transform: uppercase; letter-spacing: 1px; }
.banner-value     { color: #f1f5f9; font-size: 1.8rem; font-weight: 700; margin-top: 4px; }
.banner-right     { text-align: right; }
.banner-variation { font-size: 1.2rem; font-weight: 700; }
.banner-prev      { color: #64748b; font-size: .75rem; margin-top: 3px; }
.banner-diff      { font-size: .75rem; margin-top: 2px; }

/* KPIs */
.kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
.kpi-card { background: #1e293b; border-radius: 10px; padding: 14px 16px; border-top: 3px solid var(--accent); }
.kpi-label { color: #94a3b8; font-size: .7rem; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 6px; }
.kpi-value { color: #f1f5f9; font-size: 1.3rem; font-weight: 700; }
.kpi-delta { font-size: .75rem; margin-top: 6px; }
.kpi-neutral { color: #475569; }

/* Linha do gráfico */
.middle-row { display: grid; grid-template-columns: 1fr 220px; gap: 12px; }
.chart-card, .products-card { background: #1e293b; border-radius: 10px; padding: 16px; }
.card-header { display: flex; justify-content: space-between; align-items: center; font-size: .8rem; font-weight: 600; color: #e2e8f0; margin-bottom: 12px; }
.acum-label { color: #64748b; font-size: .75rem; }
.acum-label strong { color: #38bdf8; }

/* Produtos */
.products-list { display: flex; flex-direction: column; gap: 12px; }
.prod-row { display: flex; flex-direction: column; gap: 4px; }
.prod-meta { display: flex; justify-content: space-between; font-size: .7rem; }
.prod-name { color: #94a3b8; }
.prod-value { font-weight: 600; }
.prog-bar  { background: #334155; height: 6px; border-radius: 3px; }
.prog-fill { height: 6px; border-radius: 3px; transition: width .5s ease; }

/* Rankings */
.rankings-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.ranking-card { background: #1e293b; border-radius: 10px; padding: 16px; }
.ranking-green { color: #4ade80 !important; }
.ranking-red   { color: #f87171 !important; }

.rtable { width: 100%; border-collapse: collapse; font-size: .8rem; }
.rtable thead tr { border-bottom: 1px solid #334155; }
.rtable th { color: #475569; font-size: .65rem; text-transform: uppercase; padding: 4px 6px; text-align: right; font-weight: 500; }
.rtable th:nth-child(2) { text-align: left; }
.rtable td { padding: 7px 6px; text-align: right; color: #e2e8f0; }
.rtable td:nth-child(2) { text-align: left; }
.rtable tbody tr + tr { border-top: 1px solid #0f172a; }

.badge { display: inline-flex; align-items: center; justify-content: center; width: 18px; height: 18px; border-radius: 50%; font-size: .6rem; font-weight: 700; }
.b1 { background: #fbbf24; color: #0f172a; }
.b2 { background: #94a3b8; color: #0f172a; }
.b3 { background: #b45309; color: #fff; }
.bn { background: #334155; color: #94a3b8; }
.bz { background: #7f1d1d; color: #fca5a5; }

.up   { color: #4ade80; }
.down { color: #ef4444; }
.flat { color: #475569; }
```

- [ ] **Step 2: Commit**

```bash
git add frontend/styles.css
git commit -m "feat: dark theme CSS with grid layout for all dashboard sections"
```

---

### Task 8: frontend/dashboard.js — Chart.js + SSE + Renderização

**Files:**
- Create: `frontend/dashboard.js`

- [ ] **Step 1: Criar frontend/dashboard.js**

```javascript
'use strict';

const R = (v) =>
  'R$ ' + Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

const PROD_COLORS = { Carro: '#38bdf8', Moto: '#a78bfa', Bicicleta: '#fbbf24', Selos: '#4ade80' };

let chart = null;

// ── Banner ──────────────────────────────────────────────────────────────────
function renderBanner(b) {
  document.getElementById('banner-label').textContent =
    `Faturamento Acumulado — ${b.month_label || ''}`;
  document.getElementById('banner-value').textContent = R(b.current_total);

  const up  = b.variation_pct >= 0;
  const cls = up ? 'up' : 'down';
  const arrow = up ? '▲' : '▼';
  const sign  = up ? '+' : '';

  const varEl = document.getElementById('banner-variation');
  varEl.textContent = `${arrow} ${sign}${b.variation_pct.toFixed(1)}%`;
  varEl.className = `banner-variation ${cls}`;

  document.getElementById('banner-prev').textContent =
    `vs ${b.previous_month_label || 'mês ant.'}: ${R(b.previous_total)}`;

  const diffEl = document.getElementById('banner-diff');
  diffEl.textContent = `${up ? '+' : ''}${R(b.variation_value)}`;
  diffEl.className = `banner-diff ${cls}`;
}

// ── KPIs ────────────────────────────────────────────────────────────────────
function renderKpis(k) {
  document.getElementById('today-total').textContent     = R(k.today_total);
  document.getElementById('yesterday-total').textContent = R(k.yesterday_total);
  document.getElementById('today-ticket').textContent    = R(k.today_ticket);
  document.getElementById('yesterday-ticket').textContent = R(k.yesterday_ticket);

  function setDelta(id, value) {
    const el  = document.getElementById(id);
    const up  = value >= 0;
    el.textContent = `${up ? '▲' : '▼'} ${up ? '+' : ''}${R(value)} vs ontem`;
    el.className   = `kpi-delta ${up ? 'up' : 'down'}`;
  }
  setDelta('today-delta',  k.today_total  - k.yesterday_total);
  setDelta('ticket-delta', k.today_ticket - k.yesterday_ticket);
}

// ── Gráfico de linha ────────────────────────────────────────────────────────
function renderChart(monthly, acumulado) {
  document.getElementById('acum-total').textContent = R(acumulado);

  const labels  = monthly.map(m => m.month);
  const values  = monthly.map(m => m.total);
  const ptColor = monthly.map(m => m.is_current ? '#4ade80' : '#38bdf8');

  if (chart) {
    chart.data.labels = labels;
    chart.data.datasets[0].data = values;
    chart.data.datasets[0].pointBackgroundColor = ptColor;
    chart.update();
    return;
  }

  const ctx = document.getElementById('monthlyChart').getContext('2d');
  chart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        data: values,
        borderColor: '#38bdf8',
        backgroundColor: (context) => {
          const { ctx: c, chartArea } = context.chart;
          if (!chartArea) return 'transparent';
          const g = c.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
          g.addColorStop(0,   'rgba(56,189,248,.35)');
          g.addColorStop(1,   'rgba(56,189,248,.02)');
          return g;
        },
        fill: true,
        tension: 0.4,
        borderWidth: 2.5,
        pointRadius: 5,
        pointHoverRadius: 7,
        pointBackgroundColor: ptColor,
        pointBorderColor: '#0f172a',
        pointBorderWidth: 2,
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: (ctx) => R(ctx.parsed.y) } }
      },
      scales: {
        x: { grid: { color: '#334155' }, ticks: { color: '#64748b' } },
        y: { grid: { color: '#334155' }, ticks: { color: '#64748b', callback: (v) => R(v) } }
      }
    }
  });
}

// ── Produtos ────────────────────────────────────────────────────────────────
function renderProducts(products) {
  const maxVal = Math.max(...products.map(p => p.total), 1);
  document.getElementById('products-list').innerHTML = products.map(p => {
    const color = PROD_COLORS[p.product] || '#38bdf8';
    const pct   = (p.total / maxVal * 100).toFixed(0);
    return `<div class="prod-row">
      <div class="prod-meta">
        <span class="prod-name">${p.icon} ${p.product}</span>
        <span class="prod-value" style="color:${color}">${R(p.total)}</span>
      </div>
      <div class="prog-bar">
        <div class="prog-fill" style="background:${color};width:${pct}%"></div>
      </div>
    </div>`;
  }).join('');
}

// ── Rankings ────────────────────────────────────────────────────────────────
function badge(rank) {
  if (rank === 1)  return `<span class="badge b1">1</span>`;
  if (rank === 2)  return `<span class="badge b2">2</span>`;
  if (rank === 3)  return `<span class="badge b3">3</span>`;
  if (rank === 10) return `<span class="badge bz">10</span>`;
  return `<span class="badge bn">${rank}</span>`;
}

function varCell(pct) {
  if (pct > 0) return `<td class="up">▲ +${pct.toFixed(1)}%</td>`;
  if (pct < 0) return `<td class="down">▼ ${pct.toFixed(1)}%</td>`;
  return `<td class="flat">— 0%</td>`;
}

function renderRanking(tbodyId, rows) {
  document.getElementById(tbodyId).innerHTML = rows.map(r => `
    <tr>
      <td>${badge(r.rank)}</td>
      <td>${r.unit}</td>
      <td>${R(r.month_total)}</td>
      <td style="color:#94a3b8">${R(r.month_ticket)}</td>
      ${varCell(r.variation_pct)}
    </tr>`).join('');
}

// ── Render principal ────────────────────────────────────────────────────────
function render(data) {
  renderBanner(data.banner);
  renderKpis(data.kpis);
  renderChart(data.monthly_chart, data.banner.current_total);
  renderProducts(data.products);
  renderRanking('top5-best',  data.top5_best);
  renderRanking('top5-worst', data.top5_worst);
}

// ── SSE com reconexão automática ────────────────────────────────────────────
function connect() {
  const es = new EventSource('/api/stream');
  es.onmessage = (e) => { try { render(JSON.parse(e.data)); } catch (_) {} };
  es.onerror   = () => { es.close(); setTimeout(connect, 5000); };
}

connect();
```

- [ ] **Step 2: Commit**

```bash
git add frontend/dashboard.js
git commit -m "feat: dashboard JS with Chart.js line chart, SSE client, and render functions"
```

---

### Task 9: Integração — Executar e Verificar

**Files:** nenhum novo

- [ ] **Step 1: Rodar toda a suíte de testes**

```bash
cd "C:/Users/Claudia Peluco/Documents/dashboard-vendas"
pytest tests/ -v
```

Saída esperada: `17 passed`

- [ ] **Step 2: Popular o banco (se ainda não foi feito)**

```bash
python backend/seed_data.py
```

Saída esperada: `Seed OK → backend/sales.db`

- [ ] **Step 3: Iniciar o servidor Flask**

```bash
python backend/app.py
```

Saída esperada:
```
 * Running on http://0.0.0.0:5000
 * Threaded mode is on
```

- [ ] **Step 4: Abrir o dashboard no navegador**

Acesse `http://localhost:5000` e verifique item a item:

- [ ] Banner exibe valor acumulado do mês com `▲` verde ou `▼` vermelho e % vs mês anterior
- [ ] 4 cards KPI mostram Vendas Hoje/Ontem e Ticket Médio Hoje/Ontem com `▲/▼` e variação em R$
- [ ] Gráfico de linha renderiza com área preenchida; último ponto verde (mês atual)
- [ ] Painel de Produtos exibe Carro, Moto, Bicicleta, Selos com barras proporcionais
- [ ] Top 5 Melhores mostra BERRINI, IGUATEMI, CUBO, JK28, PARAISO com faturamento, ticket médio e var%
- [ ] Top 5 Piores mostra MYKONOS, ATRIUM II, JF100, ACYR, COMOLATTI com var% em vermelho
- [ ] Medalhas: ouro (#1), prata (#2), bronze (#3)

- [ ] **Step 5: Configurar e-mail (opcional)**

```bash
copy .env.example .env
# Editar .env com as credenciais reais de IMAP
```

Formato esperado dos e-mails de venda:
```
Unidade: BERRINI
Produto: Carro
Valor: R$ 2.500,00
Data: 19/05/2026
```

- [ ] **Step 6: Commit final**

```bash
git add .
git commit -m "feat: dashboard vendas online GarageINN — implementação completa integrada"
```

---

## Self-Review

**Cobertura da spec:**
- ✅ Banner full-width: acumulado mês atual + `▲/▼ X%` verde/vermelho vs mês anterior + diferença R$
- ✅ 4 KPI cards: Vendas Hoje, Vendas Ontem, Ticket Médio Hoje, Ticket Médio Ontem com `▲/▼`
- ✅ Gráfico de linha com área preenchida (Chart.js), mês atual destacado em verde
- ✅ Painel de Produtos: Carro, Moto, Bicicleta, Selos com barras e valores
- ✅ Top 5 Melhores e Piores com colunas: Faturamento, Ticket Médio, Var% (▲ verde / ▼ vermelho)
- ✅ Dados fictícios para 10 unidades: ACYR, ATRIUM II, BERRINI, COMOLATTI, CUBO, IGUATEMI, JF100, JK28, MYKONOS, PARAISO
- ✅ Atualização automática via IMAP + SSE
- ✅ Título "DASHBOARD VENDAS ONLINE — GarageINN" + indicador "🟢 AO VIVO"

**Consistência de tipos:**
- `init_db(db_path: str) → Connection` — usado em `app.py:conn = init_db(DB_PATH)` ✅
- `insert_sale(conn, date, unit, product, value)` — assinatura idêntica em todos os chamadores ✅
- `get_unit_rankings` retorna chaves `rank, unit, month_total, month_ticket, today_total, yesterday_total, variation_pct` — usadas em `renderRanking` e `varCell` ✅
- `get_banner_data` retorna `current_total, previous_total, variation_pct, variation_value` — consumidas em `renderBanner` ✅
- `get_daily_kpis` retorna `today_total, today_ticket, yesterday_total, yesterday_ticket` — consumidas em `renderKpis` ✅
- `monthly_chart` item tem chaves `month, total, is_current` — usadas em `renderChart` ✅

**Placeholder scan:** Nenhum TBD, TODO ou bloco incompleto. ✅
