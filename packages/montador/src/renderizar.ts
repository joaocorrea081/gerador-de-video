// A função pública do pacote: recebe as props tipadas e um caminho de
// saída, e renderiza o MP4 de verdade via @remotion/renderer (critério #8).
// Chamável de qualquer outro pacote — não depende do Studio.
import { copyFileSync, mkdirSync, rmSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import type { VideoCarroPropsMontador } from "./variantes.js";
import { calcularDuracaoFrames } from "./Composicao.js";
import { extrairCorDominanteHex } from "./destaque.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
// Aponta para o arquivo-fonte (src), não para o .js compilado: o bundler do
// Remotion compila TSX ele mesmo. Resolve certo tanto rodando de src/ (tsx)
// quanto de dist/ (node), porque dist e src são irmãos.
const ENTRADA_REMOTION = join(__dirname, "../src/entrada-remotion.ts");

const RAIZ_PROJETO = resolve(__dirname, "../../..");

// Fica dentro do projeto (em /home, btrfs) para nunca cruzar sistema de
// arquivos com o NTFS de /mnt/Dados — ver RESTRICOES.md (EXDEV).
const PASTA_SAIDA_BASE = join(RAIZ_PROJETO, "out", "bundle-remotion");

/**
 * `publicDir` do bundle: NUNCA a raiz do projeto. Servir a raiz inteira
 * por HTTP durante o render exporia `.env` (chave de API do cliente),
 * `dados/gerador.db` e `node_modules` — achado numa revisão desta mesma
 * etapa. Em vez disso, cada render ganha uma pasta efêmera própria,
 * local ao pacote, com só um link simbólico para CADA foto DAQUELE
 * carro — nunca a pasta de origem inteira.
 *
 * O bundler só copia o conteúdo do `publicDir` para dentro do bundle NO
 * MOMENTO do `bundle()` — um arquivo adicionado depois não é servido (o
 * Remotion monta sua própria lista de arquivos públicos nesse momento).
 * Por isso as fotos entram ANTES de empacotar, e cada render empacota de
 * novo: mais lento que reaproveitar um bundle entre renders, mas é o
 * jeito que garante que nenhuma pasta além da do próprio carro é servida.
 */
function prepararArea(id: string): { pastaPublica: string; pastaSaida: string } {
  const pastaBase = join(PASTA_SAIDA_BASE, id);
  const pastaPublica = join(pastaBase, "public-origem");
  const pastaSaida = join(pastaBase, "bundle");
  rmSync(pastaBase, { recursive: true, force: true });
  mkdirSync(pastaPublica, { recursive: true });
  return { pastaPublica, pastaSaida };
}

/**
 * Isola as fotos de UM carro na pasta pública efêmera (nunca a pasta de
 * origem inteira), e devolve as props já com `caminho` relativo a ela —
 * prontas para servir de `inputProps`.
 *
 * São CÓPIAS, não links simbólicos: o servidor estático do Remotion
 * (`serve-handler`) responde 404 pra qualquer arquivo que seja symlink
 * quando a opção `symlinks` está desligada — que é o padrão. Era por
 * isso que o render saía "ok" sem erro fatal, mas as fotos nunca
 * apareciam na imagem (os `<img>`/`background-image` carregavam 404).
 */
function isolarFotos(pastaPublica: string, props: VideoCarroPropsMontador): VideoCarroPropsMontador {
  const fotos = props.fotos.map((foto, indice) => {
    const nome = `${indice}${extname(foto.caminho) || ".jpg"}`;
    copyFileSync(foto.caminho, join(pastaPublica, nome));
    return { ...foto, caminho: nome };
  });
  return { ...props, fotos };
}

export interface OpcoesRenderizacao {
  /** ID da composição no Root.tsx. Padrão: a composição genérica "VideoCarro". */
  composicaoId?: string;
}

/**
 * Renderiza o vídeo de um carro em MP4.
 *
 * @param props Dados do veículo, fotos, escolhas do cardápio (fundo, ritmo,
 *   enquadramento, modelo, cor; `variante` ainda vale e vence o enquadramento
 *   do cardápio; padrão "nitida"). Nada aqui
 *   vem embutido no componente — tudo chega por prop (critério #3).
 * @param caminhoSaida Caminho absoluto do .mp4 de saída.
 */
export async function renderizarVideo(
  props: VideoCarroPropsMontador,
  caminhoSaida: string,
): Promise<void> {
  const id = `render-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const { pastaPublica, pastaSaida } = prepararArea(id);
  // Cor automática: extraída da PRIMEIRA foto (a de capa) aqui, em Node, e
  // passada por prop. Falhou ou carro sem cor: null -> a composição cai no âmbar.
  const destaqueAutomatico =
    props.cardapio.cor === "automatica" && props.fotos[0]
      ? extrairCorDominanteHex(props.fotos[0].caminho)
      : null;
  const inputProps = { ...isolarFotos(pastaPublica, props), destaqueAutomatico };

  try {
    const bundleDir = await bundle({
      entryPoint: ENTRADA_REMOTION,
      outDir: pastaSaida,
      publicDir: pastaPublica,
      // Nosso código usa extensão .js nos imports relativos (exigência do
      // "moduleResolution": "NodeNext" do tsconfig, para o tsc enxergar os
      // arquivos .ts/.tsx compilados). O webpack do Remotion precisa saber
      // mapear essa extensão de volta para o arquivo-fonte real.
      webpackOverride: (config) => ({
        ...config,
        resolve: {
          ...config.resolve,
          extensionAlias: {
            ".js": [".tsx", ".ts", ".js"],
          },
        },
      }),
    });

    const composicao = await selectComposition({
      serveUrl: bundleDir,
      id: `VideoCarro-${props.variante ?? props.cardapio.enquadramento ?? "nitida"}`,
      inputProps,
    });

    await renderMedia({
      serveUrl: bundleDir,
      composition: {
        ...composicao,
        durationInFrames: calcularDuracaoFrames(props.fotos.length, props.cardapio.ritmo, props.cardapio.modelo),
      },
      codec: "h264",
      outputLocation: caminhoSaida,
      inputProps,
      // O ARQUITETURA.md trata áudio como item obrigatório de decisão (trilha
      // licenciada, locução ou silêncio — escolha comercial do João, não
      // nossa). Por ora, força uma faixa de áudio silenciosa: sem isso o
      // MP4 não tem faixa de áudio alguma, e plataformas tratam isso como
      // vídeo incompleto.
      enforceAudioTrack: true,
    });
  } finally {
    // Nunca deixar a pasta efêmera (bundle + links das fotos) no disco
    // depois do render — nem o bundle acumulando a cada chamada.
    rmSync(join(PASTA_SAIDA_BASE, id), { recursive: true, force: true });
  }
}
