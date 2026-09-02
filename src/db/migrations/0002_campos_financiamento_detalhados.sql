-- Detalhamento de como custo_transferencia é calculado (taxa do banco,
-- custas de cartório, se é 2º imóvel financiado, desconto de ITBI de
-- primeiro imóvel e o valor da entrada nesse caso, % de comissão). O
-- painel já coletava tudo isso na tela pra calcular o total, mas o
-- backend descartava esses campos silenciosamente - só o resultado final
-- (custo_transferencia) era salvo, sem o detalhamento por trás dele.

ALTER TABLE contratos ADD COLUMN IF NOT EXISTS taxa_banco NUMERIC(14,2);
ALTER TABLE contratos ADD COLUMN IF NOT EXISTS custas_cartorio NUMERIC(14,2);
ALTER TABLE contratos ADD COLUMN IF NOT EXISTS segundo_imovel_financiado BOOLEAN;
ALTER TABLE contratos ADD COLUMN IF NOT EXISTS tem_desconto_primeiro_imovel BOOLEAN;
ALTER TABLE contratos ADD COLUMN IF NOT EXISTS valor_entrada NUMERIC(14,2);
ALTER TABLE contratos ADD COLUMN IF NOT EXISTS comissao_percentual NUMERIC(5,2);
