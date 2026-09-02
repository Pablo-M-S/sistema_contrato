const test = require('node:test');
const assert = require('node:assert/strict');
const { reaisPorExtenso, reaisComExtenso } = require('../src/services/contratoTexto');

test('valores simples', () => {
    assert.equal(reaisPorExtenso(0), 'zero reais');
    assert.equal(reaisPorExtenso(1), 'um real');
    assert.equal(reaisPorExtenso(15), 'quinze reais');
    assert.equal(reaisPorExtenso(21), 'vinte e um reais');
    assert.equal(reaisPorExtenso(100), 'cem reais');
    assert.equal(reaisPorExtenso(101), 'cento e um reais');
});

test('centavos', () => {
    assert.equal(reaisPorExtenso(1.5), 'um real e cinquenta centavos');
    assert.equal(reaisPorExtenso(0.01), 'um centavo');
    assert.equal(reaisPorExtenso(1250.5), 'mil duzentos e cinquenta reais e cinquenta centavos');
});

test('milhar', () => {
    assert.equal(reaisPorExtenso(250000), 'duzentos e cinquenta mil reais');
    assert.equal(reaisPorExtenso(1000), 'mil reais');
});

test('milhão - "de reais" só quando é redondo', () => {
    // Milhão exato: precisa do "de" ("um milhão DE reais")
    assert.equal(reaisPorExtenso(1000000), 'um milhão de reais');
    assert.equal(reaisPorExtenso(2000000), 'dois milhões de reais');
    // Milhão com resto: sem "de" ("um milhão e duzentos mil reais")
    assert.equal(reaisPorExtenso(1200000), 'um milhão e duzentos mil reais');
    assert.equal(reaisPorExtenso(3750000.99), 'três milhões setecentos e cinquenta mil reais e noventa e nove centavos');
});

test('valor nulo/indefinido não quebra', () => {
    assert.equal(reaisPorExtenso(null), '');
    assert.equal(reaisPorExtenso(undefined), '');
});

test('reaisComExtenso junta valor em R$ e por extenso', () => {
    const { reais } = require('../src/services/contratoTexto');
    assert.equal(reaisComExtenso(250000), `${reais(250000)} (duzentos e cinquenta mil reais)`);
    assert.equal(reaisComExtenso(null), '____');
});
