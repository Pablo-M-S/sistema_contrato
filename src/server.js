require('dotenv').config();
const express = require('express');

const authRoutes = require('./routes/auth');
const contratosRoutes = require('./routes/contratos');
const publicoRoutes = require('./routes/publico');

const app = express();
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/contratos', contratosRoutes);
app.use('/api/publico/contratos', publicoRoutes); // sem autenticação - link do cliente

app.get('/api/health', (req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`sistema_contrato rodando na porta ${PORT}`);
});
