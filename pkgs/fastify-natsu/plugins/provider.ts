import { FastifyInstance, FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify"
import fp from "fastify-plugin"

export type Provider<
  path extends string,
	value extends any,
	opts extends Record<string, any>
> = FastifyPluginAsync<{
  _provide: {
    key: path
		value: value
  }
} & opts>

export type ProviderDef<
	path extends string,
	value extends any,
	opts extends Record<string, any>
> = {
	path: path
	value: (options?: opts) => Promise<value>
}

export function createProvider<
	path extends string,
	value extends any,
	options extends Record<string, any> = {}
>(def: ProviderDef<path, value, options>): Provider<path, value, options> {
	return fp(async (f: FastifyInstance, opts: options) => {
		const instance: any = await def.value.bind(f)(opts)
		f._provider[def.path] = instance
	}, {
		name: `provider-${def.path}`,
		dependencies: ['fastify-provider']
	})
}

export type RequestProviderDef<
	path extends string,
	value extends any,
	opts extends Record<string, any>
> = {
	path: path
	value: (req: FastifyRequest, rep: FastifyReply, options?: opts) => Promise<value>
}

export function createRequestProvider<
	path extends string,
	value extends any,
	options extends Record<string, any> = {}
>(def: RequestProviderDef<path, value, options>): Provider<path, value, options> {
	return fp(async (f: FastifyInstance, opts: options) => {
		f.addHook('preValidation', async (req, rep) => {
			const instance: any = await def.value.bind(f)(req, rep, opts)
			req._provider[def.path] = instance
		})
	}, {
		name: `request-provider-${def.path}`,
		dependencies: ['fastify-provider']
	})
}

export const provider = fp(async (f: FastifyInstance) => {
	f.decorate('_provider', {})
	f.decorateRequest('_provider', () => {})

	f.addHook('onRequest', async function providerOnRequest(req, rep) {
		req._provider = { ...f._provider }
	})
}, {
	name: 'fastify-provider'
})

declare module 'fastify' {
	interface FastifyInstance {
		_provider: Record<string, any>
	}

	interface FastifyRequest {
		_provider: Record<string, any>
	}
}