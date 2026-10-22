// Provedores de rede: uma interface, duas implementações por rede.
//  - Reais: chamadas HTTP às APIs, conforme PUBLICACAO.md.
//  - Falsos (modo seco): mesmas respostas e MESMOS erros (limite, falha
//    temporária, token inválido). Trocar um pelo outro é configuração.
// Segredo: tokens entram só pelo construtor e nunca em mensagem de erro.

import type { Rede, TokensRenovados } from "@gerador/core";

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export type CodigoErroRede = "temporario" | "limite" | "autenticacao" | "recusado" | "configuracao";

/** Erro padronizado de rede. `transitorio` decide se vale tentar de novo com espera. */
export class ErroRede extends Error {
  constructor(
    mensagem: string,
    readonly codigo: CodigoErroRede,
    readonly transitorio: boolean,
  ) {
    super(mensagem);
  }
}

export interface PedidoPublicacao {
  chaveIdempotencia: string;
  caminhoArquivo: string;
  /** URL pública do vídeo (Instagram e TikTok PULL_FROM_URL exigem). */
  urlMidia: string | null;
  legenda: string;
  /** Rótulo de conteúdo gerado por IA: sempre explícito, vai na requisição. */
  iaGerado: boolean;
  visibilidade: "publica" | "privada";
}

export interface ResultadoPublicacao {
  idExterno: string;
  simulado: boolean;
}

export interface LimiteConsultado {
  usado: number;
  total: number;
}

export interface ProvedorRede {
  readonly rede: Rede;
  readonly simulado: boolean;
  /** null = a rede não tem consulta; vale a contagem local com limite fixo. */
  consultarLimite(chaveEmCurso?: string): Promise<LimiteConsultado | null>;
  /** Renova o token. A resposta DEVE ser gravada por quem chama (rotação). */
  renovarToken(): Promise<TokensRenovados>;
  publicar(pedido: PedidoPublicacao): Promise<ResultadoPublicacao>;
}

// ------------------------------------------------------------- modo seco

export interface OpcoesFalso {
  /** Quantas publicações a rede considera usadas nas últimas 24h (vem do banco). */
  usadoNas24h(excluirChave?: string): number;
  /** Devolve um defeito a simular nesta chamada (e consome), ou null. */
  consumirFalha(): "temporario" | "autenticacao" | null;
  limiteTotal: number | null;
  agora(): Date;
  /** Chaves já publicadas: o falso também recusa duplicata, como a rede faria. */
  jaPublicada(chave: string): boolean;
  tokenAtual?: () => { refreshToken: string | null };
}

let contadorRotacao = 0;

export class ProvedorFalso implements ProvedorRede {
  readonly simulado = true;
  constructor(
    readonly rede: Rede,
    private readonly o: OpcoesFalso,
  ) {}

  async consultarLimite(chaveEmCurso?: string): Promise<LimiteConsultado | null> {
    if (this.o.limiteTotal === null) return null;
    return { usado: this.o.usadoNas24h(chaveEmCurso), total: this.o.limiteTotal };
  }

  async renovarToken(): Promise<TokensRenovados> {
    contadorRotacao += 1;
    const agora = this.o.agora().getTime();
    return {
      accessToken: `seco-acesso-${contadorRotacao}`,
      refreshToken: `seco-refresh-${contadorRotacao}`,
      expiraEm: new Date(agora + 24 * 3_600_000).toISOString(),
      refreshExpiraEm: new Date(agora + 365 * 24 * 3_600_000).toISOString(),
    };
  }

  async publicar(p: PedidoPublicacao): Promise<ResultadoPublicacao> {
    const falha = this.o.consumirFalha();
    if (falha === "temporario") throw new ErroRede("A rede está temporariamente indisponível (simulado).", "temporario", true);
    if (falha === "autenticacao") throw new ErroRede("A rede recusou o token (simulado).", "autenticacao", false);
    const lim = await this.consultarLimite(p.chaveIdempotencia);
    if (lim && lim.usado >= lim.total) {
      throw new ErroRede(`Limite diário da rede atingido: ${lim.usado} de ${lim.total} (simulado).`, "limite", true);
    }
    if (this.o.jaPublicada(p.chaveIdempotencia)) {
      throw new ErroRede("Publicação duplicada recusada (simulado).", "recusado", false);
    }
    // Eco dos campos que a API real exigiria, para o teste provar que vão na requisição.
    return { idExterno: `seco-${this.rede}-${p.chaveIdempotencia}`, simulado: true };
  }
}

