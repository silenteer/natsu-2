import "./tracing"
import fastify, { FastifyInstance, FastifyListenOptions, FastifyRegister, FastifyServerOptions } from "fastify";

import { NatsHandleResult } from "@silenteer/natsu";
import { A } from "ts-toolbelt";

import { createRoute, Route, RouteDef } from "./route";
import { nats } from "./plugins/nats"
import bridge from "./plugins/bridge"
import timeout, { type TimeoutConfig } from "./plugins/timeout"
import { provider, Provider } from "./plugins/provider";
import fp from "fastify-plugin";

import zod from "zod"

import sensible from "@fastify/sensible"

import { portServer, PortServerOpts } from "@silenteer/natsu-port-server-2"

type checkImplements<ServiceContext, RouteContext> =
	ServiceContext extends Record<string, unknown>
	? Record<string, unknown>
	: A.Extends<RouteContext, ServiceContext> extends 1
	? ServiceContext
	: never;

type FastifyOpts = {
	fastify: FastifyInstance
	serverOpts?: undefined
	listenOpts?: undefined
} | {
	fastify?: undefined
	serverOpts?: FastifyServerOptions
	listenOpts?: FastifyListenOptions
}

type PortOpts = {
	portEnabled?: boolean
	portServerOpts?: PortServerOpts
}

type RouterOpts = FastifyOpts & PortOpts & TimeoutConfig

type inferRoute<T> = T extends Route<infer path, infer req, infer res, any> ? {
	subject: path
	request: req
	response: res
} : any;

type RouterInjector = {
	routerFastify: FastifyInstance
}

const router = fp(function (fastify: FastifyInstance, opts: RouterInjector, done: Function) {
	// Follow fastify context structure, the route must be registered to this fastify instance to inherit those plugins
	// including all of those decorateRequest(s)
	opts.routerFastify = fastify
	done()
}, {
	name: 'fastify-router'
})

const routerConfigSchema = zod.object({
	portEnabled: zod.boolean().optional().default(false),
	listenOpts: zod.any()
		.optional()
		.default({ port: 0 }),
	serverOpts: zod.any()
		.optional()
		.default({
			logger: {
				level: 'debug'
			},
		} as FastifyServerOptions),
	timeout: zod.number().optional().default(5000)
})

export class Router<
	routes extends Route<any, any, any, any> = never,
	context extends Record<string, any> = {}
> {
	fastify: FastifyInstance
	private opts: RouterOpts
	private root: FastifyInstance
	
	register: FastifyRegister<typeof this>

	constructor(routerOpts?: RouterOpts) {
		const parsedConfig = routerConfigSchema
			.passthrough()
			.parse(routerOpts)

		this.opts = parsedConfig
		this.root = routerOpts?.fastify
			? routerOpts.fastify
			: fastify(routerOpts?.serverOpts);

		this.root.log.info({routerOpts: this.opts}, "Starting server with")

		const routerFastifyRef = { routerFastify: this.root }
		this.root.register(router, routerFastifyRef)
		this.root.register(sensible)
		this.root.register(timeout, { timeout: this.opts.timeout })
		
		// Set the fastify to the child context, as such, all of routes are going to be under this context
		this.fastify = routerFastifyRef.routerFastify;
		
		this.register = (plugin, opts) => {
			this.fastify.register(plugin, opts)
			return this;
		}
		// this.register(allHooks)
		this.register(bridge);
		this.register(provider);
		
		this.register(nats)

		if (this.opts.portEnabled) {
			this.root.register(portServer, parsedConfig)
		}
	}

	use<
		path extends string,
		value extends any,
		options extends Record<string, any>
	>(def: Provider<path, value, options>): Router<routes, context & Record<path, value>> {
		this.register(def);
		return this as any;
	}

	route<
		path extends string,
		req, res,
		routeCtx extends Record<string, unknown>
	>(def: RouteDef<path, req, res, checkImplements<context, routeCtx>>)
		: Router<routes | Route<path, req, res, routeCtx>, context>;

	route<
		path extends string,
		req, res,
		routeCtx extends Record<string, any>
	>(def: Route<path, req, res, checkImplements<context, routeCtx>>): Router<routes | Route<path, req, res, routeCtx>, context>

	route<
		path extends string,
		req, res,
		routeCtx extends Record<string, any>
	>(def:
		Route<path, req, res, checkImplements<context, routeCtx>> |
		RouteDef<path, req, res, checkImplements<context, routeCtx>>
	): Router<routes | Route<path, req, res, routeCtx>, context> {
		if (typeof def === 'function') {
			this.register(def)
		} else {
			this.register(createRoute(def))
		}

		return this as any;
	}

	declare Routes: inferRoute<routes>
	declare Context: context

	async call<
		path extends string = this['Routes']['subject'],
		input extends any = Extract<this['Routes'], { subject: path }>['request'],
		result extends any = NatsHandleResult<Extract<this['Routes'], { subject: path }>>
	>(
		subject: path,
		input?: input
			| Exclude<{
				headers?: Record<string, string>,
				body: input
			}, input>
	): Promise<result> {
		await this.fastify.ready()
		return this.fastify.bridge(subject, {
			data: input
		})
	}

	async start() {
		this.root.log.info("starting");
		await this.root.listen({ ...this?.opts?.listenOpts })
			.then(started => {
				this.root.log.info("server started successfully");
			})
			.catch(error => {
				this.root.log.error(error, 'caught startup exception, exitting')
				process.exit(1)
			})
		
		return this
	}

}