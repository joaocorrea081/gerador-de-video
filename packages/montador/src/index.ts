// API pública do pacote: o que outros pacotes (ex.: a fila de render da
// etapa 3) podem importar. Nada de componente React aqui, só a função de
// renderização e os tipos que ela usa.
export { renderizarVideo, type OpcoesRenderizacao } from "./renderizar.js";
export { calcularDuracaoCena, calcularDuracaoFrames, FPS } from "./Composicao.js";
export {
  criarFila,
  processarProximoJob,
  TIMEOUT_JOB_MS,
  type Fila,
  type FuncaoRenderizar,
  type OpcoesFila,
} from "./fila.js";
export { VARIANTES, type Variante, type VideoCarroPropsMontador } from "./variantes.js";
export { MODELOS, MODELO_PADRAO, type ConfigModelo } from "./modelos.js";
export { contraste, resolverDestaque, textoSobre, CONTRASTE_MIN_DESTAQUE, CONTRASTE_MIN_TEXTO } from "./cor.js";
export { sugerirVariacoes, sugerirVariacoesDoVideo } from "./variacoes.js";
export { extrairCorDominanteHex } from "./destaque.js";
