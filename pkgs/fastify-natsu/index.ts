import "./tracing"

import { createRoute } from './route'
import { Router } from './router'
import { createProvider, createRequestProvider } from './plugins/provider'

type inferContext<T> = T extends Router<infer Route, infer Context> ? Context : any;
type inferRoute<T> = T extends Router<infer R, infer Context> ? R : unknown;

export {
	Router,
	createRoute,
	createProvider,
	createRequestProvider
}

export type {
	inferContext,
	inferRoute
}
