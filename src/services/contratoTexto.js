// Funções puras de geração de texto do contrato (valores por extenso,
// cláusula do objeto, formas de pagamento, ordinais). Separadas de
// pdfContrato.js de propósito: não dependem do pdfkit, então dá pra
// testar (tests/) sem precisar montar PDF nenhum.

// Rótulos e texto de cada forma de pagamento extra (além de sinal e
// financiamento, que já têm cláusula própria). FGTS/subsídio/balão/parcelas/
// valor à vista são em dinheiro; veículo e imóvel são permuta (bem dado como
// parte do pagamento), por isso têm descrição própria em vez de um valor.
const LABEL_FORMA_PAGAMENTO = {
    fgts: 'FGTS',
    subsidio_caixa: 'Subsídio Caixa',
    assinatura_banco: 'Pagamento na assinatura do banco',
    balao: 'Balão',
    parcelas: 'Parcelas',
    valor_vista: 'Valor à vista',
    veiculo: 'Veículo (permuta)',
    imovel: 'Imóvel (permuta)',
};

function textoFormaPagamento(f) {
    const label = LABEL_FORMA_PAGAMENTO[f.tipo] || f.tipo;
    if (f.tipo === 'veiculo') {
        const partes = [
            f.veiculo_modelo && `modelo ${f.veiculo_modelo}`,
            f.veiculo_ano && `ano ${f.veiculo_ano}`,
            f.veiculo_cor && `cor ${f.veiculo_cor}`,
            f.veiculo_combustivel && `combustível ${f.veiculo_combustivel}`,
            f.veiculo_placa && `placa ${f.veiculo_placa}`,
            f.veiculo_chassi && `chassi ${f.veiculo_chassi}`,
            f.veiculo_renavam && `RENAVAM ${f.veiculo_renavam}`,
        ].filter(Boolean).join(', ');
        return `${label}: ${partes}${f.descricao ? ` (${f.descricao})` : ''}.`;
    }
    if (f.tipo === 'imovel') {
        const partes = [
            f.imovel_lote && `lote ${f.imovel_lote}`,
            f.imovel_quadra && `quadra ${f.imovel_quadra}`,
            f.imovel_loteamento && `loteamento ${f.imovel_loteamento}`,
            f.imovel_matricula && `matrícula M-${f.imovel_matricula}`,
            f.imovel_unidade && `unidade ${f.imovel_unidade}`,
            f.imovel_pavimento && `pavimento ${f.imovel_pavimento}`,
            f.imovel_metragem && `${f.imovel_metragem} m²`,
        ].filter(Boolean).join(', ');
        return `${label}: ${f.imovel_descricao}${partes ? ` (${partes})` : ''}.`;
    }
    return `${label}: ${reaisComExtenso(f.valor)}${f.descricao ? ` — ${f.descricao}` : ''}.`;
}

