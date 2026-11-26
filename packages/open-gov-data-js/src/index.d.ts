export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | readonly JsonValue[];
export interface JsonObject {
  readonly [key: string]: JsonValue;
}

export type Provider = 'apify' | 'rapidapi';
export type MoneyInput = string | number;

/** The eight enumerable Apify catalog keys. v0.1.0 keys remain unchanged. */
export type ApifySourceKey =
  | 'atsJobsHiringSignals'
  | 'secEdgar'
  | 'globalPublicTenders'
  | 'pharmaPipelineIntelligence'
  | 'usaspendingContracts'
  | 'clinicalTrials'
  | 'ukGovTenders'
  | 'singaporeGreenMark';
export type ApifySourceAlias = 'secEdgarIntelligence' | 'sgGreenMark';
export type ApifyCatalogKey = ApifySourceKey | ApifySourceAlias;

/** The four v0.1.0 RapidAPI catalog keys. */
export type RapidApiSourceKey =
  | 'secEdgar'
  | 'clinicalTrials'
  | 'openFda'
  | 'singaporeGreenMark';
export type RapidApiSourceAlias =
  | 'secEdgarCorporateFilings'
  | 'clinicaltrialsStudies'
  | 'openfdaRecalls'
  | 'sgGreenMarkBuildings';
export type RapidApiCatalogKey = RapidApiSourceKey | RapidApiSourceAlias;

export type ActorSchemaKey =
  | 'atsJobsHiringSignals'
  | 'secEdgarIntelligence'
  | 'globalPublicTenders'
  | 'pharmaPipelineIntelligence'
  | 'usaspendingContracts'
  | 'clinicalTrials'
  | 'ukGovTenders'
  | 'sgGreenMark';
export type RapidApiSchemaKey = RapidApiSourceAlias;

export interface ApifySourceDefinition {
  readonly key: ApifyCatalogKey;
  readonly label: string;
  readonly actorId: string;
}

export interface RapidApiSourceDefinition {
  readonly key: RapidApiCatalogKey;
  readonly label: string;
  readonly apiSlug: string;
  readonly host: string;
  readonly path: string;
}

export const APIFY_SOURCES: Readonly<
  Record<ApifySourceKey, Readonly<ApifySourceDefinition>>
  & Record<ApifySourceAlias, Readonly<ApifySourceDefinition>>
>;
export const RAPIDAPI_SOURCES: Readonly<
  Record<RapidApiSourceKey, Readonly<RapidApiSourceDefinition>>
  & Record<RapidApiSourceAlias, Readonly<RapidApiSourceDefinition>>
>;

export interface Catalog {
  apify: ApifySourceDefinition[];
  rapidapi: RapidApiSourceDefinition[];
}

export function getCatalog(): Catalog;

export interface JsonSchema {
  readonly type?: 'object' | 'array' | 'string' | 'integer' | 'number' | 'boolean' | 'null';
  readonly properties?: Readonly<Record<string, JsonSchema>>;
  readonly required?: readonly string[];
  readonly items?: JsonSchema;
  readonly enum?: readonly JsonPrimitive[];
  readonly default?: JsonValue;
  readonly minimum?: number;
  readonly maximum?: number;
  readonly minLength?: number;
  readonly maxLength?: number;
  readonly additionalProperties?: boolean;
}

export const ACTOR_SCHEMA_SOURCES: Readonly<Record<ActorSchemaKey, string>>;
export const APIFY_INPUT_SCHEMAS: Readonly<Record<ActorSchemaKey, JsonSchema>>;
export const RAPIDAPI_QUERY_SCHEMAS: Readonly<Record<RapidApiSchemaKey, JsonSchema>>;

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
  /** Generic v0.1 method range: 1..1000. Typed helpers use each Actor schema's range. */
  maxItems?: number;
  /** May lower, but never raise, the client hard ceiling. */
  maxTotalChargeUsd?: MoneyInput;
}

