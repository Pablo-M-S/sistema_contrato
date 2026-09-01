const PDFDocument = require('pdfkit');
const path = require('path');

const LOGO_PATH = path.join(__dirname, '..', 'painel', 'img', 'logo-dourado-transparente.png');
const RODAPE_TEXTO = 'Imobiliária Deon e Silva Ltda. — CNPJ 49.699.403/0001-60 — CRECI J-8625';

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

// Converte um inteiro (0 a 999.999.999) para extenso em português.
function extensoInteiro(n) {
    if (n === 0) return 'zero';
    const milhoes = Math.floor(n / 1000000);
    const milhares = Math.floor((n % 1000000) / 1000);
    const unidades = n % 1000;
    const partes = [];
    if (milhoes > 0) partes.push(milhoes === 1 ? 'um milhão' : `${extensoGrupo(milhoes)} milhões`);
    if (milhares > 0) partes.push(milhares === 1 ? 'mil' : `${extensoGrupo(milhares)} mil`);
    if (unidades > 0) partes.push(extensoGrupo(unidades));
    return partes.join(unidades > 0 && unidades < 100 && (milhoes > 0 || milhares > 0) ? ' e ' : ' ').replace(/\s+/g, ' ').trim();
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

function gerarPdfContrato({ contrato, vendedores, comprador, testemunhas, formasPagamento = [] }) {
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({ margin: 60, size: 'A4' });
        const bufs = [];
        doc.on('data', (d) => bufs.push(d));
        doc.on('end', () => resolve(Buffer.concat(bufs)));
        doc.on('error', reject);

        // Número da página - incrementado manualmente a cada página nova
        // (pdfkit não expõe um contador pronto). A primeira página conta
        // como 1 antes de qualquer 'pageAdded' disparar.
        let numeroPagina = 1;

        // Cabeçalho com o SKU do contrato no canto superior esquerdo de
        // cada página (pedido da imobiliária, pra facilitar organização).
        function adicionarSkuCanto() {
            const xAntes = doc.x;
            const yAntes = doc.y;
            doc.font('Helvetica-Bold').fontSize(8).fillColor('#555555').text(
                `Nº ${contrato.sku || '—'}`,
                doc.page.margins.left,
                20,
                { lineBreak: false }
            );
            doc.fillColor('black').font('Helvetica').fontSize(11);
            doc.x = xAntes;
            doc.y = yAntes;
        }

        // Rodapé (código do contrato + dados da imobiliária + nº de página)
        // em todas as páginas, inclusive as que forem adicionadas
        // automaticamente pelo fluxo do texto - por isso o listener em
        // 'pageAdded'.
        function adicionarRodape() {
            const alturaRodape = 30;
            const xAntes = doc.x;
            const yAntes = doc.y;
            // O texto do rodapé é escrito dentro da margem inferior da
            // página (perto do fim de tudo). Sem isso, o próprio PDFKit
            // entende que esse texto "não cabe" na área de conteúdo e cria
            // uma página nova sozinho só pra encaixá-lo - o que dispara o
            // evento 'pageAdded' de novo, que chama adicionarRodape() de
            // novo, que cria outra página... um loop infinito e SÍNCRONO
            // (tudo dentro da mesma call stack) até estourar a pilha do
            // Node com "Maximum call stack size exceeded" bem em
            // PDFDocument.addPage - exatamente o erro visto nos logs.
            // Zerar margins.bottom temporariamente avisa o PDFKit que pode
            // escrever ali sem precisar de página nova.
            const margemInferiorAntes = doc.page.margins.bottom;
            doc.page.margins.bottom = 0;
            doc.font('Helvetica').fontSize(8).fillColor('#555555').text(
                `${RODAPE_TEXTO} — Contrato Nº ${contrato.sku || '—'} — Página ${numeroPagina}`,
                doc.page.margins.left,
                doc.page.height - alturaRodape,
                { align: 'center', width: doc.page.width - doc.page.margins.left - doc.page.margins.right, lineBreak: false }
            );
            doc.page.margins.bottom = margemInferiorAntes;
            doc.fillColor('black');
            doc.x = xAntes;
            doc.y = yAntes;
        }
        doc.on('pageAdded', () => {
            numeroPagina += 1;
            adicionarRodape();
            adicionarSkuCanto();
        });

        try {
            doc.image(LOGO_PATH, (doc.page.width - 160) / 2, doc.y, { width: 160 });
            doc.moveDown(3.5);
        } catch (err) {
            // Segue sem logo se o arquivo não puder ser lido, pra não travar a geração do contrato
            console.error('Erro ao carregar logo no PDF:', err.message);
        }

        const titulo = (t) => doc.moveDown(1).font('Helvetica-Bold').fontSize(12).text(t).moveDown(0.3).font('Helvetica').fontSize(11);
        const p = (t) => doc.text(t, { align: 'justify' }).moveDown(0.5);

        doc.font('Helvetica-Bold').fontSize(14).text('INSTRUMENTO PARTICULAR DE COMPROMISSO DE COMPRA E VENDA DE IMÓVEL URBANO', { align: 'center' });
        adicionarRodape();
        adicionarSkuCanto();

        titulo('PROMITENTE VENDEDOR(ES):');
        vendedores.forEach((v) => {
            p(`${v.nome}, ${v.nacionalidade || 'brasileiro(a)'}, ${v.estado_civil || ''}, ${v.profissao || ''}, portador(a) da cédula de identidade nº ${v.rg}PR, inscrito(a) no CPF sob nº ${v.cpf}, Telefone: ${v.telefone || ''}, residente e domiciliado(a) em ${v.endereco || 'Cascavel–PR'}.`);
        });

        titulo('PROMITENTE(S) COMPRADOR(ES):');
        p(`${comprador.nome}, ${comprador.nacionalidade || 'brasileiro(a)'}, ${comprador.estado_civil || ''}, ${comprador.profissao || ''}, portador(a) da cédula de identidade n° ${comprador.rg}, inscrito(a) no CPF sob ${comprador.cpf}, Telefone: ${comprador.telefone || ''}, residente e domiciliado(a) em ${comprador.endereco}, mediante os termos e cláusulas a seguir.`);

        titulo('CLÁUSULA PRIMEIRA – DO OBJETO:');
        p(textoObjetoContrato(contrato));

        titulo('CLÁUSULA SEGUNDA – DA DECLARAÇÃO:');
        p('Através do presente instrumento e na melhor forma de direito, o(a) PROMITENTE VENDEDOR(A) acima qualificado(a) declara que vende, como de fato vendido está, o imóvel identificado e descrito na Cláusula Primeira, para o(s) PROMITENTE(S) COMPRADOR(ES), que o compram, como de fato comprado está, mediante as cláusulas e condições aqui pactuadas.');

        titulo('CLÁUSULA TERCEIRA – DO PREÇO:');
        p(`O preço a ser pago pelo(s) PROMITENTE(S) COMPRADOR(ES) pelo imóvel objeto da presente transação é de ${reaisComExtenso(contrato.valor_total)}, a serem pagos da seguinte forma:`);
        {
            const alineas = [];
            if (contrato.tem_sinal) {
                // Dados bancários de quem recebe o sinal - normalmente o
                // primeiro vendedor cadastrado (quando há mais de um, os
                // demais recebem por acordo entre eles, fora do contrato).
                const recebedor = vendedores[0] || {};
                const dadosConta = recebedor.chave_pix
                    ? `, via PIX (chave: ${recebedor.chave_pix})`
                    : (recebedor.banco ? `, no banco ${recebedor.banco}, agência ${recebedor.agencia}, conta ${recebedor.tipo_conta === 'poupanca' ? 'poupança' : 'corrente'} nº ${recebedor.conta}` : '');
                alineas.push(`${reaisComExtenso(contrato.valor_sinal)}, como sinal de negócio a ser pago na conta do vendedor${dadosConta}.`);
            }
            if (contrato.tem_financiamento) alineas.push(`${reaisComExtenso(contrato.valor_financiado)}, a serem pagos por meio de financiamento bancário.`);
            formasPagamento.forEach((f) => alineas.push(textoFormaPagamento(f)));
            alineas.forEach((texto, i) => p(`${String.fromCharCode(97 + i)}) ${texto}`));
        }

        titulo('CLÁUSULA QUARTA – DAS OBRIGAÇÕES:');
        p('Declara(m) O(S) VENDEDOR(ES) neste ato, estar o imóvel livre e desembaraçado de quaisquer ônus, dívidas e pendências judiciais. Assume(m) a obrigatoriedade de providenciar toda a documentação necessária para a elaboração do contrato de compra e venda com força de Escritura Pública, bem como as certidões positivas de bens e negativas de ônus do registro de imóveis, e as demais necessárias para conclusão do trâmite de transferência do imóvel, sendo que as despesas com escritura, emissão de contrato, ITBI, registro e certidões (parte do financiamento), são de exclusiva responsabilidade do(s) COMPRADOR(ES).');
        {
            let n = 1;
            if (contrato.tem_financiamento) {
                p(`${paragrafo(n++)} O(S) COMPRADOR(ES) têm ciência do custo aproximado de ${reaisComExtenso(contrato.custo_transferencia)} com a transferência do imóvel e obtenção do financiamento.`);
                p(`${paragrafo(n++)} Concordam as partes que necessitamos de uma avaliação de ${reaisComExtenso(contrato.valor_avaliacao)} pelo banco avaliador.`);
            }
            if (contrato.tem_prazo_obra) {
                p(`${paragrafo(n++)} O imóvel encontra-se em construção com PRAZO DE TÉRMINO DE OBRA PARA ${contrato.prazo_obra}.`);
            }
            p(`${paragrafo(n++)} Para sua documentação, 2 (dois) meses, sendo prorrogado por mais 30 (trinta) dias, por depender de órgãos públicos para concluir os mesmos, pois para iniciar o processo de financiamento é necessária a documentação imobiliária individual da unidade.`);
            p(`${paragrafo(n++)} Os impostos Federais, Estaduais e Municipais, bem como energia elétrica, IPTU e lixo que incidirem sobre o referido imóvel, são de inteira responsabilidade dos VENDEDOR(ES), até a entrega do imóvel.`);
            p(`${paragrafo(n++)} Neste ato, está sendo dispensada a apresentação das certidões negativas, sendo que as mesmas deverão ser apresentadas pelo VENDEDOR junto ao agente financeiro.`);
            p(`${paragrafo(n++)} Foi realizada a análise prévia de potencial de financiamento DO COMPRADOR, que se compromete a manter a mesma saúde financeira até a data da assinatura do contrato de financiamento junto ao agente financeiro.`);
            p(`${paragrafo(n++)} É de total responsabilidade DO(S) COMPRADOR(ES) a manutenção do contato com o agente bancário ou correspondente bancário que dará prosseguimento ao seu processo de financiamento, para que ele ocorra de maneira satisfatória e célere.`);
            p(`${paragrafo(n++)} O(S) COMPRADOR(ES) se responsabilizam por comparecer ao agente bancário quando solicitado, manter seu cadastro atualizado e disponibilizar prontamente os documentos para o andamento do financiamento bancário.`);
            p(`${paragrafo(n++)} O negócio foi intermediado pela Imobiliária Deon e Silva Ltda., devidamente inscrita no CNPJ n.º 49.699.403/0001-60, com sede na Avenida Carlos Gomes, 1106, Universitário, Cascavel–PR, com Creci J-8625.`);
        }

        titulo('CLÁUSULA QUINTA – PENAL E DA CORRETAGEM:');
        p('A parte que descumprir qualquer das cláusulas do presente instrumento, ou desistir imotivadamente do negócio após sua assinatura, ficará obrigada ao pagamento de multa compensatória equivalente a 5% (cinco por cento) sobre o valor total do negócio, em favor da parte adimplente.');
        p(`${paragrafo(1)} Caso o inadimplemento enseje cobrança judicial ou extrajudicial, a multa será fixada em 10% (dez por cento) sobre o valor total do negócio, substituindo a penalidade prevista no caput, não sendo cumulativa.`);
        p(`${paragrafo(2)} A multa contratual ora estipulada não exclui nem substitui a obrigação de pagamento da comissão de corretagem devida à IMOBILIÁRIA DEON E SILVA LTDA., a qual será integralmente devida na hipótese de conclusão do negócio ou de desistência imotivada após a intermediação que tenha resultado útil.`);
        p(`${paragrafo(3)} Na hipótese de inadimplemento da comissão de corretagem, será devida à IMOBILIÁRIA multa equivalente a 10% (dez por cento) sobre o valor da comissão ajustada, acrescida de juros de mora de 1% ao mês e correção monetária.`);

        titulo('CLÁUSULA SEXTA – DA ENTREGA DO IMÓVEL:');
        p('OS COMPRADORES assumirão a posse do imóvel objeto da presente negociação no ato da conclusão dos pagamentos mencionados na CLÁUSULA TERCEIRA deste contrato.');

        titulo('CLÁUSULA SÉTIMA – DAS RESPONSABILIDADES:');
        p(`${paragrafo(1)} O(S) VENDEDOR(ES) entregarão o imóvel sem as ligações de água e energia (sem unidade consumidora), porém com toda a infraestrutura necessária para as instalações. Em caso de falha nas instalações, compromete(m)-se a providenciar o reparo no menor prazo possível após comunicado pelo comprador. Em caso de venda de imóvel na planta ou em fase de acabamento, o(s) VENDEDOR(ES) se compromete(m) a explicar o acabamento e fornecer memorial descritivo, contatando o comprador diretamente para alinhamento, sem necessidade de envolver a Imobiliária. O prazo de entrega pactuado é de responsabilidade exclusiva do(s) VENDEDOR(ES), inclusive a comunicação de eventuais atrasos.`);
        p(`${paragrafo(2)} A IMOBILIÁRIA compete o entendimento da necessidade do comprador, busca pelo imóvel ideal, auxílio na aprovação de crédito ou indicação de correspondente bancário, auxílio na formalização da proposta, conferência dos documentos do imóvel escolhido, formalização do contrato, auxílio no acompanhamento dos prazos junto ao banco/cartórios e instrução quanto às ligações de luz, água e esgoto — não sendo responsável pela aprovação de crédito em si, negociação de taxas/parcelas, nem pela obra ou seus prazos, dando suporte na cobrança de patologias após 2 solicitações não atendidas ao VENDEDOR.`);
        p(`${paragrafo(3)} AO AGENTE FINANCEIRO compete explicar a particularidade da linha de crédito, prazos, taxas e condições ao comprador antes da assinatura deste instrumento.`);
        p(`${paragrafo(4)} AO(S) COMPRADOR(ES) compete solicitar com prazo hábil à imobiliária os documentos necessários para as ligações de luz, água e esgoto, e após a entrega das chaves, contatar diretamente a construtora/vendedor(es) sobre patologias ou reparos, recorrendo à Imobiliária apenas após duas solicitações não atendidas.`);

        titulo('CLÁUSULA OITAVA:');
        p('O presente instrumento obriga, em todos os termos, cláusulas e condições, não só O(S) VENDEDOR(ES) e O(S) COMPRADOR(ES), como também seus herdeiros e sucessores.');

        titulo('CLÁUSULA NONA:');
        p('O presente instrumento é irrevogável e irretratável, não podendo ser rescindido de forma alguma nas suas cláusulas e condições.');

        titulo('CLÁUSULA DÉCIMA:');
        p('O presente contrato é celebrado dentro dos princípios da boa-fé e da probidade, como dispõem os artigos 113 e 422 do Código Civil Brasileiro.');

        titulo('CLÁUSULA DÉCIMA SEGUNDA:');
        p('As partes declaram, por meio deste instrumento, que cumprem a legislação aplicável sobre privacidade e proteção de dados, inclusive a LGPD, sem exclusão das demais normas setoriais ou gerais sobre o tema, reconhecendo que ambas atuam como Controladoras de Dados Pessoais autônomas e independentes, cada qual respondendo pelos dados ora prestados, assegurando que os dados compartilhados foram obtidos conforme a legislação aplicável.');

        titulo('CLÁUSULA DÉCIMA TERCEIRA:');
        p('Sem prejuízo da aplicação de eventuais multas previstas em contrato, em caso de tratamento irregular de dados pessoais que seja exclusivamente atribuível a uma das Partes, esta será a única responsável por qualquer dano decorrente de tal tratamento, incluindo incidentes de segurança da informação.');

        titulo('CLÁUSULA DÉCIMA QUARTA – AUTORIZAÇÃO DE USO DE IMAGEM:');
        vendedores.forEach((v) => p(`VENDEDOR(A) ${v.nome}: ${simNao(v.autoriza_imagem)}`));
        p(`COMPRADOR(A) ${comprador.nome}: ${simNao(comprador.autoriza_imagem)}`);
        p('A autorização, quando concedida, é feita de forma gratuita, sem limitação de tempo ou número de usos, podendo ser revogada a qualquer momento por e-mail ou carta escrita, conforme art. 8°, §5°, da Lei n° 13.709/2020 (LGPD).');

        titulo('CLÁUSULA DÉCIMA QUINTA:');
        p('Fica eleito o foro do Município de Cascavel, para dirimir quaisquer dúvidas oriundas do presente instrumento, com renúncia de qualquer outro, por mais privilegiado que seja.');

        doc.moveDown(1).text(`Cascavel, ${dataExtenso(contrato.finalizado_em || new Date())}.`, { align: 'center' });

        doc.moveDown(2);
        vendedores.forEach((v) => {
            doc.text('_'.repeat(50), { align: 'center' });
            doc.text(`${v.nome} (Vendedor)`, { align: 'center' }).moveDown(1);
        });
        doc.text('_'.repeat(50), { align: 'center' });
        doc.text(`${comprador.nome} (Comprador)`, { align: 'center' }).moveDown(1.5);

        doc.font('Helvetica-Bold').text('Testemunhas:', { align: 'center' }).moveDown(0.5).font('Helvetica');
        testemunhas.forEach((t) => {
            doc.text('_'.repeat(50), { align: 'center' });
            doc.text(`${t.nome} — CPF: ${t.cpf}`, { align: 'center' }).moveDown(1);
        });

        // Nota explicativa sobre o Art. 784 do CPC (reconhecimento de firma x
        // assinatura de 2 testemunhas) + logo no final, igual à minuta oficial.
        doc.moveDown(1.5).fontSize(9).fillColor('#333333');
        p('Questão do contrato com reconhecimento de firma ou assinatura de duas testemunhas: O Artigo 784 do Código de Processo Civil dispõe sobre quais são os títulos executivos extrajudiciais, sendo que em seu Inciso III menciona sobre o documento particular assinado por 2 (duas) testemunhas. Ou seja, em interpretação literal do artigo acima, entende-se que, para que um contrato firmado entre as partes seja considerado título executivo extrajudicial, deve contar com a assinatura de duas testemunhas, devidamente identificadas. Perceba que não há qualquer menção à obrigatoriedade de reconhecimento de firma. Sendo assim, em caso de inadimplência de alguma das partes, se o contrato firmado contar com assinatura de duas testemunhas, poderá ser ajuizada demanda executória em face do devedor (inadimplente), sem a necessidade de passar pelo processo de conhecimento, garantindo maior agilidade ao credor e menos tumulto nos procedimentos judiciais (que verificamos na prática a massiva quantidade de processos).');
        doc.fillColor('black').fontSize(11);

        try {
            const larguraLogoFinal = 180;
            doc.moveDown(1).image(LOGO_PATH, (doc.page.width - larguraLogoFinal) / 2, doc.y, { width: larguraLogoFinal });
        } catch (err) {
            // Segue sem o logo final se o arquivo não puder ser lido, pra não travar a geração do contrato
            console.error('Erro ao carregar logo final no PDF:', err.message);
        }

        doc.end();
    });
}

module.exports = { gerarPdfContrato };
