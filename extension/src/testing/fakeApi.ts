import { vi } from 'vitest';
import { API_BASE, GEO_TRACE_URL } from '../lib/config';

/** A request the panel made during a test. */
export interface FakeCall {
  method: string;
  /** Pathname only, without the host. */
  path: string;
  url: string;
  /** Raw body. A JSON string, FormData for uploads, or null. */
  body: string | FormData | null;
  /** Parsed JSON body, or null if there is none or it does not parse. */
  json: unknown;
  /** Headers as the panel set them. */
  headers: Record<string, string>;
}

export interface FakeAnswer {
  status?: number;
  /** Wrapped in the `{ data }` envelope that read endpoints use. */
  data?: unknown;
  /** Sent as is, for endpoints that return an unwrapped body. */
  json?: unknown;
  /** Plain text body, for the country trace. */
  text?: string;
}

export type FakeResponder = (call: FakeCall) => FakeAnswer;

interface Route {
  method: string;
  path: string | RegExp;
  answer: FakeAnswer | FakeResponder;
  /** The response waits on this, so a test can hold a pending state open. */
  gate?: Promise<void>;
}

/** A request no route answered, or one aimed outside the local API. */
export interface RefusedRequest {
  method: string;
  url: string;
  reason: string;
}

const refused: RefusedRequest[] = [];

/** Requests refused since the last clear. setup.ts fails the test if there are any. */
export function refusedRequests(): RefusedRequest[] {
  return refused;
}

export function clearRefusedRequests(): void {
  refused.length = 0;
}

/** Records a refused request so the test that made it fails. */
export function refuseRequest(method: string, url: string, reason: string): void {
  refused.push({ method, url, reason });
}

export interface FakeApi {
  /** All requests, oldest first. */
  readonly calls: FakeCall[];
  /** Answers `METHOD path`. `path` is a pathname or a RegExp over one. The latest match wins. */
  on(method: string, path: string | RegExp, answer: FakeAnswer | FakeResponder): FakeApi;
  /** Holds `METHOD path` until the returned function is called, then answers with `answer` (a null body by default). */
  hold(method: string, path: string | RegExp, answer?: FakeAnswer | FakeResponder): () => void;
  /** Calls with this method and exact path, oldest first. */
  callsTo(method: string, path: string): FakeCall[];
  /** Stubs global fetch for this test. `unstubGlobals` restores it afterwards. */
  install(): FakeApi;
}

/**
 * A fetch stub that answers only the routes a test registers. Everything else is
 * refused, so no test can reach a real host or write to the live review queues.
 */
export function fakeApi(): FakeApi {
  const calls: FakeCall[] = [];
  const routes: Route[] = [
    // Country check answer: Syria, unless a test overrides it.
    { method: 'GET', path: new URL(GEO_TRACE_URL).pathname, answer: { text: 'fl=v8\nloc=SY\nts=1758000000\n' } },
    // The card asks for the record behind a matched service as soon as it
    // matches. This answer carries no parts and no alternatives, so a test that
    // wants either answers this route itself. Routes registered later win.
    {
      method: 'GET',
      path: /^\/services\/[^/]+$/,
      answer: { data: { id: 'svc-record', name: 'Record', url: null, functionalities: [], alternatives: [] } },
    },
  ];

  const findRoute = (call: FakeCall): Route | undefined =>
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
    hold(method, path, answer = { json: null }) {
      let release: () => void = () => undefined;
      const gate = new Promise<void>((resolve) => {
        release = () => resolve();
      });
      routes.push({ method: method.toUpperCase(), path, answer, gate });
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
