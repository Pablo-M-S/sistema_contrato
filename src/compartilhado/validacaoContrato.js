// Validações e helpers de contrato/imóvel/vendedor - fonte única usada
// tanto pelo backend (src/routes/contratos.js, via require) quanto pelo
// painel do corretor (src/painel/js/app.js, via <script src="...">, sem
// bundler). Antes cada lado tinha sua própria cópia dessa lógica e elas
// foram divergindo (um exemplo real: o backend não validava alguns campos
// financeiros que o painel já coletava). Editar só este arquivo passa a
// bastar pros dois lados ficarem de acordo.
//
// O bloco no final detecta o ambiente automaticamente: no Node
// (require) usa module.exports; no navegador (script tag) usa
// window.ValidacaoContrato.

(function (root, factory) {
    const modulo = factory();
    if (typeof module === 'object' && module.exports) {
        module.exports = modulo; // Node: require('./validacaoContrato')
    } else {
        root.ValidacaoContrato = modulo; // Navegador: window.ValidacaoContrato
    }
})(typeof window !== 'undefined' ? window : globalThis, function () {

    // Campos do imóvel que são condicionais: cada um tem um par tem_X
    // (boolean, obrigatório) + valor. Se tem_X = true, o valor é
    // obrigatório; se false, o valor é ignorado (o imóvel simplesmente não
    // tem essa característica). Ex: nem todo imóvel tem "quadra"
    // (loteamentos não numerados) ou "pavimento" (casas térreas) — em vez
    // de deixar em branco sem explicação, o corretor declara explicitamente
    // que aquilo não se aplica.
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
        { flag: 'tem_cartorio_numero', valor: 'cartorio_numero', label: 'número do cartório de registro de imóveis' },
    ];

    // Valida os dados bancários do vendedor (quem recebe o sinal/pagamento -
    // Cláusula Terceira). Aceita qualquer uma das duas formas: chave PIX, OU
    // banco+agência+conta+tipo de conta completos.
    function validarDadosBancarios({ banco, agencia, conta, tipo_conta, chave_pix }) {
        if (chave_pix && chave_pix.trim()) return [];
        if (banco && agencia && conta && tipo_conta) return [];
        return ['Informe a chave PIX ou os dados completos da conta (banco, agência, conta e tipo) para recebimento do pagamento'];
    }

    // Valida os pares tem_X/valor do imóvel e devolve lista de erros (vazia
    // se tudo ok). É preciso escolher sim/não pra cada campo (não pode
    // ficar sem resposta) - se sim, o valor é obrigatório; se não, o valor
    // enviado é descartado (fica null), pra não guardar lixo no banco.
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

    // Condições financeiras: valor_total é sempre obrigatório. Sinal segue
    // o mesmo padrão tem_X/valor do imóvel (nem todo negócio tem sinal
    // separado). Se tem_financiamento = true, os 3 campos que dependem do
    // financiamento passam a ser obrigatórios (eles só aparecem no
    // contrato final nesse caso).
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
                { chave: 'taxa_banco', label: 'Taxa do banco' },
                { chave: 'custas_cartorio', label: 'Custas de cartório' },
            ];
            for (const { chave, label } of CAMPOS_FINANCIAMENTO) {
                if (campos[chave] === undefined || campos[chave] === null || campos[chave] === '') {
                    erros.push(`${label} é obrigatório quando o negócio envolve financiamento`);
                }
            }

            // Desconto de ITBI de primeiro imóvel: mesmo padrão tem_X/valor
            // dos campos do imóvel, só que condicionado a ter financiamento.
            if (campos.tem_desconto_primeiro_imovel === undefined || campos.tem_desconto_primeiro_imovel === null) {
                erros.push('Informe se o comprador tem desconto de ITBI de primeiro imóvel (sim/não)');
            } else if (campos.tem_desconto_primeiro_imovel === true
                && (campos.valor_entrada === undefined || campos.valor_entrada === null || campos.valor_entrada === '')) {
                erros.push('Valor da entrada é obrigatório quando marcado como "sim" o desconto de ITBI de primeiro imóvel');
            }
        }

        return erros;
    }

    // Zera o valor de qualquer campo cuja flag tenha sido marcada como
    // "não" - evita guardar um valor preenchido que depois vira irrelevante
    // se o corretor mudar de ideia e desmarcar o campo. Mesma lógica
    // aplicada ao sinal (tem_sinal) e aos campos que só existem com
    // financiamento.
    function limparCamposIrrelevantes(campos) {
        const limpo = Object.assign({}, campos);
        for (const { flag, valor } of CAMPOS_CONDICIONAIS_IMOVEL) {
            if (limpo[flag] !== true) limpo[valor] = null;
        }
        if (limpo.tem_sinal !== true) limpo.valor_sinal = null;
        if (limpo.tem_financiamento !== true) {
            limpo.valor_financiado = null;
            limpo.valor_avaliacao = null;
            limpo.custo_transferencia = null;
            limpo.taxa_banco = null;
            limpo.custas_cartorio = null;
            limpo.segundo_imovel_financiado = null;
            limpo.tem_desconto_primeiro_imovel = null;
            limpo.valor_entrada = null;
        } else if (limpo.tem_desconto_primeiro_imovel !== true) {
            limpo.valor_entrada = null;
        }
        return limpo;
    }

    return {
        CAMPOS_CONDICIONAIS_IMOVEL,
        validarDadosBancarios,
        validarCamposImovel,
        validarCamposFinanceiros,
        limparCamposIrrelevantes,
    };
});
