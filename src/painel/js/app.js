// ---------------------------------------------------------------
// Guarda de sessão
// ---------------------------------------------------------------
if (!Api.token()) window.location.href = 'login.html';

const corretorLogado = Api.corretor();
document.getElementById('nome-corretor').textContent = corretorLogado?.nome || '';
document.getElementById('btn-sair').addEventListener('click', () => Api.logout());

const app = document.getElementById('app');

function mostrarToast(msg, erro) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast mostrar' + (erro ? ' erro' : '');
  setTimeout(() => t.classList.remove('mostrar'), 3500);
}

function formatarMoeda(valor) {
  const n = Number(valor);
  if (isNaN(n)) return '—';
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function paraNumero(valorTexto) {
  if (valorTexto === '' || valorTexto === null || valorTexto === undefined) return null;
  const limpo = String(valorTexto).replace(/\./g, '').replace(',', '.').replace(/[^\d.-]/g, '');
  const n = parseFloat(limpo);
  return isNaN(n) ? null : n;
}

const LABELS_STATUS = {
  rascunho: 'Rascunho',
  aguardando_cliente: 'Aguardando cliente',
  finalizado: 'Finalizado',
  cancelado: 'Cancelado',
};

// Espelha CAMPOS_CONDICIONAIS_IMOVEL do backend (src/routes/contratos.js) -
// cada campo é um toggle "tem isso? sim/não", e o valor só é obrigatório se
// sim. Precisa ficar igual dos dois lados, senão o backend rejeita.
const CAMPOS_CONDICIONAIS_IMOVEL = [
  { flag: 'tem_lote', valor: 'lote', label: 'Lote', tipo: 'texto' },
  { flag: 'tem_quadra', valor: 'quadra', label: 'Quadra', tipo: 'texto' },
  { flag: 'tem_loteamento', valor: 'loteamento', label: 'Loteamento', tipo: 'texto' },
  { flag: 'tem_matricula', valor: 'matricula', label: 'Matrícula', tipo: 'texto' },
  { flag: 'tem_unidade', valor: 'unidade', label: 'Unidade', tipo: 'texto' },
  { flag: 'tem_pavimento', valor: 'pavimento', label: 'Pavimento', tipo: 'texto' },
  { flag: 'tem_metragem', valor: 'metragem', label: 'Metragem (m²)', tipo: 'numero' },
  { flag: 'tem_prazo_obra', valor: 'prazo_obra', label: 'Prazo de obra', tipo: 'texto', placeholder: 'Ex: dezembro de 2026' },
];

// ---------------------------------------------------------------
// Roteamento simples por hash
// ---------------------------------------------------------------
function rotear() {
  const hash = window.location.hash || '#/dashboard';
  if (hash.startsWith('#/novo')) {
    renderWizard();
  } else {
    renderDashboard();
  }
}
window.addEventListener('hashchange', rotear);

// ---------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------
async function renderDashboard() {
  app.innerHTML = `
    <div class="tela">
      <div id="lista-contratos">
        <div class="vazio"><div class="spinner" style="margin:0 auto 12px; border-top-color:var(--gold);"></div>Carregando contratos…</div>
      </div>
    </div>
    <div class="barra-acao-fixa">
      <div class="conteudo">
        <a href="#/novo" class="btn btn-primary">+ Novo contrato</a>
      </div>
    </div>
  `;

  try {
    const resp = await Api.listarContratos();
    const contratos = Array.isArray(resp) ? resp : (resp.contratos || resp.dados || []);
    renderListaContratos(contratos);
  } catch (err) {
    document.getElementById('lista-contratos').innerHTML = `
      <div class="vazio">
        <div class="display">Não foi possível carregar</div>
        <p>${err.message}</p>
      </div>`;
  }
}

function renderListaContratos(contratos) {
  const el = document.getElementById('lista-contratos');
  if (!contratos || contratos.length === 0) {
    el.innerHTML = `
      <div class="vazio">
        <div class="display">Nenhum contrato ainda</div>
        <p>Toque em "Novo contrato" para começar.</p>
      </div>`;
    return;
  }

  el.innerHTML = contratos.map(c => {
    const status = c.status || 'rascunho';
    const descricao = c.imovel_descricao || 'Imóvel sem descrição';
    const valor = c.valor_total ?? c.dados_financeiros?.valor_total;
    const data = c.criado_em ? new Date(c.criado_em).toLocaleDateString('pt-BR') : '';
    return `
      <div class="card card-contrato">
        <div class="topo">
          <div>
            ${c.sku ? `<div class="meta">${c.sku}</div>` : ''}
            <div class="descricao">${descricao}</div>
            <div class="meta">${data}</div>
          </div>
          <span class="badge badge-${status}">${LABELS_STATUS[status] || status}</span>
        </div>
        ${valor ? `<div class="valor">${formatarMoeda(valor)}</div>` : ''}
        ${status === 'finalizado' ? `<button class="btn btn-secondary btn-baixar-pdf" data-id="${c.id}" style="margin-top:10px;">Baixar PDF</button>` : ''}
      </div>
    `;
  }).join('');

  el.querySelectorAll('.btn-baixar-pdf').forEach((btn) => {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner"></span>';
      try {
        await Api.baixarPdf(btn.dataset.id);
      } catch (err) {
        mostrarToast(err.message || 'Erro ao baixar PDF.', true);
      } finally {
        btn.disabled = false;
        btn.textContent = 'Baixar PDF';
      }
    });
  });
}

