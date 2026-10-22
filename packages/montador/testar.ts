// Script de prova para a Etapa 1 — não faz parte da API do pacote.
// Roda com: npx tsx packages/montador/testar.ts <args>
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import type { CardapioVideo, FundoEscolha, RitmoEscolha, VideoCarroProps } from "@gerador/core";
import type { VideoCarroPropsMontador } from "./src/variantes.js";
import { renderizarVideo } from "./src/renderizar.js";

const RAIZ = import.meta.dirname ? join(import.meta.dirname, "../..") : process.cwd();
const PASTA_COMPASS = join(RAIZ, "ativos-teste", "compass");
const PASTA_OUT = join(RAIZ, "out");
mkdirSync(PASTA_OUT, { recursive: true });

function medidasConhecidas() {
  // As 8 fotos de teste são todas 1024x768 (confirmado no ETAPA-1-CRITERIO.md).
  return { largura: 1024, altura: 768 };
}

function fotos(qtd: number) {
  const { largura, altura } = medidasConhecidas();
  return Array.from({ length: qtd }, (_, i) => ({
    caminho: join(PASTA_COMPASS, `${i + 1}.jpg`),
    largura,
    altura,
  }));
}

const DADOS = {
  marca: "JEEP",
  modelo: "COMPASS 2.0 16V FLEX SPORT AUTOMÁTICO",
  ano: 2021,
  km: 48000,
  preco: 89900,
  revenda: "Rota 66 BH",
};

async function main() {
  const [modo, ...resto] = process.argv.slice(2);

  if (modo === "variantes") {
    mkdirSync(join(PASTA_OUT, "variantes"), { recursive: true });
    for (const variante of ["cheia", "nitida"] as const) {
      const saida = join(PASTA_OUT, "variantes", `compass-${variante}.mp4`);
      const props: VideoCarroPropsMontador = {
        dados: {
          marca: "JEEP",
          modelo: "COMPASS 2.0 16V FLEX SPORT AUTOMÁTICO",
          ano: 2021,
          km: 42000,
          preco: 119900,
          revenda: "Rota 66",
        },
        fotos: fotos(8),
        cardapio: { fundo: (resto[0] ?? "escuro") as FundoEscolha, ritmo: "calmo" },
        anuncio: {
          corpo:
            "Compass Sport automático, único dono e revisões em dia. Interior conservado, ar-condicionado digital e central multimídia. Venha conhecer e fazer um test drive.",
        },
        variante,
      };
      console.log(`Renderizando variante ${variante} -> ${saida}`);
      const t0 = Date.now();
      await renderizarVideo(props, saida);
      console.log(`OK ${variante} em ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    }
    return;
  }

  if (modo === "modelos") {
    // Amostra comparavel: mesma foto, mesmos dados. Uso: modelos <nome1> <nome2> ...
    mkdirSync(join(PASTA_OUT, "modelos"), { recursive: true });
    const base = { fundo: "escuro", ritmo: "calmo" } as const;
    const AMOSTRAS: Record<string, CardapioVideo> = {
      "modelo-institucional": { ...base, enquadramento: "nitida", modelo: "institucional", cor: "ambar" },
      "modelo-energico": { ...base, enquadramento: "nitida", modelo: "energico", cor: "ambar" },
      "modelo-numeros": { ...base, enquadramento: "nitida", modelo: "numeros", cor: "ambar" },
      "modelo-editorial": { ...base, enquadramento: "nitida", modelo: "editorial", cor: "ambar" },
      "cor-azul": { ...base, enquadramento: "nitida", modelo: "institucional", cor: "azul" },
      "cor-vermelho": { ...base, enquadramento: "nitida", modelo: "institucional", cor: "vermelho" },
      "cor-automatica": { ...base, enquadramento: "nitida", modelo: "institucional", cor: "automatica" },
      "extra-editorial-cheia-claro": { fundo: "claro", ritmo: "rapido", enquadramento: "cheia", modelo: "editorial", cor: "roxo" },
      "extra-numeros-cheia-gradiente": { fundo: "gradiente", ritmo: "calmo", enquadramento: "cheia", modelo: "numeros", cor: "verde" },
      "extra-energico-cheia-escuro": { ...base, enquadramento: "cheia", modelo: "energico", cor: "automatica" },
    };
    for (const nome of resto) {
      const cardapio = AMOSTRAS[nome];
      if (!cardapio) throw new Error(`amostra desconhecida: ${nome}`);
      const saida = join(PASTA_OUT, "modelos", `${nome}.mp4`);
      const props: VideoCarroPropsMontador = {
        dados: { marca: "JEEP", modelo: "COMPASS 2.0 16V FLEX SPORT AUTOMÁTICO", ano: 2021, km: 42000, preco: 119900, revenda: "Rota 66" },
        fotos: fotos(8),
        cardapio,
        anuncio: {
          corpo:
            "Compass Sport automático, único dono e revisões em dia. Interior conservado, ar-condicionado digital e central multimídia. Venha conhecer e fazer um test drive.",
        },
      };
      console.log(`Renderizando ${nome} -> ${saida}`);
      const t0 = Date.now();
      await renderizarVideo(props, saida);
      console.log(`OK ${nome} em ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    }
    return;
  }

  if (modo === "fotos") {
    const qtd = Number(resto[0]);
    const fundo = (resto[1] ?? "escuro") as FundoEscolha;
    const ritmo = (resto[2] ?? "calmo") as RitmoEscolha;
    const saida = resto[3] ?? join(PASTA_OUT, `teste-${qtd}-fotos.mp4`);
    const props: VideoCarroProps = {
      dados: DADOS,
      fotos: fotos(qtd),
      cardapio: { fundo, ritmo },
    };
    console.log(`Renderizando ${qtd} fotos, fundo=${fundo}, ritmo=${ritmo} -> ${saida}`);
    await renderizarVideo(props, saida);
    console.log("OK:", saida);
    return;
  }

  throw new Error(`modo desconhecido: ${modo}`);
}

main().catch((erro) => {
  console.error(erro);
  process.exit(1);
});
