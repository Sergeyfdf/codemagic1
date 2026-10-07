from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
import sqlite3
import re
import os
import asyncio

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class ConnectionManager:
    def __init__(self):
        self.active_connections = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self, message: str):
        for connection in self.active_connections:
            try:
                await connection.send_text(message)
            except Exception:
                pass

manager = ConnectionManager()

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)

@app.middleware("http")
async def notify_updates_middleware(request: Request, call_next):
    response = await call_next(request)
    if request.method in ["POST", "PUT", "DELETE"] and 200 <= response.status_code < 300:
        if request.url.path != "/ws":
            asyncio.create_task(manager.broadcast("update"))
    return response

DB_FILE = "sparkbank.db"

# Инициализация базы данных
def init_db():
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    # Таблица баланса (хранит всегда одну запись)
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS balance (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            amount REAL NOT NULL,
            last_updated TEXT NOT NULL
        )
    ''')
    try:
        cursor.execute('ALTER TABLE balance ADD COLUMN cash_balance REAL DEFAULT 0.0')
    except sqlite3.OperationalError:
        pass
    
    # Таблица транзакций
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS transactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            time TEXT NOT NULL,
            amount REAL NOT NULL,
            merchant TEXT NOT NULL,
            raw_text TEXT NOT NULL,
            wallet_id INTEGER DEFAULT 1
        )
    ''')
    try:
        cursor.execute('ALTER TABLE transactions ADD COLUMN wallet_id INTEGER DEFAULT 1')
    except sqlite3.OperationalError:
        pass

    # Таблица кошельков
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS wallets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT,
            currency TEXT,
            balance REAL DEFAULT 0.0
        )
    ''')
    
    # Третье меню: хотелки и подписки
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS wishlist_folders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT,
            parent_id INTEGER
        )
    ''')
    try:
        cursor.execute("ALTER TABLE wishlist_folders ADD COLUMN parent_id INTEGER")
    except sqlite3.OperationalError:
        pass
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS wishlist_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            folder_id INTEGER,
            title TEXT,
            url TEXT,
            price REAL
        )
    ''')
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS subscriptions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT,
            amount REAL,
            next_payment_date TEXT
        )
    ''')
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS debts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            person TEXT,
            amount REAL,
            type TEXT
        )
    ''')
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS goals (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT,
            target_amount REAL,
            current_amount REAL DEFAULT 0.0
        )
    ''')
    
    # Таблица для истории конвертера валют
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS converter_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            from_currency TEXT,
            to_currency TEXT,
            amount REAL,
            result REAL,
            date TEXT
        )
    ''')
    
    # Инициализируем нулевой баланс, если таблица пуста
    cursor.execute('SELECT count(*) FROM balance')
    if cursor.fetchone()[0] == 0:
        cursor.execute("INSERT INTO balance (id, amount, cash_balance, last_updated) VALUES (1, 0.0, 0.0, datetime('now'))")
        
    try:
        cursor.execute("ALTER TABLE wallets ADD COLUMN is_goal INTEGER DEFAULT 0")
        cursor.execute("ALTER TABLE wallets ADD COLUMN target_amount REAL DEFAULT 0.0")
        cursor.execute("ALTER TABLE wallets ADD COLUMN photo_uri TEXT")
    except sqlite3.OperationalError:
        pass
        
    try:
        cursor.execute("ALTER TABLE debts ADD COLUMN deadline TEXT")
    except sqlite3.OperationalError:
        pass
        
    try:
        cursor.execute("ALTER TABLE debts ADD COLUMN is_recurring INTEGER DEFAULT 0")
        cursor.execute("ALTER TABLE debts ADD COLUMN recurring_period TEXT")
    except sqlite3.OperationalError:
        pass

    try:
        cursor.execute("ALTER TABLE debts ADD COLUMN last_paid_date TEXT")
    except sqlite3.OperationalError:
        pass
        
    # Инициализируем дефолтный кошелек, если их нет
    cursor.execute('SELECT count(*) FROM wallets')
    if cursor.fetchone()[0] == 0:
        cursor.execute('SELECT cash_balance FROM balance WHERE id = 1')
        row = cursor.fetchone()
        cash_balance = row[0] if row else 0.0
        cursor.execute("INSERT INTO wallets (id, name, currency, balance) VALUES (1, '', 'UAH', ?)", (cash_balance,))
        
    conn.commit()
    conn.close()

init_db()

class BalanceUpdate(BaseModel):
    amount: float


class MessageInput(BaseModel):
    text: str

class ManualTx(BaseModel):
    time: str
    amount: float
    merchant: str
    balance: float

@app.post("/manual_tx")
async def add_manual_tx(data: ManualTx):
    try:
        conn = sqlite3.connect(DB_FILE)
        cursor = conn.cursor()
        cursor.execute("UPDATE balance SET amount = ?, last_updated = datetime('now') WHERE id = 1", (data.balance,))
        cursor.execute("INSERT INTO transactions (time, amount, merchant, raw_text, wallet_id) VALUES (?, ?, ?, ?, ?)", (data.time, data.amount, data.merchant, "Ручное добавление: " + data.merchant, 1))
        conn.commit()
        conn.close()
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/")
async def root():
    return {"status": "ok", "message": "SparkBank API is running on SQLite"}

@app.get("/balance")
async def get_balance():
    try:
        conn = sqlite3.connect(DB_FILE)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        
        cursor.execute('SELECT amount, cash_balance FROM balance WHERE id = 1')
        balance_row = cursor.fetchone()
        balance_amount = balance_row['amount'] if balance_row else 0.0
        cash_balance = balance_row['cash_balance'] if balance_row else 0.0
        
        # Получаем последние 50 транзакций
        cursor.execute('SELECT id, time, amount, merchant, raw_text as raw, wallet_id FROM transactions ORDER BY id DESC LIMIT 50')
        transactions = [dict(row) for row in cursor.fetchall()]
        
        # Получаем все кошельки
        cursor.execute('SELECT id, name, currency, balance, is_goal, target_amount, photo_uri FROM wallets')
        wallets = [dict(row) for row in cursor.fetchall()]
        
        conn.close()
        
        return {
            "balance": balance_amount,
            "cash_balance": cash_balance,
            "transactions": transactions,
            "wallets": wallets
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/update")
async def update_balance(balance_update: BalanceUpdate):
    try:
        conn = sqlite3.connect(DB_FILE)
        cursor = conn.cursor()
        cursor.execute("UPDATE balance SET amount = ?, last_updated = datetime('now') WHERE id = 1", (balance_update.amount,))
        conn.commit()
        conn.close()
        return {"status": "success", "balance": balance_update.amount}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

class CashBalanceUpdate(BaseModel):
    amount: float
    diff: float = 0.0
    reason: str = None
    wallet_id: int = 1

@app.post("/update_cash")
async def update_cash(cash_update: CashBalanceUpdate):
    try:
        conn = sqlite3.connect(DB_FILE)
        cursor = conn.cursor()
        
        # Обновляем старый cash_balance для обратной совместимости, если это кошелек 1
        if cash_update.wallet_id == 1:
            cursor.execute("UPDATE balance SET cash_balance = ?, last_updated = datetime('now') WHERE id = 1", (cash_update.amount,))
            
        # Обновляем кошелек
        cursor.execute("UPDATE wallets SET balance = ? WHERE id = ?", (cash_update.amount, cash_update.wallet_id))
        
        # Всегда записываем как транзакцию!
        from datetime import datetime
        now_str = datetime.now().strftime("%d.%m.%y %H:%M")
        
        reason_text = cash_update.reason if cash_update.reason else "Наличные"
        merchant_name = "Наличные: " + reason_text
        
        cursor.execute('''
            INSERT INTO transactions (time, amount, merchant, raw_text, wallet_id)
            VALUES (?, ?, ?, ?, ?)
        ''', (now_str, cash_update.diff, merchant_name, "Операция с наличными", cash_update.wallet_id))
            
        conn.commit()
        conn.close()
        return {"status": "success", "cash_balance": cash_update.amount}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/transaction/{tx_id}")
async def delete_transaction(tx_id: int):
    try:
        conn = sqlite3.connect(DB_FILE)
        cursor = conn.cursor()
        cursor.execute("DELETE FROM transactions WHERE id = ?", (tx_id,))
        conn.commit()
        conn.close()
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/transaction/{tx_id}/cancel")
async def cancel_transaction(tx_id: int):
    try:
        conn = sqlite3.connect(DB_FILE)
        cursor = conn.cursor()
        
        # Get the transaction details
        cursor.execute("SELECT amount, raw_text, wallet_id FROM transactions WHERE id = ?", (tx_id,))
        row = cursor.fetchone()
        
        if row:
            amount, raw_text, wallet_id = row
            
            # Revert balance
            if raw_text == "Операция с наличными":
                if wallet_id == 1:
                    cursor.execute("UPDATE balance SET cash_balance = cash_balance - ? WHERE id = 1", (amount,))
                cursor.execute("UPDATE wallets SET balance = balance - ? WHERE id = ?", (amount, wallet_id))
            else:
                cursor.execute("UPDATE balance SET amount = amount - ? WHERE id = 1", (amount,))
                
            # Delete transaction
            cursor.execute("DELETE FROM transactions WHERE id = ?", (tx_id,))
            
        conn.commit()
        conn.close()
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

class WalletCreate(BaseModel):
    name: str
    currency: str
    is_goal: int = 0
    target_amount: float = 0.0
    photo_uri: str = None

@app.post("/wallet")
async def create_wallet(wallet: WalletCreate):
    try:
        conn = sqlite3.connect(DB_FILE)
        cursor = conn.cursor()
        cursor.execute("INSERT INTO wallets (name, currency, balance, is_goal, target_amount, photo_uri) VALUES (?, ?, 0.0, ?, ?, ?)", 
                       (wallet.name, wallet.currency, wallet.is_goal, wallet.target_amount, wallet.photo_uri))
        conn.commit()
        conn.close()
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/wallet/{wallet_id}")
async def delete_wallet(wallet_id: int):
    if wallet_id == 1:
        raise HTTPException(status_code=400, detail="Cannot delete main wallet")
    try:
        conn = sqlite3.connect(DB_FILE)
        cursor = conn.cursor()
        cursor.execute("DELETE FROM transactions WHERE wallet_id = ?", (wallet_id,))
        cursor.execute("DELETE FROM wallets WHERE id = ?", (wallet_id,))
        conn.commit()
        conn.close()
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/message")
async def parse_message(msg: MessageInput):
    """
    Принимает сырой текст SMS от банка и парсит его сам.
    Поддерживает 2 формата (списание и пополнение).
    """
    try:
        # Формат 1 (Списание): 12.09.26 11:58 Visa Instant *8288 splata za tovar/poslugu 707.93 UAH ALIEXPRESS.COM. Balans 300.65 UAH
        pattern1 = r"(\d{2}\.\d{2}\.\d{2}\s+\d{2}:\d{2}).*?([\d\.]+)\s*UAH\s+(.*?)\.\s*Balans\s*([\d\.]+)\s*UAH"
        
        # Формат 2 (Пополнение): 1.00 UAH 23.09.26 Visa Instant *8288 popovnennia kartky vid Тимошенко Андрій. Zalyshok: 200.84 UAH
        pattern2 = r"([\d\.]+)\s*UAH\s+(\d{2}\.\d{2}\.\d{2}).*?\*\d{4}\s+(.*?)[\.\s]*(?:Zalyshok|Balans)[:\s]*([\d\.]+)"
        
        match1 = re.search(pattern1, msg.text, re.IGNORECASE)
        match2 = re.search(pattern2, msg.text, re.IGNORECASE)
        
        if match1:
            time_str = match1.group(1).strip()
            amount = -float(match1.group(2)) # Списание (минус)
            merchant = match1.group(3).strip()
            balance = float(match1.group(4))
        elif match2:
            amount = float(match2.group(1)) # Пополнение (плюс)
            time_str = match2.group(2).strip() # Здесь только дата, времени нет
            merchant = match2.group(3).strip()
            balance = float(match2.group(4))
        else:
            return {"status": "error", "message": "Не удалось распарсить сообщение", "text": msg.text}
        
        # Сохраняем в БД
        conn = sqlite3.connect(DB_FILE)
        cursor = conn.cursor()
        
        # Обновляем баланс
        cursor.execute("UPDATE balance SET amount = ?, last_updated = datetime('now') WHERE id = 1", (balance,))
        
        # Добавляем транзакцию
        cursor.execute('''
            INSERT INTO transactions (time, amount, merchant, raw_text)
            VALUES (?, ?, ?, ?)
        ''', (time_str, amount, merchant, msg.text))
        
        conn.commit()
        conn.close()
        
        return {"status": "success"}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ---- MENU 3 ENDPOINTS ----

@app.get("/menu3_data")
async def get_menu3_data():
    try:
        conn = sqlite3.connect(DB_FILE)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        
        cursor.execute("SELECT * FROM wishlist_folders")
        folders = [dict(row) for row in cursor.fetchall()]
        
        cursor.execute("SELECT * FROM wishlist_items")
        items = [dict(row) for row in cursor.fetchall()]
        
        for folder in folders:
            folder['items'] = [item for item in items if item['folder_id'] == folder['id']]
            
        cursor.execute("SELECT * FROM subscriptions")
        subscriptions = [dict(row) for row in cursor.fetchall()]
        
        cursor.execute("SELECT * FROM debts")
        debts = [dict(row) for row in cursor.fetchall()]
        
        cursor.execute("SELECT * FROM converter_history ORDER BY id DESC")
        conversions = [dict(row) for row in cursor.fetchall()]
        
        conn.close()
        return {"status": "success", "folders": folders, "subscriptions": subscriptions, "debts": debts, "conversions": conversions}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

class FolderCreate(BaseModel):
    name: str
    parent_id: Optional[int] = None

@app.post("/wishlist/folder")
async def add_folder(data: FolderCreate):
    try:
        conn = sqlite3.connect(DB_FILE)
        cursor = conn.cursor()
        cursor.execute("INSERT INTO wishlist_folders (name, parent_id) VALUES (?, ?)", (data.name, data.parent_id))
        conn.commit()
        conn.close()
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/wishlist/folder/{folder_id}")
async def delete_folder(folder_id: int):
    try:
        conn = sqlite3.connect(DB_FILE)
        cursor = conn.cursor()
        cursor.execute("DELETE FROM wishlist_items WHERE folder_id = ?", (folder_id,))
        cursor.execute("DELETE FROM wishlist_folders WHERE id = ?", (folder_id,))
        conn.commit()
        conn.close()
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

class ItemCreate(BaseModel):
    folder_id: int
    title: str
    url: str
    price: float = 0.0

@app.post("/wishlist/item")
async def add_item(data: ItemCreate):
    try:
        conn = sqlite3.connect(DB_FILE)
        cursor = conn.cursor()
        cursor.execute("INSERT INTO wishlist_items (folder_id, title, url, price) VALUES (?, ?, ?, ?)", 
                      (data.folder_id, data.title, data.url, data.price))
        conn.commit()
        conn.close()
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/wishlist/item/{item_id}")
async def delete_item(item_id: int):
    try:
        conn = sqlite3.connect(DB_FILE)
        cursor = conn.cursor()
        cursor.execute("DELETE FROM wishlist_items WHERE id = ?", (item_id,))
        conn.commit()
        conn.close()
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

class MoveItem(BaseModel):
    new_folder_id: Optional[int]

@app.put("/wishlist/item/{item_id}/move")
async def move_item(item_id: int, data: MoveItem):
    try:
        conn = sqlite3.connect(DB_FILE)
        cursor = conn.cursor()
        cursor.execute("UPDATE wishlist_items SET folder_id = ? WHERE id = ?", (data.new_folder_id, item_id))
        conn.commit()
        conn.close()
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

class MoveFolder(BaseModel):
    new_parent_id: Optional[int]

@app.put("/wishlist/folder/{folder_id}/move")
async def move_folder(folder_id: int, data: MoveFolder):
    try:
        conn = sqlite3.connect(DB_FILE)
        cursor = conn.cursor()
        cursor.execute("UPDATE wishlist_folders SET parent_id = ? WHERE id = ?", (data.new_parent_id, folder_id))
        conn.commit()
        conn.close()
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

class SubCreate(BaseModel):
    name: str
    amount: float
    next_payment_date: str

@app.post("/subscription")
async def add_subscription(data: SubCreate):
    try:
        conn = sqlite3.connect(DB_FILE)
        cursor = conn.cursor()
        cursor.execute("INSERT INTO subscriptions (name, amount, next_payment_date) VALUES (?, ?, ?)",
                      (data.name, data.amount, data.next_payment_date))
        conn.commit()
        conn.close()
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/subscription/{sub_id}")
async def delete_subscription(sub_id: int):
    try:
        conn = sqlite3.connect(DB_FILE)
        cursor = conn.cursor()
        cursor.execute("DELETE FROM subscriptions WHERE id = ?", (sub_id,))
        conn.commit()
        conn.close()
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

class DebtCreate(BaseModel):
    person: str
    amount: float
    type: str # 'owed_to_me' or 'i_owe'
    deadline: str = None
    is_recurring: int = 0
    recurring_period: str = None

@app.post("/debts")
async def add_debt(data: DebtCreate):
    try:
        conn = sqlite3.connect(DB_FILE)
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO debts (person, amount, type, deadline, is_recurring, recurring_period) VALUES (?, ?, ?, ?, ?, ?)", 
            (data.person, data.amount, data.type, data.deadline, data.is_recurring, data.recurring_period)
        )
        conn.commit()
        conn.close()
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/debts/{debt_id}")
async def delete_debt(debt_id: int):
    try:
        conn = sqlite3.connect(DB_FILE)
        cursor = conn.cursor()
        cursor.execute("DELETE FROM debts WHERE id = ?", (debt_id,))
        conn.commit()
        conn.close()
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

class DebtPay(BaseModel):
    last_paid_date: str

@app.put("/debts/{debt_id}/pay")
async def pay_debt(debt_id: int, data: DebtPay):
    try:
        conn = sqlite3.connect(DB_FILE)
        cursor = conn.cursor()
        cursor.execute("UPDATE debts SET last_paid_date = ? WHERE id = ?", (data.last_paid_date, debt_id))
        conn.commit()
        conn.close()
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

class ConverterCreate(BaseModel):
    from_currency: str
    to_currency: str
    amount: float
    result: float
    date: str

@app.post("/converter/history")
async def add_conversion(data: ConverterCreate):
    try:
        conn = sqlite3.connect(DB_FILE)
        cursor = conn.cursor()
        cursor.execute("INSERT INTO converter_history (from_currency, to_currency, amount, result, date) VALUES (?, ?, ?, ?, ?)",
                      (data.from_currency, data.to_currency, data.amount, data.result, data.date))
        conn.commit()
        conn.close()
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/converter/history/{conv_id}")
async def delete_conversion(conv_id: int):
    try:
        conn = sqlite3.connect(DB_FILE)
        cursor = conn.cursor()
        cursor.execute("DELETE FROM converter_history WHERE id = ?", (conv_id,))
        conn.commit()
        conn.close()
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
