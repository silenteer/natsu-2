import "./tracing"
import fastify, { FastifyInstance, FastifyListenOptions, FastifyRegister, FastifyServerOptions } from "fastify";

import { NatsHandleResult } from "@silenteer/natsu";
import { A } from "ts-toolbelt";

import { createRoute, Route, RouteDef } from "./route";
import { nats, type NatsOptions } from "./plugins/nats"
import bridge from "./plugins/bridge"
import timeout, { type TimeoutConfig } from "./plugins/timeout"
import { provider, Provider } from "./plugins/provider";

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

type NatsOpts = {
	nats?: NatsOptions
}

export type RouterOpts = FastifyOpts & PortOpts & TimeoutConfig & NatsOpts

type inferRoute<T> = T extends Route<infer path, infer req, infer res, any> ? {
	subject: path
	request: req
	response: res
} : any;

type RouterInjector = {
	routerFastify: FastifyInstance
}

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
	private opts: RouterOpts
	fastify: FastifyInstance
	register: FastifyRegister<typeof this>

	constructor(routerOpts?: RouterOpts) {
		const parsedConfig = routerConfigSchema
			.passthrough()
			.parse(routerOpts)

		this.opts = parsedConfig
		this.fastify = routerOpts?.fastify
			? routerOpts.fastify
			: fastify(routerOpts?.serverOpts);

		this.fastify.log.info({routerOpts: this.opts}, "Starting server with")

		this.fastify.register(sensible)
		this.fastify.register(timeout, { timeout: this.opts.timeout })
		
		this.register = (plugin: any, opts: any) => {
			this.fastify.register(plugin, opts)
			return this;
		}
		
		this.register(bridge);
		this.register(provider);
		
		this.register(nats, routerOpts?.nats)

		if (routerOpts?.portEnabled) {
			this.register(portServer, routerOpts?.portServerOpts)
		}

	}

	use<
		path extends string,
		value extends any,
		options extends Record<string, any>
	>(
		def: Provider<path, value, options>, 
		opts: options,
		enable: boolean | (() => boolean) = true
	): Router<routes, context & Record<path, value>> {
		if (enable) {
			this.register(def, opts as any);
		} else {
			this.fastify.log.info(def, "ignoring registration")
		}
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
		this.fastify.log.info("starting");
		await this.fastify.listen({ ...this?.opts?.listenOpts })
			.then(started => {
				this.fastify.log.info("server started successfully");
			})
			.catch(error => {
				this.fastify.log.error(error, 'caught startup exception, exitting')
				process.exit(1)
			})
		
		return this
	}

}