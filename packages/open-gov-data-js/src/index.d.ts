export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | readonly JsonValue[];
export interface JsonObject {
  readonly [key: string]: JsonValue;
}

export type Provider = 'apify' | 'rapidapi';
export type ApifySourceKey =
  | 'secEdgar'
  | 'clinicalTrials'
  | 'ukGovTenders'
  | 'singaporeGreenMark';
export type RapidApiSourceKey =
  | 'secEdgar'
  | 'clinicalTrials'
  | 'openFda'
  | 'singaporeGreenMark';
export type MoneyInput = string | number;

export interface ApifySourceDefinition {
  readonly key: ApifySourceKey;
  readonly label: string;
  readonly actorId: string;
}

export interface RapidApiSourceDefinition {
  readonly key: RapidApiSourceKey;
  readonly label: string;
  readonly apiSlug: string;
  readonly host: string;
  readonly path: string;
}

export const APIFY_SOURCES: Readonly<Record<ApifySourceKey, Readonly<ApifySourceDefinition>>>;
export const RAPIDAPI_SOURCES: Readonly<Record<RapidApiSourceKey, Readonly<RapidApiSourceDefinition>>>;

export interface Catalog {
  apify: ApifySourceDefinition[];
  rapidapi: RapidApiSourceDefinition[];
}

export function getCatalog(): Catalog;

export interface OpenGovDataErrorOptions {
  statusCode?: number;
}

export class OpenGovDataError extends Error {
  readonly code: string;
  readonly statusCode?: number;
  constructor(code: string, message: string, options?: OpenGovDataErrorOptions);
  toJSON(): SafeError;
}

export interface SafeError {
  code: string;
  message: string;
  statusCode?: number;
}

export function safeError(error: unknown): SafeError;

export interface TestingEndpointOverrides {
  /** Test-only. Must be the production Apify origin or an explicit-port loopback origin. */
  apifyBaseUrl?: string;
  /** Test-only. Must be an explicit-port loopback origin. */
  rapidApiBaseUrl?: string;
}

export interface ClientOptions {
  apifyToken?: string;
  rapidApiKey?: string;
  /** Client-wide hard ceiling. A request may lower but never raise it. Default: 0.25. */
  maxTotalChargeUsd?: MoneyInput;
  /** Default: 30000. Range: 100..300000. */
  timeoutMs?: number;
  testing?: TestingEndpointOverrides;
}

export interface FromEnvOptions extends Omit<ClientOptions, 'apifyToken' | 'rapidApiKey'> {
  env?: Readonly<Record<string, string | undefined>>;
}

export interface ApifyRequestOptions {
  /** Default: 10. Range: 1..1000. */
  maxItems?: number;
  /** May lower, but never raise, the client hard ceiling. */
  maxTotalChargeUsd?: MoneyInput;
}

export interface RapidApiRequestOptions {
  /** Default: 10. Range: 1..1000. */
  maxItems?: number;
  /** RapidAPI has no equivalent server-side USD cap, so this is rejected at runtime. */
  maxTotalChargeUsd?: never;
}

export interface ClientPublicState {
  name: 'OpenGovDataClient';
  apifyConfigured: boolean;
  rapidApiConfigured: boolean;
  maxTotalChargeUsd: string;
  timeoutMs: number;
}

export class OpenGovDataClient {
  constructor(options?: ClientOptions);
  static fromEnv(options?: FromEnvOptions): OpenGovDataClient;
  get maxTotalChargeUsd(): string;
  get timeoutMs(): number;
  get apifyConfigured(): boolean;
  get rapidApiConfigured(): boolean;
  toJSON(): ClientPublicState;

  request<T extends JsonValue = JsonValue>(
    provider: 'apify',
    source: ApifySourceKey,
    requestInput?: JsonObject | string | null,
    options?: ApifyRequestOptions,
  ): Promise<T | null>;
  request<T extends JsonValue = JsonValue>(
    provider: 'rapidapi',
    source: RapidApiSourceKey,
    requestInput?: JsonObject | string | null,
    options?: RapidApiRequestOptions,
  ): Promise<T | null>;

  records<T extends JsonValue = JsonValue>(
    provider: 'apify',
    source: ApifySourceKey,
    requestInput?: JsonObject | string | null,
    options?: ApifyRequestOptions,
  ): Promise<T[]>;
  records<T extends JsonValue = JsonValue>(
    provider: 'rapidapi',
    source: RapidApiSourceKey,
    requestInput?: JsonObject | string | null,
    options?: RapidApiRequestOptions,
  ): Promise<T[]>;

  runActor<T extends JsonValue = JsonValue>(
    source: ApifySourceKey,
    actorInput?: JsonObject | string | null,
    options?: ApifyRequestOptions,
  ): Promise<T | null>;

  queryRapidApi<T extends JsonValue = JsonValue>(
    source: RapidApiSourceKey,
    query?: JsonObject | string | null,
    options?: RapidApiRequestOptions,
  ): Promise<T | null>;
}

export function extractRecords<T extends JsonValue = JsonValue>(payload: JsonValue | undefined): T[];

export const APIFY_BASE_URL: 'https://api.apify.com';
export const USER_AGENT: string;
export const MAX_ITEMS_LIMIT: 1000;
export const MIN_TIMEOUT_MS: 100;
export const MAX_TIMEOUT_MS: 300000;
export const MIN_CHARGE_USD: '0.00005';
export const MAX_CHARGE_USD: '100';
export const MAX_INPUT_BYTES: 1000000;
export const MAX_INPUT_DEPTH: 32;
export const MAX_RESPONSE_BYTES: 10000000;

export function validateCredential(provider: Provider, value: unknown): string;
export function validateMaxItems(value: unknown): number;
export function validateTimeoutMs(value: unknown): number;
export function validateMaxTotalChargeUsd(value: unknown): string;
export function compareMaxTotalChargeUsd(left: MoneyInput, right: MoneyInput): -1 | 0 | 1;
export function parseInput(value?: JsonObject | string | null): Record<string, JsonValue>;
export function rapidApiQueryValue(value: JsonValue): string | null;

export interface WritableStreamLike {
  write(chunk: string): unknown;
}

export interface CliIo {
  stdout?: WritableStreamLike;
  stderr?: WritableStreamLike;
  env?: Readonly<Record<string, string | undefined>>;
}

export const USAGE: string;
export function cliMain(argv?: string[], io?: CliIo): Promise<number>;
