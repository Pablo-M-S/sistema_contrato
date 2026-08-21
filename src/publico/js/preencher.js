const LOGO = '/preencher/img/logo-dourado-transparente.png';

function pegarToken() {
  const partes = window.location.pathname.split('/').filter(Boolean);
  // esperado: ['preencher', '<token>']
  return partes[partes.length - 1];
}

function formatarMoeda(valor) {
  const n = Number(valor);
  if (isNaN(n)) return '—';
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

async function chamarApi(metodo, corpo) {
  const token = pegarToken();
  const opcoes = { method: metodo, headers: { 'Content-Type': 'application/json' } };
  if (corpo !== undefined) opcoes.body = JSON.stringify(corpo);

  let resposta;
  try {
    resposta = await fetch(`/api/publico/contratos/${token}`, opcoes);
  } catch {
    throw { generico: true, mensagem: 'Não foi possível conectar. Verifique sua internet e tente novamente.' };
  }

  let dados = null;
  const texto = await resposta.text();
  if (texto) { try { dados = JSON.parse(texto); } catch { dados = null; } }

  if (!resposta.ok) {
    throw { status: resposta.status, mensagem: (dados && dados.erro) || 'Ocorreu um erro.' };
  }
  return dados;
}

const app = document.getElementById('app');

function renderEstado({ icone, classeIcone, titulo, texto }) {
  app.innerHTML = `
    <div class="estado-central">
      <img src="${LOGO}" alt="Deon Imobiliária">
      <div class="icone-status ${classeIcone}">${icone}</div>
      <div class="display">${titulo}</div>
      <p>${texto}</p>
    </div>
  `;
}

async function iniciar() {
  const token = pegarToken();
  if (!token) {
    renderEstado({
      icone: '!', classeIcone: 'icone-erro',
      titulo: 'Link incompleto',
      texto: 'Este link parece estar incompleto. Confira se copiou o endereço inteiro enviado pelo corretor.',
    });
    return;
  }

  let contrato;
  try {
    contrato = await chamarApi('GET');
  } catch (err) {
    if (err.status === 404) {
      renderEstado({
        icone: '!', classeIcone: 'icone-erro',
        titulo: 'Link inválido',
        texto: 'Não encontramos nenhum contrato para este link. Confirme o endereço com seu corretor.',
      });
    } else if (err.status === 410) {
      renderEstado({
        icone: '✓', classeIcone: 'icone-sucesso',
        titulo: 'Contrato já finalizado',
        texto: 'Este contrato já teve os dados preenchidos anteriormente. Fale com seu corretor se precisar de algo.',
      });
    } else {
      renderEstado({
        icone: '!', classeIcone: 'icone-erro',
        titulo: 'Não foi possível carregar',
        texto: err.mensagem || 'Tente novamente em instantes.',
      });
    }
    return;
  }

  renderFormulario(contrato);
}

function renderFormulario(contrato) {
  app.innerHTML = `
    <div class="tela">
      <div class="topo-marca">
        <img src="${LOGO}" alt="Deon Imobiliária">
      </div>

      <div class="card-resumo">
        <div class="rotulo">Imóvel</div>
        <div class="imovel">${contrato.imovel_descricao || '—'}</div>
        ${contrato.loteamento ? `<div class="linha-valor"><span>Loteamento</span><span>${contrato.loteamento}</span></div>` : ''}
        <div class="linha-valor"><span>Valor total</span><span class="valor">${formatarMoeda(contrato.valor_total)}</span></div>
        ${contrato.valor_sinal ? `<div class="linha-valor"><span>Sinal</span><span class="valor">${formatarMoeda(contrato.valor_sinal)}</span></div>` : ''}
        ${contrato.tem_financiamento ? `<div class="linha-valor"><span>Financiamento</span><span>Sim</span></div>` : ''}
      </div>

      <div class="secao-titulo">Seus dados</div>

      <form id="form-comprador">
        <div class="campo" id="campo-nome">
          <label for="nome">Nome completo</label>
          <input id="nome" autocomplete="name">
          <div class="erro">Informe seu nome completo.</div>
        </div>

        <div class="linha-2">
          <div class="campo">
            <label for="nacionalidade">Nacionalidade</label>
            <input id="nacionalidade" value="Brasileiro(a)">
          </div>
          <div class="campo">
            <label for="profissao">Profissão <span class="opcional">(opcional)</span></label>
            <input id="profissao">
          </div>
        </div>

        <div class="linha-2">
          <div class="campo" id="campo-rg">
            <label for="rg">RG</label>
            <input id="rg">
            <div class="erro">Informe seu RG.</div>
          </div>
          <div class="campo" id="campo-cpf">
            <label for="cpf">CPF</label>
            <input id="cpf" inputmode="numeric">
            <div class="erro">Informe seu CPF.</div>
          </div>
        </div>

        <div class="campo" id="campo-telefone">
          <label for="telefone">Telefone</label>
          <input id="telefone" inputmode="tel" autocomplete="tel">
          <div class="erro">Informe seu telefone.</div>
        </div>

        <div class="campo" id="campo-endereco">
          <label for="endereco">Endereço completo</label>
          <input id="endereco" autocomplete="street-address">
          <div class="erro">Informe seu endereço.</div>
        </div>

        <div class="campo-check">
          <input type="checkbox" id="autoriza-imagem">
          <label for="autoriza-imagem">Autorizo o uso da minha imagem</label>
        </div>

        <button type="submit" class="btn btn-primary" id="btn-enviar">
          <span id="txt-enviar">Enviar dados</span>
        </button>
      </form>
    </div>
  `;

  document.getElementById('form-comprador').addEventListener('submit', enviarFormulario);
}

async function enviarFormulario(e) {
  e.preventDefault();

  const campos = {
    nome: document.getElementById('nome').value.trim(),
    nacionalidade: document.getElementById('nacionalidade').value.trim(),
    profissao: document.getElementById('profissao').value.trim(),
    rg: document.getElementById('rg').value.trim(),
    cpf: document.getElementById('cpf').value.trim(),
    telefone: document.getElementById('telefone').value.trim(),
    endereco: document.getElementById('endereco').value.trim(),
    autoriza_imagem: document.getElementById('autoriza-imagem').checked,
  };

  const obrigatorios = ['nome', 'rg', 'cpf', 'telefone', 'endereco'];
  let valido = true;
  obrigatorios.forEach((campo) => {
    const elCampo = document.getElementById(`campo-${campo}`);
    const vazio = !campos[campo];
    elCampo.classList.toggle('invalido', vazio);
    if (vazio) valido = false;
  });
  if (!valido) {
    document.querySelector('.campo.invalido input')?.focus();
    return;
  }

  const btn = document.getElementById('btn-enviar');
  const txt = document.getElementById('txt-enviar');
  btn.disabled = true;
  txt.innerHTML = '<span class="spinner"></span>';

  try {
    await chamarApi('POST', campos);
    renderEstado({
      icone: '✓', classeIcone: 'icone-sucesso',
      titulo: 'Dados enviados!',
      texto: 'Seus dados foram recebidos e o contrato foi finalizado. Seu corretor vai entrar em contato com os próximos passos.',
    });
  } catch (err) {
    if (err.status === 400 && err.mensagem) {
      alert('Faltam alguns dados obrigatórios. Confira o formulário e tente novamente.');
    } else if (err.status === 410) {
      renderEstado({
        icone: '✓', classeIcone: 'icone-sucesso',
        titulo: 'Contrato já finalizado',
        texto: 'Este contrato já teve os dados preenchidos. Fale com seu corretor se precisar de algo.',
      });
      return;
    } else {
      alert(err.mensagem || 'Não foi possível enviar. Tente novamente.');
    }
    btn.disabled = false;
    txt.textContent = 'Enviar dados';
  }
}

iniciar();
