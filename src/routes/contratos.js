const express = require('express');
const pool = require('../db/pool');
const { autenticar, somenteAdmin } = require('../middleware/auth');
const { gerarPdfContrato } = require('../services/pdfContrato');

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
    { flag: 'tem_prazo_obra', valor: 'prazo_obra', label: 'prazo de obra' },
    { flag: 'tem_empreendimento', valor: 'empreendimento', label: 'nome do empreendimento' },
    { flag: 'tem_cartorio_numero', valor: 'cartorio_numero', label: 'número do cartório de registro de imóveis' }
];

// Valida os dados bancários do vendedor (quem recebe o sinal/pagamento -
// Cláusula Terceira). Aceita qualquer uma das duas formas: chave PIX, OU
// banco+agência+conta+tipo de conta completos.
function validarDadosBancarios({ banco, agencia, conta, tipo_conta, chave_pix }) {
    if (chave_pix && chave_pix.trim()) return [];
    if (banco && agencia && conta && tipo_conta) return [];
    return ['Informe a chave PIX ou os dados completos da conta (banco, agência, conta e tipo) para recebimento do pagamento'];
}

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

// Condições financeiras: valor_total é sempre obrigatório. Sinal segue o
// mesmo padrão tem_X/valor do imóvel (nem todo negócio tem sinal separado).
// Se tem_financiamento = true, os 3 campos que dependem do financiamento
// passam a ser obrigatórios (eles só aparecem no contrato final nesse
// caso - ver montarDescricaoImovel/gerarPdfContrato).
function validarCamposFinanceiros(campos) {
    const erros = [];
    if (campos.valor_total === undefined || campos.valor_total === null || campos.valor_total === '') {
        erros.push('Valor total do imóvel é obrigatório');
    }

    if (campos.tem_sinal === undefined || campos.tem_sinal === null) {
        erros.push('Informe se o negócio tem sinal (sim/não)');
    } else if (campos.tem_sinal === true && (campos.valor_sinal === undefined || campos.valor_sinal === null || campos.valor_sinal === '')) {
        erros.push('Valor do sinal é obrigatório quando marcado como "sim"');
    }

    if (campos.tem_financiamento === true) {
        const CAMPOS_FINANCIAMENTO = [
            { chave: 'valor_financiado', label: 'Valor financiado' },
            { chave: 'valor_avaliacao', label: 'Valor de avaliação' },
            { chave: 'custo_transferencia', label: 'Custo de transferência' },
        ];
        for (const { chave, label } of CAMPOS_FINANCIAMENTO) {
            if (campos[chave] === undefined || campos[chave] === null || campos[chave] === '') {
                erros.push(`${label} é obrigatório quando o negócio envolve financiamento`);
            }
        }
    }

    return erros;
}

// Zera o valor de qualquer campo cuja flag tenha sido marcada como "não" -
// evita guardar um valor preenchido que depois vira irrelevante se o
// corretor mudar de ideia e desmarcar o campo. Mesma lógica aplicada ao
// sinal (tem_sinal) e aos campos que só existem com financiamento.
function limparCamposIrrelevantes(campos) {
    const limpo = { ...campos };
    for (const { flag, valor } of CAMPOS_CONDICIONAIS_IMOVEL) {
        if (limpo[flag] !== true) limpo[valor] = null;
    }
    if (limpo.tem_sinal !== true) limpo.valor_sinal = null;
    if (limpo.tem_financiamento !== true) {
        limpo.valor_financiado = null;
        limpo.valor_avaliacao = null;
        limpo.custo_transferencia = null;
    }
    return limpo;
}

