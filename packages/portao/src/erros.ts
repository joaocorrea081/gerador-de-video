// Mensagens de erro do núcleo (packages/core) chegam em português. Aqui elas viram o idioma da pessoa.
// O núcleo não carrega código nem parâmetros em todas as mensagens, então o reconhecimento é pelo texto original.
// Mensagem que não bate com nenhum padrão sai como veio (nunca se inventa tradução).
import { idiomaAtual, localeDe, rotuloDe, tOpcional } from "./idioma/index.js";

const minusculo = (prefixo: string, valor: string): string => rotuloDe(prefixo, valor).toLocaleLowerCase(localeDe());

type Extrator = (m: RegExpExecArray) => Record<string, string>;
const nenhum: Extrator = () => ({});

const PADROES: [RegExp, string, Extrator][] = [
  [/^vídeo (\d+) não encontrado$/, "core.videoNaoEncontrado", (m) => ({ id: m[1]! })],
  [/^vídeo não encontrado$/, "core.videoNaoEncontradoSemId", nenhum],
  [/^vídeo (\d+) não está aguardando aprovação \(estado atual: (.+)\)$/, "core.naoAguardando", (m) => ({ id: m[1]!, estado: minusculo("estado", m[2]!) })],
  [/^motivo é obrigatório — é um botão, não texto livre$/, "core.motivoObrigatorio", nenhum],
  [/^campo "titulo" é obrigatório$/, "core.tituloObrigatorio", nenhum],
  [/^campo "corpo" é obrigatório$/, "core.corpoObrigatorio", nenhum],
  [/^título passa de (\d+) caracteres$/, "core.tituloLongo", (m) => ({ n: m[1]! })],
  [/^corpo passa de (\d+) caracteres$/, "core.corpoLongo", (m) => ({ n: m[1]! })],
  [/^o texto do vídeo (\d+) não pode mudar no estado "(.+)"$/, "core.textoNaoMuda", (m) => ({ id: m[1]!, estado: minusculo("estado", m[2]!) })],
  [/^este produto já tem um vídeo na fila ou renderizando — espere terminar$/, "core.jaTemVideoNaFila", nenhum],
  [/^produto (\d+) não encontrado$/, "core.produtoNaoEncontrado", (m) => ({ id: m[1]! })],
  [/^produto (\d+) já tem vídeo — use "refazer vídeo"$/, "core.produtoJaTemVideo", (m) => ({ id: m[1]! })],
  [/^filtro\.(\w+) deve ser um número maior ou igual a zero$/, "core.filtroNumero", (m) => ({ campo: m[1]! })],
  [/^filtro\.anoMin não pode ser maior que filtro\.anoMax$/, "core.filtroAnos", nenhum],
  [/^"intervaloMinutos" deve ser inteiro entre (\d+) e (\d+)$/, "core.intervalo", (m) => ({ min: m[1]!, max: m[2]! })],
  [/^"siteUrl" deve ser uma URL http ou https$/, "core.siteUrl", nenhum],
  [/^"quantidade" deve ser inteiro entre 1 e 100$/, "core.quantidade", nenhum],
  [/^modo real exige "contaId"$/, "core.contaIdObrigatorio", nenhum],
  [/^modo real exige "accessToken"$/, "core.tokenObrigatorio", nenhum],
  [/^(.+) não está conectado\.? ?.*$/, "core.naoConectada", (m) => ({ rede: m[1]! })],
  [/^O horário já passou\. Escolha um instante no futuro\.$/, "core.noPassado", nenhum],
  [/^Este vídeo já está (.+) no (.+)\. Use remarcar\.$/, "core.jaAgendada", (m) => ({ estado: minusculo("pub.estado", m[1]!), rede: m[2]! })],
  [/^Este vídeo já foi publicado no (.+)\.$/, "core.jaPublicada", (m) => ({ rede: m[1]! })],
  [/^publicação (\d+) não encontrada$/, "core.publicacaoNaoEncontrada", (m) => ({ id: m[1]! })],
  [/^Não dá para desmarcar uma publicação "(.+)"\.$/, "core.naoDesmarcar", (m) => ({ estado: minusculo("pub.estado", m[1]!) })],
  [/^Não dá para remarcar uma publicação "(.+)"\.$/, "core.naoRemarcar", (m) => ({ estado: minusculo("pub.estado", m[1]!) })],
  [/^O site (.+) já está cadastrado\.$/, "core.siteJaCadastrado", (m) => ({ id: m[1]! })],
  [/^Site não cadastrado: (.+)$/, "core.siteNaoCadastrado", (m) => ({ id: m[1]! })],
  [/^Nenhum site ativo cadastrado\. Cadastre um site para o sistema ler\.$/, "core.nenhumSiteAtivo", nenhum],
  [/^A legenda não pode ficar vazia\.$/, "core.legendaVazia", nenhum],
  [/^Legenda com (\d+) caracteres; o limite do (.+) é (\d+)\.$/, "core.legendaLonga", (m) => ({ n: m[1]!, rede: m[2]!, limite: m[3]! })],
];

/** A mensagem no idioma atual. Português e mensagens sem padrão conhecido saem como vieram. */
export function traduzirErro(mensagem: string): string {
  if (idiomaAtual() === "pt-BR") return mensagem;
  for (const [re, chave, extrair] of PADROES) {
    const m = re.exec(mensagem);
    if (!m) continue;
    return tOpcional(chave, extrair(m)) ?? mensagem;
  }
  return mensagem;
}

/** As chaves que este módulo pode pedir ao catálogo (o teste confere que todas existem). */
export const CHAVES_DE_ERRO_DO_NUCLEO: readonly string[] = PADROES.map(([, chave]) => chave);
