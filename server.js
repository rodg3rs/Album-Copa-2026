const express = require('express');
const { createClient } = require('@libsql/client');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const nodemailer = require('nodemailer');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(cors());

const db = createClient({
    url: process.env.TURSO_URL,
    authToken: process.env.TURSO_TOKEN,
});

// Configuração do E-mail (Nodemailer)
const transporter = nodemailer.createTransport({
    service: 'gmail', 
    auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
});

// Middleware de Autenticação
const verifyToken = (req, res, next) => {
    const token = req.headers['authorization']?.split(' ')[1];
    if (!token) return res.status(403).json({ error: "Acesso negado" });

    jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
        if (err) return res.status(401).json({ error: "Sessão expirada" });
        req.user = decoded;
        next();
    });
};

// A. CADASTRO E VALIDAÇÕES (dManos) [cite: 16, 18, 20]
app.post('/api/register', async (req, res) => {
    const { nome, senha, email } = req.body;

    if (senha.length !== 6) return res.status(400).json({ error: "Senha deve ter 6 caracteres" });
    if (!email.includes('@')) return res.status(400).json({ error: "E-mail inválido" });

    try {
        const lastUser = await db.execute("SELECT MAX(CAST(ID AS INTEGER)) as maxId FROM dManos");
        let nextId = (lastUser.rows[0].maxId || 99) + 1; 
        if (nextId > 999) return res.status(400).json({ error: "Limite de usuários atingido" });

        await db.execute({
            sql: "INSERT INTO dManos (ID, Nome, eMail, Senha) VALUES (?, ?, ?, ?)",
            args: [String(nextId), nome, email, senha]
        });

        await transporter.sendMail({
            from: process.env.EMAIL_USER,
            to: email,
            subject: "Cadastro Copa 2026",
            html: `<h1>Bem-vindo, ${nome}!</h1><p>Seu ID de acesso é: <b>${nextId}</b></p>`
        });

        res.json({ success: true, id: nextId });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// LOGIN
app.post('/api/login', async (req, res) => {
    const { id, senha } = req.body;
    const result = await db.execute({
        sql: "SELECT * FROM dManos WHERE ID = ? AND Senha = ?",
        args: [String(id), senha]
    });

    if (result.rows.length > 0) {
        const token = jwt.sign({ id: result.rows[0].ID, nome: result.rows[0].Nome }, process.env.JWT_SECRET);
        res.json({ token, nome: result.rows[0].Nome });
    } else { res.status(401).json({ error: "ID ou Senha incorretos" }); }
});

// B. CHAT COM LIMPEZA DE 24H (dChat) [cite: 22, 24, 26]
app.post('/api/chat', verifyToken, async (req, res) => {
    const { mensagem } = req.body;
    const agora = new Date();
    const ts = agora.getTime();
    try {
        await db.execute({
            sql: "INSERT INTO dChat (ID, Mensagem, Data, Hora, Timestamp) VALUES (?, ?, ?, ?, ?)",
            args: [req.user.id, mensagem, agora.toLocaleDateString(), agora.toLocaleTimeString(), ts]
        });
        await db.execute({ sql: "DELETE FROM dChat WHERE Timestamp < ?", args: [ts - 86400000] });
        res.sendStatus(201);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/chat', verifyToken, async (req, res) => {
    const result = await db.execute("SELECT m.Nome, c.* FROM dChat c JOIN dManos m ON c.ID = m.ID ORDER BY Timestamp DESC LIMIT 50");
    res.json(result.rows);
});

// C. LÓGICA DE FIGURINHAS (dControle - Linhas Alfanuméricas) 
app.post('/api/stickers', verifyToken, async (req, res) => {
    const { stamp, tipo, acao } = req.body; // tipo: 'A' (Album) ou 'R' (Repetida)
    try {
        if (acao === 'add') {
            await db.execute({ sql: "INSERT INTO dControle (ID, Stamp, Tipo) VALUES (?, ?, ?)", args: [req.user.id, stamp, tipo] });
        } else {
            await db.execute({ sql: "DELETE FROM dControle WHERE ID = ? AND Stamp = ? AND Tipo = ?", args: [req.user.id, stamp, tipo] });
        }
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/my-stickers', verifyToken, async (req, res) => {
    const { tipo } = req.query;
    const result = await db.execute({ sql: "SELECT Stamp FROM dControle WHERE ID = ? AND Tipo = ?", args: [req.user.id, tipo] });
    res.json(result.rows.map(r => r.Stamp));
});

// D. TROCAS (Cruzamento de Dados) [cite: 40, 44]
app.get('/api/match/want', verifyToken, async (req, res) => {
    const query = `
        SELECT DISTINCT m.Nome, m.eMail, c.Stamp 
        FROM dControle c 
        JOIN dManos m ON c.ID = m.ID 
        WHERE c.Tipo = 'R' AND c.ID != ?
        AND c.Stamp NOT IN (SELECT Stamp FROM dControle WHERE ID = ? AND Tipo = 'A')
    `;
    const result = await db.execute({ sql: query, args: [req.user.id, req.user.id] });
    res.json(result.rows);
});

app.listen(process.env.PORT || 3000, () => console.log("Servidor rodando!"));