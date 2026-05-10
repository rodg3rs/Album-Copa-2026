const express = require('express');
const { createClient } = require('@libsql/client');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const nodemailer = require('nodemailer');
require('dotenv').config();
const app = express();
app.use(express.json());
app.use(cors());
// Cliente Turso DB (Dados do seu .env)
const db = createClient({
url: process.env.TURSO_URL,
authToken: process.env.TURSO_TOKEN,
});
// Middleware para verificar JWT
const verifyToken = (req, res, next) => {
const token = req.headers['authorization']?.split(' ')[1];
if (!token) return res.status(403).json({ error: "Token não fornecido" });
jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
if (err) return res.status(401).json({ error: "Token inválido" });
req.userId = decoded.id;
next();
});
};

app.post('/api/register', async (req, res) => {
const { id, nome, senha, email } = req.body;

try {
await db.execute({
sql: "INSERT INTO dManos (ID, Nome, eMail, Senha) VALUES (?, ?, ?, ?)",
args: [id, nome, email, senha]
});
// Inicializa álbum e repetidas vazios para o novo usuário
await db.execute({ sql: "INSERT INTO dAlbum (ID, Nome) VALUES (?, ?)", args: [id,
nome] });
await db.execute({ sql: "INSERT INTO dRepetida (ID, Nome) VALUES (?, ?)", args:
[id, nome] });
// Envio de Email (Configurar transportador nodemailer)
console.log(`Simulando envio de email para ${email}: Bem-vindo ao Álbum 2026!`);
res.json({ success: true, message: "Bem-vindo! Cadastro efetivado." });
} catch (e) {
res.status(500).json({ error: e.message });
}
});


app.post('/api/chat', verifyToken, async (req, res) => {
const { mensagem } = req.body;
const agora = new Date();
try {
await db.execute({
sql: "INSERT INTO dChat (ID, Mensagem, Data, Hora) VALUES (?, ?, ?, ?)",
args: [req.userId, mensagem, agora.toLocaleDateString(),
agora.toLocaleTimeString()]
});
// Limpeza de mensagens com mais de 24 horas
// Nota: Em produção, isto pode ser um Cron Job, aqui é feito no 'push'
const ontem = new Date(agora.getTime() - (24 * 60 * 60 *
1000)).toLocaleDateString();
await db.execute({
sql: "DELETE FROM dChat WHERE Data < ?",
args: [ontem]
});
res.sendStatus(201);
} catch (e) { res.status(500).json({ error: e.message }); }
});

// Exemplo Simplificado para "Eu Quero" (Cruzamento de Álbuns)
app.get('/api/match/want', verifyToken, async (req, res) => {
try {
// Busca figurinhas que faltam no dAlbum do usuário logado
// e verifica quem as tem na tabela dRepetida
const query = `
SELECT R.Nome as Usuario, 'R1' as Figurinha
FROM dRepetida R
JOIN dAlbum A ON A.ID = ?
WHERE A.A1 = '0' AND R.R1 = '1'
UNION
SELECT R.Nome, 'R2' FROM dRepetida R JOIN dAlbum A ON A.ID = ?
WHERE A.A2 = '0' AND R.R2 = '1'
-- (... repetir lógica ou otimizar via código para as 200 colunas)
`;
const result = await db.execute({ sql: query, args: [req.userId, req.userId] });
res.json(result.rows);
} catch (e) { res.status(500).send(e.message); }
});
