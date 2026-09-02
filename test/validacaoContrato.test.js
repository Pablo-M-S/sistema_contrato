const test = require('node:test');
const assert = require('node:assert/strict');
const {
    validarDadosBancarios,
    validarCamposImovel,
    validarCamposFinanceiros,
    limparCamposIrrelevantes,
    CAMPOS_CONDICIONAIS_IMOVEL,
} = require('../src/compartilhado/validacaoContrato');

test('validarDadosBancarios aceita só PIX', () => {
    assert.deepEqual(validarDadosBancarios({ chave_pix: '123.456.789-00' }), []);
});

test('validarDadosBancarios aceita banco+agência+conta+tipo completos', () => {
    assert.deepEqual(validarDadosBancarios({
        banco: 'Banco do Brasil', agencia: '1234', conta: '56789-0', tipo_conta: 'corrente',
    }), []);
});

test('validarDadosBancarios rejeita quando não tem nem PIX nem conta completa', () => {
    const erros = validarDadosBancarios({ banco: 'Banco do Brasil' }); // faltam agencia/conta/tipo
    assert.equal(erros.length, 1);
});

test('validarDadosBancarios rejeita vazio', () => {
    const erros = validarDadosBancarios({});
    assert.equal(erros.length, 1);
});

test('validarCamposImovel exige resposta sim/não em todo campo condicional', () => {
    const erros = validarCamposImovel({});
    assert.equal(erros.length, CAMPOS_CONDICIONAIS_IMOVEL.length);
});

test('validarCamposImovel exige o valor quando marcado como "sim"', () => {
    const campos = { tem_lote: true }; // lote não informado
    const erros = validarCamposImovel(campos);
    assert.ok(erros.some((e) => e.includes('lote')));
});

test('validarCamposImovel passa quando tudo "não" (sem valores)', () => {
    const campos = {};
    for (const { flag } of CAMPOS_CONDICIONAIS_IMOVEL) campos[flag] = false;
    assert.deepEqual(validarCamposImovel(campos), []);
});

test('validarCamposFinanceiros exige valor_total', () => {
    const erros = validarCamposFinanceiros({ tem_sinal: false });
    assert.ok(erros.some((e) => e.includes('Valor total')));
});

test('validarCamposFinanceiros exige valor_sinal quando tem_sinal=true', () => {
    const erros = validarCamposFinanceiros({ valor_total: 100000, tem_sinal: true });
    assert.ok(erros.some((e) => e.includes('sinal')));
});

test('validarCamposFinanceiros exige os campos de financiamento quando marcado', () => {
    const erros = validarCamposFinanceiros({ valor_total: 100000, tem_sinal: false, tem_financiamento: true });
    // valor_financiado, valor_avaliacao, custo_transferencia, taxa_banco,
    // custas_cartorio + a pergunta sim/não do desconto de ITBI
    assert.equal(erros.length, 6);
});

test('validarCamposFinanceiros exige valor_entrada quando tem desconto de ITBI de primeiro imóvel', () => {
    const erros = validarCamposFinanceiros({
        valor_total: 100000, tem_sinal: false, tem_financiamento: true,
        valor_financiado: 80000, valor_avaliacao: 100000, custo_transferencia: 5000,
        taxa_banco: 5000, custas_cartorio: 1000,
        tem_desconto_primeiro_imovel: true, // valor_entrada não informado
    });
    assert.ok(erros.some((e) => e.includes('entrada')));
});

test('validarCamposFinanceiros passa completo com financiamento sem desconto de ITBI', () => {
    const erros = validarCamposFinanceiros({
        valor_total: 100000, tem_sinal: false, tem_financiamento: true,
        valor_financiado: 80000, valor_avaliacao: 100000, custo_transferencia: 5000,
        taxa_banco: 5000, custas_cartorio: 1000,
        tem_desconto_primeiro_imovel: false,
    });
    assert.deepEqual(erros, []);
});

test('limparCamposIrrelevantes zera valor de campo marcado como "não"', () => {
    const limpo = limparCamposIrrelevantes({ tem_lote: false, lote: 'lixo que não deveria ficar' });
    assert.equal(limpo.lote, null);
});

test('limparCamposIrrelevantes mantém valor de campo marcado como "sim"', () => {
    const limpo = limparCamposIrrelevantes({ tem_lote: true, lote: '12' });
    assert.equal(limpo.lote, '12');
});

test('limparCamposIrrelevantes zera detalhamento de financiamento quando tem_financiamento=false', () => {
    const limpo = limparCamposIrrelevantes({
        tem_financiamento: false, taxa_banco: 5000, custas_cartorio: 1000,
        segundo_imovel_financiado: true, tem_desconto_primeiro_imovel: true, valor_entrada: 20000,
    });
    assert.equal(limpo.taxa_banco, null);
    assert.equal(limpo.custas_cartorio, null);
    assert.equal(limpo.segundo_imovel_financiado, null);
    assert.equal(limpo.tem_desconto_primeiro_imovel, null);
    assert.equal(limpo.valor_entrada, null);
});

test('limparCamposIrrelevantes zera valor_entrada quando não tem desconto de ITBI, mesmo com financiamento', () => {
    const limpo = limparCamposIrrelevantes({
        tem_financiamento: true, tem_desconto_primeiro_imovel: false, valor_entrada: 20000,
    });
    assert.equal(limpo.valor_entrada, null);
});
