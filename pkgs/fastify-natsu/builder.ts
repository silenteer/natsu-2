import fastify, { FastifyInstance, FastifyListenOptions, FastifyRegister, FastifyServerOptions } from "fastify";

import { NatsHandler, NatsHandleResult } from "@silenteer/natsu";
import { NatsService } from "@silenteer/natsu-type";
import { A, O } from "ts-toolbelt";

import { createRoute, Route } from "./route";
import { natsPlugin } from "./plugins/nats-plugin"
import fastifyClient from "./plugins/client";
import { provider, Provider } from "./plugins/provider";
import fastifyTimeout, { type TimeoutConfig } from './plugins/timeout'

type checkImplements<ServiceContext, RouteContext> =
	ServiceContext extends Record<string, unknown>
	? Record<string, unknown>
	: A.Extends<RouteContext, ServiceContext> extends 1
	? ServiceContext
	: never;

type LegacyHandlerDef<path extends string, req, res, context extends Record<string, unknown>> = O.Optional<
	NatsHandler<NatsService<path, req, res>, context>, "authorize" | "validate"
>


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
}

type HandlerOpt = {
	handler?: TimeoutConfig
}

type RouterOpts = FastifyOpts & PortOpts & Partial<HandlerOpt>

type inferRoute<T> = T extends Route<infer path, infer req, infer res, any> ? {
	subject: path
	request: req
	response: res
} : any;

declare module 'fastify' {
	interface FastifyRequest {
		_timeout: NodeJS.Timeout
	}
}

export class Router<
	routes extends Route<any, any, any, any> = never,
	context extends Record<string, any> = {}
> {
	fastify: FastifyInstance
	private opts: RouterOpts | undefined

	register: FastifyRegister<typeof this>

	constructor(routerOpts?: RouterOpts) {
		this.opts = routerOpts
		this.fastify = routerOpts?.fastify
			? routerOpts.fastify
			: fastify(routerOpts?.serverOpts);

		this.register = (plugin, opts) => {
			this.fastify.register(plugin, opts)
			return this;
		}
		this.register(fastifyTimeout, this.opts?.handler)

		this.register(fastifyClient);
		this.register(provider);

		if (this.opts?.portEnabled) {
			this.register(natsPlugin)
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
	>(def: LegacyHandlerDef<path, req, res, checkImplements<context, routeCtx>>)
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
		LegacyHandlerDef<path, req, res, checkImplements<context, routeCtx>>
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
		output extends any = NatsHandleResult<Extract<this['Routes'], { subject: path }>['response']>
	>(
		subject: path,
		input: input
			| Exclude<{
				headers?: Record<string, string>,
				body: input
			}, input>
	): Promise<output> {
		if (!this.fastify.server.listening) {
			throw new Error("Server needs to be started firstly")
		}

		return this.fastify.call(subject, input)
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