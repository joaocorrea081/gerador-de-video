// Lê largura/altura de JPEG e PNG direto dos bytes, sem depender de biblioteca
// de imagem — as fotos de revenda de carro são sempre JPEG (ETAPA-4-CRITERIO.md),
// mas cobrimos PNG também por segurança.

export interface Dimensoes {
  largura: number;
  altura: number;
}

function lerPng(buffer: Buffer): Dimensoes | undefined {
  // Assinatura PNG + IHDR: largura e altura são os 8 bytes a partir do offset 16.
  if (buffer.length < 24) return undefined;
  const assinaturaOk =
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47;
  if (!assinaturaOk) return undefined;
  return {
    largura: buffer.readUInt32BE(16),
    altura: buffer.readUInt32BE(20),
  };
}

function lerJpeg(buffer: Buffer): Dimensoes | undefined {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) {
    return undefined; // não começa com o marcador SOI de JPEG.
  }

  let offset = 2;
  while (offset + 4 <= buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset++;
      continue;
    }
    const marcador = buffer[offset + 1]!;
    offset += 2;

    // Marcadores sem payload (RST, TEM, etc).
    if (marcador === 0xd8 || marcador === 0xd9) continue;
    if (marcador >= 0xd0 && marcador <= 0xd7) continue;

    if (offset + 2 > buffer.length) break;
    const tamanhoSegmento = buffer.readUInt16BE(offset);

    // Marcadores SOF (Start Of Frame) carregam altura/largura.
    const ehSof =
      (marcador >= 0xc0 && marcador <= 0xcf) &&
      marcador !== 0xc4 &&
      marcador !== 0xc8 &&
      marcador !== 0xcc;

    if (ehSof) {
      if (offset + 7 > buffer.length) break;
      const altura = buffer.readUInt16BE(offset + 3);
      const largura = buffer.readUInt16BE(offset + 5);
      return { largura, altura };
    }

    offset += tamanhoSegmento;
  }
  return undefined;
}

/** Lê as dimensões nativas de um JPEG ou PNG a partir dos bytes do arquivo. */
export function lerDimensoes(buffer: Buffer): Dimensoes | undefined {
  return lerJpeg(buffer) ?? lerPng(buffer);
}