// Criar rascunho de contrato
router.post('/', autenticar, async (req, res) => {
    const corretorId = req.corretor.id;

    const erros = [...validarCamposImovel(req.body), ...validarCamposFinanceiros(req.body)];
    if (!req.body.imovel_paragrafo || !req.body.imovel_paragrafo.trim()) {
        erros.push('O parágrafo da Cláusula Primeira (objeto do contrato) é obrigatório');
    }
    if (erros.length > 0) {
        return res.status(400).json({ erro: 'Campos obrigatórios faltando', detalhes: erros });
    }
    const campos = limparCamposIrrelevantes(req.body); // imovel_descricao, lote, valor_total, tem_financiamento, etc.

    try {
        const { rows } = await pool.query(
            `INSERT INTO contratos (corretor_id, imovel_descricao,
                tem_lote, lote, tem_quadra, quadra, tem_loteamento, loteamento, tem_matricula, matricula,
                tem_unidade, unidade, tem_pavimento, pavimento, tem_metragem, metragem, tem_prazo_obra, prazo_obra,
                tem_empreendimento, empreendimento, tem_cartorio_numero, cartorio_numero, imovel_paragrafo,
                valor_total, tem_sinal, valor_sinal, tem_financiamento,
                valor_financiado, valor_avaliacao, custo_transferencia, comissao_imobiliaria)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30)
             RETURNING *`,
            [corretorId, campos.imovel_descricao,
             campos.tem_lote, campos.lote, campos.tem_quadra, campos.quadra,
             campos.tem_loteamento, campos.loteamento, campos.tem_matricula, campos.matricula,
             campos.tem_unidade, campos.unidade, campos.tem_pavimento, campos.pavimento,
             campos.tem_metragem, campos.metragem, campos.tem_prazo_obra, campos.prazo_obra,
             campos.tem_empreendimento, campos.empreendimento, campos.tem_cartorio_numero, campos.cartorio_numero,
             campos.imovel_paragrafo,
             campos.valor_total, campos.tem_sinal, campos.valor_sinal, campos.tem_financiamento || false,
             campos.valor_financiado, campos.valor_avaliacao, campos.custo_transferencia,
             campos.comissao_imobiliaria]
        );

        // SKU gerado a partir do próprio id (só existe depois do INSERT) -
        // formato CTR-<ano>-<id com 4 dígitos>, ex: CTR-2026-0007.
        const ano = new Date().getFullYear();
        const sku = `CTR-${ano}-${String(rows[0].id).padStart(4, '0')}`;
        const { rows: comSku } = await pool.query(
            `UPDATE contratos SET sku = $1 WHERE id = $2 RETURNING *`, [sku, rows[0].id]
        );

        res.status(201).json(comSku[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ erro: 'Erro ao criar contrato' });
    }
});

// Confere se o contrato existe e pertence ao corretor logado (admin vê
// qualquer um). Usado por qualquer rota que adiciona dados a um contrato já
// criado (vendedor, testemunha) - sem isso, um corretor podia manipular
// dados de um contrato de outro colega só adivinhando o ID.
async function contratoPertenceAoCorretor(id, corretor) {
    const { rows } = await pool.query(`SELECT id FROM contratos WHERE id = $1`, [id]);
    if (!rows[0]) return false;
    if (corretor.is_admin) return true;
    const { rows: dono } = await pool.query(
        `SELECT id FROM contratos WHERE id = $1 AND corretor_id = $2`, [id, corretor.id]
    );
    return !!dono[0];
}

