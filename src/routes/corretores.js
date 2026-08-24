const express = require('express');
const bcrypt = require('bcryptjs');
const pool = require('../db/pool');
const { autenticar, somenteAdmin } = require('../middleware/auth');

const router = express.Router();

// Cadastrar corretor - só o login central (admin) pode criar novos logins.
router.post('/', autenticar, somenteAdmin, async (req, res) => {
    const { nome, email, senha } = req.body;
    if (!nome || !email || !senha) {
        return res.status(400).json({ erro: 'Nome, email e senha são obrigatórios' });
    }
    if (senha.length < 6) {
        return res.status(400).json({ erro: 'A senha precisa ter pelo menos 6 caracteres' });
    }

    try {
        const senha_hash = await bcrypt.hash(senha, 10);
        const { rows } = await pool.query(
            `INSERT INTO corretores (nome, email, senha_hash, is_admin)
             VALUES ($1,$2,$3, false) RETURNING id, nome, email, is_admin`,
            [nome, email, senha_hash]
        );
        res.status(201).json(rows[0]);
    } catch (err) {
        if (err.code === '23505') { // unique_violation (email duplicado)
            return res.status(409).json({ erro: 'Já existe um corretor com esse email' });
        }
        console.error(err);
        res.status(500).json({ erro: 'Erro ao cadastrar corretor' });
    }
});

// Listar corretores - usado pelo admin pra montar o filtro "corretor" na
// tela de contratos. Não devolve senha_hash.
router.get('/', autenticar, somenteAdmin, async (req, res) => {
    try {
        const { rows } = await pool.query(
            `SELECT id, nome, email, is_admin FROM corretores ORDER BY nome`
        );
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ erro: 'Erro ao listar corretores' });
    }
});

module.exports = router;
