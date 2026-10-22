// Só exporta. Importar este pacote nunca abre porta sozinho — quem sobe o
// servidor de fato é src/bin.ts (ver script "dev" no package.json).
export { iniciarServidor } from "./servidor.js";