export interface RapidApiRequestOptions {
  /** Generic v0.1 method range: 1..1000. Typed helpers enforce each endpoint's 1..20 limit. */
  maxItems?: number;
  /** RapidAPI has no equivalent server-side USD cap, so this is rejected at runtime. */
  maxTotalChargeUsd?: never;
}

export interface AtsJobsHiringSignalsInput {
  preset?: 'ai_leaders' | 'fintech_saas' | 'all_curated' | 'custom_only';
  companyBoards?: string[];
  keywords?: string;
  remoteOnly?: boolean;
  departmentFilter?: string;
  includeDescription?: boolean;
  maxItems?: number;
}

export interface SecEdgarIntelligenceInput {
  mode?: 'form_d_funding' | 'xbrl_financials' | 'filings';
  query?: string;
  ticker?: string;
  cik?: string;
  forms?: string;
  startDate?: string;
  endDate?: string;
  excludePooledFunds?: boolean;
  minOfferingAmountUsd?: number;
  industryFilter?: string;
  includeAmendments?: boolean;
  maxItems?: number;
}

export type GlobalTenderSource =
  | 'uk_find_a_tender'
  | 'eu_ted'
  | 'us_grants_gov'
  | 'usaspending'
  | 'world_bank'
  | 'canada_contracts'
  | 'austender';
export type OpportunityType = 'tender' | 'grant' | 'award';

export interface GlobalPublicTendersInput {
  sources?: GlobalTenderSource[];
  opportunityTypes?: OpportunityType[];
  keyword?: string;
  dateFrom?: string;
  dateTo?: string;
  maxItems?: number;
  perSourceLimit?: number;
  sourceTimeoutSecs?: number;
}

export interface PharmaPipelineIntelligenceInput {
  mode?: 'drug_dossier' | 'pipeline_feed';
  query?: string;
  drugNames?: string[];
  maxItems?: number;
  sourceItemsPerQuery?: number;
  sourceTimeoutSeconds?: number;
  requestDelayMs?: number;
}

export interface UsaspendingContractsInput {
  keyword?: string;
  awardCategory?: 'contracts' | 'grants' | 'idvs';
  startDate?: string;
  endDate?: string;
  awardingAgency?: string;
  minAwardAmount?: number;
  naicsCode?: string;
  sortOrder?: 'desc' | 'asc';
  maxItems?: number;
}

export type ClinicalTrialStatus =
  | ''
  | 'RECRUITING'
  | 'NOT_YET_RECRUITING'
  | 'ACTIVE_NOT_RECRUITING'
  | 'COMPLETED'
  | 'ENROLLING_BY_INVITATION'
  | 'SUSPENDED'
  | 'TERMINATED'
  | 'WITHDRAWN'
  | 'UNKNOWN';

export interface ClinicalTrialsInput {
  condition?: string;
  intervention?: string;
  status?: ClinicalTrialStatus;
  sponsor?: string;
  queryTerm?: string;
  maxItems?: number;
}

export interface UkGovTendersInput {
  keyword?: string;
  stages?: 'tender' | 'planning' | 'award' | 'planning,tender,award';
  minValue?: number;
  publishedFrom?: string;
  maxItems?: number;
}

export type GreenMarkRating = '' | 'Platinum' | 'Goldplus' | 'Gold' | 'Certified';

export interface SgGreenMarkInput {
  query?: string;
  rating?: GreenMarkRating;
  expiresWithinDays?: number;
  maxItems?: number;
}

export interface SecEdgarCorporateFilingsQuery {
  mode?: 'search' | 'company';
  query?: string;
  forms?: string;
  cik?: string;
  ticker?: string;
  startDate?: string;
  endDate?: string;
  limit?: number;
}

export interface ClinicaltrialsStudiesQuery {
  condition?: string;
  intervention?: string;
  status?: Exclude<ClinicalTrialStatus, ''>;
  sponsor?: string;
  queryTerm?: string;
  limit?: number;
}

