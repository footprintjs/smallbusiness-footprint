import { normalizeBoundaryError } from 'footprint-blueprint/diagnostics';

export type CommerceBoundaryErrorOptions = Parameters<typeof normalizeBoundaryError>[1];
export type NormalizedCommerceBoundaryError = ReturnType<typeof normalizeBoundaryError>;

const own = (value: unknown, key: string): unknown => {
  try {
    const descriptor = value && typeof value === 'object' ? Object.getOwnPropertyDescriptor(value, key) : undefined;
    return descriptor && 'value' in descriptor ? descriptor.value : undefined;
  } catch { return undefined; }
};
const categories = ['timeout', 'rate-limited', 'server', 'network', 'auth', 'permanent', 'unknown'];
const numericStatus = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isInteger(value) && value >= 100 && value <= 599 ? value : undefined;

/**
 * Normalize commerce adapter errors before application wrappers hide their safe classification.
 * AWS-shaped database names are recognized without an AWS SDK or invented HTTP status.
 * A classification records what the adapter saw; it does not establish a provider outage.
 */
export function normalizeCommerceBoundaryError(error: unknown, options: CommerceBoundaryErrorOptions): NormalizedCommerceBoundaryError {
  const httpStatus = options?.httpStatus ?? numericStatus(own(error, 'status')) ?? numericStatus(own(error, 'statusCode'))
    ?? numericStatus(own(own(error, '$metadata'), 'httpStatusCode'));
  return normalizeBoundaryError(error, {
    ...options,
    ...(httpStatus === undefined ? {} : { httpStatus }),
    classify(fields) {
      // Hosts own provider policy. A safe explicit result wins over this optional compatibility map.
      let custom: unknown;
      try { custom = options?.classify?.(fields); } catch { /* Retain the safe built-in/default classification. */ }
      if (typeof custom === 'string' && categories.includes(custom)) return custom as NormalizedCommerceBoundaryError['category'];
      if (options?.system === 'database' && (fields.httpStatus === undefined || fields.httpStatus === 400)) {
        if (['AccessDeniedException', 'UnrecognizedClientException', 'InvalidSignatureException', 'ExpiredTokenException',
          'CredentialsProviderError', 'MissingAuthenticationTokenException'].includes(fields.name ?? '')) return 'auth';
        if (['ProvisionedThroughputExceededException', 'ThrottlingException', 'RequestLimitExceeded', 'TooManyRequestsException']
          .includes(fields.name ?? '')) return 'rate-limited';
        if (['ServiceUnavailable', 'ServiceUnavailableException', 'InternalServerError', 'InternalFailure']
          .includes(fields.name ?? '')) return 'server';
      }
      return undefined;
    },
  });
}
