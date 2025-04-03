from fastapi import FastAPI, HTTPException, Depends, status, Query
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from pydantic import BaseModel
from typing import List, Optional
import psycopg2
import psycopg2.pool
from psycopg2.extras import RealDictCursor
from passlib.context import CryptContext
from jose import JWTError, jwt
from datetime import datetime, timedelta

from fastapi.middleware.cors import CORSMiddleware

# --- Конфигурация JWT ---
SECRET_KEY = "c7ff7061b295f10715ac9fbd7632a68d116c139f3adcb846107d4bdf32649b80f487b2ce309ec524ce3981a579fa7c489a896c0cef6807e261c8f6666b3576a133c2ff62c15f999cf2edb538711379d8ea15a0d30aa999d8f66794c2543d376cde4b9890c1c2cf7d4baec2c3f4261e4d1e709a8ca22deb8ccdc2b46d309b59e8ff0041025b6711d572412ac0307de4050882c78ea4732bb1f64a358a29cd265e8107c84f390aba368f0a97da45df007adde7422dabcaa8974e3f6f4897bbd5e238801e8c8b9afc9c4c8e4051e4589a4dee8dd0ff2217131d4e63f21d904194c456e96fea9aca968c9dca8881b7fe6ef843f05215592652566620edff65784ac0"
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60

# --- Настройки подключения к PostgreSQL ---
DB_HOST = "localhost"
DB_NAME = "Тамер"        # Название вашей базы
DB_USER = "postgres"     # Пользователь PostgreSQL
DB_PASSWORD = "Aidana2007"  # Пароль от PostgreSQL

# Инициализация пула соединений (минимум 1, максимум 10 соединений)
db_pool = psycopg2.pool.SimpleConnectionPool(
    1, 10,
    host=DB_HOST,
    database=DB_NAME,
    user=DB_USER,
    password=DB_PASSWORD
)

# Зависимость для получения соединения из пула
def get_db():
    conn = db_pool.getconn()
    try:
        yield conn
    finally:
        db_pool.putconn(conn)

# --- Инициализация FastAPI ---
app = FastAPI()

# Разрешаем CORS со всех доменов (для упрощения локальной разработки)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Настройка шифрования паролей ---
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)

# --- JWT ---

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=15)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

# --- Pydantic-модели ---
class UserCreate(BaseModel):
    username: str
    password: str

class Token(BaseModel):
    access_token: str
    token_type: str

# Обратите внимание: теперь у TaskCreate есть board_id
class TaskCreate(BaseModel):
    content: str
    column: Optional[str] = "todo"
    position: Optional[int] = 0
    board_id: int  # <-- обязательное поле, чтобы знать, в какой доске задача

# Расширяем TaskOut, чтобы вернуть board_id тоже
class TaskOut(BaseModel):
    id: int
    content: str
    column: str
    position: int
    board_id: int

    class Config:
        from_attributes = True

# Модель для создания доски
class BoardCreate(BaseModel):
    title: str

# --- Работа с БД (функции) ---
def get_user_by_username(db_conn, username: str):
    with db_conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute("SELECT * FROM users WHERE username = %s", (username,))
        return cur.fetchone()

def authenticate_user(db_conn, username: str, password: str):
    user = get_user_by_username(db_conn, username)
    if not user:
        return None
    if not verify_password(password, user["hashed_password"]):
        return None
    return user

# --- Depends: получение текущего юзера ---
async def get_current_user(token: str = Depends(oauth2_scheme), db_conn=Depends(get_db)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
    user = get_user_by_username(db_conn, username)
    if user is None:
        raise credentials_exception
    return user

# --- Роуты пользователей/логина ---
@app.post("/register", response_model=Token)
def register(user_create: UserCreate, db_conn=Depends(get_db)):
    # Проверяем, нет ли уже такого имени пользователя
    if get_user_by_username(db_conn, user_create.username):
        raise HTTPException(status_code=400, detail="Username already registered")

    hashed_password = get_password_hash(user_create.password)
    with db_conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute("""
            INSERT INTO users (username, hashed_password)
            VALUES (%s, %s)
            RETURNING id, username
        """, (user_create.username, hashed_password))
        db_conn.commit()
        new_user = cur.fetchone()

    # Генерируем JWT-токен
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": new_user["username"]},
        expires_delta=access_token_expires
    )
    return {"access_token": access_token, "token_type": "bearer"}

