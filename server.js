// server.js
require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const session = require("express-session");
const nodemailer = require("nodemailer");
const cors = require("cors");
const path = require("path");

// Conexão com Turso (SQLite remoto)
const { createClient } = require("@libsql/client");
const turso = createClient({
  url: process.env.TURSO_URL,
  authToken: process.env.TURSO_TOKEN
});

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(session({
  secret: "figurinhas2026",
  resave: false,
  saveUninitialized: true
}));

// Servir arquivos estáticos (HTML, CSS, JS)
app.use(express.static(path.join(__dirname, "public")));

// Rota raiz para teste
app.get("/", (req, res) => {
  res.send("Servidor do Troca de Figurinhas está rodando!");
});

// Configuração de envio de e-mail
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// ---------------- ROTAS ----------------

// Cadastro
app.post("/cadastro", async (req, res) => {
  const { nome, email, senha } = req.body;
  try {
    await turso.execute({
      sql: "INSERT INTO dManos (nome, eMail, senha) VALUES (?, ?, ?)",
      args: [nome, email, senha]
    });
    res.json({ success: true, message: "Cadastro realizado com sucesso!" });
  } catch (err) {
    if (err.message.includes("UNIQUE constraint failed")) {
      res.json({ success: false, error: "Este e-mail já está cadastrado." });
    } else {
      res.json({ success: false, error: "Erro ao cadastrar usuário." });
    }
  }
});


// Login
app.post("/login", async (req, res) => {
    const { nome, senha } = req.body;
    try {
        const result = await turso.execute({
            sql: "SELECT * FROM dManos WHERE Nome = ? AND Senha = ?",
            args: [nome, senha]
        });

if (result.rows.length > 0) {
  const usuario = result.rows[0];
  req.session.user = usuario; // <<-- ESSENCIAL
  res.json({ success: true, message: "Login realizado com sucesso!", nome: usuario.Nome, id: usuario.ID });
} else {
  res.json({ success: false, error: "Nome ou senha inválidos." });
}

    } catch (err) {
        res.json({ success: false, error: "Erro ao realizar login." });
    }
});


// Chat
app.post("/chat", async (req, res) => {
  if (!req.session.user) return res.status(403).json({ error: "Não logado" });
  const { mensagem } = req.body;
  const data = new Date();
  try {
    await turso.execute(  "INSERT INTO dChat (ID, Mensagem, Data, Hora, Timestamp) VALUES (?, ?, ?, ?, ?)",
  [req.session.user.ID, mensagem, data.toLocaleDateString(), data.toLocaleTimeString(), Date.now()]
);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Álbum (A/R)
// Retorna stamps do usuário por tipo (A ou R)
// ---------------- CONTROLE ----------------
// Retorna stamps do usuário por tipo (A ou R)
app.get("/controle", async (req, res) => {
  if (!req.session.user) return res.status(403).json({ success:false, error: "Não logado" });
  const tipo = (req.query.tipo || "A").toUpperCase();
  try {
    const result = await turso.execute({
      sql: "SELECT Stamp FROM dControle WHERE ID = ? AND Tipo = ?",
      args: [parseInt(req.session.user.ID), tipo]
    });
    const stamps = result.rows.map(r => r.Stamp);
    res.json({ success: true, stamps });
  } catch (err) {
    res.status(500).json({ success:false, error: err.message });
  }
});

// Atualiza dControle: insere novos e remove desmarcados
app.post("/controle", async (req, res) => {
  if (!req.session.user) return res.status(403).json({ success:false, error: "Não logado" });
  const { tipo, stamps } = req.body;
  const userId = parseInt(req.session.user.ID);
  const t = (tipo || "A").toUpperCase();

  try {
    // Buscar existentes
    const existingRes = await turso.execute({
      sql: "SELECT Stamp FROM dControle WHERE ID = ? AND Tipo = ?",
      args: [userId, t]
    });
    const existing = new Set(existingRes.rows.map(r => r.Stamp));

    // Calcular diferenças
    const incoming = new Set(Array.isArray(stamps) ? stamps : []);
    const toInsert = [...incoming].filter(s => !existing.has(s));
    const toDelete = [...existing].filter(s => !incoming.has(s));

    // Inserir novos
    for (let s of toInsert) {
      await turso.execute({
        sql: "INSERT OR IGNORE INTO dControle (ID, Stamp, Tipo) VALUES (?, ?, ?)",
        args: [userId, s, t]
      });
    }

    // Deletar removidos
    if (toDelete.length > 0) {
      const placeholders = toDelete.map(() => "?").join(",");
      const sql = `DELETE FROM dControle WHERE ID = ? AND Tipo = ? AND Stamp IN (${placeholders})`;
      await turso.execute({
        sql,
        args: [userId, t, ...toDelete]
      });
    }

    res.json({ success: true, message: "Controle atualizado", inserted: toInsert.length, deleted: toDelete.length });
  } catch (err) {
    res.status(500).json({ success:false, error: err.message });
  }
});


// Trocas (Eu Quero / Eu Troco)
app.post("/troca", async (req, res) => {
  if (!req.session.user) return res.status(403).json({ error: "Não logado" });
  const { tipo, figurinha, destinatarioEmail } = req.body;
  try {
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: destinatarioEmail,
      subject: "Solicitação de Troca de Figurinha",
      text: `O usuário ${req.session.user.Nome} deseja trocar a figurinha ${figurinha} (${tipo}).`
    });
    res.json({ success: true, message: "Solicitação enviada!" });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Logout
app.get("/logout", (req, res) => {
  req.session.destroy();
  res.json({ success: true, message: "Logout realizado" });
});

// ---------------- INICIALIZAÇÃO ----------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
