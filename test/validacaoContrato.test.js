const test = require('node:test');
const assert = require('node:assert/strict');
const {
    validarDadosBancarios,
    validarCamposImovel,
    validarCamposFinanceiros,
    limparCamposIrrelevantes,
    CAMPOS_CONDICIONAIS_IMOVEL,
} = require('../src/routes/validacaoContrato');

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

test('validarCamposFinanceiros exige os 3 campos de financiamento quando marcado', () => {
    const erros = validarCamposFinanceiros({ valor_total: 100000, tem_sinal: false, tem_financiamento: true });
    assert.equal(erros.length, 3);
});

test('limparCamposIrrelevantes zera valor de campo marcado como "não"', () => {
    const limpo = limparCamposIrrelevantes({ tem_lote: false, lote: 'lixo que não deveria ficar' });
    assert.equal(limpo.lote, null);
});

test('limparCamposIrrelevantes mantém valor de campo marcado como "sim"', () => {
    const limpo = limparCamposIrrelevantes({ tem_lote: true, lote: '12' });
    assert.equal(limpo.lote, '12');
});