@app.post("/token", response_model=Token)
def login(form_data: OAuth2PasswordRequestForm = Depends(), db_conn=Depends(get_db)):
    user = authenticate_user(db_conn, form_data.username, form_data.password)
    if not user:
        raise HTTPException(status_code=401, detail="Incorrect username or password")

    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user["username"]},
        expires_delta=access_token_expires
    )
    return {"access_token": access_token, "token_type": "bearer"}

# --- Роуты для tasks ---
@app.get("/tasks", response_model=List[TaskOut])
def read_tasks(
    board_id: int = Query(...),
    db_conn=Depends(get_db),
    current_user=Depends(get_current_user)
):
    """
    Требует параметр ?board_id=...
    Возвращает задачи только этой доски.
    """
    with db_conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute("""
            SELECT id, content, "column", position, board_id
            FROM tasks
            WHERE owner_id = %s AND board_id = %s
            ORDER BY position
        """, (current_user["id"], board_id))
        tasks = cur.fetchall()
    return tasks

@app.post("/tasks", response_model=TaskOut)
def create_task(
    task: TaskCreate,
    db_conn=Depends(get_db),
    current_user=Depends(get_current_user)
):
    # Опционально, проверка: принадлежит ли board_id этому пользователю
    with db_conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute("""
            INSERT INTO tasks (content, "column", position, owner_id, board_id)
            VALUES (%s, %s, %s, %s, %s)
            RETURNING id, content, "column", position, board_id
        """, (task.content, task.column, task.position, current_user["id"], task.board_id))
        db_conn.commit()
        new_task = cur.fetchone()
    return new_task

@app.put("/tasks/{task_id}", response_model=TaskOut)
def update_task(
    task_id: int,
    task: TaskCreate,
    db_conn=Depends(get_db),
    current_user=Depends(get_current_user)
):
    with db_conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute("""
            UPDATE tasks
               SET content = %s,
                   "column" = %s,
                   position = %s,
                   board_id = %s
             WHERE id = %s
               AND owner_id = %s
         RETURNING id, content, "column", position, board_id
        """, (task.content, task.column, task.position, task.board_id, task_id, current_user["id"]))
        updated_task = cur.fetchone()
        if not updated_task:
            raise HTTPException(status_code=404, detail="Task not found or belongs to another user")
        db_conn.commit()
    return updated_task

# --- Роуты для boards ---
@app.get("/boards")
def get_boards(db_conn=Depends(get_db), current_user=Depends(get_current_user)):
    with db_conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute(
            "SELECT id, title FROM boards WHERE owner_id = %s ORDER BY id",
            (current_user["id"],)
        )
        boards = cur.fetchall()
    return boards

@app.post("/boards")
def create_board(
    board: BoardCreate,
    db_conn=Depends(get_db),
    current_user=Depends(get_current_user)
):
    with db_conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute("""
            INSERT INTO boards (title, owner_id)
            VALUES (%s, %s)
            RETURNING id, title
        """, (board.title, current_user["id"]))
        db_conn.commit()
        new_board = cur.fetchone()
    return new_board

@app.delete("/boards/{board_id}")
def delete_board(
    board_id: int,
    db_conn=Depends(get_db),
    current_user=Depends(get_current_user)
):
    with db_conn.cursor(cursor_factory=RealDictCursor) as cur:
        # Проверим, что доска существует и принадлежит user
        cur.execute("SELECT id FROM boards WHERE id = %s AND owner_id = %s", (board_id, current_user["id"]))
        row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Board not found or not yours")

        # Удаляем доску
        cur.execute("DELETE FROM boards WHERE id = %s", (board_id,))
        db_conn.commit()
    return {"detail": "Board deleted"}

# --- Запуск приложения (для отладки) ---
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
