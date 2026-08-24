const express = require('express');
const pool = require('../db/pool');
const { autenticar, somenteAdmin } = require('../middleware/auth');

const router = express.Router();

// Campos do imóvel que são condicionais: cada um tem um par tem_X (boolean,
// obrigatório) + valor. Se tem_X = true, o valor é obrigatório; se false, o
// valor é ignorado (o imóvel simplesmente não tem essa característica).
// Ex: nem todo imóvel tem "quadra" (loteamentos não numerados) ou "pavimento"
// (casas térreas) — em vez de deixar em branco sem explicação, o corretor
// declara explicitamente que aquilo não se aplica.
const CAMPOS_CONDICIONAIS_IMOVEL = [
    { flag: 'tem_lote', valor: 'lote', label: 'lote' },
    { flag: 'tem_quadra', valor: 'quadra', label: 'quadra' },
    { flag: 'tem_loteamento', valor: 'loteamento', label: 'loteamento' },
    { flag: 'tem_matricula', valor: 'matricula', label: 'matrícula' },
    { flag: 'tem_unidade', valor: 'unidade', label: 'unidade' },
    { flag: 'tem_pavimento', valor: 'pavimento', label: 'pavimento' },
    { flag: 'tem_metragem', valor: 'metragem', label: 'metragem' },
    { flag: 'tem_prazo_obra', valor: 'prazo_obra', label: 'prazo de obra' }
];

// Valida os pares tem_X/valor do imóvel e devolve lista de erros (vazia se
// tudo ok). É preciso escolher sim/não pra cada campo (não pode ficar sem
// resposta) - se sim, o valor é obrigatório; se não, o valor enviado é
// descartado (fica null), pra não guardar lixo no banco.
function validarCamposImovel(campos) {
    const erros = [];
    for (const { flag, valor, label } of CAMPOS_CONDICIONAIS_IMOVEL) {
        if (campos[flag] === undefined || campos[flag] === null) {
            erros.push(`Informe se o imóvel tem ${label} (sim/não)`);
            continue;
        }
        if (campos[flag] === true && (campos[valor] === undefined || campos[valor] === null || campos[valor] === '')) {
            erros.push(`Campo "${label}" é obrigatório quando marcado como "sim"`);
        }
    }
    return erros;
}

// Zera o valor de qualquer campo cuja flag tenha sido marcada como "não" -
// evita guardar um valor preenchido que depois vira irrelevante se o
// corretor mudar de ideia e desmarcar o campo.
function limparCamposIrrelevantes(campos) {
    const limpo = { ...campos };
    for (const { flag, valor } of CAMPOS_CONDICIONAIS_IMOVEL) {
        if (limpo[flag] !== true) limpo[valor] = null;
    }
    return limpo;
}

// Criar rascunho de contrato
router.post('/', autenticar, async (req, res) => {
    const corretorId = req.corretor.id;

    const erros = validarCamposImovel(req.body);
    if (erros.length > 0) {
        return res.status(400).json({ erro: 'Campos do imóvel inválidos', detalhes: erros });
    }
    const campos = limparCamposIrrelevantes(req.body); // imovel_descricao, lote, valor_total, tem_financiamento, etc.

    try {
        const { rows } = await pool.query(
            `INSERT INTO contratos (corretor_id, imovel_descricao,
                tem_lote, lote, tem_quadra, quadra, tem_loteamento, loteamento, tem_matricula, matricula,
                tem_unidade, unidade, tem_pavimento, pavimento, tem_metragem, metragem, tem_prazo_obra, prazo_obra,
                valor_total, valor_sinal, tem_financiamento,
                valor_financiado, valor_avaliacao, custo_transferencia, comissao_imobiliaria)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25)
             RETURNING *`,
            [corretorId, campos.imovel_descricao,
             campos.tem_lote, campos.lote, campos.tem_quadra, campos.quadra,
             campos.tem_loteamento, campos.loteamento, campos.tem_matricula, campos.matricula,
             campos.tem_unidade, campos.unidade, campos.tem_pavimento, campos.pavimento,
             campos.tem_metragem, campos.metragem, campos.tem_prazo_obra, campos.prazo_obra,
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
