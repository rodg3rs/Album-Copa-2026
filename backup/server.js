// Exemplo: server.js - integrar no seu servidor existente
require('dotenv').config();
const express = require('express');
const path = require('path');
const { createClient } = require('@libsql/client');
const bcrypt = require('bcryptjs'); 
const jwt = require('jsonwebtoken');

const app = express();
const PORT = process.env.PORT || 3000;

// TESTE DE DIAGNÓSTICO:
console.log("URL lida do ENV:", process.env.TURSO_URL ? "OK (Encontrada)" : "ERRO (Não encontrada)");
console.log("Token lido do ENV:", process.env.TURSO_TOKEN ? "OK (Encontrado)" : "ERRO (Não encontrado)");

const db = createClient({
  url: process.env.TURSO_URL || process.env.TURSO_DATABASE_URL, // Tenta os dois nomes
  auth: { 
    token: process.env.TURSO_TOKEN || process.env.TURSO_AUTH_TOKEN // Tenta os dois nomes
  }
});

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public'))); // serve index.html e /js/*.js

// Helper: gerar token JWT
function signToken(payload) {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET não configurado.');
  return jwt.sign(payload, secret, { expiresIn: '8h' });
}

app.post('/api/auth/register', async (req, res) => {
    console.log("Dados recebidos no cadastro:", req.body); // Adicione esta linha
    const { nome, email, senha } = req.body;

    try {
        // Gera ID automático no formato A01, A02...
        const result = await db.execute("SELECT COUNT(*) as total FROM dManos");
        const proximoNumero = (Number(result.rows[0].total) + 1).toString().padStart(2, '0');
        const novoId = `A${proximoNumero}`;

        // Criptografia da senha
        const salt = await bcrypt.genSalt(10);
        const hash = await bcrypt.hash(senha, salt);

        await db.execute({
            sql: "INSERT INTO dManos (ID, Nome, Senha, eMail) VALUES (?, ?, ?, ?)",
            args: [novoId, nome, hash, email]
        });

        res.json({ message: 'Cadastro realizado!', id: novoId });
    } catch (err) {
        console.error(err);
        if (err.message.includes('UNIQUE')) {
            return res.status(400).json({ message: 'Este e-mail já está cadastrado.' });
        }
        res.status(500).json({ message: 'Erro interno ao salvar no banco.' });
    }
});

// Rota: login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { identifier, senhaHash } = req.body || {};
    if (!identifier || !senhaHash) {
      return res.status(400).json({ message: 'Campos obrigatórios ausentes.' });
    }

    // Buscar usuário por ID (3 chars) ou eMail
    const check = await db.execute('SELECT ID, Nome, Senha, eMail FROM dManos WHERE ID = ? OR eMail = ?', [identifier, identifier]);
    const rows = check.rows || [];
    if (rows.length === 0) {
      return res.status(401).json({ message: 'Credenciais inválidas.' });
    }
    const user = rows[0];

    // Comparar senha: senhaHash (SHA-256 vindo do cliente) comparado com bcrypt armazenado
    const match = await bcrypt.compare(senhaHash, user.Senha);
    if (!match) {
      return res.status(401).json({ message: 'Credenciais inválidas.' });
    }

    // Criar token e retornar dados sem a senha
    const token = signToken({ id: user.ID, nome: user.Nome, email: user.eMail });
    const userSafe = { id: user.ID, nome: user.Nome, email: user.eMail };
    return res.json({ token, user: userSafe });
  } catch (err) {
    console.error('Erro /api/auth/login', err);
    return res.status(500).json({ message: 'Erro interno no servidor.' });
  }
});

// Opcional: rota para checar token (exemplo)
function authMiddleware(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : (req.headers['x-access-token'] || '');
  if (!token) return res.status(401).json({ message: 'Token não fornecido.' });
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = payload;
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Token inválido.' });
  }
}
app.get('/api/me', authMiddleware, (req, res) => {
  res.json({ user: req.user });
});



// --- ROTAS DE CHAT ---
app.get('/api/chat', authMiddleware, async (req, res) => {
  // Retorna mensagens das últimas 24 horas
  const query = `SELECT Nome, Mensagem, datetime(DataHora, 'localtime') as DataHora FROM dChat WHERE DataHora >= datetime('now', '-1 day') ORDER BY DataHora ASC`;
  const result = await db.execute(query);
  res.json(result.rows);
});

