-- Schema inicial - sistema_contrato
-- Imobiliária: gestão de contratos e propostas de venda de imóveis

CREATE TABLE IF NOT EXISTS corretores (
    id SERIAL PRIMARY KEY,
    nome VARCHAR(150) NOT NULL,
    email VARCHAR(150) UNIQUE NOT NULL,
    senha_hash VARCHAR(255) NOT NULL,
    is_admin BOOLEAN DEFAULT FALSE, -- login central
    criado_em TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS contratos (
    id SERIAL PRIMARY KEY,
    token_link UUID DEFAULT gen_random_uuid() UNIQUE NOT NULL,
    corretor_id INTEGER REFERENCES corretores(id) NOT NULL,

    -- Código legível do contrato (ex: CTR-2026-0007), gerado logo após o
    -- INSERT em routes/contratos.js (depende do id, que só existe depois de
    -- criado). Fica NULL por uma fração de segundo entre o INSERT e o UPDATE
    -- que preenche esse campo.
    sku VARCHAR(20) UNIQUE,

    status VARCHAR(20) DEFAULT 'rascunho' CHECK (status IN ('rascunho', 'aguardando_cliente', 'finalizado', 'cancelado')),

    -- Dados do imóvel — cada campo abaixo é condicional: tem_X (obrigatório
    -- escolher sim/não) e, se tem_X = true, o valor correspondente é
    -- obrigatório; se false, o valor é ignorado/irrelevante. Validação real
    -- fica em routes/contratos.js (validarCamposImovel).
    imovel_descricao TEXT,
    tem_lote BOOLEAN,
    lote VARCHAR(50),
    tem_quadra BOOLEAN,
    quadra VARCHAR(50),
    tem_loteamento BOOLEAN,
    loteamento VARCHAR(150),
    tem_matricula BOOLEAN,
    matricula VARCHAR(100),
    tem_unidade BOOLEAN,
    unidade VARCHAR(50),
    tem_pavimento BOOLEAN,
    pavimento VARCHAR(50),
    tem_metragem BOOLEAN,
    metragem NUMERIC(10,2),
    tem_prazo_obra BOOLEAN,
    prazo_obra VARCHAR(100),

    -- Condições financeiras
    valor_total NUMERIC(14,2),
    -- Nem todo negócio tem sinal separado do restante do pagamento, por
    -- isso segue o mesmo padrão tem_X/valor dos campos do imóvel, em vez de
    -- deixar valor_sinal em branco de forma ambígua (esqueceu vs. não tem).
    tem_sinal BOOLEAN,
    valor_sinal NUMERIC(14,2),
    tem_financiamento BOOLEAN DEFAULT FALSE,
    -- valor_financiado, valor_avaliacao e custo_transferencia só existem se
    -- tem_financiamento = true (obrigatórios nesse caso; validação em
    -- routes/contratos.js).
    valor_financiado NUMERIC(14,2),
    valor_avaliacao NUMERIC(14,2),
    custo_transferencia NUMERIC(14,2),
    -- Dado interno da imobiliária, não aparece no texto do contrato - por
    -- isso continua opcional, sem travar o fluxo do corretor.
    comissao_imobiliaria NUMERIC(14,2),

    -- Nome do arquivo final (nome do cliente comprador)
    nome_arquivo_pdf VARCHAR(255),
    caminho_pdf TEXT,

    criado_em TIMESTAMP DEFAULT NOW(),
    finalizado_em TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_contratos_corretor ON contratos(corretor_id);
CREATE INDEX IF NOT EXISTS idx_contratos_status ON contratos(status);
CREATE INDEX IF NOT EXISTS idx_contratos_financiamento ON contratos(tem_financiamento);
CREATE INDEX IF NOT EXISTS idx_contratos_criado_em ON contratos(criado_em);

-- Formas de pagamento extras, além do sinal e do financiamento (que já têm
-- campos próprios em `contratos`). Pedido da imobiliária: FGTS, subsídio
-- Caixa, pagamento na assinatura do banco, balão e parcelas usam só um
-- valor em R$; veículo e imóvel são permuta (parte do pagamento em bem, não
-- em dinheiro) e por isso têm campos descritivos próprios.
CREATE TABLE IF NOT EXISTS formas_pagamento (
    id SERIAL PRIMARY KEY,
    contrato_id INTEGER REFERENCES contratos(id) ON DELETE CASCADE NOT NULL,
    tipo VARCHAR(30) NOT NULL CHECK (tipo IN (
        'fgts', 'subsidio_caixa', 'assinatura_banco', 'balao', 'parcelas',
        'valor_vista', 'veiculo', 'imovel'
    )),
    valor NUMERIC(14,2), -- obrigatório pros tipos em dinheiro (validado em routes/contratos.js)
    descricao TEXT,      -- observação livre (parcelamento, condições, etc.)

    -- Só preenchidos quando tipo = 'veiculo' (dados do bem dado em permuta)
    veiculo_modelo VARCHAR(100),
    veiculo_placa VARCHAR(20),
    veiculo_chassi VARCHAR(30),
    veiculo_renavam VARCHAR(20),
    veiculo_cor VARCHAR(40),
    veiculo_combustivel VARCHAR(30),
    veiculo_ano VARCHAR(10),

    -- Só preenchidos quando tipo = 'imovel' (mesmo padrão de campos da
    -- Cláusula Primeira / objeto do contrato, mas para o imóvel dado em
    -- permuta pelo comprador)
    imovel_descricao TEXT,
    imovel_lote VARCHAR(50),
    imovel_quadra VARCHAR(50),
    imovel_loteamento VARCHAR(150),
    imovel_matricula VARCHAR(50),
    imovel_unidade VARCHAR(50),
    imovel_pavimento VARCHAR(50),
    imovel_metragem NUMERIC(10,2),

    criado_em TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_formas_pagamento_contrato ON formas_pagamento(contrato_id);

CREATE TABLE IF NOT EXISTS vendedores (
    id SERIAL PRIMARY KEY,
    contrato_id INTEGER REFERENCES contratos(id) ON DELETE CASCADE NOT NULL,
    nome VARCHAR(150) NOT NULL,
    nacionalidade VARCHAR(100),
    profissao VARCHAR(100),
    -- RG, CPF, telefone, endereço e autorização de imagem são dados da
    -- pessoa, não do imóvel - não variam de contrato pra contrato, então
    -- são sempre obrigatórios (mesmo padrão exigido do comprador). Validação
    -- reforçada em routes/contratos.js.
    rg VARCHAR(30) NOT NULL,
    cpf VARCHAR(20) NOT NULL,
    telefone VARCHAR(30) NOT NULL,
    endereco TEXT NOT NULL,
    autoriza_imagem BOOLEAN NOT NULL
);

CREATE TABLE IF NOT EXISTS compradores (
    id SERIAL PRIMARY KEY,
    contrato_id INTEGER REFERENCES contratos(id) ON DELETE CASCADE NOT NULL,
    nome VARCHAR(150),
    nacionalidade VARCHAR(100),
    profissao VARCHAR(100),
    rg VARCHAR(30),
    cpf VARCHAR(20),
    telefone VARCHAR(30),
    endereco TEXT,
    autoriza_imagem BOOLEAN,
    preenchido_em TIMESTAMP
);

CREATE TABLE IF NOT EXISTS testemunhas (
    id SERIAL PRIMARY KEY,
    contrato_id INTEGER REFERENCES contratos(id) ON DELETE CASCADE NOT NULL,
    nome VARCHAR(150),
    cpf VARCHAR(20)
);