// ------------------------------------------------------------ utilidades

const VERSAO_GRAPH = "v25.0";
const BASE_GRAPH = `https://graph.facebook.com/${VERSAO_GRAPH}`;

async function lerJson(r: Response): Promise<Record<string, any>> {
  const t = await r.text();
  try { return t ? (JSON.parse(t) as Record<string, any>) : {}; } catch { return {}; }
}

/** Erro da Graph API (Meta) -> ErroRede. Nunca ecoa o corpo cru (pode ter token). */
export function erroDaMeta(status: number, corpo: Record<string, any>, quem: string): ErroRede {
  const e = (corpo["error"] ?? {}) as { code?: number; is_transient?: boolean; message?: string };
  const cod = e.code;
  if (cod === 190 || status === 401) return new ErroRede(`${quem}: token recusado ou expirado — reconecte a conta.`, "autenticacao", false);
  if (cod === 4 || cod === 17 || cod === 32 || cod === 613) return new ErroRede(`${quem}: limite de uso da API atingido.`, "limite", true);
  if (status >= 500 || e.is_transient === true || cod === 1 || cod === 2) {
    return new ErroRede(`${quem}: serviço temporariamente indisponível (HTTP ${status}).`, "temporario", true);
  }
  return new ErroRede(`${quem}: pedido recusado (HTTP ${status}${cod ? `, código ${cod}` : ""}).`, "recusado", false);
}

function exigirUrl(p: PedidoPublicacao, quem: string): string {
  if (!p.urlMidia) {
    throw new ErroRede(`${quem} exige o vídeo numa URL pública. Configure publicacao.url_publica (ou GERADOR_URL_PUBLICA).`, "configuracao", false);
  }
  return p.urlMidia;
}

async function pedir(f: FetchLike, url: string, init: RequestInit, quem: string): Promise<{ status: number; corpo: Record<string, any> }> {
  let r: Response;
  try {
    r = await f(url, init);
  } catch {
    throw new ErroRede(`${quem}: sem resposta da rede.`, "temporario", true);
  }
  const corpo = await lerJson(r);
  if (!r.ok) throw erroDaMeta(r.status, corpo, quem);
  return { status: r.status, corpo };
}

const dormir = (ms: number) => new Promise<void>((res) => setTimeout(res, ms));

// -------------------------------------------------------------- Instagram

export class InstagramReal implements ProvedorRede {
  readonly rede = "instagram" as const;
  readonly simulado = false;
  constructor(
    private readonly c: { contaId: string; token: string },
    private readonly f: FetchLike = fetch,
    private readonly esperarMs = 3000,
  ) {}

  async consultarLimite(): Promise<LimiteConsultado | null> {
    const u = `${BASE_GRAPH}/${this.c.contaId}/content_publishing_limit?fields=config,quota_usage&access_token=${encodeURIComponent(this.c.token)}`;
    const { corpo } = await pedir(this.f, u, { method: "GET" }, "Instagram");
    const d = (corpo["data"] as any[] | undefined)?.[0];
    const total = Number(d?.config?.quota_total);
    const usado = Number(d?.quota_usage);
    if (!Number.isFinite(total) || !Number.isFinite(usado)) {
      throw new ErroRede("Instagram: não consegui ler o limite diário; por segurança não publico.", "temporario", true);
    }
    return { usado, total };
  }

