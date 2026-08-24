const express = require('express');
const pool = require('../db/pool');

const router = express.Router();

const CAMPOS_TEXTO_OBRIGATORIOS_COMPRADOR = ['nome', 'rg', 'cpf', 'telefone', 'endereco'];

// autoriza_imagem é boolean - precisa ser uma escolha explícita (true/false),
// então não pode usar o mesmo teste de "falsy" dos campos de texto (senão
// "não" (false) seria confundido com "não respondeu").
function validarComprador(dados) {
    const faltando = CAMPOS_TEXTO_OBRIGATORIOS_COMPRADOR.filter((campo) => !dados[campo]);
    if (dados.autoriza_imagem === undefined || dados.autoriza_imagem === null) {
        faltando.push('autoriza_imagem');
    }
    return faltando;
}

// Cliente abre o link - retorna só o necessário pra montar o formulário (nunca dados do vendedor/comissão)
router.get('/:token', async (req, res) => {
    const { token } = req.params;
    try {
        const { rows } = await pool.query(
            `SELECT id, status, imovel_descricao, loteamento, valor_total, valor_sinal, tem_financiamento
             FROM contratos WHERE token_link = $1`,
            [token]
        );
        const contrato = rows[0];
        if (!contrato) {
            return res.status(404).json({ erro: 'Link inválido' });
        }
        if (contrato.status === 'finalizado') {
            return res.status(410).json({ erro: 'Este contrato já foi finalizado' });
        }
        res.json(contrato);
    } catch (err) {
        console.error(err);
        res.status(500).json({ erro: 'Erro ao carregar contrato' });
    }
});

// Cliente envia os dados dele - valida obrigatoriedade e finaliza
router.post('/:token', async (req, res) => {
    const { token } = req.params;
    const dados = req.body;

    const faltando = validarComprador(dados);
    if (faltando.length > 0) {
        return res.status(400).json({ erro: 'Campos obrigatórios faltando', campos: faltando });
    }

    try {
        const { rows: contratoRows } = await pool.query(
            `SELECT id, status FROM contratos WHERE token_link = $1`,
            [token]
        );
        const contrato = contratoRows[0];
        if (!contrato) {
            return res.status(404).json({ erro: 'Link inválido' });
        }
        if (contrato.status === 'finalizado') {
            return res.status(410).json({ erro: 'Este contrato já foi finalizado' });
        }

        const { rows: testemunhas } = await pool.query(
            `SELECT id FROM testemunhas WHERE contrato_id = $1`, [contrato.id]
        );
        if (testemunhas.length < 2) {
            return res.status(400).json({ erro: 'O corretor ainda não cadastrou as 2 testemunhas deste contrato' });
        }

        await pool.query(
            `INSERT INTO compradores (contrato_id, nome, nacionalidade, profissao, rg, cpf, telefone, endereco, autoriza_imagem, preenchido_em)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9, NOW())`,
            [contrato.id, dados.nome, dados.nacionalidade, dados.profissao, dados.rg, dados.cpf,
             dados.telefone, dados.endereco, dados.autoriza_imagem]
        );

        // Nome do arquivo final = nome do cliente comprador (sanitizado)
        const nomeArquivo = dados.nome
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // remove acentos
            .replace(/[^a-zA-Z0-9\s-]/g, '')
            .trim().replace(/\s+/g, '_');

        await pool.query(
            `UPDATE contratos SET status = 'finalizado', finalizado_em = NOW(), nome_arquivo_pdf = $1 WHERE id = $2`,
            [nomeArquivo, contrato.id]
        );

        // TODO: disparar geração do PDF final aqui (a definir junto com o modelo)

        res.json({ mensagem: 'Contrato finalizado com sucesso' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ erro: 'Erro ao finalizar contrato' });
    }
});

module.exports = router;
