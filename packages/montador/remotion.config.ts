// Configuração do Remotion Studio (usada só por "pnpm --filter @gerador/montador run studio").
// O render de verdade (packages/montador/src/renderizar.ts) configura o
// bundle() programaticamente com as mesmas opções — este arquivo não é
// lido por ele.
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Config } from "@remotion/cli/config";

const __dirname = dirname(fileURLToPath(import.meta.url));
const RAIZ_PROJETO = resolve(__dirname, "../..");

// NÃO aponta pra raiz do projeto: o bundler copia o publicDir inteiro
// para dentro da pasta de build, e a raiz contém node_modules e a própria
// pasta de build — cópia recursiva que enche o disco (ver renderizar.ts,
// mesma explicação). Em vez disso, uma pasta dedicada com uma CÓPIA de
// cada pasta de assets usada pelas fotos de exemplo — cópia, não link
// simbólico: o servidor estático do Remotion (`serve-handler`) responde
// 404 pra qualquer arquivo que seja symlink por padrão (`symlinks`
// desligado), o que faria as fotos do Studio sumirem do mesmo jeito que
// sumiam no render de verdade antes dessa correção.
const PASTA_PUBLICA = join(RAIZ_PROJETO, "out", "publico-remotion-studio");
rmSync(PASTA_PUBLICA, { recursive: true, force: true });
mkdirSync(PASTA_PUBLICA, { recursive: true });
for (const nome of ["ativos-teste", "dados"]) {
  const origem = join(RAIZ_PROJETO, nome);
  if (existsSync(origem)) {
    cpSync(origem, join(PASTA_PUBLICA, nome), { recursive: true });
  }
}

Config.setPublicDir(PASTA_PUBLICA);

Config.overrideWebpackConfig((config) => ({
  ...config,
  resolve: {
    ...config.resolve,
    extensionAlias: {
      ".js": [".tsx", ".ts", ".js"],
    },
  },
}));