  async renovarToken(): Promise<TokensRenovados> {
    // Token de longa duração do Instagram: GET /refresh_access_token (grant ig_refresh_token).
    const u = `https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=${encodeURIComponent(this.c.token)}`;
    const { corpo } = await pedir(this.f, u, { method: "GET" }, "Instagram");
    const novo = corpo["access_token"];
    if (typeof novo !== "string") throw new ErroRede("Instagram: renovação sem token novo.", "recusado", false);
    return { accessToken: novo, expiraEm: new Date(Date.now() + Number(corpo["expires_in"] ?? 0) * 1000).toISOString() };
  }

  async publicar(p: PedidoPublicacao): Promise<ResultadoPublicacao> {
    const url = exigirUrl(p, "Instagram");
    const form = (o: Record<string, string>) => ({
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ ...o, access_token: this.c.token }).toString(),
    });
    // 1) container
    const cont = await pedir(this.f, `${BASE_GRAPH}/${this.c.contaId}/media`, form({
      media_type: "REELS", video_url: url, caption: p.legenda, share_to_feed: "true", is_ai_generated: String(p.iaGerado),
    }), "Instagram");
    const idContainer = String(cont.corpo["id"] ?? "");
    if (!idContainer) throw new ErroRede("Instagram: container sem id.", "recusado", false);
    // 2) espera o processamento
    for (let i = 0; ; i++) {
      const st = await pedir(this.f, `${BASE_GRAPH}/${idContainer}?fields=status_code&access_token=${encodeURIComponent(this.c.token)}`, { method: "GET" }, "Instagram");
      const codigo = st.corpo["status_code"];
      if (codigo === "FINISHED") break;
      if (codigo === "ERROR" || codigo === "EXPIRED") throw new ErroRede(`Instagram: o processamento do vídeo terminou em ${codigo}.`, "recusado", false);
      if (i >= 40) throw new ErroRede("Instagram: o vídeo demorou demais para processar.", "temporario", true);
      await dormir(this.esperarMs);
    }
    // 3) publica
    const pub = await pedir(this.f, `${BASE_GRAPH}/${this.c.contaId}/media_publish`, form({ creation_id: idContainer }), "Instagram");
    return { idExterno: String(pub.corpo["id"] ?? idContainer), simulado: false };
  }
}

// --------------------------------------------------------------- Facebook

export class FacebookReal implements ProvedorRede {
  readonly rede = "facebook" as const;
  readonly simulado = false;
  constructor(
    private readonly c: { paginaId: string; token: string },
    private readonly f: FetchLike = fetch,
  ) {}

  async consultarLimite(): Promise<LimiteConsultado | null> {
    return null; // 30 por 24h é regra fixa; a contagem é local.
  }

  async renovarToken(): Promise<TokensRenovados> {
    // Token de Página: o caminho para rodar sempre é System User token (não expira); não há refresh.
    throw new ErroRede("Facebook: token de Página não renova por refresh. Use um System User token.", "configuracao", false);
  }

  async publicar(p: PedidoPublicacao): Promise<ResultadoPublicacao> {
    const url = exigirUrl(p, "Facebook");
    const aresta = `${BASE_GRAPH}/${this.c.paginaId}/video_reels`;
    const json = { "content-type": "application/json" };
    // 1) START
    const ini = await pedir(this.f, aresta, { method: "POST", headers: json, body: JSON.stringify({ upload_phase: "start", access_token: this.c.token }) }, "Facebook");
    const videoId = String(ini.corpo["video_id"] ?? "");
    const uploadUrl = String(ini.corpo["upload_url"] ?? "");
    if (!videoId || !uploadUrl) throw new ErroRede("Facebook: START sem video_id/upload_url.", "recusado", false);
    // 2) upload (vídeo hospedado: a rede busca pela URL pública)
    await pedir(this.f, uploadUrl, { method: "POST", headers: { Authorization: `OAuth ${this.c.token}`, file_url: url } }, "Facebook");
    // 3) FINISH
    await pedir(this.f, aresta, {
      method: "POST", headers: json,
      body: JSON.stringify({
        upload_phase: "finish", video_id: videoId, video_state: "PUBLISHED", description: p.legenda,
        is_ai_generated: p.iaGerado, access_token: this.c.token,
      }),
    }, "Facebook");
    return { idExterno: videoId, simulado: false };
  }
}

