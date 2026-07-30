import { expect } from '@playwright/test';

const PRICE_TAG_ID = '404';
const PRICE_TAG_LENGTH = 91;
const PRICE_TAG_HEADER = `${PRICE_TAG_ID}${String(PRICE_TAG_LENGTH).padStart(3, '0')}`;
const VERSION_TAG_HEADER = '001008';

export interface FepasResponse {
  CODMSG?: string;
  BIT_39?: string;
  BIT_47?: string;
  BIT_60?: string;
  BIT_70?: string;
  [key: string]: unknown;
}

/** Monta a tag TLV 001 com a versão de tabela conhecida pelo terminal. */
export function fepasVersionField(version: number | string) {
  return `${VERSION_TAG_HEADER}${String(version).padStart(8, '0')}`;
}

/** Cria uma mensagem de logon/carga com os campos mínimos aceitos pelo fluxo FEPAS. */
export function fepasPriceTableRequest(
  distributorDocument: string,
  version: number | string,
  phase: 'discovery' | 'load'
) {
  return {
    CODMSG: '0800',
    BIT_03: '910000',
    BIT_11: String(Date.now()).slice(-6).padStart(6, '0'),
    BIT_12: '120000',
    BIT_13: '0730',
    BIT_42: distributorDocument,
    BIT_47: fepasVersionField(version),
    BIT_70: phase === 'discovery' ? '001' : '800'
  };
}

/** Extrai a versão de oito dígitos anunciada na etapa de descoberta. */
export function readAnnouncedVersion(response: FepasResponse) {
  const bit47 = response.BIT_47 ?? '';
  const start = bit47.indexOf(VERSION_TAG_HEADER);
  expect(start, 'A resposta FEPAS deve anunciar a tag 001 da versão.').toBeGreaterThanOrEqual(0);
  return bit47.slice(start + VERSION_TAG_HEADER.length, start + VERSION_TAG_HEADER.length + 8);
}

/**
 * Extrai os três preços monetários da primeira tag 404.
 *
 * A tag possui produto, serviços, características, EAN e quantidade antes dos três
 * campos de 12 dígitos que devem transportar exatamente o mesmo preço final.
 */
export function readFirstTag404Amounts(response: FepasResponse) {
  const bit47 = response.BIT_47 ?? '';
  const start = bit47.indexOf(PRICE_TAG_HEADER);
  expect(start, 'A carga FEPAS deve conter ao menos uma tag 404.').toBeGreaterThanOrEqual(0);

  const value = bit47.slice(start + PRICE_TAG_HEADER.length, start + PRICE_TAG_HEADER.length + PRICE_TAG_LENGTH);
  expect(value).toHaveLength(PRICE_TAG_LENGTH);
  return [
    value.slice(35, 47),
    value.slice(47, 59),
    value.slice(59, 71)
  ];
}
