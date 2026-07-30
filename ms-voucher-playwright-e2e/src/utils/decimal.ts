/**
 * Aritmética decimal exata equivalente à usada pelo `PriceService`.
 *
 * O serviço calcula o desconto percentual com `BigDecimal#divide(100, 8, HALF_EVEN)` e padroniza
 * o preço final com `setScale(2, HALF_EVEN)`. Reproduzir esse comportamento com `number` do
 * JavaScript introduziria erro de ponto flutuante e esconderia justamente os defeitos de
 * arredondamento que os testes precisam detectar, por isso todo o cálculo usa `bigint`.
 */

const INTERMEDIATE_SCALE = 8;
const MONETARY_SCALE = 2;
const ONE_HUNDRED = 100n;

export type DecimalInput = string | number;

function pow10(exponent: number) {
  return 10n ** BigInt(exponent);
}

/** Converte um decimal textual ou numérico para inteiro na escala informada, sem perda. */
export function toScaled(value: DecimalInput, scale: number): bigint {
  const text = typeof value === 'number' ? value.toString() : value.trim();
  const match = /^(-?)(\d*)(?:\.(\d*))?$/.exec(text);
  if (!match || (match[2] === '' && (match[3] ?? '') === '')) {
    throw new Error(`Valor decimal inválido: ${value}`);
  }

  const [, sign, integerPart, fractionPart = ''] = match;
  if (fractionPart.length > scale) {
    throw new Error(`Valor ${value} possui mais de ${scale} casas decimais.`);
  }

  const digits = `${integerPart || '0'}${fractionPart.padEnd(scale, '0')}`;
  const magnitude = BigInt(digits);
  return sign === '-' ? -magnitude : magnitude;
}

/** Divide dois inteiros aplicando arredondamento bancário, como `RoundingMode.HALF_EVEN`. */
export function divideHalfEven(numerator: bigint, denominator: bigint): bigint {
  if (denominator <= 0n) {
    throw new Error('O divisor deve ser positivo.');
  }

  const quotient = numerator / denominator;
  const remainder = numerator % denominator;
  if (remainder === 0n) {
    return quotient;
  }

  const doubledRemainder = (remainder < 0n ? -remainder : remainder) * 2n;
  const isTie = doubledRemainder === denominator;
  const roundsAway = doubledRemainder > denominator || (isTie && quotient % 2n !== 0n);
  if (!roundsAway) {
    return quotient;
  }

  return numerator < 0n ? quotient - 1n : quotient + 1n;
}

/** Formata um inteiro escalado como decimal textual com o número exato de casas. */
export function formatScaled(value: bigint, scale: number): string {
  const negative = value < 0n;
  const digits = (negative ? -value : value).toString().padStart(scale + 1, '0');
  const integerPart = digits.slice(0, digits.length - scale);
  const fractionPart = scale === 0 ? '' : `.${digits.slice(digits.length - scale)}`;
  return `${negative ? '-' : ''}${integerPart}${fractionPart}`;
}

/** Normaliza qualquer representação monetária para duas casas com arredondamento bancário. */
export function toMonetary(value: DecimalInput): string {
  const scaled = toScaled(value, INTERMEDIATE_SCALE);
  return formatScaled(divideHalfEven(scaled, pow10(INTERMEDIATE_SCALE - MONETARY_SCALE)), MONETARY_SCALE);
}

/** Preço final de uma campanha absoluta: o `novoValor` é abatido do preço líquido vigente. */
export function applyAbsoluteDiscount(basePrice: DecimalInput, discount: DecimalInput): string {
  const base = toScaled(basePrice, INTERMEDIATE_SCALE);
  const absolute = toScaled(discount, INTERMEDIATE_SCALE);
  return formatScaled(
    divideHalfEven(base - absolute, pow10(INTERMEDIATE_SCALE - MONETARY_SCALE)),
    MONETARY_SCALE
  );
}

/** Preço final de uma campanha percentual, reproduzindo as duas etapas de arredondamento. */
export function applyPercentageDiscount(basePrice: DecimalInput, percentage: DecimalInput): string {
  const base = toScaled(basePrice, INTERMEDIATE_SCALE);
  const percent = toScaled(percentage, INTERMEDIATE_SCALE);
  const discount = divideHalfEven(base * percent, ONE_HUNDRED * pow10(INTERMEDIATE_SCALE));
  return formatScaled(
    divideHalfEven(base - discount, pow10(INTERMEDIATE_SCALE - MONETARY_SCALE)),
    MONETARY_SCALE
  );
}

/** Compara dois valores monetários pela representação canônica de duas casas. */
export function isSameMonetaryValue(first: DecimalInput, second: DecimalInput) {
  return toMonetary(first) === toMonetary(second);
}

/**
 * Converte o preço final para os 12 dígitos em centavos usados nos campos monetários
 * da tag `404` da FEPAS.
 */
export function toFepasAmount(price: DecimalInput, length = 12): string {
  const cents = toScaled(toMonetary(price), MONETARY_SCALE);
  if (cents <= 0n) {
    throw new Error(`A FEPAS não aceita preço menor ou igual a zero: ${price}`);
  }
  return cents.toString().padStart(length, '0');
}