// ----------------------------------------------------------------- TikTok

export class TikTokReal implements ProvedorRede {
  readonly rede = "tiktok" as const;
  readonly simulado = false;
  constructor(
    private readonly c: { token: string; refreshToken: string | null; clientKey: string | undefined; clientSecret: string | undefined },
    private readonly f: FetchLike = fetch,
  ) {}

  async consultarLimite(): Promise<LimiteConsultado | null> {
    return null;
  }

  async renovarToken(): Promise<TokensRenovados> {
    if (!this.c.refreshToken || !this.c.clientKey || !this.c.clientSecret) {
      throw new ErroRede("TikTok: faltam refresh token, TIKTOK_CLIENT_KEY ou TIKTOK_CLIENT_SECRET para renovar.", "configuracao", false);
    }
    let r: Response;
    try {
      r = await this.f("https://open.tiktokapis.com/v2/oauth/token/", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_key: this.c.clientKey, client_secret: this.c.clientSecret,
          grant_type: "refresh_token", refresh_token: this.c.refreshToken,
        }).toString(),
      });
    } catch {
      throw new ErroRede("TikTok: sem resposta ao renovar o token.", "temporario", true);
    }
    const j = await lerJson(r);
    if (!r.ok || typeof j["access_token"] !== "string") {
      throw new ErroRede(`TikTok: renovação recusada (HTTP ${r.status}) — reconecte a conta.`, r.status >= 500 ? "temporario" : "autenticacao", r.status >= 500);
    }
    const agora = Date.now();
    return {
      accessToken: j["access_token"],
      // O TikTok PODE rotacionar o refresh: o novo vem aqui e quem chama grava.
      refreshToken: typeof j["refresh_token"] === "string" ? j["refresh_token"] : undefined,
      expiraEm: new Date(agora + Number(j["expires_in"] ?? 0) * 1000).toISOString(),
      refreshExpiraEm: j["refresh_expires_in"] ? new Date(agora + Number(j["refresh_expires_in"]) * 1000).toISOString() : undefined,
    };
  }

  async publicar(p: PedidoPublicacao): Promise<ResultadoPublicacao> {
    const url = exigirUrl(p, "TikTok");
    const cab = { "content-type": "application/json; charset=UTF-8", Authorization: `Bearer ${this.c.token}` };
    const r = await this.f("https://open.tiktokapis.com/v2/post/publish/video/init/", {
      method: "POST", headers: cab,
      body: JSON.stringify({
        post_info: {
          title: p.legenda,
          privacy_level: p.visibilidade === "publica" ? "PUBLIC_TO_EVERYONE" : "SELF_ONLY",
          is_aigc: p.iaGerado,
        },
        source_info: { source: "PULL_FROM_URL", video_url: url },
      }),
    }).catch(() => { throw new ErroRede("TikTok: sem resposta da rede.", "temporario", true); });
    const j = await lerJson(r);
    const codigo = String((j["error"] as { code?: string } | undefined)?.code ?? "ok");
    if (!r.ok || codigo !== "ok") {
      if (r.status >= 500) throw new ErroRede(`TikTok: indisponível (HTTP ${r.status}).`, "temporario", true);
      if (r.status === 429 || codigo === "rate_limit_exceeded") throw new ErroRede("TikTok: limite de uso atingido.", "limite", true);
      if (r.status === 401 || codigo === "access_token_invalid") throw new ErroRede("TikTok: token recusado — reconecte a conta.", "autenticacao", false);
      if (codigo === "unaudited_client_can_only_post_to_private_accounts") {
        throw new ErroRede("TikTok: app sem auditoria só publica em conta privada, com visibilidade privada.", "recusado", false);
      }
      throw new ErroRede(`TikTok: pedido recusado (código ${codigo}).`, "recusado", false);
    }
    return { idExterno: String((j["data"] as { publish_id?: string } | undefined)?.publish_id ?? ""), simulado: false };
  }
}
