// Descobrir se um site dá para ler e provar com dado de verdade: é o que está
// por trás do botão "Testar site" do painel.
// Regras: respeita robots.txt (recusa dizendo a regra), respeita o intervalo
// entre requisições (>= 2s) e NÃO varre o site: 1 a 3 carros bastam.
// Nunca diz "dá para ler" sem ter lido uma ficha com dado de verdade.

import type { Adaptador, FichaLida } from "./adaptador.js";
import { adaptadorPorNome, identificarPlataforma, type NomeAdaptador } from "./adaptadores/registro.js";
import { descobrirUrlListagem } from "./adaptadores/jsonld.js";
import { BloqueioError, DESCRICAO_SINAL, type SinalBloqueio } from "./bloqueio.js";
import type { Navegador } from "./navegador.js";
import { abrirNavegadorDoModo, type CaminhoUsado, type ModoNavegacao } from "./navegador-modos.js";
import { NavegadorIndisponivelError } from "./navegador-pessoa.js";
import { Ritmo, INTERVALO_PADRAO_MS } from "./ritmo.js";
import { buscarRobots, regraQueProibe, type Robots } from "./robots.js";

export type SituacaoSite =
  | "legivel-autocerto" // plataforma AutoCerto reconhecida e ficha lida
  | "legivel-jsonld" // JSON-LD de Vehicle/Car lido
  | "precisa-seletor" // parece ter carros, mas sem JSON-LD: precisa de adaptador específico
  | "recusado-robots" // robots.txt proíbe
  | "ilegivel" // não achei carro nenhum
  | "bloqueado" // o site barrou o leitor (403, Cloudflare, captcha, login, página vazia)
  | "navegador-indisponivel" // modo exige o navegador da pessoa e ele não está aberto
  | "erro-rede"; // não consegui nem abrir

export interface FichaDeAmostra {
  url: string;
  ficha: FichaLida;
}

export interface ResultadoTeste {
  /** true só se pelo menos uma ficha com dado de verdade foi lida. */
  legivel: boolean;
  situacao: SituacaoSite;
  /** Frase pronta para mostrar na tela, em português. */
  mensagem: string;
  /** Adaptador que leu a amostra. Ausente quando não deu para ler. */
  adaptador?: NomeAdaptador;
  /** Endereço normalizado que foi testado. */
  url: string;
  urlListagem?: string;
  /** Links de carro achados na listagem (não verificados um a um; só a amostra foi lida). */
  carrosNaListagem: number;
  /** 1 a 3 fichas realmente lidas. */
  amostra: FichaDeAmostra[];
  avisos: string[];
  /** Quando recusado: a regra do robots.txt que proibiu (ex: "Disallow: /"). */
  regraRobots?: string;
  /** Quando bloqueado: qual sinal apareceu. */
  sinalBloqueio?: SinalBloqueio;
  /** Caminho que de fato leu as páginas (útil no modo automático). */
  caminho?: CaminhoUsado;
}

export interface OpcoesTeste {
  /** Navegador já aberto (testes injetam um falso). Sem ele, abre e fecha o Chromium. */
  navegador?: Navegador;
  intervaloMs?: number;
  /** Quantas fichas ler, de 1 a 3. Padrão 3. */
  maxFichas?: number;
  /** Como navegar quando `navegador` não é passado. Padrão "playwright". */
  modo?: ModoNavegacao;
  /** Troca a busca do robots.txt (testes). */
  buscarRobots?: (url: string) => Promise<Robots>;
}

export class EnderecoInvalidoError extends Error {}

/** "rota66bh.com.br" -> "https://rota66bh.com.br". Só http/https. */
export function normalizarEndereco(entrada: string): string {
  const bruto = entrada.trim();
  if (bruto === "") throw new EnderecoInvalidoError("Digite o endereço do site.");
  const comEsquema = /^[a-z][a-z0-9+.-]*:\/\//i.test(bruto) ? bruto : `https://${bruto}`;
  let u: URL;
  try {
    u = new URL(comEsquema);
  } catch {
    throw new EnderecoInvalidoError(`Endereço inválido: ${entrada}`);
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    throw new EnderecoInvalidoError("Só endereços http ou https.");
  }
  if (!u.hostname.includes(".") && u.hostname !== "localhost") {
    throw new EnderecoInvalidoError(`Endereço inválido: ${entrada}`);
  }
  u.hash = "";
  const texto = u.toString();
  return u.pathname === "/" && u.search === "" ? texto.replace(/\/$/, "") : texto;
}

export function fichaTemDado(f: FichaLida): boolean {
  return (
    f.marca !== undefined ||
    f.modelo !== undefined ||
    f.ano !== undefined ||
    f.km !== undefined ||
    f.preco !== undefined
  );
}

