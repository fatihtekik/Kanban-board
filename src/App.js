import React, { useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useParams } from 'react-router-dom';
import Login from './components/Login';
import Register from './components/Register';
import KanbanBoard from './components/KanbanBoard';
import Sidebar from './components/Sidebar';

// Обёртка для доски, которая извлекает boardId из URL
function BoardWrapper({ token, username, onLogout }) {
  const { boardId } = useParams();
  return (
    <div style={{ display: 'flex', height: '100vh' }}>
      <Sidebar token={token} currentBoardId={boardId} />
      <KanbanBoard token={token} username={username} onLogout={onLogout} boardId={boardId} />
    </div>
  );
}

function App() {
  // Считываем из localStorage, если уже есть
  const [token, setToken] = useState(localStorage.getItem('token') || '');
  const [username, setUsername] = useState(localStorage.getItem('username') || '');

  const handleLogout = () => {
    setToken('');
    setUsername('');
    localStorage.removeItem('token');
    localStorage.removeItem('username');
  };

  return (
    <Router>
      <Routes>
        <Route path="/login" element={<Login setToken={setToken} setUsername={setUsername} />} />
        <Route path="/register" element={<Register setToken={setToken} setUsername={setUsername} />} />
        <Route
          path="/boards/:boardId"
          element={token ? <BoardWrapper token={token} username={username} onLogout={handleLogout} /> : <Navigate to="/login" />}
        />
        {/* Если токен есть, можно перенаправить на какую-нибудь дефолтную доску или показать сообщение */}
        <Route path="/" element={token ? <Navigate to="/boards/0" /> : <Navigate to="/login" />} />
      </Routes>
    </Router>
  );
}

export default App;
