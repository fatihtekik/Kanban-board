import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import './Login.css'; // используем те же стили

const API_URL = 'http://127.0.0.1:8000';

function Register({ setToken, setUsername }) {
  const [localUsername, setLocalUsername] = useState('');
  const [password, setPassword] = useState('');
  const navigate = useNavigate();

  const handleSubmit = (e) => {
    e.preventDefault();
    const body = {
      username: localUsername,
      password: password
    };

    fetch(`${API_URL}/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error('Registration failed');
        }
        return response.json();
      })
      .then((data) => {
        const token = data.access_token;
        setToken(token);
        setUsername(localUsername);
        localStorage.setItem('token', token);
        localStorage.setItem('username', localUsername);
        navigate('/');
      })
      .catch(() => {
        alert('Ошибка регистрации');
      });
  };

  return (
    <div className="login-page">
      <div className="login-container">
        <h2>Регистрация</h2>
        <form onSubmit={handleSubmit}>
          <label>Имя пользователя:</label>
          <input
            type="text"
            value={localUsername}
            onChange={(e) => setLocalUsername(e.target.value)}
            required
          />
          <label>Пароль:</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <button type="submit">Зарегистрироваться</button>
        </form>
        <div className="link">
          Уже есть аккаунт? <Link to="/login">Войти</Link>
        </div>
      </div>
    </div>
  );
}

export default Register;