// ---------------------------------------------------------------
// Wizard: Novo contrato
// ---------------------------------------------------------------
const TOTAL_ETAPAS = 5;

const estadoWizard = {
  etapa: 1,
  contratoId: null,
  sku: null,
  imovel: {},
  financeiro: { tem_financiamento: false },
  vendedores: [],
  testemunhas: [],
};

function resetarWizard() {
  estadoWizard.etapa = 1;
  estadoWizard.contratoId = null;
  estadoWizard.sku = null;
  estadoWizard.imovel = {};
  estadoWizard.financeiro = { tem_financiamento: false };
  estadoWizard.vendedores = [];
  estadoWizard.testemunhas = [];
}

function renderWizard() {
  if (estadoWizard.etapa === 1 && !estadoWizard.contratoId) resetarWizard();

  app.innerHTML = `
    <div class="tela">
      <div style="display:flex; align-items:center; gap:12px; margin-bottom:16px;">
        <button class="btn-ghost" id="btn-voltar-dash" style="padding:6px;">←</button>
        <h1 class="display" style="font-size:19px;">Novo contrato</h1>
      </div>
      <div class="wizard-progresso">
        ${Array.from({ length: TOTAL_ETAPAS }, (_, i) => i + 1).map(n => `<div class="ponto ${n < estadoWizard.etapa ? 'concluido' : ''} ${n === estadoWizard.etapa ? 'ativo' : ''}"></div>`).join('')}
      </div>
      <div id="conteudo-etapa"></div>
    </div>
  `;

  document.getElementById('btn-voltar-dash').addEventListener('click', () => {
    if (confirm('Sair sem salvar? Os dados preenchidos nesta etapa serão perdidos.')) {
      resetarWizard();
      window.location.hash = '#/dashboard';
    }
  });

  if (estadoWizard.etapa === 1) renderEtapaImovel();
  else if (estadoWizard.etapa === 2) renderEtapaFinanceiro();
  else if (estadoWizard.etapa === 3) renderEtapaVendedores();
  else if (estadoWizard.etapa === 4) renderEtapaTestemunhas();
  else renderEtapaRevisao();
}

