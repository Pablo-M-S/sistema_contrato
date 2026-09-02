// Runner de migrations - sem dependência nova, só usa o pg que já existe.
//
// Como funciona: cada arquivo .sql dentro de src/db/migrations/ é uma
// mudança de schema. Esse script aplica, em ordem alfabética, só os
// arquivos que ainda não rodaram nesse banco (controle na tabela
// schema_migrations). Cada arquivo roda dentro de uma transação: se der
// erro, desfaz e para ali, sem marcar como aplicado.
//
// É chamado automaticamente antes do servidor subir (ver "start" no
// package.json), então esquecer de rodar a migração manualmente no
// Railway não vai mais acontecer - foi exatamente isso que causou os
// erros "column does not exist" e o de "gov.br" nesta mesma sessão.
//
// Pra criar uma migração nova: adicionar um arquivo
// src/db/migrations/000X_nome_da_mudanca.sql com o ALTER TABLE/CREATE
// TABLE necessário. O número na frente do nome é só pra garantir a ordem
// de execução - nunca reaproveitar um número já usado, nem editar um
// arquivo de migração que já foi commitado (se algo estiver errado,
// criar uma migração nova corrigindo, não editar a antiga).

const fs = require('fs');
const path = require('path');
const pool = require('./pool');

const PASTA_MIGRATIONS = path.join(__dirname, 'migrations');

async function garantirTabelaControle(client) {
    await client.query(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
            id SERIAL PRIMARY KEY,
            nome VARCHAR(255) UNIQUE NOT NULL,
            aplicada_em TIMESTAMP NOT NULL DEFAULT NOW()
        )
    `);
}

async function migracoesJaAplicadas(client) {
    const { rows } = await client.query('SELECT nome FROM schema_migrations');
    return new Set(rows.map((r) => r.nome));
}

async function rodarMigrations() {
    if (!fs.existsSync(PASTA_MIGRATIONS)) {
        console.log('[migrate] Nenhuma pasta de migrations encontrada, nada a fazer.');
        return;
    }

    const arquivos = fs.readdirSync(PASTA_MIGRATIONS)
        .filter((f) => f.endsWith('.sql'))
        .sort(); // ordem alfabética == ordem de execução (por isso o prefixo numérico)

    const client = await pool.connect();
    try {
        await garantirTabelaControle(client);
        const aplicadas = await migracoesJaAplicadas(client);
        const pendentes = arquivos.filter((f) => !aplicadas.has(f));

        if (pendentes.length === 0) {
            console.log('[migrate] Banco já está em dia, nenhuma migration pendente.');
            return;
        }

        for (const arquivo of pendentes) {
            const sql = fs.readFileSync(path.join(PASTA_MIGRATIONS, arquivo), 'utf8');
            console.log(`[migrate] Aplicando ${arquivo}...`);
            try {
                await client.query('BEGIN');
                await client.query(sql);
                await client.query('INSERT INTO schema_migrations (nome) VALUES ($1)', [arquivo]);
                await client.query('COMMIT');
                console.log(`[migrate] OK: ${arquivo}`);
            } catch (err) {
                await client.query('ROLLBACK');
                console.error(`[migrate] ERRO em ${arquivo}, revertido. O deploy será interrompido.`);
                throw err;
            }
        }
        console.log(`[migrate] Concluído: ${pendentes.length} migration(s) aplicada(s).`);
    } finally {
        client.release();
    }
}

// Permite tanto `node src/db/migrate.js` direto quanto `require(...)` em testes.
if (require.main === module) {
    rodarMigrations()
        .then(() => process.exit(0))
        .catch((err) => {
            console.error('[migrate] Falha ao rodar migrations:', err.message);
            process.exit(1);
        });
}

module.exports = { rodarMigrations };
