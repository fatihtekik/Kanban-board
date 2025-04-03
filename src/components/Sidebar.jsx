import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './sidebar.css';

const API_URL = "http://127.0.0.1:8000";

function Sidebar({ token, currentBoardId }) {
  const [boards, setBoards] = useState([]);
  const [newTitle, setNewTitle] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    // Загружаем список досок
    fetch(`${API_URL}/boards`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(res => {
        if (!res.ok) {
          throw new Error("Ошибка при загрузке досок (не авторизован?)");
        }
        return res.json();
      })
      .then(data => {
        if (Array.isArray(data)) {
          setBoards(data);
        } else {
          console.warn("Ответ /boards не является массивом:", data);
          setBoards([]);
        }
      })
      .catch(err => {
        console.error("Ошибка при загрузке досок:", err);
      });
  }, [token]);

  const handleCreateBoard = () => {
    const title = newTitle.trim();
    if (!title) return;

    fetch(`${API_URL}/boards`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ title })
    })
      .then(res => {
        if (!res.ok) {
          throw new Error("Ошибка при создании доски");
        }
        return res.json();
      })
      .then(newBoard => {
        setBoards(prev => [...prev, newBoard]);
        setNewTitle('');
      })
      .catch(err => console.error("Ошибка при создании доски:", err));
  };

  const handleDeleteBoard = boardId => {
    fetch(`${API_URL}/boards/${boardId}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${token}`
      }
    })
      .then(res => {
        if (!res.ok) {
          throw new Error("Не удалось удалить доску");
        }
        setBoards(prev => prev.filter(b => b.id !== boardId));
      })
      .catch(err => console.error("Ошибка при удалении доски:", err));
  };

  return (
    <div className="columnWithTask">
      <h3>Мои доски</h3>
      <ul style={{ listStyle: 'none', paddingLeft: 0 }}>
        {boards.map(board => board && (
          <li key={board.id} style={{ marginBottom: '5px' }}>
            <span
              style={{
                cursor: 'pointer',
                fontWeight: String(board.id) === String(currentBoardId) ? 'bold' : 'normal'
              }}
              onClick={() => navigate(`/boards/${board.id}`)}
            >
              {board.title}
            </span>
            <button onClick={() => handleDeleteBoard(board.id)} style={{ marginLeft: '8px' }}>
              -
            </button>
          </li>
        ))}
      </ul>

      <div style={{ marginTop: '10px' }}>
        <input
          type="text"
          placeholder="Название новой доски"
          value={newTitle}
          onChange={e => setNewTitle(e.target.value)}
        />
        <button onClick={handleCreateBoard}>Создать</button>
      </div>
    </div>
  );
}

export default Sidebar;
