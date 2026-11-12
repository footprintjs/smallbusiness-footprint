import { describe, expect, it } from 'vitest';
import { normalizeBoundaryError } from 'footprint-blueprint/diagnostics';
import { normalizeCommerceBoundaryError, type CommerceBoundaryErrorOptions } from '../../diagnostics.js';
const options = { system: 'database', operation: 'read-order', effect: 'read' as const };
describe('commerce adapter classification', () => {
  it.each([
    ['AccessDeniedException', 'auth'], ['UnrecognizedClientException', 'auth'],
    ['ProvisionedThroughputExceededException', 'rate-limited'], ['ThrottlingException', 'rate-limited'],
    ['ServiceUnavailableException', 'server'],
  ])('classifies real HTTP400 database name %s without changing the status', (name, category) => {
    const failure = Object.assign(new Error('PRIVATE PROVIDER MESSAGE'), { name, $metadata: { httpStatusCode: 400 } });
    const neutral = normalizeBoundaryError(failure, options);
    expect(neutral.category).toBe('unknown'); expect(neutral.httpStatus).toBeUndefined();
    const actual = normalizeCommerceBoundaryError(failure, options);
    expect(actual).toMatchObject({ category, httpStatus: 400, effect: 'none' });
    expect(JSON.stringify(actual)).not.toContain('PRIVATE'); expect(Object.isFrozen(actual)).toBe(true);
  });
  it('does not reinterpret database-specific names on a payment or shipping boundary', () => {
    const failure = { name: 'AccessDeniedException', $metadata: { httpStatusCode: 400 } };
    expect(normalizeCommerceBoundaryError(failure, { ...options, system: 'payment' }).category).toBe('permanent');
    expect(normalizeCommerceBoundaryError(failure, { ...options, system: 'shipping' }).category).toBe('permanent');
  });
  it.each(['configuration', 'storage', 'email'])('recognizes modeled cloud errors for the %s adapter without changing HTTP400', system => {
    expect(normalizeCommerceBoundaryError({ name: 'AccessDeniedException', $metadata: { httpStatusCode: 400 } }, { ...options, system }))
      .toMatchObject({ category: 'auth', httpStatus: 400 });
    expect(normalizeCommerceBoundaryError({ name: 'ThrottlingException', $metadata: { httpStatusCode: 400 } }, { ...options, system }))
      .toMatchObject({ category: 'rate-limited', httpStatus: 400 });
  });
  it('preserves numeric precedence, rejects status strings and does not infer a committed write', () => {
    expect(normalizeCommerceBoundaryError({ status: 500, $metadata: { httpStatusCode: 400 } }, { ...options, effect: 'write' }))
      .toMatchObject({ category: 'server', httpStatus: 500, effect: 'unknown' });
    expect(normalizeCommerceBoundaryError({ status: '500', $metadata: { httpStatusCode: '429' } }, options))
      .toMatchObject({ category: 'unknown', effect: 'none' });
  });
  it('honors an explicit trusted host status and rejects an invalid status option', () => {
    expect(normalizeCommerceBoundaryError({ status: 500 }, { ...options, httpStatus: 400 })).toMatchObject({ httpStatus: 400, category: 'permanent' });
    expect(() => normalizeCommerceBoundaryError({ status: 500 }, { ...options, httpStatus: 0 })).toThrow();
  });
  it('never invokes raw provider getters and contains no raw messages or payloads', () => {
    let reads = 0; const failure = Object.defineProperties({}, {
      name: { get() { reads++; throw new Error('private'); } },
      $metadata: { get() { reads++; throw new Error('private'); } },
      message: { get() { reads++; throw new Error('private'); } },
    });
    expect(normalizeCommerceBoundaryError(failure, options)).toMatchObject({ category: 'unknown' }); expect(reads).toBe(0);
  });
  it('supports explicit host vendor classifications from bounded frozen fields only', () => {
    const fieldsSeen: unknown[] = [];
    const result = normalizeCommerceBoundaryError({ name: 'CustomOverload', message: 'private', payload: { secret: true }, status: 400 }, {
      ...options, system: 'shipping', classify(fields) { fieldsSeen.push(fields); return 'rate-limited'; },
    });
    expect(result.category).toBe('rate-limited');
    expect(fieldsSeen).toEqual([{ name: 'CustomOverload', httpStatus: 400 }]); expect(Object.isFrozen(fieldsSeen[0])).toBe(true);
  });
  it.each([
    ['StripeAuthenticationError', 'auth'], ['StripePermissionError', 'auth'], ['StripeRateLimitError', 'rate-limited'],
    ['StripeConnectionError', 'network'], ['StripeInvalidRequestError', 'permanent'], ['StripeAPIError', 'server'],
  ])('classifies recorded payment SDK type %s without inventing an HTTP response', (type, category) => {
    const result = normalizeCommerceBoundaryError({ type, message: 'PRIVATE', raw: { payload: 'PRIVATE' } }, { ...options, system: 'payment', effect: 'write' });
    expect(result).toMatchObject({ category, effect: 'unknown' }); expect(result.httpStatus).toBeUndefined();
    expect(JSON.stringify(result)).not.toContain('PRIVATE');
    expect(normalizeCommerceBoundaryError({ type }, { ...options, system: 'shipping' }).category).toBe('unknown');
  });
  it('preserves numeric response precedence and custom vendor policies over SDK type hints', () => {
    expect(normalizeCommerceBoundaryError({ type: 'StripeAuthenticationError', statusCode: 503 }, { ...options, system: 'payment' }))
      .toMatchObject({ category: 'server', httpStatus: 503 });
    expect(normalizeCommerceBoundaryError({ type: 'StripeAPIError' }, { ...options, system: 'payment', classify: () => 'rate-limited' }))
      .toMatchObject({ category: 'rate-limited' });
    expect(normalizeCommerceBoundaryError({ type: 'constructor' }, { ...options, system: 'payment' }).category).toBe('unknown');
  });
  it.each([
    [{ code: 'ECONNREFUSED' }, 'network'], [{ cause: { code: 'ECONNRESET' } }, 'network'],
    [{ cause: { code: 'EAI_AGAIN' } }, 'network'], [{ cause: { code: 'ETIMEDOUT' } }, 'timeout'],
    [{ name: 'TimeoutError' }, 'timeout'], [{ name: 'NetworkingError' }, 'network'],
  ])('classifies only recorded transport data %j', (failure, category) => {
    const result = normalizeCommerceBoundaryError(failure, options);
    expect(result).toMatchObject({ category, effect: 'none' }); expect(result.httpStatus).toBeUndefined();
  });
  it('does not turn caller cancellation or numeric rejection into an old nested transport failure', () => {
    expect(normalizeCommerceBoundaryError({ name: 'AbortError', cause: { code: 'ETIMEDOUT' } }, options).category).toBe('unknown');
    expect(normalizeCommerceBoundaryError({ status: 401, cause: { code: 'ECONNRESET' } }, options))
      .toMatchObject({ category: 'auth', httpStatus: 401 });
  });
  it.each([
    [200, 'ECONNRESET', 'network'], [200, 'ETIMEDOUT', 'timeout'], [302, 'ECONNRESET', 'network'],
    [401, 'ECONNRESET', 'auth'], [429, 'ETIMEDOUT', 'rate-limited'], [503, 'ECONNRESET', 'server'],
  ])('classifies body transport failure after HTTP%s without discarding recorded rejecting responses', (httpStatus, code, category) => {
    const result = normalizeCommerceBoundaryError({ status: httpStatus, cause: { code }, message: 'PRIVATE BODY' },
      { ...options, system: 'payment', effect: 'write' });
    expect(result).toMatchObject({ category, httpStatus, effect: 'unknown' });
    expect(JSON.stringify(result)).not.toContain('PRIVATE');
  });
  it('never reads SDK type or nested cause getters and never copies a provider request reference', () => {
    let reads = 0;
    const failure = Object.defineProperties({}, {
      type: { get() { reads++; throw new Error('PRIVATE'); } },
      cause: { get() { reads++; throw new Error('PRIVATE'); } },
    });
    const result = normalizeCommerceBoundaryError(failure, { ...options, system: 'payment' });
    expect(result.category).toBe('unknown'); expect(reads).toBe(0);
    const nested = Object.defineProperty({}, 'code', { get() { reads++; throw new Error('PRIVATE'); } });
    expect(normalizeCommerceBoundaryError({ cause: nested, requestId: 'PRIVATE' }, options).category).toBe('unknown');
    expect(reads).toBe(0); expect(JSON.stringify(result)).not.toContain('PRIVATE');
  });
});

it('explicit valid host classifications override a known database name while invalid/throw/undefined fall back safely', () => {
  const failure = { name: 'AccessDeniedException', $metadata: { httpStatusCode: 400 } };
  expect(normalizeCommerceBoundaryError(failure, { ...options, classify: () => 'network' }))
    .toMatchObject({ category: 'network', httpStatus: 400 });
  for (const classify of [() => undefined, () => { throw new Error('PRIVATE CLASSIFIER ERROR'); }, () => 'invalid-category']) {
    const config = { ...options, classify } as CommerceBoundaryErrorOptions;
    const result = normalizeCommerceBoundaryError(failure, config);
    expect(result).toMatchObject({ category: 'auth', httpStatus: 400 }); expect(JSON.stringify(result)).not.toContain('PRIVATE');
  }
});
