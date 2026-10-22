import type Database from "better-sqlite3";

interface Migracao {
  versao: number;
  descricao: string;
  aplicar: (db: Database.Database) => void;
}

// Migrações em ordem, aplicadas uma vez cada (idempotente via tabela schema_version).
const MIGRACOES: readonly Migracao[] = [
  {
    versao: 1,
    descricao: "esquema inicial",
    aplicar: (db) => {
      db.exec(`
        CREATE TABLE produto (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          origem_url TEXT NOT NULL,
          dados_json TEXT NOT NULL,
          lido_em TEXT NOT NULL
        );

        CREATE TABLE foto (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          produto_id INTEGER NOT NULL REFERENCES produto(id),
          url TEXT NOT NULL,
          largura INTEGER,
          altura INTEGER,
          caminho_local TEXT,
          ordem INTEGER NOT NULL DEFAULT 0
        );

        CREATE TABLE video (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          produto_id INTEGER NOT NULL REFERENCES produto(id),
          estado TEXT NOT NULL CHECK (estado IN (
            'rascunho', 'renderizando', 'aguardando_aprovacao',
            'aprovado', 'rejeitado', 'publicado', 'erro'
          )),
          caminho_mp4 TEXT,
          criado_em TEXT NOT NULL,
          atualizado_em TEXT NOT NULL
        );

        CREATE TABLE job (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          video_id INTEGER NOT NULL REFERENCES video(id),
          estado TEXT NOT NULL CHECK (estado IN (
            'pendente', 'em_execucao', 'concluido', 'falhou'
          )),
          tentativas INTEGER NOT NULL DEFAULT 0,
          erro TEXT,
          criado_em TEXT NOT NULL,
          iniciado_em TEXT,
          terminado_em TEXT
        );

        CREATE TABLE rejeicao (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          video_id INTEGER NOT NULL REFERENCES video(id),
          motivo TEXT NOT NULL CHECK (motivo IN (
            'foto_ruim', 'texto_errado', 'ritmo', 'dado_errado', 'fundo'
          )),
          observacao TEXT,
          criado_em TEXT NOT NULL
        );

        CREATE TABLE ajuste (
          chave TEXT PRIMARY KEY,
          valor TEXT NOT NULL
        );
      `);
    },
  },
  {
    versao: 2,
    // Etapa 3 (fila + portão): o montador precisa persistir as escolhas do
    // cardápio e o texto do anúncio junto do vídeo para o worker poder
    // renderizar sem depender de nada em memória — se o processo cair entre
    // "escritor decidiu" e "render terminou", o job sobrevive no banco.
    // Colunas sempre opcionais (NULL até o escritor rodar) e sem CHECK novo
    // aqui: fundo/ritmo já são validados pelo cardápio fechado em código
    // (ver REGRAS-DE-NEGOCIO.md), não precisam de outro CHECK redundante.
    descricao: "colunas de cardápio e texto em video, para a fila de render",
    aplicar: (db) => {
      db.exec(`
        ALTER TABLE video ADD COLUMN titulo TEXT;
        ALTER TABLE video ADD COLUMN corpo TEXT;
        ALTER TABLE video ADD COLUMN fundo TEXT;
        ALTER TABLE video ADD COLUMN ritmo TEXT;
        ALTER TABLE video ADD COLUMN ordem_fotos_json TEXT;
      `);
    },
  },
  {
    versao: 3,
    // Um produto por origem_url. Bancos antigos já têm duplicata (cada rodada
    // relia o site e inseria de novo), então limpa antes de criar o índice:
    // fica a linha MAIS RECENTE (maior id) de cada URL. Vídeos das linhas
    // removidas são religados à que ficou (nada de vídeo/aprovação perdido,
    // e a chave estrangeira continua válida); fotos delas são apagadas.
    descricao: "produto.origem_url único (remove duplicatas antes)",
    aplicar: (db) => {
      const duplicadas = `
        SELECT p.id AS id, k.mantido AS mantido
        FROM produto p
        JOIN (SELECT origem_url, MAX(id) AS mantido FROM produto GROUP BY origem_url) k
          ON k.origem_url = p.origem_url
        WHERE p.id <> k.mantido`;
      db.exec(`
        UPDATE video SET produto_id =
          (SELECT d.mantido FROM (${duplicadas}) d WHERE d.id = video.produto_id)
        WHERE produto_id IN (SELECT id FROM (${duplicadas}));
        DELETE FROM foto WHERE produto_id IN (SELECT id FROM (${duplicadas}));
        DELETE FROM produto WHERE id IN (SELECT id FROM (${duplicadas}));
        DELETE FROM foto WHERE produto_id NOT IN (SELECT id FROM produto);
        CREATE UNIQUE INDEX idx_produto_origem_url ON produto(origem_url);
      `);
    },
  },
  {
    versao: 4,
    // Etapa 6 (publicação): contas por rede, legendas por rede e fila de
    // publicação. UNIQUE(video_id, rede) é a chave de idempotência: a mesma
    // publicação nunca tem duas linhas, logo nunca sai duas vezes.
    // Tokens ficam só em conta_rede e nenhuma consulta de API os devolve.
    descricao: "publicação: conta_rede, legenda_video e publicacao",
    aplicar: (db) => {
      db.exec(`
        CREATE TABLE conta_rede (
          rede TEXT PRIMARY KEY CHECK (rede IN ('instagram', 'facebook', 'tiktok')),
          conectada INTEGER NOT NULL DEFAULT 0,
          modo TEXT CHECK (modo IN ('seco', 'real')),
          conta_id TEXT,
          conta_nome TEXT,
          access_token TEXT,
          refresh_token TEXT,
          token_expira_em TEXT,
          refresh_expira_em TEXT,
          escopos_json TEXT NOT NULL DEFAULT '[]',
          aprovacao_plataforma INTEGER NOT NULL DEFAULT 0,
          atualizado_em TEXT NOT NULL
        );

        CREATE TABLE legenda_video (
          video_id INTEGER NOT NULL REFERENCES video(id),
          rede TEXT NOT NULL CHECK (rede IN ('instagram', 'facebook', 'tiktok')),
          texto TEXT NOT NULL,
          manual INTEGER NOT NULL DEFAULT 0,
          atualizado_em TEXT NOT NULL,
          PRIMARY KEY (video_id, rede)
        );

        CREATE TABLE publicacao (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          video_id INTEGER NOT NULL REFERENCES video(id),
          rede TEXT NOT NULL CHECK (rede IN ('instagram', 'facebook', 'tiktok')),
          estado TEXT NOT NULL CHECK (estado IN (
            'agendada', 'publicando', 'publicada', 'falhou', 'cancelada', 'verificar'
          )),
          agendada_para TEXT NOT NULL,
          visibilidade TEXT NOT NULL DEFAULT 'publica' CHECK (visibilidade IN ('publica', 'privada')),
          ia_gerado INTEGER NOT NULL DEFAULT 0,
          legenda TEXT,
          tentativas INTEGER NOT NULL DEFAULT 0,
          proxima_tentativa_em TEXT,
          erro TEXT,
          id_externo TEXT,
          simulado INTEGER NOT NULL DEFAULT 0,
          chave_idempotencia TEXT NOT NULL,
          criado_em TEXT NOT NULL,
          atualizado_em TEXT NOT NULL,
          publicada_em TEXT,
          UNIQUE (video_id, rede),
          UNIQUE (chave_idempotencia)
        );
        CREATE INDEX idx_publicacao_agenda ON publicacao(estado, agendada_para);
      `);
    },
  },
  {
    versao: 5,
    // Controles que evitam prejuízo: carro vendido no ar, preço desatualizado
    // e freio de mão. Só colunas novas, todas opcionais (as migrações v1..v4
    // seguem intocadas).
    // - produto: marca de "saiu do estoque" com contagem de leituras seguidas
    //   sem o carro. Nunca se apaga produto nem histórico.
    // - video.dados_snapshot_json: o dado que ENTROU no vídeo (gravado quando
    //   o render começa). É o "antes" da conferência de preço. Vídeos já
    //   renderizados recebem o snapshot só quando o produto não foi relido
    //   depois deles (aí o dado atual é exatamente o que está no vídeo);
    //   nos demais fica NULL e a conferência pede para refazer o vídeo.
    // - publicacao.conferencia_*: resultado da releitura antes de publicar.
    //   Sem CHECK de propósito: o estado de publicação (v4) não muda.
    descricao: "controles: saída do estoque, snapshot do vídeo e conferência de publicação",
    aplicar: (db) => {
      db.exec(`
        ALTER TABLE produto ADD COLUMN saiu_do_estoque_em TEXT;
        ALTER TABLE produto ADD COLUMN ausencias_seguidas INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE produto ADD COLUMN ultima_vista_em TEXT;
        ALTER TABLE produto ADD COLUMN saida_detalhe TEXT;

        ALTER TABLE video ADD COLUMN dados_snapshot_json TEXT;

        ALTER TABLE publicacao ADD COLUMN conferencia_estado TEXT;
        ALTER TABLE publicacao ADD COLUMN conferencia_em TEXT;
        ALTER TABLE publicacao ADD COLUMN conferencia_json TEXT;

        UPDATE video SET dados_snapshot_json =
          (SELECT p.dados_json FROM produto p
            WHERE p.id = video.produto_id AND p.lido_em <= video.atualizado_em)
        WHERE caminho_mp4 IS NOT NULL AND dados_snapshot_json IS NULL;
      `);
    },
  },
];

/** Cria a tabela de controle de versão, se não existir. */
function garantirTabelaVersao(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_version (
      versao INTEGER PRIMARY KEY,
      aplicada_em TEXT NOT NULL
    );
  `);
}

/** Aplica, em ordem, as migrações ainda não registradas. Idempotente. */
export function migrar(db: Database.Database, ateVersao = Infinity): void {
  garantirTabelaVersao(db);

  const jaAplicadas = new Set(
    db
      .prepare("SELECT versao FROM schema_version")
      .all()
      .map((linha) => (linha as { versao: number }).versao),
  );

  const registrar = db.prepare(
    "INSERT INTO schema_version (versao, aplicada_em) VALUES (?, ?)",
  );

  for (const migracao of MIGRACOES) {
    if (jaAplicadas.has(migracao.versao) || migracao.versao > ateVersao) continue;

    const transacao = db.transaction(() => {
      migracao.aplicar(db);
      registrar.run(migracao.versao, new Date().toISOString());
    });
    transacao();
  }
}
