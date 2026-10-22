// Ponto de entrada do bundle Remotion. Separado de index.ts porque
// index.ts é a API pública do pacote (renderizarVideo), chamável de outro
// pacote em Node puro — não deve rodar registerRoot.
import { registerRoot } from "remotion";
import { RemotionRoot } from "./Root.js";

registerRoot(RemotionRoot);
