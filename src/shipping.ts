/**
 * Browser-safe shipping contracts. This entry has no executor, provider SDK,
 * storage, React, or Node dependencies. Register trusted factories in your host.
 */
export type ShippingPolicy = {
  mode: 'flat' | 'carrier';
  enabled: boolean;
  provider: string | null;
  testMode: boolean;
  handlingDays?: number;
  reason?: 'not_configured' | 'setup_required';
};

export type ShippingSelection = { quoteId: string; rateId: string };

export type ShippingRate = {
  /** Opaque provider value: do not parse it or assume a vendor prefix. */
  rateId: string;
  carrier: string;
  service: string;
  amountCents: number;
  /** Current contract uses USD integer cents; do not silently convert currencies. */
  currency: 'USD';
  /** Carrier transit time, separate from the merchant's preparation time. */
  estimatedDays?: number;
  estimatedDeliveryAt?: string;
  guaranteed: boolean;
};

export type ShippingQuote = {
  quoteId: string;
  expiresAt: string;
  rates: ShippingRate[];
};

export const shipmentStatuses = Object.freeze([
  'QUOTED', 'PURCHASING', 'PURCHASE_UNKNOWN', 'LABEL_CREATED',
  'PRE_TRANSIT', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED',
  'EXCEPTION', 'CANCELED',
] as const);

export type ShipmentStatus = (typeof shipmentStatuses)[number];

export type ShipmentSummary = {
  shipmentId: string;
  provider: string;
  mode: 'test' | 'production';
  carrier?: string;
  service?: string;
  status: ShipmentStatus;
  trackingNumber?: string;
  trackingUrl?: string;
  estimatedDeliveryAt?: string;
  deliveredAt?: string;
  amountCents?: number;
  currency?: 'USD';
};

export type ShippingAddress = {
  name: string;
  street1: string;
  street2?: string;
  city: string;
  state: string;
  zip: string;
  /** ISO country code. The host and adapter enforce supported destinations. */
  country: string;
  phone?: string;
  email?: string;
};

export type ShippingParcel = {
  lengthIn: number;
  widthIn: number;
  heightIn: number;
  weightOz: number;
};

export type ProviderShipment = {
  id: string;
  reference: string;
  mode: 'test' | 'production';
  rates: ShippingRate[];
  selectedRateId?: string;
  labelUrl?: string;
  trackerId?: string;
  trackingNumber?: string;
  trackingUrl?: string;
  status?: ShipmentStatus;
  updatedAt?: string;
  estimatedDeliveryAt?: string;
};

export interface ShippingProvider {
  readonly provider: string;
  createShipment(input: {
    origin: ShippingAddress;
    destination: ShippingAddress;
    parcel: ShippingParcel;
    reference: string;
  }): Promise<ProviderShipment>;
  retrieveShipment(id: string): Promise<ProviderShipment>;
  buyShipment(id: string, rateId: string): Promise<ProviderShipment>;
  retrieveTracker(id: string): Promise<{
    shipmentId: string;
    trackerId: string;
    mode: 'test' | 'production';
    status: ShipmentStatus;
    updatedAt: string;
    trackingNumber?: string;
    trackingUrl?: string;
    estimatedDeliveryAt?: string;
  }>;
}

export type ShippingWebhookRequest = {
  /** The original bytes, before parsing or re-serialization. */
  body: Uint8Array;
  headers: Record<string, string | undefined>;
  method: string;
  path: string;
};

export type ShippingTrackingEvent = {
  eventId: string;
  trackerId: string;
  shipmentId: string;
};

export type ShippingAdapter = {
  provider: ShippingProvider;
  /**
   * Authenticate the request before normalizing it. Throw on invalid signatures;
   * return undefined only for authenticated events that do not concern tracking.
   * The host must retrieve the tracker and verify ownership/mode before applying it.
   */
  verifyWebhook(request: ShippingWebhookRequest):
    Promise<ShippingTrackingEvent | undefined> | ShippingTrackingEvent | undefined;
};

export type ShippingAdapterContext = {
  mode: 'test' | 'production';
  /** Private host-resolved values; never send this context to the browser or traces. */
  credentials: Readonly<Record<string, string>>;
};

/** Construction is synchronous; network operations belong to the returned adapter. */
export type ShippingAdapterFactory = (context: ShippingAdapterContext) => ShippingAdapter;

export type ShippingAdapterRegistry = {
  has(id: string): boolean;
  create(id: string, context: ShippingAdapterContext): ShippingAdapter;
};

export function isShippingProviderId(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 64
    && /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(value);
}

/** Labels and tracking links are untrusted provider/customer values. */
export function safeShippingUrl(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length > 2048) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Explicit, immutable registration: no import(), eval, package names or URLs from
 * deployment configuration. Factories are trusted host code, not a sandbox.
 * Errors intentionally exclude provider identifiers, credentials and causes.
 */
export function createShippingAdapterRegistry(
  factories: Record<string, ShippingAdapterFactory>,
): ShippingAdapterRegistry {
  const registered = new Map<string, ShippingAdapterFactory>();
  try {
    if (!factories || typeof factories !== 'object' || Array.isArray(factories)) throw new Error();
    for (const [id, factory] of Object.entries(factories)) {
      if (!isShippingProviderId(id) || typeof factory !== 'function') throw new Error();
      registered.set(id, factory);
    }
  } catch {
    throw new Error('Invalid shipping adapter registration');
  }
  return Object.freeze({
    has(id: string) {
      return isShippingProviderId(id) && registered.has(id);
    },
    create(id: string, context: ShippingAdapterContext) {
      // Check registration before resolving or touching credential values.
      if (!isShippingProviderId(id) || !registered.has(id)) {
        throw new Error('Shipping adapter is not registered');
      }
      try {
        if (!context || (context.mode !== 'test' && context.mode !== 'production')
          || !context.credentials || typeof context.credentials !== 'object'
          || Array.isArray(context.credentials)) throw new Error();
        const entries = Object.entries(context.credentials);
        if (entries.some(([, value]) => typeof value !== 'string')) throw new Error();
        const privateContext = Object.freeze({
          mode: context.mode,
          credentials: Object.freeze(Object.fromEntries(entries)),
        });
        const adapter = registered.get(id)!(privateContext);
        const provider = adapter?.provider;
        if (!provider || provider.provider !== id || typeof adapter.verifyWebhook !== 'function'
          || !['createShipment', 'retrieveShipment', 'buyShipment', 'retrieveTracker']
            .every(operation => typeof provider[operation as keyof ShippingProvider] === 'function')) {
          throw new Error();
        }
        return adapter;
      } catch {
        // A third-party constructor may throw a message containing its key.
        throw new Error('Shipping adapter could not be initialized');
      }
    },
  });
}
