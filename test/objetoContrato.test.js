const test = require('node:test');
const assert = require('node:assert/strict');
const { montarDescricaoImovel, textoObjetoContrato } = require('../src/services/contratoTexto');

test('monta descrição só com os campos marcados como "tem"', () => {
    const texto = montarDescricaoImovel({
        tem_lote: true, lote: '12',
        tem_quadra: true, quadra: '5',
        tem_loteamento: false, loteamento: null,
        tem_matricula: false,
        tem_unidade: false,
        tem_pavimento: false,
        tem_empreendimento: false,
        tem_metragem: false,
        tem_cartorio_numero: false,
    });
    assert.match(texto, /lote 12/);
    assert.match(texto, /quadra número 5/);
    assert.doesNotMatch(texto, /loteamento/);
    assert.doesNotMatch(texto, /pavimento/);
});

test('inclui empreendimento e cartório quando marcados', () => {
    const texto = montarDescricaoImovel({
        tem_empreendimento: true, empreendimento: 'Edifício Aurora',
        tem_unidade: true, unidade: '302',
        tem_pavimento: true, pavimento: '3',
        tem_cartorio_numero: true, cartorio_numero: '2',
        tem_lote: false, tem_quadra: false, tem_loteamento: false,
        tem_matricula: false, tem_metragem: false,
    });
    assert.match(texto, /Edifício Aurora/);
    assert.match(texto, /unidade n° 302/);
    assert.match(texto, /pavimento 3/);
    assert.match(texto, /2º Serviço de Registro/);
});

test('textoObjetoContrato prioriza o parágrafo escrito pelo corretor', () => {
    const contrato = { imovel_paragrafo: 'Texto customizado da Cláusula Primeira.' };
    assert.equal(textoObjetoContrato(contrato), 'Texto customizado da Cláusula Primeira.');
});

test('textoObjetoContrato cai no automático se não tiver parágrafo (contrato antigo)', () => {
    const contrato = { imovel_paragrafo: null, tem_lote: true, lote: '9' };
    assert.match(textoObjetoContrato(contrato), /lote 9/);
});

test('textoObjetoContrato ignora parágrafo em branco', () => {
    const contrato = { imovel_paragrafo: '   ', tem_lote: true, lote: '9' };
    assert.match(textoObjetoContrato(contrato), /lote 9/);
});
