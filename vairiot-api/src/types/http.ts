import type { Request as ExpressRequest } from 'express';
import type { ParamsFlatDictionary } from 'express-serve-static-core';

// @types/express 5 widened route params to `string | string[]`
// (`ParamsDictionary`). The array half models repeated and wildcard params —
// `/*splat`, or the same name twice in one path. This API uses none of those:
// every route is single named segments, so `req.params.x` is always a string
// at runtime, and `ParamsFlatDictionary` says exactly that.
//
// Routers import `Request` from here instead of from 'express'. Stating it
// once beats 131 casts across 24 routers asserting what the routes already
// guarantee. If a wildcard route is ever added, drop this alias and the
// compiler will point at every site that then has to handle the union.
export type Request = ExpressRequest<ParamsFlatDictionary>;
