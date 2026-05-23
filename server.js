// server.js
require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const session = require("express-session");
const SQLiteStore = require("connect-sqlite3")(session);
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
app.use(cors({
  origin: true,
  credentials: true
}));

app.use(bodyParser.json());

app.use(session({
  store: new SQLiteStore({
    db: "sessoes.db", // O arquivo será criado direto na raiz do projeto
    dir: "."          // O ponto significa: "esta mesma pasta onde o servidor está rodando"
  }),
  secret: "figurinhas2026",
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false, // Mantenha false para testes. Em produção com HTTPS mude para: process.env.NODE_ENV === "production"
    sameSite: 'lax',
    maxAge: 1000 * 60 * 60 * 24 * 7
  }
}));

// Servir arquivos estáticos (HTML, CSS, JS)
app.use(express.static(path.join(__dirname, "public")));

// Rota raiz para teste
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
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
      sql: "SELECT * FROM dManos WHERE nome = ? AND senha = ?",
      args: [nome, senha]
    });

    if (result.rows.length > 0) {
      const usuario = result.rows[0];
      req.session.user = {
        ID: usuario.ID ?? usuario.id,
        Nome: usuario.nome ?? usuario.Nome ?? nome
      };
      res.json({ success: true, message: "Login realizado com sucesso!", nome: req.session.user.Nome, id: req.session.user.ID });
    } else {
      res.json({ success: false, error: "Nome ou senha inválidos." });
    }
  } catch (err) {
    console.error("Erro /login:", err);
    res.json({ success: false, error: "Erro ao realizar login." });
  }
});

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

    // Lista completa de figurinhas
  const teams = [
    "MEX","RSA","KOR","CZE","CAN","BIH","QAT","SUI","BRA","MAR","HAI","SCO","USA","PAR","AUS","TUR",
    "GER","CUW","CIV","ECU","NED","JPN","SWE","TUN","BEL","EGY","IRN","NZL","ESP","CPV","KSA","URU",
    "FRA","SEN","IRQ","NOR","ARG","ALG","AUT","JOR","POR","COD","UZB","COL","ENG","CRO","GHA","PAN"
  ];
    const allStamps = [];

	// Seleções
    for (let team of teams) {
      for (let i=1;i<=20;i++) allStamps.push(`${team}${i}`);
    }
    
	// FWC 0-19
	for (let i=0;i<=19;i++) allStamps.push(`FWC${i}`);
    
	// Coca-Cola CC1-CC14
	for (let i=1;i<=14;i++) allStamps.push(`CC${i}`);

    const total = allStamps.length; // 994 figurinhas
    const marcadas = stamps.length;
    const faltam = total - marcadas;

    res.json({ success: true, stamps, total, marcadas, faltam });
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
app.get("/troco", async (req, res) => {
  if (!req.session.user) return res.status(403).json({ success: false, error: "Não logado" });
  const filtroUser = req.query.user || null;
  const userId = parseInt(req.session.user.ID);

  try {
    // 1. Coleta todas as suas figurinhas repetidas (Tipo R)
    const repRes = await turso.execute({
      sql: "SELECT Stamp FROM dControle WHERE ID = ? AND Tipo = 'R'",
      args: [userId]
    });
    const minhasRepetidas = new Set(repRes.rows.map(r => r.Stamp));

    // Se você não tiver nenhuma repetida, não há o que cruzar. Retorna vazio rápido.
    if (minhasRepetidas.size === 0) {
      return res.json({ success: true, users: [], result: [] });
    }

    // 2. Busca quais usuários NÃO possuem as figurinhas que você tem para repetir (Álbum Tipo A)
    // Usamos o CROSS JOIN com dManos para testar suas repetidas contra todos os usuários
    let sql = `
      SELECT dManos.Nome, s.Stamp
      FROM (
        SELECT Stamp FROM dControle WHERE ID = ? AND Tipo = 'R'
      ) s
      CROSS JOIN dManos
      WHERE dManos.ID <> ?
        AND NOT EXISTS (
          SELECT 1 FROM dControle
          WHERE dControle.ID = dManos.ID
            AND dControle.Tipo = 'A'
            AND dControle.Stamp = s.Stamp
        )
    `;
    
    let args = [userId, userId];
    if (filtroUser) { 
      sql += " AND dManos.Nome = ?"; 
      args.push(filtroUser); 
    }
    
    const faltRes = await turso.execute({ sql, args });

    // 3. Agrupamento do cruzamento por usuário e por sigla (incluindo FWC e CC)
    const result = [];
    const users = new Set();

    faltRes.rows.forEach(r => {
      if (minhasRepetidas.has(r.Stamp)) {
        // Extrai a sigla da equipe: "MEX15" vira "MEX", "FWC12" vira "FWC", "CC3" vira "CC"
        const team = r.Stamp.replace(/[0-9]+$/, "");
        
        let row = result.find(x => x.user === r.Nome && x.team === team);
        if (!row) { 
          row = { user: r.Nome, team, stamps: [] }; 
          result.push(row); 
        }
        row.stamps.push(r.Stamp);
        users.add(r.Nome);
      }
    });

    res.json({ success: true, users: [...users], result });
  } catch (err) {
    console.error("Erro /troco:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get("/quero", async (req, res) => {
  if (!req.session.user) return res.status(403).json({ success: false, error: "Não logado" });
  const filtroUser = req.query.user || null;
  const userId = parseInt(req.session.user.ID);

  try {
    // LÓGICA INTELIGENTE: Busca as repetidas (Tipo 'R') dos OUTROS usuários,
    // mas APENAS se você NÃO tiver essa figurinha no seu álbum (Tipo 'A')
    let sql = `
      SELECT dManos.Nome, r.Stamp
      FROM dControle r
      JOIN dManos ON r.ID = dManos.ID
      WHERE r.Tipo = 'R' 
        AND r.ID <> ?
        AND NOT EXISTS (
          SELECT 1 FROM dControle a
          WHERE a.ID = ? 
            AND a.Tipo = 'A'
            AND a.Stamp = r.Stamp
        )
    `;
    
    let args = [userId, userId];
    if (filtroUser) { 
      sql += " AND dManos.Nome = ?"; 
      args.push(filtroUser); 
    }
    
    const repRes = await turso.execute({ sql, args });

    // Agrupamento do resultado por usuário e sigla (MEX, FWC, CC...)
    const result = [];
    const users = new Set();

    repRes.rows.forEach(r => {
      // Extrai a sigla da equipe (Ex: "MEX12" -> "MEX", "FWC5" -> "FWC")
      const team = r.Stamp.replace(/[0-9]+$/, "");
      
      let row = result.find(x => x.user === r.Nome && x.team === team);
      if (!row) { 
        row = { user: r.Nome, team, stamps: [] }; 
        result.push(row); 
      }
      row.stamps.push(r.Stamp);
      users.add(r.Nome);
    });

    res.json({ success: true, users: [...users], result });
  } catch (err) {
    console.error("Erro /quero inteligente:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET mensagens (últimas 24h)
app.get("/chat", async (req,res)=>{
  if (!req.session.user) return res.status(403).json({success:false,error:"Não logado"});
  const cutoff = Math.floor(Date.now()/1000) - 24*3600;
  try {
    const result = await turso.execute({
      sql:"SELECT Nome, Mensagem, Timestamp FROM dChat WHERE Timestamp>=? ORDER BY Timestamp ASC",
      args:[cutoff]
    });
    const messages = result.rows.map(r=>({
      user:r.Nome,
      text:r.Mensagem,
      timestamp:r.Timestamp
    }));
    res.json({success:true,currentUser:req.session.user.Nome,messages});
  } catch(err) {
    res.status(500).json({success:false,error:err.message});
  }
});

// POST nova mensagem
app.post("/chat", async (req, res) => {
  console.log("POST /chat recebido - session present:", !!req.session.user, "body:", req.body);

  if (!req.session.user) {
    console.warn("POST /chat bloqueado: sem sessão");
    return res.status(403).json({ success:false, error: "Não logado" });
  }

  const { text } = req.body;
  console.log("POST /chat - user:", req.session.user.Nome, "text type:", typeof text);

  if (!text || !text.trim()) return res.json({ success:false, error: "Mensagem vazia" });

  const now = new Date();
  const timestamp = Math.floor(Date.now() / 1000);

  try {
    await turso.execute({
      sql: "INSERT INTO dChat (Nome, Mensagem, Data, Hora, Timestamp) VALUES (?, ?, ?, ?, ?)",
      args: [
        String(req.session.user.Nome),
        String(text.trim()),
        String(now.toISOString().split("T")[0]),
        String(now.toTimeString().split(" ")[0]),
        Number(timestamp)
      ]
    });
    console.log("POST /chat: inserido com sucesso");
    res.json({ success: true });
  } catch (err) {
    console.error("ERRO /chat INSERT:", err);
    res.status(500).json({ success:false, error: err.message });
  }
});


// Logout simples
app.get("/logout", (req, res) => {
  req.session.destroy(() => {
    res.json({ success: true });
  });
});

// ---------------- INICIALIZAÇÃO ----------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
