// O painel é servido pelo mesmo backend Express (igual o admin do Santa Terra
// Vitta), então as chamadas de API usam caminho relativo. Se um dia o painel
// for hospedado separado do backend, troque a linha abaixo pela URL fixa:
// const API_BASE = 'https://sistemacontrato-production.up.railway.app';
const API_BASE = '';

const Api = {
  token() {
    return localStorage.getItem('sc_token');
  },

  salvarSessao(token, corretor) {
    localStorage.setItem('sc_token', token);
    localStorage.setItem('sc_corretor', JSON.stringify(corretor));
  },

  corretor() {
    try {
      return JSON.parse(localStorage.getItem('sc_corretor') || 'null');
    } catch {
      return null;
    }
  },

  logout() {
    localStorage.removeItem('sc_token');
    localStorage.removeItem('sc_corretor');
    window.location.href = 'login.html';
  },

  async _chamar(metodo, caminho, corpo) {
    const opcoes = {
      method: metodo,
      headers: { 'Content-Type': 'application/json' },
    };
    const token = this.token();
    if (token) opcoes.headers['Authorization'] = `Bearer ${token}`;
    if (corpo !== undefined) opcoes.body = JSON.stringify(corpo);

    let resposta;
    try {
      resposta = await fetch(`${API_BASE}${caminho}`, opcoes);
    } catch (e) {
      throw new Error('Não foi possível conectar ao servidor. Verifique sua conexão.');
    }

    if (resposta.status === 401) {
      this.logout();
      throw new Error('Sessão expirada. Faça login novamente.');
    }

    let dados = null;
    const texto = await resposta.text();
    if (texto) {
      try { dados = JSON.parse(texto); } catch { dados = null; }
    }

    if (!resposta.ok) {
      const msg = (dados && (dados.erro || dados.mensagem || dados.message)) || `Erro ${resposta.status}`;
      throw new Error(msg);
    }
    return dados;
  },

  get(caminho) { return this._chamar('GET', caminho); },
  post(caminho, corpo) { return this._chamar('POST', caminho, corpo); },
  put(caminho, corpo) { return this._chamar('PUT', caminho, corpo); },
  del(caminho) { return this._chamar('DELETE', caminho); },

  // ---- Auth ----
  login(email, senha) {
    return this.post('/api/auth/login', { email, senha });
  },

  // ---- Contratos ----
  listarContratos(filtros = {}) {
    const params = new URLSearchParams(filtros);
    const qs = params.toString();
    return this.get(`/api/contratos${qs ? '?' + qs : ''}`);
  },
  criarContrato(dados) {
    return this.post('/api/contratos', dados);
  },
  adicionarVendedor(contratoId, dados) {
    return this.post(`/api/contratos/${contratoId}/vendedores`, dados);
  },
  adicionarTestemunha(contratoId, dados) {
    return this.post(`/api/contratos/${contratoId}/testemunhas`, dados);
  },
  removerTestemunha(contratoId, testemunhaId) {
    return this.del(`/api/contratos/${contratoId}/testemunhas/${testemunhaId}`);
  },
  gerarLink(contratoId) {
    return this.post(`/api/contratos/${contratoId}/gerar-link`);
  },

  // ---- Corretores (admin) ----
  listarCorretores() {
    return this.get('/api/corretores');
  },
  criarCorretor(dados) {
    return this.post('/api/corretores', dados);
  },

  // PDF vem como arquivo binário, não JSON - por isso não usa _chamar (que
  // sempre tenta fazer JSON.parse da resposta). Abre direto numa nova aba.
  async baixarPdf(contratoId) {
    const resposta = await fetch(`${API_BASE}/api/contratos/${contratoId}/pdf`, {
      headers: { Authorization: `Bearer ${this.token()}` }
    });
    if (!resposta.ok) {
      const dados = await resposta.json().catch(() => null);
      throw new Error((dados && dados.erro) || 'Erro ao gerar PDF.');
    }
    const blob = await resposta.blob();
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
  },
};
