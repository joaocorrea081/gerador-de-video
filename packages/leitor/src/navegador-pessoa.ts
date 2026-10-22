// Navegador por BrowserSkill: dirige o navegador REAL da pessoa (já logado,
// com a extensão BrowserSkill) pelo CLI `bsk`. Mesmo contrato do Playwright
// (`Navegador`): o leitor e os adaptadores não sabem qual dos dois usam.
//
// LIMITE HONESTO: isto só funciona com o navegador da pessoa ABERTO e a
// extensão conectada. NÃO roda sozinho de madrugada. Quando não dá, lança
// `NavegadorIndisponivelError` com o motivo — nunca finge que leu.
//
// RESPEITO AO SITE: dirigir o navegador da pessoa não é licença para varrer.
// robots.txt, intervalo e poucas páginas continuam valendo (leitor.ts/ritmo.ts).
//
// RESSALVA COMERCIAL: usar fotos de um site que não é do cliente (ex: revender
// por comissão) é decisão comercial e jurídica do João, não de código. O
// direito de uso das imagens se resolve em contrato — ver "Direito sobre as
// fotos" em REGRAS-DE-NEGOCIO.md. Este arquivo não muda por causa disso.

import { execFile, spawn } from "node:child_process";
import { exigirSemBloqueio } from "./bloqueio.js";
import type { Navegador } from "./navegador.js";

export interface SaidaBsk {
  codigo: number;
  saida: string;
  erro: string;
}
/** Executa `bsk <args>`. Trocável em teste para não depender do navegador aberto. */
export type ExecBsk = (args: string[], timeoutMs?: number) => Promise<SaidaBsk>;

export const execBskReal: ExecBsk = (args, timeoutMs = 90_000) =>
  new Promise((resolve) => {
    execFile("bsk", args, { maxBuffer: 128 * 1024 * 1024, timeout: timeoutMs, encoding: "utf8" }, (err, saida, erro) => {
      const codigo = err ? (typeof (err as { code?: unknown }).code === "number" ? (err as { code: number }).code : 1) : 0;
      const falhaAoLancar = err && (err as { code?: unknown }).code === "ENOENT" ? "bsk não encontrado no PATH" : "";
      resolve({ codigo, saida, erro: falhaAoLancar || erro });
    });
  });

export type MotivoIndisponivel = "bsk-ausente" | "daemon-parado" | "navegador-fechado" | "sessao-falhou";

export class NavegadorIndisponivelError extends Error {
  constructor(
    readonly motivo: MotivoIndisponivel,
    mensagem: string,
  ) {
    super(mensagem);
  }
}

export interface EstadoNavegadorPessoa {
  disponivel: boolean;
  motivo?: MotivoIndisponivel;
  /** Frase pronta para o painel. */
  mensagem: string;
}

const MENSAGEM_ABRIR = "Abra o navegador (Chrome com a extensão BrowserSkill) para ler este site.";

async function iniciarDaemon(): Promise<void> {
  const filho = spawn("bsk", ["daemon", "start", "--quiet"], { detached: true, stdio: "ignore" });
  filho.on("error", () => {});
  filho.unref();
}

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Diz se dá para usar o navegador da pessoa AGORA. Se o daemon estiver parado,
 * tenta subir (`bsk daemon start`). Nunca lança.
 */
export async function verificarNavegadorDaPessoa(
  exec: ExecBsk = execBskReal,
  opcoes: { subirDaemon?: boolean; esperaMs?: number } = {},
): Promise<EstadoNavegadorPessoa> {
  const subir = opcoes.subirDaemon ?? true;
  let st = await exec(["status", "--json"], 15_000);
  if (st.erro.includes("não encontrado") || st.erro.includes("ENOENT")) {
    return { disponivel: false, motivo: "bsk-ausente", mensagem: "O programa bsk (BrowserSkill) não está instalado nesta máquina." };
  }
  if (st.codigo !== 0) {
    if (subir) {
      await iniciarDaemon();
      const limite = Date.now() + (opcoes.esperaMs ?? 8000);
      while (Date.now() < limite && st.codigo !== 0) {
        await dormir(500);
        st = await exec(["status", "--json"], 15_000);
      }
    }
    if (st.codigo !== 0) {
      return {
        disponivel: false,
        motivo: "daemon-parado",
        mensagem: `O serviço do BrowserSkill não está de pé. Rode "bsk daemon start" e ${MENSAGEM_ABRIR.toLowerCase()}`,
      };
    }
  }
  const nav = await exec(["browsers", "--json"], 15_000);
  let lista: { unresponsive?: boolean }[] = [];
  try {
    lista = JSON.parse(nav.saida) as { unresponsive?: boolean }[];
  } catch {
    lista = [];
  }
  if (nav.codigo !== 0 || lista.filter((b) => !b.unresponsive).length === 0) {
    return { disponivel: false, motivo: "navegador-fechado", mensagem: MENSAGEM_ABRIR };
  }
  return { disponivel: true, mensagem: "Navegador da pessoa conectado." };
}

// Rolagem em passos, igual ao Playwright (navegador.ts): dispara o lazy load.
const SCRIPT_ROLAGEM = `(async () => {
  const altura = () => Math.max(document.body.scrollHeight || 0, document.documentElement.scrollHeight || 0);
  const total = altura();
  for (let y = 0; y < total; y += 600) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 200)); }
  window.scrollTo(0, 0);
  await new Promise(r => setTimeout(r, 400));
  return total;
})()`;

export async function abrirNavegadorDaPessoa(
  exec: ExecBsk = execBskReal,
): Promise<Navegador> {
  const estado = await verificarNavegadorDaPessoa(exec);
  if (!estado.disponivel) throw new NavegadorIndisponivelError(estado.motivo ?? "navegador-fechado", estado.mensagem);

  const ini = await exec(["session", "start", "--json", "--name", "leitor-gerador-de-video"], 30_000);
  let sessao: string;
  try {
    sessao = (JSON.parse(ini.saida) as { session_id: string }).session_id;
  } catch {
    throw new NavegadorIndisponivelError("sessao-falhou", `Não consegui abrir uma sessão no navegador. ${ini.erro}`.trim());
  }
  if (!sessao) throw new NavegadorIndisponivelError("sessao-falhou", "O BrowserSkill não devolveu uma sessão.");

  return {
    async abrirERolar(url: string): Promise<string> {
      const nav = await exec(["navigate", url, "--session", sessao, "--json", "--timeout", "45s"], 60_000);
      if (nav.codigo !== 0) {
        throw new Error(`bsk navigate falhou: ${(nav.erro || nav.saida).trim().slice(0, 300)}`);
      }
      let urlFinal: string | undefined;
      try {
        urlFinal = (JSON.parse(nav.saida) as { final_url?: string }).final_url;
      } catch {
        urlFinal = undefined;
      }
      await exec(["evaluate", SCRIPT_ROLAGEM, "--session", sessao, "--timeout", "60s"], 75_000);
      const h = await exec(["get-html", "--session", sessao], 60_000);
      if (h.codigo !== 0) throw new Error(`bsk get-html falhou: ${(h.erro || "sem detalhe").trim().slice(0, 300)}`);
      // O navegador da pessoa não informa o código HTTP: vale o resto dos sinais.
      const resposta = urlFinal === undefined ? { url, html: h.saida } : { url, urlFinal, html: h.saida };
      exigirSemBloqueio(resposta);
      return h.saida;
    },
    async fechar(): Promise<void> {
      await exec(["session", "stop", sessao], 15_000);
    },
  };
}
