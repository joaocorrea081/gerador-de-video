// Leitor de robots.txt: decide se uma URL pode ser buscada.
// Regra: regra mais específica (prefixo mais longo) ganha; Allow e Disallow
// competem pelo mesmo critério. Sem regra que bata, a busca é permitida.
// Só olhamos o grupo "User-agent: *" — é o único que existe nos sites alvo
// (ver ETAPA-4-CRITERIO.md) e é o grupo que qualquer robô genérico deve seguir.

interface Regra {
  tipo: "allow" | "disallow";
  prefixo: string;
}

export interface Robots {
  regras: readonly Regra[];
}

/** Interpreta o texto de um robots.txt, mantendo só o grupo `User-agent: *`. */
export function interpretarRobots(texto: string): Robots {
  const linhas = texto.split("\n").map((l) => l.replace(/#.*$/, "").trim());

  const regras: Regra[] = [];
  let dentroDoGrupoTodos = false;
  let grupoJaEncontrado = false;

  for (const linhaBruta of linhas) {
    if (linhaBruta === "") continue;
    const separador = linhaBruta.indexOf(":");
    if (separador === -1) continue;

    const campo = linhaBruta.slice(0, separador).trim().toLowerCase();
    const valor = linhaBruta.slice(separador + 1).trim();

    if (campo === "user-agent") {
      // Um novo bloco de "User-agent" encerra o anterior.
      dentroDoGrupoTodos = valor === "*";
      if (dentroDoGrupoTodos) grupoJaEncontrado = true;
      continue;
    }

    if (!dentroDoGrupoTodos) continue;

    if (campo === "allow") {
      regras.push({ tipo: "allow", prefixo: valor });
    } else if (campo === "disallow") {
      if (valor !== "") regras.push({ tipo: "disallow", prefixo: valor });
    }
  }

  // Sites sem bloco "*" explícito liberam tudo (comportamento padrão do protocolo).
  void grupoJaEncontrado;
  return { regras };
}

/** Decide se `caminho` (ex: "/Veiculos") pode ser buscado, segundo `robots`. */
export function podeBuscar(robots: Robots, caminho: string): boolean {
  let melhorTamanho = -1;
  let melhorTipo: "allow" | "disallow" = "allow";

  for (const regra of robots.regras) {
    if (!caminho.startsWith(regra.prefixo)) continue;
    if (regra.prefixo.length > melhorTamanho) {
      melhorTamanho = regra.prefixo.length;
      melhorTipo = regra.tipo;
    }
  }

  // Nenhuma regra bateu: permitido por padrão.
  if (melhorTamanho === -1) return true;
  return melhorTipo === "allow";
}

/** Busca e interpreta o robots.txt da origem de `baseUrl`. */
export async function buscarRobots(baseUrl: string): Promise<Robots> {
  const url = new URL("/robots.txt", baseUrl).toString();
  const resposta = await fetch(url);
  if (!resposta.ok) {
    // Sem robots.txt: tudo permitido (comportamento padrão do protocolo).
    return { regras: [] };
  }
  const texto = await resposta.text();
  return interpretarRobots(texto);
}

/**
 * Se `caminho` está proibido, devolve a regra que proíbe (ex: "Disallow: /Upload/");
 * se está permitido, devolve undefined. Mesmo critério de `podeBuscar`.
 */
export function regraQueProibe(robots: Robots, caminho: string): string | undefined {
  let melhorTamanho = -1;
  let melhor: Regra | undefined;
  for (const regra of robots.regras) {
    if (!caminho.startsWith(regra.prefixo)) continue;
    if (regra.prefixo.length > melhorTamanho) {
      melhorTamanho = regra.prefixo.length;
      melhor = regra;
    }
  }
  if (melhor?.tipo === "disallow") return `Disallow: ${melhor.prefixo}`;
  return undefined;
}
