const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../db/pool');

const router = express.Router();

router.post('/login', async (req, res) => {
    const { email, senha } = req.body;
    if (!email || !senha) {
        return res.status(400).json({ erro: 'Email e senha são obrigatórios' });
    }

    try {
        const { rows } = await pool.query(
            'SELECT id, nome, email, senha_hash, is_admin FROM corretores WHERE email = $1',
            [email]
        );
        const corretor = rows[0];
        if (!corretor) {
            return res.status(401).json({ erro: 'Credenciais inválidas' });
        }

        const senhaOk = await bcrypt.compare(senha, corretor.senha_hash);
        if (!senhaOk) {
            return res.status(401).json({ erro: 'Credenciais inválidas' });
        }

        const token = jwt.sign(
            { id: corretor.id, email: corretor.email, is_admin: corretor.is_admin },
            process.env.JWT_SECRET,
            { expiresIn: '12h' }
        );

        res.json({
            token,
            corretor: { id: corretor.id, nome: corretor.nome, email: corretor.email, is_admin: corretor.is_admin },
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ erro: 'Erro ao autenticar' });
    }
});

module.exports = router;
