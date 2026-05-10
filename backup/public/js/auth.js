// public/js/auth.js
(() => {
  'use strict';
  const el = (q) => document.querySelector(q);

  function showMessage(targetSelector, message, isError = false) {
    const target = el(targetSelector);
    if (!target) return alert(message);
    target.textContent = message;
    target.style.color = isError ? '#b00020' : '#006400';
    setTimeout(() => { if (target.textContent === message) target.textContent = ''; }, 6000);
  }

  async function handleRegister(ev) {
    ev.preventDefault();
    const nome = el('#reg-nome').value;
    const email = el('#reg-email').value;
    const senha = el('#reg-senha').value;

    if (senha.length !== 6) {
      return showMessage('#auth-message', 'A senha deve ter exatamente 6 dígitos.', true);
    }

    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome, email, senha })
      });

      const result = await response.json();
      if (response.ok) {
        showMessage('#auth-message', 'Cadastro realizado! Use o formulário acima para entrar.');
        ev.target.reset();
      } else {
        showMessage('#auth-message', result.message || 'Erro no cadastro', true);
      }
    } catch (err) {
      showMessage('#auth-message', 'Erro: Certifique-se de que o servidor está rodando em localhost:3000', true);
    }
  }

  async function handleLogin(ev) {
    ev.preventDefault();
    const identifier = el('#login-id').value.trim();
    const senha = el('#login-senha').value;

try {
  const response = await fetch('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    // Alterado 'senha' para 'senhaHash' para combinar com o server.js
    body: JSON.stringify({ nome, email, senhaHash: senha }) 
  })

      const json = await response.json();
      if (response.ok && json.token) {
        localStorage.setItem('albumAuthToken', json.token);
        localStorage.setItem('albumUser', JSON.stringify(json.user));
        window.location.reload();
      } else {
        showMessage('#login-message', json.message || 'Credenciais inválidas.', true);
      }
    } catch (err) {
      showMessage('#login-message', 'Erro de conexão com o servidor.', true);
    }
  }

  window.albumAuth = {
    init: () => {
      const regForm = el('#form-register');
      if (regForm) regForm.addEventListener('submit', handleRegister);
      const logForm = el('#form-login');
      if (logForm) logForm.addEventListener('submit', handleLogin);
    },
    getUser: () => JSON.parse(localStorage.getItem('albumUser') || '{}'),
    logout: () => {
      localStorage.clear();
      window.location.reload();
    }
  };
})();