function reais(valor) {
    if (valor === null || valor === undefined) return '____';
    return Number(valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

// --- Números por extenso (reais e centavos) ---------------------------
const UNIDADES = ['', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove'];
const DEZ_A_DEZENOVE = ['dez', 'onze', 'doze', 'treze', 'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove'];
const DEZENAS = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
const CENTENAS = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos'];

// Converte um grupo de 0-999 para extenso.
function extensoGrupo(n) {
    if (n === 0) return '';
    if (n === 100) return 'cem';
    const c = Math.floor(n / 100);
    const resto = n % 100;
    const partes = [];
    if (c > 0) partes.push(CENTENAS[c]);
    if (resto > 0) {
        if (resto < 10) partes.push(UNIDADES[resto]);
        else if (resto < 20) partes.push(DEZ_A_DEZENOVE[resto - 10]);
        else {
            const d = Math.floor(resto / 10);
            const u = resto % 10;
            partes.push(u > 0 ? `${DEZENAS[d]} e ${UNIDADES[u]}` : DEZENAS[d]);
        }
    }
    return partes.join(' e ');
}

// Converte um inteiro (0 a 999.999.999) para extenso em português. Regra
// do "e" entre os grupos (milhão/mil/unidades): só entra antes do último
// grupo da lista, e só quando esse grupo vale menos de 100 ou é uma centena
// redonda (100, 200, 300...) - é a mesma regra usada em extenso de cheque
// ("mil e cinquenta", "um milhão e duzentos mil", mas "mil novecentos e
// noventa e oito" sem "e" antes de "novecentos").
function extensoInteiro(n) {
    if (n === 0) return 'zero';
    const milhoes = Math.floor(n / 1000000);
    const milhares = Math.floor((n % 1000000) / 1000);
    const unidades = n % 1000;

    const grupos = [];
    if (milhoes > 0) grupos.push({ valor: milhoes, texto: milhoes === 1 ? 'um milhão' : `${extensoGrupo(milhoes)} milhões` });
    if (milhares > 0) grupos.push({ valor: milhares, texto: milhares === 1 ? 'mil' : `${extensoGrupo(milhares)} mil` });
    if (unidades > 0) grupos.push({ valor: unidades, texto: extensoGrupo(unidades) });

    let resultado = grupos[0].texto;
    for (let i = 1; i < grupos.length; i++) {
        const grupo = grupos[i];
        const ehUltimo = i === grupos.length - 1;
        const usarE = ehUltimo && (grupo.valor < 100 || grupo.valor % 100 === 0);
        resultado += `${usarE ? ' e ' : ' '}${grupo.texto}`;
    }
    return resultado;
}

// Escreve um valor monetário em reais por extenso, ex: "R$ 1.250,50" ->
// "um mil, duzentos e cinquenta reais e cinquenta centavos". Usado em todo
// valor em dinheiro do contrato, conforme pedido da imobiliária.
function reaisPorExtenso(valor) {
    if (valor === null || valor === undefined) return '';
    const n = Number(valor);
    if (isNaN(n)) return '';
    const inteiro = Math.floor(n);
    const centavos = Math.round((n - inteiro) * 100);
    const partes = [];
    // "de reais" só entra quando o valor é um milhão "redondo" (ex: "dois
    // milhões de reais") - se sobra alguma coisa depois do milhão (ex: "um
    // milhão e duzentos mil reais"), o "de" não é usado.
    if (inteiro > 0) {
        const ehMilhaoRedondo = inteiro >= 1000000 && inteiro % 1000000 === 0;
        partes.push(`${extensoInteiro(inteiro)}${ehMilhaoRedondo ? ' de' : ''} ${inteiro === 1 ? 'real' : 'reais'}`);
    }
    if (centavos > 0) partes.push(`${extensoInteiro(centavos)} ${centavos === 1 ? 'centavo' : 'centavos'}`);
    if (partes.length === 0) return 'zero reais';
    return partes.join(' e ');
}

// Valor em R$ seguido do extenso entre parênteses, no formato usado na
// minuta oficial: "R$ 250.000,00 (duzentos e cinquenta mil reais)".
function reaisComExtenso(valor) {
    if (valor === null || valor === undefined) return '____';
    return `${reais(valor)} (${reaisPorExtenso(valor)})`;
}

// Ordinais por extenso pros parágrafos numerados dentro de cada cláusula
// (convenção jurídica: "Parágrafo Primeiro:", "Parágrafo Segundo:" em vez
// de "1.", "2."). Usado só até o 10º item de uma cláusula, mais que isso é
// incomum neste contrato.
const ORDINAIS = ['Primeiro', 'Segundo', 'Terceiro', 'Quarto', 'Quinto', 'Sexto', 'Sétimo', 'Oitavo', 'Nono', 'Décimo'];
function paragrafo(n) {
    return `Parágrafo ${ORDINAIS[n - 1] || `${n}º`}:`;
}

function dataExtenso(data) {
    return new Date(data).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'America/Sao_Paulo' });
}

function simNao(valor) {
    return valor ? '(X) autoriza ( ) não autoriza' : '( ) autoriza (X) não autoriza';
}

// Monta a frase da Cláusula Primeira incluindo só as características que o
// imóvel de fato tem (tem_X = true) - imóveis variam muito (nem todo tem
// quadra numerada, nem todo tem pavimento definido, etc.), então a frase é
// construída dinamicamente em vez de ter campos fixos que ficariam em
// branco.
function montarDescricaoImovel(c) {
    let partes = [];
    if (c.tem_empreendimento) partes.push(`sendo edificado no(a) ${c.empreendimento}`);
    if (c.tem_lote) partes.push(`sobre o terreno número lote ${c.lote}`);
    if (c.tem_quadra) partes.push(`da quadra número ${c.quadra}`);
    if (c.tem_loteamento) partes.push(`do loteamento ${c.loteamento}`);
    if (c.tem_matricula) partes.push(`(matrícula do terreno M-${c.matricula})`);
    let unidadeTxt = '';
    if (c.tem_unidade) unidadeTxt += `, sendo a unidade n° ${c.unidade}`;
    if (c.tem_pavimento) unidadeTxt += ` do pavimento ${c.pavimento}`;
    if (c.tem_empreendimento) unidadeTxt += ` do(a) ${c.empreendimento}`;
    let texto = `O presente instrumento tem por objeto a venda e compra de um imóvel ${partes.join(', ')}${unidadeTxt}.`;
    if (c.tem_metragem) texto += ` A unidade possui ${c.metragem} m² de área construída.`;
    const cartorio = c.tem_cartorio_numero && c.cartorio_numero ? `${c.cartorio_numero}º ` : '';
    texto += ` Nesta cidade e Comarca de Cascavel–PR, a qual vai possuir matrícula de unidade individual no ${cartorio}Serviço de Registro de Imóveis desta Comarca.`;
    return texto;
}

// Texto final da Cláusula Primeira: usa o parágrafo que o corretor escreveu
// (imovel_paragrafo), que é o que garante o contrato saindo igual à minuta
// oficial em qualquer caso especial. Só cai pro texto automático em
// contratos antigos que ainda não tinham esse campo.
function textoObjetoContrato(c) {
    return (c.imovel_paragrafo && c.imovel_paragrafo.trim()) ? c.imovel_paragrafo.trim() : montarDescricaoImovel(c);
}

module.exports = {
    textoFormaPagamento,
    reais,
    reaisPorExtenso,
    reaisComExtenso,
    paragrafo,
    dataExtenso,
    simNao,
    montarDescricaoImovel,
    textoObjetoContrato,
};