// ---- Etapa 1: Imóvel ----
function renderCampoCondicional(campo, d) {
  const temValor = d[campo.flag]; // true, false ou undefined (ainda não respondido)
  return `
    <div class="campo campo-condicional" data-campo="${campo.flag}">
      <label>${campo.label}</label>
      <div class="toggle-sim-nao">
        <button type="button" class="toggle-opcao ${temValor === true ? 'ativo' : ''}" data-flag="${campo.flag}" data-valor="true">Sim</button>
        <button type="button" class="toggle-opcao ${temValor === false ? 'ativo' : ''}" data-flag="${campo.flag}" data-valor="false">Não</button>
      </div>
      <div class="campo-condicional-valor ${temValor ? '' : 'oculto'}">
        <input id="valor-${campo.valor}" inputmode="${campo.tipo === 'numero' ? 'decimal' : 'text'}"
               placeholder="${campo.placeholder || ''}" value="${d[campo.valor] ?? ''}">
      </div>
    </div>
  `;
}

function renderEtapaImovel() {
  const d = estadoWizard.imovel;
  document.getElementById('conteudo-etapa').innerHTML = `
    <h2 class="wizard-etapa-titulo display">Dados do imóvel</h2>
    <p class="wizard-etapa-sub">Marque "Sim" só para as características que esse imóvel realmente tem</p>

    <div class="campo">
      <label for="c-descricao">Descrição do imóvel</label>
      <textarea id="c-descricao">${d.imovel_descricao || ''}</textarea>
    </div>

    ${CAMPOS_CONDICIONAIS_IMOVEL.map((campo) => renderCampoCondicional(campo, d)).join('')}

    <div class="barra-acao-fixa">
      <div class="conteudo">
        <button class="btn btn-primary" id="btn-continuar-1">Continuar</button>
      </div>
    </div>
  `;

  // Cada campo condicional guarda sua própria resposta (true/false) no
  // dataset do container, pra saber o estado de todos na hora de validar.
  document.querySelectorAll('.toggle-opcao').forEach((btn) => {
    btn.addEventListener('click', () => {
      const container = btn.closest('.campo-condicional');
      const valor = btn.dataset.valor === 'true';
      container.dataset.resposta = valor;
      container.querySelectorAll('.toggle-opcao').forEach((b) => b.classList.remove('ativo'));
      btn.classList.add('ativo');
      container.querySelector('.campo-condicional-valor').classList.toggle('oculto', !valor);
    });
    // Estado inicial (edição / voltar de outra etapa)
    if (btn.classList.contains('ativo')) {
      btn.closest('.campo-condicional').dataset.resposta = btn.dataset.valor;
    }
  });

  document.getElementById('btn-continuar-1').addEventListener('click', () => {
    const descricao = document.getElementById('c-descricao').value.trim();
    if (!descricao) {
      mostrarToast('Descreva o imóvel antes de continuar.', true);
      document.getElementById('c-descricao').focus();
      return;
    }

    const dados = { imovel_descricao: descricao };
    for (const campo of CAMPOS_CONDICIONAIS_IMOVEL) {
      const container = document.querySelector(`.campo-condicional[data-campo="${campo.flag}"]`);
      const resposta = container.dataset.resposta;
      if (resposta === undefined) {
        mostrarToast(`Informe se o imóvel tem ${campo.label.toLowerCase()} (sim/não).`, true);
        container.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
      const temCampo = resposta === 'true';
      dados[campo.flag] = temCampo;
      if (temCampo) {
        const valorInput = document.getElementById(`valor-${campo.valor}`).value.trim();
        if (!valorInput) {
          mostrarToast(`Preencha o campo "${campo.label}" (marcado como "sim").`, true);
          document.getElementById(`valor-${campo.valor}`).focus();
          return;
        }
        dados[campo.valor] = campo.tipo === 'numero' ? paraNumero(valorInput) : valorInput;
      } else {
        dados[campo.valor] = null;
      }
    }

    estadoWizard.imovel = dados;
    estadoWizard.etapa = 2;
    renderWizard();
  });
}

// ---- Etapa 2: Condições financeiras ----
function renderEtapaFinanceiro() {
  const f = estadoWizard.financeiro;
  document.getElementById('conteudo-etapa').innerHTML = `
    <h2 class="wizard-etapa-titulo display">Condições financeiras</h2>
    <p class="wizard-etapa-sub">Valores do negócio e comissão</p>

    <div class="linha-2">
      <div class="campo">
        <label for="f-valor-total">Valor total (R$)</label>
        <input id="f-valor-total" inputmode="decimal" value="${f.valor_total ?? ''}">
      </div>
      <div class="campo">
        <label for="f-valor-sinal">Valor do sinal (R$)</label>
        <input id="f-valor-sinal" inputmode="decimal" value="${f.valor_sinal ?? ''}">
      </div>
    </div>

    <div class="campo-check">
      <input type="checkbox" id="f-tem-financiamento" ${f.tem_financiamento ? 'checked' : ''}>
      <label for="f-tem-financiamento">Envolve financiamento</label>
    </div>

    <div id="bloco-financiamento" class="${f.tem_financiamento ? '' : 'oculto'}">
      <div class="linha-2">
        <div class="campo">
          <label for="f-valor-financiado">Valor financiado (R$)</label>
          <input id="f-valor-financiado" inputmode="decimal" value="${f.valor_financiado ?? ''}">
        </div>
        <div class="campo">
          <label for="f-valor-avaliacao">Valor de avaliação (R$)</label>
          <input id="f-valor-avaliacao" inputmode="decimal" value="${f.valor_avaliacao ?? ''}">
        </div>
      </div>
    </div>

    <div class="linha-2">
      <div class="campo">
        <label for="f-custo-transferencia">Custo de transferência (R$)</label>
        <input id="f-custo-transferencia" inputmode="decimal" value="${f.custo_transferencia ?? ''}">
      </div>
      <div class="campo">
        <label for="f-comissao">Comissão da imobiliária (R$)</label>
        <input id="f-comissao" inputmode="decimal" value="${f.comissao_imobiliaria ?? ''}">
      </div>
    </div>

    <div class="barra-acao-fixa">
      <div class="conteudo btn-row">
        <button class="btn btn-secondary" id="btn-voltar-2">Voltar</button>
        <button class="btn btn-primary" id="btn-continuar-2">
          <span id="txt-continuar-2">Continuar</span>
        </button>
      </div>
    </div>
  `;

  document.getElementById('f-tem-financiamento').addEventListener('change', (e) => {
    document.getElementById('bloco-financiamento').classList.toggle('oculto', !e.target.checked);
  });

  document.getElementById('btn-voltar-2').addEventListener('click', () => {
    estadoWizard.etapa = 1;
    renderWizard();
  });

  document.getElementById('btn-continuar-2').addEventListener('click', async () => {
    const valorTotal = paraNumero(document.getElementById('f-valor-total').value);
    if (valorTotal === null) {
      mostrarToast('Informe o valor total do imóvel.', true);
      return;
    }
    const temFinanciamento = document.getElementById('f-tem-financiamento').checked;

    estadoWizard.financeiro = {
      valor_total: valorTotal,
      valor_sinal: paraNumero(document.getElementById('f-valor-sinal').value),
      tem_financiamento: temFinanciamento,
      valor_financiado: temFinanciamento ? paraNumero(document.getElementById('f-valor-financiado').value) : null,
      valor_avaliacao: temFinanciamento ? paraNumero(document.getElementById('f-valor-avaliacao').value) : null,
      custo_transferencia: paraNumero(document.getElementById('f-custo-transferencia').value),
      comissao_imobiliaria: paraNumero(document.getElementById('f-comissao').value),
    };

    // Se ainda não existe o contrato no backend, cria agora (rascunho)
    if (!estadoWizard.contratoId) {
      const btn = document.getElementById('btn-continuar-2');
      const txt = document.getElementById('txt-continuar-2');
      btn.disabled = true;
      txt.innerHTML = '<span class="spinner"></span>';
      try {
        const payload = { ...estadoWizard.imovel, ...estadoWizard.financeiro };
        const resp = await Api.criarContrato(payload);
        estadoWizard.contratoId = resp.id || resp.contrato?.id;
        estadoWizard.sku = resp.sku || resp.contrato?.sku || null;
        if (!estadoWizard.contratoId) throw new Error('O servidor não retornou o ID do contrato criado.');
      } catch (err) {
        mostrarToast(err.message || 'Erro ao criar contrato.', true);
        btn.disabled = false;
        txt.textContent = 'Continuar';
        return;
      }
    }

    estadoWizard.etapa = 3;
    renderWizard();
  });
}

// ---- Etapa 3: Vendedores ----
function renderEtapaVendedores() {
  document.getElementById('conteudo-etapa').innerHTML = `
    <h2 class="wizard-etapa-titulo display">Vendedor(es)</h2>
    <p class="wizard-etapa-sub">Adicione pelo menos um vendedor ao contrato</p>

    <div id="lista-vendedores">
      ${estadoWizard.vendedores.map((v, i) => `
        <div class="item-pessoa">
          <div>
            <div class="nome">${v.nome}</div>
            <div class="doc">CPF ${v.cpf || '—'}</div>
          </div>
        </div>
      `).join('')}
    </div>

    <div class="card" style="margin-top:8px;">
      <div class="campo">
        <label for="v-nome">Nome completo</label>
        <input id="v-nome">
      </div>
      <div class="linha-2">
        <div class="campo">
          <label for="v-nacionalidade">Nacionalidade</label>
          <input id="v-nacionalidade" value="Brasileiro(a)">
        </div>
        <div class="campo">
          <label for="v-profissao">Profissão</label>
          <input id="v-profissao">
        </div>
      </div>
      <div class="linha-2">
        <div class="campo">
          <label for="v-rg">RG</label>
          <input id="v-rg">
        </div>
        <div class="campo">
          <label for="v-cpf">CPF</label>
          <input id="v-cpf" inputmode="numeric">
        </div>
      </div>
      <div class="campo">
        <label for="v-telefone">Telefone</label>
        <input id="v-telefone" inputmode="tel">
      </div>
      <div class="campo">
        <label for="v-endereco">Endereço</label>
        <input id="v-endereco">
      </div>
      <div class="campo-check">
        <input type="checkbox" id="v-autoriza-imagem">
        <label for="v-autoriza-imagem">Autoriza uso de imagem</label>
      </div>
      <button class="btn btn-secondary" id="btn-add-vendedor">+ Adicionar vendedor</button>
    </div>

    <div class="barra-acao-fixa">
      <div class="conteudo btn-row">
        <button class="btn btn-secondary" id="btn-voltar-3">Voltar</button>
        <button class="btn btn-primary" id="btn-continuar-3">Continuar</button>
      </div>
    </div>
  `;

  document.getElementById('btn-add-vendedor').addEventListener('click', async () => {
    const nome = document.getElementById('v-nome').value.trim();
    const cpf = document.getElementById('v-cpf').value.trim();
    if (!nome) {
      mostrarToast('Informe o nome do vendedor.', true);
      document.getElementById('v-nome').focus();
      return;
    }
    if (!cpf) {
      mostrarToast('Informe o CPF do vendedor.', true);
      document.getElementById('v-cpf').focus();
      return;
    }
    const dados = {
      nome,
      nacionalidade: document.getElementById('v-nacionalidade').value.trim(),
      profissao: document.getElementById('v-profissao').value.trim(),
      rg: document.getElementById('v-rg').value.trim(),
      cpf,
      telefone: document.getElementById('v-telefone').value.trim(),
      endereco: document.getElementById('v-endereco').value.trim(),
      autoriza_imagem: document.getElementById('v-autoriza-imagem').checked,
    };

    const btn = document.getElementById('btn-add-vendedor');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span>';
    try {
      await Api.adicionarVendedor(estadoWizard.contratoId, dados);
      estadoWizard.vendedores.push(dados);
      renderEtapaVendedores();
    } catch (err) {
      mostrarToast(err.message || 'Erro ao adicionar vendedor.', true);
      btn.disabled = false;
      btn.textContent = '+ Adicionar vendedor';
    }
  });

  document.getElementById('btn-voltar-3').addEventListener('click', () => {
    estadoWizard.etapa = 2;
    renderWizard();
  });

  document.getElementById('btn-continuar-3').addEventListener('click', () => {
    if (estadoWizard.vendedores.length === 0) {
      mostrarToast('Adicione pelo menos um vendedor antes de continuar.', true);
      return;
    }
    estadoWizard.etapa = 4;
    renderWizard();
  });
}

// ---- Etapa 4: Testemunhas ----
function renderEtapaTestemunhas() {
  document.getElementById('conteudo-etapa').innerHTML = `
    <h2 class="wizard-etapa-titulo display">Testemunhas</h2>
    <p class="wizard-etapa-sub">O contrato precisa de exatamente 2 testemunhas pra poder ser finalizado. Se ainda não souber quem vai assinar, dá pra voltar aqui depois.</p>

    <div id="lista-testemunhas">
      ${estadoWizard.testemunhas.map((t) => `
        <div class="item-pessoa">
          <div>
            <div class="nome">${t.nome}</div>
            <div class="doc">CPF ${t.cpf}</div>
          </div>
        </div>
      `).join('')}
    </div>

    ${estadoWizard.testemunhas.length < 2 ? `
      <div class="card" style="margin-top:8px;">
        <div class="campo">
          <label for="t-nome">Nome completo</label>
          <input id="t-nome">
        </div>
        <div class="campo">
          <label for="t-cpf">CPF</label>
          <input id="t-cpf" inputmode="numeric">
        </div>
        <button class="btn btn-secondary" id="btn-add-testemunha">+ Adicionar testemunha</button>
      </div>
    ` : `<p class="wizard-etapa-sub">As 2 testemunhas já foram cadastradas.</p>`}

    <div class="barra-acao-fixa">
      <div class="conteudo btn-row">
        <button class="btn btn-secondary" id="btn-voltar-4">Voltar</button>
        <button class="btn btn-primary" id="btn-continuar-4">Continuar</button>
      </div>
    </div>
  `;

  const btnAdd = document.getElementById('btn-add-testemunha');
  if (btnAdd) {
    btnAdd.addEventListener('click', async () => {
      const nome = document.getElementById('t-nome').value.trim();
      const cpf = document.getElementById('t-cpf').value.trim();
      if (!nome || !cpf) {
        mostrarToast('Informe nome e CPF da testemunha.', true);
        return;
      }
      btnAdd.disabled = true;
      btnAdd.innerHTML = '<span class="spinner"></span>';
      try {
        const criada = await Api.adicionarTestemunha(estadoWizard.contratoId, { nome, cpf });
        estadoWizard.testemunhas.push(criada);
        renderEtapaTestemunhas();
      } catch (err) {
        mostrarToast(err.message || 'Erro ao adicionar testemunha.', true);
        btnAdd.disabled = false;
        btnAdd.textContent = '+ Adicionar testemunha';
      }
    });
  }

  document.getElementById('btn-voltar-4').addEventListener('click', () => {
    estadoWizard.etapa = 3;
    renderWizard();
  });

  document.getElementById('btn-continuar-4').addEventListener('click', () => {
    // Testemunhas podem ficar pendentes por enquanto (só são exigidas na
    // hora do cliente finalizar pelo link) - por isso não bloqueia aqui,
    // só avisa.
    if (estadoWizard.testemunhas.length < 2) {
      mostrarToast('Você pode gerar o link mesmo sem as testemunhas, mas o cliente só consegue finalizar depois que as 2 forem cadastradas.', false);
    }
    estadoWizard.etapa = 5;
    renderWizard();
  });
}

// ---- Etapa 4: Revisão + gerar link ----
function renderEtapaRevisao() {
  const im = estadoWizard.imovel;
  const fin = estadoWizard.financeiro;

  document.getElementById('conteudo-etapa').innerHTML = `
    <h2 class="wizard-etapa-titulo display">Revisão</h2>
    <p class="wizard-etapa-sub">Confira antes de gerar o link para o comprador</p>

    ${estadoWizard.sku ? `<div class="card"><div class="meta">Código do contrato</div><div class="descricao">${estadoWizard.sku}</div></div>` : ''}

    <div class="card">
      <div class="descricao" style="font-family:var(--font-display); font-weight:600; margin-bottom:8px;">${im.imovel_descricao}</div>
      <div class="meta">${[im.loteamento, im.quadra && `Q.${im.quadra}`, im.lote && `L.${im.lote}`].filter(Boolean).join(' · ')}</div>
    </div>

    <div class="card">
      <div class="meta" style="margin-bottom:6px;">Valor total</div>
      <div class="valor" style="font-size:20px;">${formatarMoeda(fin.valor_total)}</div>
      ${fin.tem_financiamento ? '<div class="meta" style="margin-top:8px;">Com financiamento</div>' : ''}
    </div>

    <div class="card">
      <div class="meta" style="margin-bottom:10px;">Vendedor(es)</div>
      ${estadoWizard.vendedores.map(v => `<div class="item-pessoa" style="background:transparent; border:none; padding:6px 0;"><div><div class="nome">${v.nome}</div></div></div>`).join('')}
    </div>

    <div class="card">
      <div class="meta" style="margin-bottom:10px;">Testemunhas</div>
      ${estadoWizard.testemunhas.length > 0
        ? estadoWizard.testemunhas.map(t => `<div class="item-pessoa" style="background:transparent; border:none; padding:6px 0;"><div><div class="nome">${t.nome}</div></div></div>`).join('')
        : '<div class="meta">Nenhuma cadastrada ainda — o cliente não vai conseguir finalizar até isso ser preenchido.</div>'}
    </div>

    <div class="barra-acao-fixa">
      <div class="conteudo btn-row">
        <button class="btn btn-secondary" id="btn-voltar-4">Voltar</button>
        <button class="btn btn-primary" id="btn-gerar-link">
          <span id="txt-gerar-link">Gerar link para o comprador</span>
        </button>
      </div>
    </div>
  `;

  document.getElementById('btn-voltar-4').addEventListener('click', () => {
    estadoWizard.etapa = 4;
    renderWizard();
  });

  document.getElementById('btn-gerar-link').addEventListener('click', async () => {
    const btn = document.getElementById('btn-gerar-link');
    const txt = document.getElementById('txt-gerar-link');
    btn.disabled = true;
    txt.innerHTML = '<span class="spinner"></span>';
    try {
      const resp = await Api.gerarLink(estadoWizard.contratoId);
      const link = resp.link || resp.url || resp.linkPublico;
      mostrarModalLink(link);
    } catch (err) {
      mostrarToast(err.message || 'Erro ao gerar link.', true);
      btn.disabled = false;
      txt.textContent = 'Gerar link para o comprador';
    }
  });
}

function mostrarModalLink(link) {
  const fundo = document.createElement('div');
  fundo.className = 'modal-fundo';
  fundo.innerHTML = `
    <div class="modal-conteudo">
      <h2 class="display" style="font-size:18px; margin-bottom:6px;">Link gerado</h2>
      <p style="color:var(--text-dim); font-size:14px; margin:0;">Envie este link para o comprador preencher os dados dele.</p>
      <div class="link-caixa">${link || '(link não retornado pelo servidor)'}</div>
      <div class="btn-row">
        <button class="btn btn-secondary" id="btn-copiar-link">Copiar</button>
        <button class="btn btn-primary" id="btn-ir-dashboard">Concluir</button>
      </div>
    </div>
  `;
  document.body.appendChild(fundo);

  document.getElementById('btn-copiar-link').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(link || '');
      mostrarToast('Link copiado.');
    } catch {
      mostrarToast('Não foi possível copiar automaticamente.', true);
    }
  });

  document.getElementById('btn-ir-dashboard').addEventListener('click', () => {
    resetarWizard();
    document.body.removeChild(fundo);
    window.location.hash = '#/dashboard';
    rotear();
  });
}

// ---------------------------------------------------------------
rotear();
