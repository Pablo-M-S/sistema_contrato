const express = require('express');
const pool = require('../db/pool');
const { autenticar, somenteAdmin } = require('../middleware/auth');

const router = express.Router();

// Criar rascunho de contrato
router.post('/', autenticar, async (req, res) => {
    const corretorId = req.corretor.id;
    const campos = req.body; // imovel_descricao, lote, valor_total, tem_financiamento, etc.

    try {
        const { rows } = await pool.query(
            `INSERT INTO contratos (corretor_id, imovel_descricao, lote, quadra, loteamento, matricula,
                unidade, pavimento, metragem, prazo_obra, valor_total, valor_sinal, tem_financiamento,
                valor_financiado, valor_avaliacao, custo_transferencia, comissao_imobiliaria)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
             RETURNING *`,
            [corretorId, campos.imovel_descricao, campos.lote, campos.quadra, campos.loteamento,
             campos.matricula, campos.unidade, campos.pavimento, campos.metragem, campos.prazo_obra,
             campos.valor_total, campos.valor_sinal, campos.tem_financiamento || false,
             campos.valor_financiado, campos.valor_avaliacao, campos.custo_transferencia,
             campos.comissao_imobiliaria]
        );
        res.status(201).json(rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ erro: 'Erro ao criar contrato' });
    }
});

// Adicionar vendedor a um contrato (pode ter mais de um)
router.post('/:id/vendedores', autenticar, async (req, res) => {
    const { id } = req.params;
    const { nome, nacionalidade, profissao, rg, cpf, telefone, endereco, autoriza_imagem } = req.body;

    if (!nome || !cpf) {
        return res.status(400).json({ erro: 'Nome e CPF do vendedor são obrigatórios' });
    }

    try {
        const { rows } = await pool.query(
            `INSERT INTO vendedores (contrato_id, nome, nacionalidade, profissao, rg, cpf, telefone, endereco, autoriza_imagem)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
            [id, nome, nacionalidade, profissao, rg, cpf, telefone, endereco, autoriza_imagem]
        );
        res.status(201).json(rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ erro: 'Erro ao adicionar vendedor' });
    }
});

// Gerar link público para o comprador preencher (muda status)
router.post('/:id/gerar-link', autenticar, async (req, res) => {
    const { id } = req.params;
    try {
        const { rows } = await pool.query(
            `UPDATE contratos SET status = 'aguardando_cliente'
             WHERE id = $1 AND corretor_id = $2 RETURNING token_link`,
            [id, req.corretor.id]
        );
        if (!rows[0]) {
            return res.status(404).json({ erro: 'Contrato não encontrado' });
        }
        const linkPublico = `${process.env.APP_URL || ''}/preencher/${rows[0].token_link}`;
        res.json({ link: linkPublico });
    } catch (err) {
        console.error(err);
        res.status(500).json({ erro: 'Erro ao gerar link' });
    }
});

// Listar contratos - corretor vê só os dele; admin vê todos e pode filtrar por corretor_id
router.get('/', autenticar, async (req, res) => {
    const { nome, data_inicio, data_fim, financiamento, status, corretor_id } = req.query;
    const condicoes = [];
    const valores = [];

    if (!req.corretor.is_admin) {
        valores.push(req.corretor.id);
        condicoes.push(`c.corretor_id = $${valores.length}`);
    } else if (corretor_id) {
        valores.push(corretor_id);
        condicoes.push(`c.corretor_id = $${valores.length}`);
    }

    if (nome) {
        valores.push(`%${nome}%`);
        condicoes.push(`(comp.nome ILIKE $${valores.length} OR v.nome ILIKE $${valores.length})`);
    }
    if (data_inicio) {
        valores.push(data_inicio);
        condicoes.push(`c.criado_em >= $${valores.length}`);
    }
    if (data_fim) {
        valores.push(data_fim);
        condicoes.push(`c.criado_em <= $${valores.length}`);
    }
    if (financiamento !== undefined) {
        valores.push(financiamento === 'true');
        condicoes.push(`c.tem_financiamento = $${valores.length}`);
    }
    if (status) {
        valores.push(status);
        condicoes.push(`c.status = $${valores.length}`);
    }

    const where = condicoes.length ? `WHERE ${condicoes.join(' AND ')}` : '';

    try {
        const { rows } = await pool.query(
            `SELECT DISTINCT c.* FROM contratos c
             LEFT JOIN compradores comp ON comp.contrato_id = c.id
             LEFT JOIN vendedores v ON v.contrato_id = c.id
             ${where}
             ORDER BY c.criado_em DESC`,
            valores
        );
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ erro: 'Erro ao listar contratos' });
    }
});

module.exports = router;
