// Este teste existe por causa de um bug real: a query de criação de
// contrato (routes/contratos.js) já quebrou duas vezes em produção por
// causa de contagem errada entre as colunas do INSERT, os placeholders
// ($1, $2...) e os valores passados no array. Em vez de só confiar em
// revisão visual (que já falhou), esse teste lê o arquivo de verdade e
// confere as três contagens toda vez que os testes rodam - se alguém
// adicionar uma coluna nova e esquecer de atualizar um dos três lugares,
// o teste quebra antes de virar erro em produção.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const CAMINHO_CONTRATOS = path.join(__dirname, '..', 'src', 'routes', 'contratos.js');

function extrairInsertContratos(src) {
    const m = src.match(/INSERT INTO contratos \(([\s\S]*?)\)\s*VALUES \(([\s\S]*?)\)\s*RETURNING \*`,\s*(\[[\s\S]*?\])\s*\);/);
    if (!m) throw new Error('Não achei o INSERT INTO contratos no arquivo - o teste precisa ser ajustado se a query mudou de formato.');
    const colunas = m[1].split(',').map((s) => s.trim()).filter(Boolean);
    const placeholders = m[2].split(',').map((s) => s.trim()).filter(Boolean);
    // O array de valores é JS de verdade (não SQL) - contar vírgulas de
    // nível 0 é arriscado com objetos/chamadas de função dentro, então
    // conta os elementos separando só pelas vírgulas que não estão dentro
    // de parênteses (cobre casos como `campos.tem_financiamento || false`).
    let profundidade = 0;
    let valores = [];
    let atual = '';
    const conteudoArray = m[3].slice(1, -1); // remove [ e ]
    for (const ch of conteudoArray) {
        if (ch === '(' || ch === '[') profundidade++;
        if (ch === ')' || ch === ']') profundidade--;
        if (ch === ',' && profundidade === 0) {
            valores.push(atual.trim());
            atual = '';
        } else {
            atual += ch;
        }
    }
    if (atual.trim()) valores.push(atual.trim());
    return { colunas, placeholders, valores };
}

test('INSERT INTO contratos: colunas, placeholders e valores batem', () => {
    const src = fs.readFileSync(CAMINHO_CONTRATOS, 'utf8');
    const { colunas, placeholders, valores } = extrairInsertContratos(src);

    assert.equal(colunas.length, placeholders.length,
        `${colunas.length} colunas mas ${placeholders.length} placeholders ($1, $2...) no INSERT INTO contratos`);
    assert.equal(colunas.length, valores.length,
        `${colunas.length} colunas mas ${valores.length} valores no array passado pro INSERT INTO contratos`);
});
