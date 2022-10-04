import "./tracing"

import { createRoute } from './route'
import { Router } from './router'
import { createProvider } from './plugins/provider'

type inferContext<T> = T extends Router<infer Route, infer Context> ? Context : any;
type inferRoute<T> = T extends Router<infer R, infer Context> ? R : unknown;

export {
	Router,
	createRoute,
	createProvider,
}

export type {
	inferContext,
	inferRoute
}
