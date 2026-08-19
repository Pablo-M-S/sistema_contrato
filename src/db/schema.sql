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

    status VARCHAR(20) DEFAULT 'rascunho' CHECK (status IN ('rascunho', 'aguardando_cliente', 'finalizado', 'cancelado')),

    -- Dados do imóvel
    imovel_descricao TEXT,
    lote VARCHAR(50),
    quadra VARCHAR(50),
    loteamento VARCHAR(150),
    matricula VARCHAR(100),
    unidade VARCHAR(50),
    pavimento VARCHAR(50),
    metragem NUMERIC(10,2),
    prazo_obra VARCHAR(100),

    -- Condições financeiras
    valor_total NUMERIC(14,2),
    valor_sinal NUMERIC(14,2),
    tem_financiamento BOOLEAN DEFAULT FALSE,
    valor_financiado NUMERIC(14,2),
    valor_avaliacao NUMERIC(14,2),
    custo_transferencia NUMERIC(14,2),
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

CREATE TABLE IF NOT EXISTS vendedores (
    id SERIAL PRIMARY KEY,
    contrato_id INTEGER REFERENCES contratos(id) ON DELETE CASCADE NOT NULL,
    nome VARCHAR(150) NOT NULL,
    nacionalidade VARCHAR(100),
    profissao VARCHAR(100),
    rg VARCHAR(30),
    cpf VARCHAR(20),
    telefone VARCHAR(30),
    endereco TEXT,
    autoriza_imagem BOOLEAN
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