export interface OpenfdaRecallsQuery {
  dataset?: 'drug_enforcement' | 'device_recall' | 'food_enforcement' | 'drug_approvals';
  searchQuery?: string;
  classification?: 'Class I' | 'Class II' | 'Class III';
  status?: 'Ongoing' | 'Completed' | 'Terminated';
  limit?: number;
}

export interface SgGreenMarkBuildingsQuery {
  rating?: Exclude<GreenMarkRating, ''>;
  limit?: number;
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
    source: ApifyCatalogKey,
    requestInput?: JsonObject | string | null,
    options?: ApifyRequestOptions,
  ): Promise<T | null>;
  request<T extends JsonValue = JsonValue>(
    provider: 'rapidapi',
    source: RapidApiCatalogKey,
    requestInput?: JsonObject | string | null,
    options?: RapidApiRequestOptions,
  ): Promise<T | null>;

  records<T extends JsonValue = JsonValue>(
    provider: 'apify',
    source: ApifyCatalogKey,
    requestInput?: JsonObject | string | null,
    options?: ApifyRequestOptions,
  ): Promise<T[]>;
  records<T extends JsonValue = JsonValue>(
    provider: 'rapidapi',
    source: RapidApiCatalogKey,
    requestInput?: JsonObject | string | null,
    options?: RapidApiRequestOptions,
  ): Promise<T[]>;

  runActor<T extends JsonValue = JsonValue>(
    source: ApifyCatalogKey,
    actorInput?: JsonObject | string | null,
    options?: ApifyRequestOptions,
  ): Promise<T | null>;

  queryRapidApi<T extends JsonValue = JsonValue>(
    source: RapidApiCatalogKey,
    query?: JsonObject | string | null,
    options?: RapidApiRequestOptions,
  ): Promise<T | null>;

  atsJobsHiringSignals<T extends JsonValue = JsonValue>(input?: AtsJobsHiringSignalsInput, options?: ApifyRequestOptions): Promise<T | null>;
  secEdgarIntelligence<T extends JsonValue = JsonValue>(input?: SecEdgarIntelligenceInput, options?: ApifyRequestOptions): Promise<T | null>;
  globalPublicTenders<T extends JsonValue = JsonValue>(input?: GlobalPublicTendersInput, options?: ApifyRequestOptions): Promise<T | null>;
  pharmaPipelineIntelligence<T extends JsonValue = JsonValue>(input?: PharmaPipelineIntelligenceInput, options?: ApifyRequestOptions): Promise<T | null>;
  usaspendingContracts<T extends JsonValue = JsonValue>(input?: UsaspendingContractsInput, options?: ApifyRequestOptions): Promise<T | null>;
  clinicalTrials<T extends JsonValue = JsonValue>(input?: ClinicalTrialsInput, options?: ApifyRequestOptions): Promise<T | null>;
  ukGovTenders<T extends JsonValue = JsonValue>(input?: UkGovTendersInput, options?: ApifyRequestOptions): Promise<T | null>;
  sgGreenMark<T extends JsonValue = JsonValue>(input?: SgGreenMarkInput, options?: ApifyRequestOptions): Promise<T | null>;

  secEdgarCorporateFilings<T extends JsonValue = JsonValue>(query?: SecEdgarCorporateFilingsQuery, options?: RapidApiRequestOptions): Promise<T | null>;
  clinicaltrialsStudies<T extends JsonValue = JsonValue>(query?: ClinicaltrialsStudiesQuery, options?: RapidApiRequestOptions): Promise<T | null>;
  openfdaRecalls<T extends JsonValue = JsonValue>(query?: OpenfdaRecallsQuery, options?: RapidApiRequestOptions): Promise<T | null>;
  sgGreenMarkBuildings<T extends JsonValue = JsonValue>(query?: SgGreenMarkBuildingsQuery, options?: RapidApiRequestOptions): Promise<T | null>;
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
export function validateAgainstSchema<T>(
  value: T,
  schema: JsonSchema,
  options?: { rejectUnknown?: boolean },
  path?: string,
): T;

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
