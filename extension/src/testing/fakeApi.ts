import { vi } from 'vitest';
import { API_BASE, GEO_TRACE_URL } from '../lib/config';

/** One request the panel made while a test was running. */
export interface FakeCall {
  method: string;
  /** The path alone, so a test matches on it without repeating the host. */
  path: string;
  url: string;
  /** The body as the browser sent it: a JSON string, FormData for uploads, or null. */
  body: string | FormData | null;
  /** The parsed JSON body, or null when the request carried none. */
  json: unknown;
  /** The request headers exactly as the panel set them. */
  headers: Record<string, string>;
}

export interface FakeAnswer {
  status?: number;
  /** Served inside the API's `{ data }` envelope, which every read endpoint expects. */
  data?: unknown;
  /** The exact body to send, for the endpoints that answer with the body itself. */
  json?: unknown;
  /** A plain text body, for the country trace. */
  text?: string;
}

export type FakeResponder = (call: FakeCall) => FakeAnswer;

interface Route {
  method: string;
  path: string | RegExp;
  answer: FakeAnswer | FakeResponder;
  /** When set, the request waits on it, which is how a test holds a state open. */
  gate?: Promise<void>;
}

/** A request no route answered, or one aimed outside the local API. */
export interface RefusedRequest {
  method: string;
  url: string;
  reason: string;
}

const refused: RefusedRequest[] = [];

/** Every request the stub has refused since the last check; setup.ts fails the test on it. */
export function refusedRequests(): RefusedRequest[] {
  return refused;
}

export function clearRefusedRequests(): void {
  refused.length = 0;
}

/** Record a request nothing answered, so the test that made it fails (spec 0001, AC-9). */
export function refuseRequest(method: string, url: string, reason: string): void {
  refused.push({ method, url, reason });
}

export interface FakeApi {
  /** Every request seen, oldest first. */
  readonly calls: FakeCall[];
  /** Answer `METHOD path` from now on; `path` is a pathname or a pattern over one. */
  on(method: string, path: string | RegExp, answer: FakeAnswer | FakeResponder): FakeApi;
  /** Hold the answer for `METHOD path` until the returned function is called. */
  hold(method: string, path: string | RegExp): () => void;
  /** The calls that matched, oldest first. */
  callsTo(method: string, path: string): FakeCall[];
  /** Replace global fetch for this test. Vitest puts the real one back afterwards. */
  install(): FakeApi;
}

/**
 * A fetch stand-in that answers from fixtures and refuses everything else, so no
 * test can reach a real host or write to the live review queues (spec 0001, AC-9).
 */
export function fakeApi(): FakeApi {
  const calls: FakeCall[] = [];
  const routes: Route[] = [
    // The country check reads plain text off the trace host: Syria unless a test overrides it.
    { method: 'GET', path: new URL(GEO_TRACE_URL).pathname, answer: { text: 'fl=v8\nloc=SY\nts=1758000000\n' } },
  ];

  const findRoute = (call: FakeCall): Route | undefined =>
    // The last answer registered wins, so a test can override a built in one.
    routes.findLast(
      (candidate) =>
        candidate.method === call.method &&
        (typeof candidate.path === 'string' ? candidate.path === call.path : candidate.path.test(call.path)),
    );

  const respond = async (call: FakeCall): Promise<Response> => {
    const route = findRoute(call);
    if (route === undefined) {
      refuseRequest(call.method, call.url, 'no stub answered it');
      return Response.json(
        { error: 'UNSTUBBED', message: `No fake answer for ${call.method} ${call.path}` },
        { status: 500 },
      );
    }
    if (route.gate !== undefined) await route.gate;
    const answer = typeof route.answer === 'function' ? route.answer(call) : route.answer;
    if (answer.text !== undefined) {
      return new Response(answer.text, { status: answer.status ?? 200, headers: { 'content-type': 'text/plain' } });
    }
    const body = answer.data !== undefined ? { data: answer.data } : (answer.json ?? null);
    return Response.json(body, { status: answer.status ?? 200 });
  };

  const fetchStub = ((input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const method = (init?.method ?? 'GET').toUpperCase();
    if (url !== GEO_TRACE_URL && !url.startsWith(API_BASE)) {
      refuseRequest(method, url, 'outside the local API');
      return Promise.reject(new Error(`fakeApi refuses a request outside the local API: ${method} ${url}`));
    }

    const sent = init?.body ?? null;
    const body = typeof sent === 'string' ? sent : sent instanceof FormData ? sent : null;
    let json: unknown = null;
    if (body !== null && typeof body === 'string' && body.length > 0) {
      try {
        json = JSON.parse(body) as unknown;
      } catch {
        json = null;
      }
    }
    const headers: Record<string, string> = {};
    for (const [key, value] of Object.entries(init?.headers ?? {})) headers[key] = String(value);

    const call: FakeCall = { method, path: new URL(url).pathname, url, body, json, headers };
    calls.push(call);
    return respond(call);
  }) satisfies typeof fetch;

  const api: FakeApi = {
    calls,
    on(method, path, answer) {
      routes.push({ method: method.toUpperCase(), path, answer });
      return api;
    },
    hold(method, path) {
      let release: () => void = () => undefined;
      const gate = new Promise<void>((resolve) => {
        release = () => resolve();
      });
      // The last answer registered wins, so a held answer covers any other.
      routes.push({ method: method.toUpperCase(), path, answer: { json: null }, gate });
      return () => release();
    },
    callsTo(method, path) {
      return calls.filter((call) => call.method === method.toUpperCase() && call.path === path);
    },
    install() {
      vi.stubGlobal('fetch', vi.fn(fetchStub));
      return api;
    },
  };
  return api;
}
