// Polyfill shim injected at the top of the CJS bundle by esbuild.
// Provides Web Platform APIs that vm2 (Node.js Lab) strips from the sandbox.
// Only sets globals that are missing — real Node 18 environments already have them.
import { Request, Response, Headers, FormData } from 'node-fetch';
import { ReadableStream, WritableStream, TransformStream } from 'node:stream/web';

if (typeof globalThis.Request === 'undefined')     globalThis.Request = Request;
if (typeof globalThis.Response === 'undefined')    globalThis.Response = Response;
if (typeof globalThis.Headers === 'undefined')     globalThis.Headers = Headers;
if (typeof globalThis.FormData === 'undefined')    globalThis.FormData = FormData;
if (typeof globalThis.ReadableStream === 'undefined')  globalThis.ReadableStream = ReadableStream;
if (typeof globalThis.WritableStream === 'undefined')  globalThis.WritableStream = WritableStream;
if (typeof globalThis.TransformStream === 'undefined') globalThis.TransformStream = TransformStream;
