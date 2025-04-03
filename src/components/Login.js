import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import './Login.css';

const API_URL = 'http://127.0.0.1:8000';

function Login({ setToken, setUsername }) {
  const [localUsername, setLocalUsername] = useState('');
  const [password, setPassword] = useState('');
  const navigate = useNavigate();

  const handleSubmit = (e) => {
    e.preventDefault();

    const formData = new URLSearchParams();
    formData.append('username', localUsername);
    formData.append('password', password);

    fetch(`${API_URL}/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: formData.toString()
    })
      .then((response) => {
        if (!response.ok) throw new Error('Login failed');
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
        alert('Ошибка входа');
      });
  };

  return (
    <div className="login-container">
      <h2>Вход</h2>
      <form onSubmit={handleSubmit}>
        <div>
          <label>Имя пользователя:</label>
          <input
            type="text"
            value={localUsername}
            onChange={(e) => setLocalUsername(e.target.value)}
            required
          />
        </div>
        <div>
          <label>Пароль:</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        <button type="submit">Войти</button>
      </form>
      <div className="link">
        Нет аккаунта? <Link to="/register">Регистрация</Link>
      </div>
    </div>
  );
}

export default Login;
