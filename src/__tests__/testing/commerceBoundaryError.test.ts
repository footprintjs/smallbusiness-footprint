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
