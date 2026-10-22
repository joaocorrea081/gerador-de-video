// Registro das composições, pra abrir no Studio e olhar o desenho.
// Props de exemplo usam as 8 fotos reais do Jeep Compass em
// ativos-teste/compass/ (dados reais da Rota 66 BH, 20/10/2026) — só para
// visualização aqui; em produção as props vêm do leitor/escritor, nunca
// embutidas no componente (ver ETAPA-1-CRITERIO.md, item 3).
//
// Sem node:fs/node:path aqui de propósito: este arquivo é bundlado pelo
// webpack do Remotion (para Studio e para o render real), que não resolve
// módulos nativos do Node. O caminho e as medidas das fotos de teste são
// literais fixos — todas 1024x768, conferido no ETAPA-1-CRITERIO.md.
import { Composition } from "remotion";
import type { FotoCarro } from "@gerador/core";
import type { Variante, VideoCarroPropsMontador } from "./variantes.js";
import { calcularDuracaoFrames, FPS, VideoCarro } from "./Composicao.js";

// Caminho relativo à raiz do monorepo: o Studio serve o projeto inteiro
// como estático (ver remotion.config.ts, Config.setPublicDir), e
// Cena.tsx lê `foto.caminho` com staticFile() — nunca com `file://`.
const PASTA_COMPASS = "ativos-teste/compass";

function fotosDeExemplo(quantidade: number): FotoCarro[] {
  return Array.from({ length: quantidade }, (_, i) => ({
    caminho: `${PASTA_COMPASS}/${i + 1}.jpg`,
    largura: 1024,
    altura: 768,
  }));
}

const DADOS_EXEMPLO = {
  marca: "JEEP",
  modelo: "COMPASS 2.0 16V FLEX SPORT AUTOMÁTICO",
  ano: 2021,
  km: 48000,
  preco: 89900,
  revenda: "Rota 66 BH",
};

function propsExemplo(quantidadeFotos: number, variante: Variante = "nitida"): VideoCarroPropsMontador {
  return {
    dados: DADOS_EXEMPLO,
    fotos: fotosDeExemplo(quantidadeFotos),
    cardapio: { fundo: "escuro", ritmo: "calmo" },
    variante,
  };
}

const COMPOSICOES: { id: string; props: VideoCarroPropsMontador }[] = [
  // Uma composição por variante: renderizar.ts escolhe por `props.variante`
  // (calculateMetadata recalcula a duração a partir das props de entrada).
  { id: "VideoCarro-cheia", props: propsExemplo(8, "cheia") },
  { id: "VideoCarro-nitida", props: propsExemplo(8, "nitida") },
  { id: "VideoCarro-generico", props: propsExemplo(8) },
  { id: "VideoCarro-3-fotos", props: propsExemplo(3) },
  { id: "VideoCarro-1-foto", props: propsExemplo(1) },
  { id: "VideoCarro-0-fotos", props: { ...propsExemplo(0), fotos: [] } },
];

export const RemotionRoot: React.FC = () => {
  return (
    <>
      {COMPOSICOES.map(({ id, props }) => (
        <Composition
          key={id}
          id={id}
          component={VideoCarro}
          width={1080}
          height={1920}
          fps={FPS}
          durationInFrames={calcularDuracaoFrames(props.fotos.length, props.cardapio.ritmo, props.cardapio.modelo)}
          defaultProps={props}
          calculateMetadata={async ({ props: p }) => ({
            durationInFrames: calcularDuracaoFrames(p.fotos.length, p.cardapio.ritmo, p.cardapio.modelo),
          })}
        />
      ))}
    </>
  );
};
