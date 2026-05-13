// server.js
const express = require("express");
const bodyParser = require("body-parser");
const session = require("express-session");
const nodemailer = require("nodemailer");
const cors = require("cors");

// Conexão com Turso (SQLite remoto)
const { createClient } = require("@tursodatabase/node");
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
  const { nome, senha, email } = req.body;
  try {
    await turso.execute("INSERT INTO dManos (Nome, Senha, eMail) VALUES (?, ?, ?)", [nome, senha, email]);

    // Envia e-mail de boas-vindas
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject: "Bem-vindo ao Troca de Figurinhas",
      text: `Olá ${nome}, seu cadastro foi realizado com sucesso!`
    });

    res.json({ success: true, message: "Cadastro realizado com sucesso!" });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Login
app.post("/login", async (req, res) => {
  const { nome, senha } = req.body;
  try {
    const result = await turso.execute("SELECT * FROM dManos WHERE Nome = ? AND Senha = ?", [nome, senha]);
    if (result.rows.length > 0) {
      req.session.user = result.rows[0];
      res.json({ success: true, user: result.rows[0] });
    } else {
      res.json({ success: false, message: "Usuário ou senha inválidos" });
    }
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
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
app.post("/album", async (req, res) => {
  if (!req.session.user) return res.status(403).json({ error: "Não logado" });
  const { figurinhas } = req.body; // array de objetos {codigo, tipo: "A" ou "R"}
  try {
    for (let f of figurinhas) {
      await turso.execute(
        "INSERT OR REPLACE INTO dControle (ID, Stamp, Tipo) VALUES (?, ?, ?)",
        [req.session.user.ID, f.stamp, f.tipo]
      );
    }
    res.json({ success: true, message: "Álbum atualizado!" });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
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
