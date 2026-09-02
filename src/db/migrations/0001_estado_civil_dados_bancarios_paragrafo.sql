-- Estado civil, dados bancários do vendedor, novos campos do imóvel
-- (empreendimento/cartório) e parágrafo editável da Cláusula Primeira.
-- Já rodada manualmente em produção antes de existir esse sistema de
-- migrations - fica aqui registrada pra qualquer banco novo (ou uma
-- réplica) ficar em dia também. IF NOT EXISTS torna seguro rodar de novo.

ALTER TABLE contratos ADD COLUMN IF NOT EXISTS tem_empreendimento BOOLEAN;
ALTER TABLE contratos ADD COLUMN IF NOT EXISTS empreendimento VARCHAR(150);
ALTER TABLE contratos ADD COLUMN IF NOT EXISTS tem_cartorio_numero BOOLEAN;
ALTER TABLE contratos ADD COLUMN IF NOT EXISTS cartorio_numero VARCHAR(10);
ALTER TABLE contratos ADD COLUMN IF NOT EXISTS imovel_paragrafo TEXT;
ALTER TABLE vendedores ADD COLUMN IF NOT EXISTS estado_civil VARCHAR(30);
ALTER TABLE vendedores ADD COLUMN IF NOT EXISTS banco VARCHAR(100);
ALTER TABLE vendedores ADD COLUMN IF NOT EXISTS agencia VARCHAR(20);
ALTER TABLE vendedores ADD COLUMN IF NOT EXISTS conta VARCHAR(30);
ALTER TABLE vendedores ADD COLUMN IF NOT EXISTS tipo_conta VARCHAR(20);
ALTER TABLE vendedores ADD COLUMN IF NOT EXISTS chave_pix VARCHAR(150);
ALTER TABLE compradores ADD COLUMN IF NOT EXISTS estado_civil VARCHAR(30);
ALTER TABLE compradores ADD COLUMN IF NOT EXISTS assinatura_meio VARCHAR(20) DEFAULT 'manual';
