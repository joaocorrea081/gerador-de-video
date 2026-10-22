// Escolha do modo de navegar, por site cadastrado:
//   playwright           (padrão) Chromium próprio; roda sozinho, agendado.
//   navegador-da-pessoa  BrowserSkill; exige o navegador da pessoa ABERTO.
//   automatico           tenta Playwright e cai para o navegador da pessoa
//                        só quando detecta bloqueio (e só se ele estiver aberto).

import { BloqueioError } from "./bloqueio.js";
import { abrirNavegador, type Navegador } from "./navegador.js";
import {
  abrirNavegadorDaPessoa,
  execBskReal,
  NavegadorIndisponivelError,
  type ExecBsk,
} from "./navegador-pessoa.js";

export const MODOS_NAVEGACAO = ["playwright", "navegador-da-pessoa", "automatico"] as const;
export type ModoNavegacao = (typeof MODOS_NAVEGACAO)[number];
export type CaminhoUsado = "playwright" | "navegador-da-pessoa";

export const ehModoNavegacao = (v: unknown): v is ModoNavegacao =>
  typeof v === "string" && (MODOS_NAVEGACAO as readonly string[]).includes(v);

/** Modos que NÃO rodam sozinhos: precisam do navegador da pessoa aberto. */
export const modoExigeNavegadorAberto = (m: ModoNavegacao): boolean => m === "navegador-da-pessoa";

/** Aviso para mostrar ao agendar rodada automática com um site neste modo. */
export function avisoDeAgendamento(modo: ModoNavegacao): string | undefined {
  if (modo === "navegador-da-pessoa") {
    return "Este site só é lido com o navegador da pessoa aberto. Ele NÃO roda sozinho de madrugada: rodadas agendadas vão pular este site.";
  }
  if (modo === "automatico") {
    return "Se este site bloquear o leitor, o plano B usa o navegador da pessoa, que precisa estar aberto. Sem ele, o site fica sem leitura naquela rodada.";
  }
  return undefined;
}

export interface NavegadorDeModo extends Navegador {
  /** Caminhos que de fato leram alguma página até agora. */
  caminhosUsados(): ReadonlySet<CaminhoUsado>;
}

export interface FabricasNavegador {
  playwright: () => Promise<Navegador>;
  pessoa: () => Promise<Navegador>;
}

/**
 * Monta o navegador do modo. As fábricas são injetáveis (testes). Abertura é
 * preguiçosa: no automático, o navegador da pessoa só abre se o bloqueio acontecer.
 */
export function navegadorDoModo(modo: ModoNavegacao, fabricas: FabricasNavegador): NavegadorDeModo {
  const usados = new Set<CaminhoUsado>();
  let pw: Navegador | undefined;
  let pessoa: Navegador | undefined;
  /** Origens onde o Playwright já foi bloqueado: não insiste (nem martela). */
  const bloqueadas = new Set<string>();

  const doPlaywright = async () => (pw ??= await fabricas.playwright());
  const daPessoa = async () => (pessoa ??= await fabricas.pessoa());

  return {
    caminhosUsados: () => usados,
    async abrirERolar(url: string): Promise<string> {
      const origem = new URL(url).origin;
      if (modo === "navegador-da-pessoa") {
        const html = await (await daPessoa()).abrirERolar(url);
        usados.add("navegador-da-pessoa");
        return html;
      }
      if (modo === "playwright" || !bloqueadas.has(origem)) {
        try {
          const html = await (await doPlaywright()).abrirERolar(url);
          usados.add("playwright");
          return html;
        } catch (e) {
          if (modo === "playwright" || !(e instanceof BloqueioError)) throw e;
          bloqueadas.add(origem); // automático: bloqueio -> plano B, sem tentar de novo
        }
      }
      // Plano B do modo automático. Pode lançar NavegadorIndisponivelError: é o estado claro.
      const html = await (await daPessoa()).abrirERolar(url);
      usados.add("navegador-da-pessoa");
      return html;
    },
    async fechar(): Promise<void> {
      await Promise.allSettled([pw?.fechar(), pessoa?.fechar()]);
    },
  };
}

/** Navegador real do modo (Playwright e/ou BrowserSkill via `bsk`). */
export function abrirNavegadorDoModo(modo: ModoNavegacao, exec: ExecBsk = execBskReal): NavegadorDeModo {
  return navegadorDoModo(modo, {
    playwright: () => abrirNavegador(),
    pessoa: () => abrirNavegadorDaPessoa(exec),
  });
}

export { NavegadorIndisponivelError };
