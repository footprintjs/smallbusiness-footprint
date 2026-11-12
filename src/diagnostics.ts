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
const networkCodes = new Set(['ECONNREFUSED', 'ECONNRESET', 'ENOTFOUND', 'EAI_AGAIN', 'ENETUNREACH', 'EHOSTUNREACH', 'EPIPE']);
const timeoutCodes = new Set(['ETIMEDOUT', 'ESOCKETTIMEDOUT']);
const cloudSystems = new Set(['database', 'configuration', 'storage', 'email']);
const paymentErrorTypes: Readonly<Record<string, NormalizedCommerceBoundaryError['category']>> = Object.freeze({
  StripeAuthenticationError: 'auth', StripePermissionError: 'auth', StripeRateLimitError: 'rate-limited',
  StripeConnectionError: 'network', StripeInvalidRequestError: 'permanent', StripeAPIError: 'server',
});

/**
 * Normalize commerce adapter errors before application wrappers hide their safe classification.
 * AWS-shaped cloud adapter names are recognized without an AWS SDK or invented HTTP status.
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
      if (cloudSystems.has(options.system) && (fields.httpStatus === undefined || fields.httpStatus === 400)) {
        if (['AccessDeniedException', 'UnrecognizedClientException', 'InvalidSignatureException', 'ExpiredTokenException',
          'CredentialsProviderError', 'MissingAuthenticationTokenException'].includes(fields.name ?? '')) return 'auth';
        if (['ProvisionedThroughputExceededException', 'ThrottlingException', 'RequestLimitExceeded', 'TooManyRequestsException']
          .includes(fields.name ?? '')) return 'rate-limited';
        if (['ServiceUnavailable', 'ServiceUnavailableException', 'InternalServerError', 'InternalFailure']
          .includes(fields.name ?? '')) return 'server';
      }
      // A rejecting HTTP response takes precedence over transport/class-name hints.
      // Successful headers do not disprove a later response-body timeout or connection reset.
      // Read only data properties; arbitrary messages and nested provider payloads never cross this boundary.
      if (fields.httpStatus === undefined || fields.httpStatus < 400) {
        if (fields.name === 'AbortError') return undefined;
        const causeCode = own(own(error, 'cause'), 'code');
        if (timeoutCodes.has(fields.code ?? '') || (typeof causeCode === 'string' && timeoutCodes.has(causeCode))) return 'timeout';
        if (networkCodes.has(fields.code ?? '') || (typeof causeCode === 'string' && networkCodes.has(causeCode))) return 'network';
        if (cloudSystems.has(options.system)) {
          if (['TimeoutError', 'RequestTimeout', 'RequestTimeoutException'].includes(fields.name ?? '')) return 'timeout';
          if (fields.name === 'NetworkingError') return 'network';
        }
        if (fields.httpStatus === undefined && options?.system === 'payment') {
          const type = own(error, 'type');
          // These are reported SDK error classes, not claims that a vendor or region is down.
          const key = typeof type === 'string' ? type : fields.name ?? '';
          const category = Object.hasOwn(paymentErrorTypes, key) ? paymentErrorTypes[key] : undefined;
          if (category) return category;
        }
      }
      return undefined;
    },
  });
}