/** Bloqueio e navegador indisponível encerram a sondagem na hora. */
const ehFatal = (e: unknown): boolean => e instanceof BloqueioError || e instanceof NavegadorIndisponivelError;

class Recusa extends Error {
  constructor(
    readonly url: string,
    readonly regra: string,
  ) {
    super(`robots.txt proíbe ${url}: ${regra}`);
  }
}

const rotulos: [keyof FichaLida, string][] = [
  ["preco", "preço"],
  ["ano", "ano"],
  ["km", "km"],
];

/**
 * Sonda o site: detecta o adaptador e lê uma amostra de fichas. Usado por
 * `detectarAdaptador` (1 ficha) e `testarSite` (até 3).
 */
async function sondar(entrada: string, opcoes: OpcoesTeste, maxFichas: number): Promise<ResultadoTeste> {
  let url: string;
  try {
    url = normalizarEndereco(entrada);
  } catch (e) {
    return resultadoVazio(entrada, "ilegivel", (e as Error).message);
  }

  const dono = opcoes.navegador === undefined;
  const navegador = opcoes.navegador ?? abrirNavegadorDoModo(opcoes.modo ?? "playwright");
  try {
    const r = await sondarCom(url, navegador, opcoes, maxFichas);
    const usados = (navegador as { caminhosUsados?: () => ReadonlySet<CaminhoUsado> }).caminhosUsados?.();
    // Se mais de um caminho leu, o último a entrar é o plano B.
    const caminho = usados ? [...usados].pop() : undefined;
    return caminho ? { ...r, caminho } : r;
  } catch (e) {
    return resultadoDeFalha(url, e);
  } finally {
    if (dono) await navegador.fechar();
  }
}

/** Bloqueio e navegador indisponível viram diagnóstico, não exceção. */
function resultadoDeFalha(url: string, e: unknown): ResultadoTeste {
  if (e instanceof BloqueioError) {
    return {
      ...resultadoVazio(
        url,
        "bloqueado",
        `O site barrou o leitor: ${DESCRICAO_SINAL[e.sinal]} (${e.url}). Parei e não insisti.`,
      ),
      sinalBloqueio: e.sinal,
    };
  }
  if (e instanceof NavegadorIndisponivelError) {
    return resultadoVazio(url, "navegador-indisponivel", e.message);
  }
  throw e;
}

function resultadoVazio(url: string, situacao: SituacaoSite, mensagem: string): ResultadoTeste {
  return { legivel: false, situacao, mensagem, url, carrosNaListagem: 0, amostra: [], avisos: [] };
}

