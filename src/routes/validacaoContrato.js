// Validações e helpers puros usados na criação/edição de contrato.
// Separados de routes/contratos.js de propósito: não dependem de
// express nem de pg, então dá pra testar (tests/) sem precisar de
// conexão com banco nenhuma.

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

module.exports = {
    CAMPOS_CONDICIONAIS_IMOVEL,
    validarDadosBancarios,
    validarCamposImovel,
    validarCamposFinanceiros,
    limparCamposIrrelevantes,
};
