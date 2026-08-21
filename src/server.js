require('dotenv').config();
const express = require('express');
const path = require('path');

const authRoutes = require('./routes/auth');
const contratosRoutes = require('./routes/contratos');
const publicoRoutes = require('./routes/publico');

const app = express();
app.use(express.json());

// Painel do corretor (login.html, index.html, css/, js/, img/) - servido
// pelo próprio backend, igual o admin do Santa Terra Vitta. Como o painel é
// carregado do mesmo domínio do backend, as chamadas de API não passam por
// CORS - não é necessário adicionar o middleware cors() só por causa disso.
app.use('/painel', express.static(path.join(__dirname, 'painel')));

// Formulário público do comprador (link enviado pelo corretor, sem login).
// express.static tenta servir um arquivo real primeiro (css/estilo.css,
// js/preencher.js, img/logo...); se não encontrar (é um token, não um
// arquivo), cai no app.get abaixo, que sempre devolve o index.html - o token
// em si é lido no navegador via JS, não no Express.
app.use('/preencher', express.static(path.join(__dirname, 'publico')));
app.get('/preencher/:token', (req, res) => {
    res.sendFile(path.join(__dirname, 'publico', 'index.html'));
});

app.use('/api/auth', authRoutes);
app.use('/api/contratos', contratosRoutes);
app.use('/api/publico/contratos', publicoRoutes); // sem autenticação - link do cliente

app.get('/api/health', (req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`sistema_contrato rodando na porta ${PORT}`);
});