async function sondarCom(
  url: string,
  navegador: Navegador,
  opcoes: OpcoesTeste,
  maxFichas: number,
): Promise<ResultadoTeste> {
  const ritmo = new Ritmo(opcoes.intervaloMs ?? INTERVALO_PADRAO_MS);
  const avisos: string[] = [];

  let robots: Robots;
  try {
    robots = await (opcoes.buscarRobots ?? buscarRobots)(url);
  } catch (e) {
    return { ...resultadoVazio(url, "erro-rede", `Não consegui nem abrir o site: ${(e as Error).message}`), avisos };
  }

  const buscar = async (alvo: string): Promise<string> => {
    const regra = regraQueProibe(robots, new URL(alvo).pathname);
    if (regra) throw new Recusa(alvo, regra);
    await ritmo.esperar();
    return navegador.abrirERolar(alvo);
  };

  let urlListagem = url;
  let adaptador: Adaptador = adaptadorPorNome("jsonld");
  let nomeAdaptador: NomeAdaptador = "jsonld";
  let plataforma: NomeAdaptador | undefined;
  let candidatos: string[] = [];
  const amostra: FichaDeAmostra[] = [];

  try {
    let html: string;
    try {
      html = await buscar(url);
    } catch (e) {
      if (e instanceof Recusa || ehFatal(e)) throw e;
      return { ...resultadoVazio(url, "erro-rede", `Não consegui abrir ${url}: ${(e as Error).message}`), avisos };
    }

    plataforma = identificarPlataforma(html);
    if (plataforma) {
      nomeAdaptador = plataforma;
      adaptador = adaptadorPorNome(plataforma);
    }
    candidatos = adaptador.extrairUrlsDetalhe(html, url);

    // Plataforma conhecida: a listagem de verdade tem a convenção dela (ex: /Veiculos).
    // A home só mostra os destaques, então o total só se sabe lá.
    if (plataforma) {
      const lista = adaptador.urlListagem(url);
      if (lista !== url) {
        try {
          const htmlLista = await buscar(lista);
          urlListagem = lista;
          candidatos = adaptador.extrairUrlsDetalhe(htmlLista, lista);
        } catch (e) {
          if (e instanceof Recusa || ehFatal(e)) throw e;
          avisos.push(`Não consegui abrir a listagem ${lista}; usei os destaques da página inicial.`);
        }
      }
    }

    if (candidatos.length === 0) {
      const ficha = adaptador.extrairFicha(html, url);
      if (fichaTemDado(ficha)) {
        // A pessoa colou o endereço de um carro só.
        amostra.push({ url, ficha });
        candidatos = [url];
      } else {
        // Uma página a mais, no máximo: a listagem do estoque.
        const proxima = plataforma ? adaptador.urlListagem(url) : descobrirUrlListagem(html, url);
        if (proxima && proxima !== url) {
          try {
            const htmlLista = await buscar(proxima);
            urlListagem = proxima;
            candidatos = adaptador.extrairUrlsDetalhe(htmlLista, proxima);
          } catch (e) {
            if (ehFatal(e)) throw e;
            if (e instanceof Recusa) {
              avisos.push(`A listagem ${e.url} foi pulada: ${e.regra}`);
              if (candidatos.length === 0 && amostra.length === 0) throw e;
            } else {
              avisos.push(`Não consegui abrir a listagem ${proxima}: ${(e as Error).message}`);
            }
          }
        }
      }
    }

    // Lê poucas fichas: confirma cada candidato; os que não têm dado são descartados.
    const limiteTentativas = maxFichas + 2;
    let tentativas = 0;
    for (const alvo of candidatos) {
      if (amostra.length >= maxFichas || tentativas >= limiteTentativas) break;
      if (amostra.some((a) => a.url === alvo)) continue;
      tentativas += 1;
      try {
        const htmlDetalhe = await buscar(alvo);
        const ficha = adaptador.extrairFicha(htmlDetalhe, alvo);
        if (fichaTemDado(ficha)) amostra.push({ url: alvo, ficha });
        else avisos.push(`Sem dado de veículo em ${alvo}.`);
      } catch (e) {
        if (ehFatal(e)) {
          // Bloqueio no meio da amostra: para, não insiste. Fica o que já foi lido.
          if (amostra.length === 0) throw e;
          avisos.push((e as Error).message);
          break;
        }
        avisos.push(
          e instanceof Recusa ? `Pulei ${alvo}: ${e.regra}` : `Não consegui abrir ${alvo}: ${(e as Error).message}`,
        );
      }
    }
  } catch (e) {
    if (e instanceof Recusa) {
      return {
        ...resultadoVazio(
          url,
          "recusado-robots",
          `O robots.txt deste site proíbe ler ${e.url} (regra "${e.regra}"). Não vou ler.`,
        ),
        regraRobots: e.regra,
        avisos,
      };
    }
    throw e;
  }

  for (const { url: u, ficha } of amostra) {
    const faltando = rotulos.filter(([campo]) => ficha[campo] === undefined).map(([, nome]) => nome);
    if (faltando.length > 0) avisos.push(`Ficha sem ${faltando.join(", ")}: ${u}`);
  }

  const base = { url, urlListagem, carrosNaListagem: candidatos.length, amostra, avisos };

  if (amostra.length > 0) {
    const como = plataforma ? "pela plataforma AutoCerto" : "por JSON-LD";
    return {
      ...base,
      legivel: true,
      situacao: plataforma ? "legivel-autocerto" : "legivel-jsonld",
      adaptador: nomeAdaptador,
      mensagem: `Dá para ler, ${como}. Achei ${candidatos.length} carro(s) na listagem e li ${amostra.length} ficha(s) de verdade.`,
    };
  }
  if (candidatos.length > 0) {
    return {
      ...base,
      legivel: false,
      situacao: "precisa-seletor",
      mensagem:
        `Achei ${candidatos.length} link(s) que parecem carros, mas as páginas não trazem dado de veículo em JSON-LD. ` +
        "Só daria para ler com um seletor específico deste site, que ainda não existe.",
    };
  }
  return {
    ...base,
    legivel: false,
    situacao: "ilegivel",
    mensagem: "Não consegui ler esta página: não achei carros nem dado de veículo nela.",
  };
}

/** Descobre sozinho se dá para ler e com qual adaptador. Lê só 1 ficha de prova. */
export function detectarAdaptador(url: string, opcoes: OpcoesTeste = {}): Promise<ResultadoTeste> {
  return sondar(url, opcoes, 1);
}

/** Botão "Testar site": quantos carros achou, 1 a 3 fichas lidas e os avisos. */
export function testarSite(url: string, opcoes: OpcoesTeste = {}): Promise<ResultadoTeste> {
  const max = Math.min(3, Math.max(1, Math.floor(opcoes.maxFichas ?? 3)));
  return sondar(url, opcoes, max);
}