// Adicionar vendedor a um contrato (pode ter mais de um)
router.post('/:id/vendedores', autenticar, async (req, res) => {
    const { id } = req.params;
    const {
        nome, nacionalidade, profissao, rg, cpf, telefone, endereco, autoriza_imagem, estado_civil,
        banco, agencia, conta, tipo_conta, chave_pix,
    } = req.body;

    // RG, CPF, telefone, endereço e estado civil são dados da pessoa (não
    // variam de contrato pra contrato como os campos do imóvel) - por isso
    // sempre obrigatórios, no mesmo padrão já exigido do comprador no
    // formulário público. autoriza_imagem precisa ser uma escolha explícita
    // (true ou false) - checar !autoriza_imagem trataria "não autoriza"
    // (false) como se estivesse faltando, por isso o teste é undefined/null.
    const faltando = [];
    if (!nome) faltando.push('nome');
    if (!cpf) faltando.push('CPF');
    if (!rg) faltando.push('RG');
    if (!telefone) faltando.push('telefone');
    if (!endereco) faltando.push('endereço');
    if (!estado_civil) faltando.push('estado civil');
    if (autoriza_imagem === undefined || autoriza_imagem === null) faltando.push('autorização de uso de imagem (sim/não)');
    faltando.push(...validarDadosBancarios(req.body));
    if (faltando.length > 0) {
        return res.status(400).json({ erro: `Campos obrigatórios do vendedor faltando: ${faltando.join(', ')}` });
    }
    if (!(await contratoPertenceAoCorretor(id, req.corretor))) {
        return res.status(404).json({ erro: 'Contrato não encontrado' });
    }

    try {
        const { rows } = await pool.query(
            `INSERT INTO vendedores (contrato_id, nome, nacionalidade, profissao, rg, cpf, telefone, endereco,
                autoriza_imagem, estado_civil, banco, agencia, conta, tipo_conta, chave_pix)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
            [id, nome, nacionalidade, profissao, rg, cpf, telefone, endereco, autoriza_imagem, estado_civil,
             banco || null, agencia || null, conta || null, tipo_conta || null, chave_pix || null]
        );
        res.status(201).json(rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ erro: 'Erro ao adicionar vendedor' });
    }
});

// Adicionar testemunha a um contrato (precisa de exatamente 2 até finalizar,
// mas cabe ao corretor decidir quando - geralmente só se sabe quem vai
// testemunhar na hora da assinatura, por isso essa rota fica aberta em
// qualquer etapa antes da finalização, e não junto da criação do contrato).
router.post('/:id/testemunhas', autenticar, async (req, res) => {
    const { id } = req.params;
    const { nome, cpf } = req.body;

    if (!nome || !cpf) {
        return res.status(400).json({ erro: 'Nome e CPF da testemunha são obrigatórios' });
    }
    if (!(await contratoPertenceAoCorretor(id, req.corretor))) {
        return res.status(404).json({ erro: 'Contrato não encontrado' });
    }

    try {
        const { rows: existentes } = await pool.query(
            `SELECT id FROM testemunhas WHERE contrato_id = $1`, [id]
        );
        if (existentes.length >= 2) {
            return res.status(400).json({ erro: 'Esse contrato já tem as 2 testemunhas necessárias' });
        }

        const { rows } = await pool.query(
            `INSERT INTO testemunhas (contrato_id, nome, cpf) VALUES ($1,$2,$3) RETURNING *`,
            [id, nome, cpf]
        );
        res.status(201).json(rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ erro: 'Erro ao adicionar testemunha' });
    }
});

// Remover testemunha (corrigir nome errado, trocar quem vai assinar, etc.)
router.delete('/:id/testemunhas/:testemunhaId', autenticar, async (req, res) => {
    const { id, testemunhaId } = req.params;
    if (!(await contratoPertenceAoCorretor(id, req.corretor))) {
        return res.status(404).json({ erro: 'Contrato não encontrado' });
    }
    try {
        await pool.query(`DELETE FROM testemunhas WHERE id = $1 AND contrato_id = $2`, [testemunhaId, id]);
        res.status(204).send();
    } catch (err) {
        console.error(err);
        res.status(500).json({ erro: 'Erro ao remover testemunha' });
    }
});

// Formas de pagamento extras (FGTS, subsídio Caixa, pagamento na assinatura
// do banco, balão, parcelas, valor à vista, veículo ou imóvel em permuta) -
// pedido da imobiliária pra registrar valores que não são nem o sinal nem o
// financiamento em si, mas ainda compõem o preço total do negócio.
const TIPOS_FORMA_PAGAMENTO_MONETARIOS = ['fgts', 'subsidio_caixa', 'assinatura_banco', 'balao', 'parcelas', 'valor_vista'];
const TIPOS_FORMA_PAGAMENTO = [...TIPOS_FORMA_PAGAMENTO_MONETARIOS, 'veiculo', 'imovel'];

router.post('/:id/formas-pagamento', autenticar, async (req, res) => {
    const { id } = req.params;
    const {
        tipo, valor, descricao,
        veiculo_modelo, veiculo_placa, veiculo_chassi, veiculo_renavam, veiculo_cor, veiculo_combustivel, veiculo_ano,
        imovel_descricao, imovel_lote, imovel_quadra, imovel_loteamento, imovel_matricula, imovel_unidade, imovel_pavimento, imovel_metragem,
    } = req.body;

    if (!TIPOS_FORMA_PAGAMENTO.includes(tipo)) {
        return res.status(400).json({ erro: `Tipo de forma de pagamento inválido. Use um de: ${TIPOS_FORMA_PAGAMENTO.join(', ')}` });
    }
    // Tipos em dinheiro exigem valor; veículo e imóvel são permuta e exigem
    // a descrição do bem em vez de um valor em R$.
    if (TIPOS_FORMA_PAGAMENTO_MONETARIOS.includes(tipo) && (valor === undefined || valor === null || valor === '')) {
        return res.status(400).json({ erro: 'Informe o valor (R$) dessa forma de pagamento' });
    }
    if (tipo === 'veiculo' && !veiculo_modelo) {
        return res.status(400).json({ erro: 'Informe pelo menos o modelo do veículo dado em permuta' });
    }
    if (tipo === 'imovel' && !imovel_descricao) {
        return res.status(400).json({ erro: 'Informe a descrição do imóvel dado em permuta' });
    }
    if (!(await contratoPertenceAoCorretor(id, req.corretor))) {
        return res.status(404).json({ erro: 'Contrato não encontrado' });
    }

    try {
        const { rows } = await pool.query(
            `INSERT INTO formas_pagamento (
                contrato_id, tipo, valor, descricao,
                veiculo_modelo, veiculo_placa, veiculo_chassi, veiculo_renavam, veiculo_cor, veiculo_combustivel, veiculo_ano,
                imovel_descricao, imovel_lote, imovel_quadra, imovel_loteamento, imovel_matricula, imovel_unidade, imovel_pavimento, imovel_metragem
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19) RETURNING *`,
            [id, tipo, valor ?? null, descricao ?? null,
             veiculo_modelo ?? null, veiculo_placa ?? null, veiculo_chassi ?? null, veiculo_renavam ?? null, veiculo_cor ?? null, veiculo_combustivel ?? null, veiculo_ano ?? null,
             imovel_descricao ?? null, imovel_lote ?? null, imovel_quadra ?? null, imovel_loteamento ?? null, imovel_matricula ?? null, imovel_unidade ?? null, imovel_pavimento ?? null, imovel_metragem ?? null]
        );
        res.status(201).json(rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ erro: 'Erro ao adicionar forma de pagamento' });
    }
});

router.delete('/:id/formas-pagamento/:formaId', autenticar, async (req, res) => {
    const { id, formaId } = req.params;
    if (!(await contratoPertenceAoCorretor(id, req.corretor))) {
        return res.status(404).json({ erro: 'Contrato não encontrado' });
    }
    try {
        await pool.query(`DELETE FROM formas_pagamento WHERE id = $1 AND contrato_id = $2`, [formaId, id]);
        res.status(204).send();
    } catch (err) {
        console.error(err);
        res.status(500).json({ erro: 'Erro ao remover forma de pagamento' });
    }
});

// Gerar link público para o comprador preencher (muda status)
router.post('/:id/gerar-link', autenticar, async (req, res) => {
    const { id } = req.params;
    if (!(await contratoPertenceAoCorretor(id, req.corretor))) {
        return res.status(404).json({ erro: 'Contrato não encontrado' });
    }
    try {
        // Mesma regra da etapa 3 do wizard, reforçada aqui pra não depender
        // só da validação do frontend (alguém podia chamar essa rota direto).
        const { rows: vendedores } = await pool.query(`SELECT id FROM vendedores WHERE contrato_id = $1`, [id]);
        if (vendedores.length === 0) {
            return res.status(400).json({ erro: 'Cadastre pelo menos um vendedor antes de gerar o link' });
        }
        const { rows: testemunhas } = await pool.query(`SELECT id FROM testemunhas WHERE contrato_id = $1`, [id]);
        if (testemunhas.length < 2) {
            return res.status(400).json({ erro: 'Cadastre as 2 testemunhas antes de gerar o link' });
        }

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

// Remover vendedor (corrigir dado errado sem precisar recriar o contrato
// inteiro). Não permite ficar com zero vendedores, pra não voltar pro
// estado inválido que o wizard já impede na criação.
router.delete('/:id/vendedores/:vendedorId', autenticar, async (req, res) => {
    const { id, vendedorId } = req.params;
    if (!(await contratoPertenceAoCorretor(id, req.corretor))) {
        return res.status(404).json({ erro: 'Contrato não encontrado' });
    }
    try {
        const { rows: existentes } = await pool.query(`SELECT id FROM vendedores WHERE contrato_id = $1`, [id]);
        if (existentes.length <= 1) {
            return res.status(400).json({ erro: 'O contrato precisa de pelo menos um vendedor' });
        }
        await pool.query(`DELETE FROM vendedores WHERE id = $1 AND contrato_id = $2`, [vendedorId, id]);
        res.status(204).send();
    } catch (err) {
        console.error(err);
        res.status(500).json({ erro: 'Erro ao remover vendedor' });
    }
});

// Detalhe completo de um contrato (imóvel, financeiro, vendedores,
// comprador, testemunhas) - usado na tela de revisão do corretor e no
// detalhe do contrato no dashboard. Sem isso não dá pra conferir os dados
// completos antes de gerar o link ou depois, só o PDF final já pronto.
router.get('/:id', autenticar, async (req, res) => {
    const { id } = req.params;
    if (!(await contratoPertenceAoCorretor(id, req.corretor))) {
        return res.status(404).json({ erro: 'Contrato não encontrado' });
    }
    try {
        const { rows: contratoRows } = await pool.query(`SELECT * FROM contratos WHERE id = $1`, [id]);
        const { rows: vendedores } = await pool.query(`SELECT * FROM vendedores WHERE contrato_id = $1`, [id]);
        const { rows: compradores } = await pool.query(`SELECT * FROM compradores WHERE contrato_id = $1`, [id]);
        const { rows: testemunhas } = await pool.query(`SELECT * FROM testemunhas WHERE contrato_id = $1`, [id]);
        const { rows: formasPagamento } = await pool.query(`SELECT * FROM formas_pagamento WHERE contrato_id = $1`, [id]);
        res.json({
            contrato: contratoRows[0],
            vendedores,
            comprador: compradores[0] || null,
            testemunhas,
            formasPagamento
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ erro: 'Erro ao buscar contrato' });
    }
});

// Baixar o PDF do contrato (corretor dono ou admin)
router.get('/:id/pdf', autenticar, async (req, res) => {
    const { id } = req.params;
    if (!(await contratoPertenceAoCorretor(id, req.corretor))) {
        return res.status(404).json({ erro: 'Contrato não encontrado' });
    }
    try {
        const { rows: contratoRows } = await pool.query(`SELECT * FROM contratos WHERE id = $1`, [id]);
        const contrato = contratoRows[0];
        const { rows: vendedores } = await pool.query(`SELECT * FROM vendedores WHERE contrato_id = $1`, [id]);
        const { rows: compradores } = await pool.query(`SELECT * FROM compradores WHERE contrato_id = $1`, [id]);
        const { rows: testemunhas } = await pool.query(`SELECT * FROM testemunhas WHERE contrato_id = $1`, [id]);
        const { rows: formasPagamento } = await pool.query(`SELECT * FROM formas_pagamento WHERE contrato_id = $1`, [id]);

        if (vendedores.length === 0 || compradores.length === 0) {
            return res.status(400).json({ erro: 'Contrato ainda não tem vendedor e/ou comprador preenchidos' });
        }

        const pdfBuffer = await gerarPdfContrato({
            contrato, vendedores, comprador: compradores[0], testemunhas, formasPagamento
        });

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="${contrato.nome_arquivo_pdf || contrato.sku || 'contrato'}.pdf"`);
        res.send(pdfBuffer);
    } catch (err) {
        console.error(err);
        res.status(500).json({ erro: 'Erro ao gerar PDF do contrato' });
    }
});

