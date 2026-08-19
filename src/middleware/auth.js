const jwt = require('jsonwebtoken');

function autenticar(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ erro: 'Token não fornecido' });
    }

    jwt.verify(token, process.env.JWT_SECRET, (err, payload) => {
        if (err) {
            return res.status(403).json({ erro: 'Token inválido ou expirado' });
        }
        req.corretor = payload; // { id, email, is_admin }
        next();
    });
}

// Só deixa passar se for login central (admin)
function somenteAdmin(req, res, next) {
    if (!req.corretor?.is_admin) {
        return res.status(403).json({ erro: 'Acesso restrito ao login central' });
    }
    next();
}

module.exports = { autenticar, somenteAdmin };
