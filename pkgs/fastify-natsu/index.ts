import { createRoute } from './route'
import { Router } from './builder'
import { natsPlugin } from './plugins/nats-plugin'
import { createProvider } from './plugins/provider'

type inferContext<T> = T extends Router<infer Route, infer Context> ? Context : any;
type inferRoute<T> = T extends Router<infer R, infer Context> ? R : unknown;

export {
	Router,
	natsPlugin as natsu,
	createRoute,
	createProvider,
}

export type {
	inferContext,
	inferRoute
}