// Editar um vendedor já cadastrado (corrigir digitação sem precisar recriar
// o contrato do zero). Mesma validação obrigatória da criação.
router.put('/:id/vendedores/:vendedorId', autenticar, async (req, res) => {
    const { id, vendedorId } = req.params;
    const {
        nome, nacionalidade, profissao, rg, cpf, telefone, endereco, autoriza_imagem, estado_civil,
        banco, agencia, conta, tipo_conta, chave_pix,
    } = req.body;

    const faltando = [];
    if (!nome) faltando.push('nome');
    if (!cpf) faltando.push('CPF');
    if (!rg) faltando.push('RG');
    if (!telefone) faltando.push('telefone');
    if (!endereco) faltando.push('endereço');
    if (!estado_civil) faltando.push('estado civil');
    if (autoriza_imagem === undefined || autoriza_imagem === null) faltando.push('autorização de uso de imagem (sim/não)');
    faltando.push(...validarDadosBancarios(req.body));
    if (faltando.length > 0) {
        return res.status(400).json({ erro: `Campos obrigatórios do vendedor faltando: ${faltando.join(', ')}` });
    }
    if (!(await contratoPertenceAoCorretor(id, req.corretor))) {
        return res.status(404).json({ erro: 'Contrato não encontrado' });
    }

    try {
        const { rows } = await pool.query(
            `UPDATE vendedores SET nome = $1, nacionalidade = $2, profissao = $3, rg = $4, cpf = $5,
                telefone = $6, endereco = $7, autoriza_imagem = $8, estado_civil = $9,
                banco = $10, agencia = $11, conta = $12, tipo_conta = $13, chave_pix = $14
             WHERE id = $15 AND contrato_id = $16 RETURNING *`,
            [nome, nacionalidade, profissao, rg, cpf, telefone, endereco, autoriza_imagem, estado_civil,
             banco || null, agencia || null, conta || null, tipo_conta || null, chave_pix || null, vendedorId, id]
        );
        if (!rows[0]) {
            return res.status(404).json({ erro: 'Vendedor não encontrado' });
        }
        res.json(rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ erro: 'Erro ao atualizar vendedor' });
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
