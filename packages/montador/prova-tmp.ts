import { abrirBanco, criarVideoDaFicha, obterVideo } from "@gerador/core";
import { criarFila } from "./src/fila.js";
const db = abrirBanco();
console.log("versao", db.prepare("SELECT MAX(versao) m FROM schema_version").get());
const a = criarVideoDaFicha(db, 5, { fundo: "escuro", ritmo: "calmo", modelo: "institucional", enquadramento: "nitida", cor: "ambar" });
const b = criarVideoDaFicha(db, 5, { fundo: "escuro", ritmo: "calmo", modelo: "energico", enquadramento: "nitida", cor: "ambar" });
console.log("videos", a.video.id, a.video.modelo, b.video.id, b.video.modelo);
const fila = criarFila(db, { pastaSaida: "/tmp/claude-1000/-home-joao-gerador-de-video/ce2c0627-665e-416d-b4a6-ee45a55cc6e0/scratchpad/saida" });
console.log("processados", await fila.esvaziar());
for (const id of [a.video.id, b.video.id]) { const v = obterVideo(db, id)!; console.log(id, v.estado, v.modelo, v.caminhoMp4); }