app.post('/api/chat', authMiddleware, async (req, res) => {
  const { mensagem, userId, nome } = req.body;
  await db.execute(`INSERT INTO dChat (ID, Nome, Mensagem) VALUES (?, ?, ?)`, [userId, nome, mensagem]);
  res.json({ success: true });
});

// --- ROTAS DE FIGURINHAS ---
app.get('/api/stickers/:type', authMiddleware, async (req, res) => {
  const table = req.params.type === 'album' ? 'dAlbum' : 'dRepetida';
  const result = await db.execute(`SELECT Figurinhas FROM ${table} WHERE ID = ?`, [req.user.id]);
  res.json({ figurinhas: result.rows.length > 0 ? result.rows[0].Figurinhas : '[]' });
});

app.post('/api/stickers/:type', authMiddleware, async (req, res) => {
  const table = req.params.type === 'album' ? 'dAlbum' : 'dRepetida';
  const { figurinhas } = req.body; // string JSON ex: "[1,5,10]"
  // Upsert (Insere ou Atualiza)
  await db.execute(`INSERT INTO ${table} (ID, Figurinhas) VALUES (?, ?) ON CONFLICT(ID) DO UPDATE SET Figurinhas = excluded.Figurinhas`, [req.user.id, figurinhas]);
  res.json({ success: true });
});

// --- ROTAS DE TROCA (MATCHES) ---
app.get('/api/trades/:type', authMiddleware, async (req, res) => {
  try {
      const myId = req.user.id;
      // Pegar meu album e minhas repetidas
      const myAlbumRes = await db.execute(`SELECT Figurinhas FROM dAlbum WHERE ID = ?`, [myId]);
      const myRepetidasRes = await db.execute(`SELECT Figurinhas FROM dRepetida WHERE ID = ?`, [myId]);
      
      const myAlbum = myAlbumRes.rows.length > 0 ? JSON.parse(myAlbumRes.rows[0].Figurinhas || '[]') : [];
      const myRepetidas = myRepetidasRes.rows.length > 0 ? JSON.parse(myRepetidasRes.rows[0].Figurinhas || '[]') : [];
      
      let matches = [];

      // Cruzamento lógico em memória (ideal para o escopo do projeto):
      if (req.params.type === 'quero') {
          // Figurinhas que faltam pra mim (1 a 200 menos o que tenho)
          const faltam = Array.from({length: 200}, (_, i) => i + 1).filter(x => !myAlbum.includes(x));
          
          // Buscar todos os outros usuários e suas repetidas
          const outros = await db.execute(`SELECT r.ID, r.Figurinhas, m.Nome, m.eMail FROM dRepetida r JOIN dManos m ON r.ID = m.ID WHERE r.ID != ?`, [myId]);
          
          outros.rows.forEach(user => {
              const repetidasDele = JSON.parse(user.Figurinhas || '[]');
              repetidasDele.forEach(fig => {
                  if(faltam.includes(fig)) {
                      matches.push({ figurinha: fig, usuarioNome: user.Nome, email: user.eMail });
                  }
              });
          });

      } else if (req.params.type === 'troco') {
          // Quem precisa das minhas repetidas?
          const outros = await db.execute(`SELECT a.ID, a.Figurinhas, m.Nome, m.eMail FROM dAlbum a JOIN dManos m ON a.ID = m.ID WHERE a.ID != ?`, [myId]);
          
          outros.rows.forEach(user => {
              const albumDele = JSON.parse(user.Figurinhas || '[]');
              const faltamPraEle = Array.from({length: 200}, (_, i) => i + 1).filter(x => !albumDele.includes(x));
              
              myRepetidas.forEach(minhaRepetida => {
                  if(faltamPraEle.includes(minhaRepetida)) {
                      matches.push({ figurinha: minhaRepetida, usuarioNome: user.Nome, email: user.eMail });
                  }
              });
          });
      }

      res.json(matches);
  } catch(err) {
      console.error(err);
      res.status(500).json({ error: 'Erro ao processar trocas' });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});