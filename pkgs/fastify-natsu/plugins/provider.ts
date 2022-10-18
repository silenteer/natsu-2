import { FastifyInstance, FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify"
import fp from "fastify-plugin"
import Zod, { ZodType } from "zod"

type ValueProvider<
  path extends string,
	value extends any,
	config extends Record<string, any>
> = FastifyPluginAsync<{
  	_provide: {
    	key: path
			value: value
  	}
	} & config>

export type ProviderDef<
	path extends string,
	value extends any,
	config extends Record<string, any>,
	requestValue extends any,
	meta extends Record<string, any>
> = {
	path: path
	config?(z: typeof Zod): ZodType<config>
	meta?(z: typeof Zod): ZodType<meta>
	value?(options?: config): Promise<value>
	requestValue?(req: FastifyRequest, rep: FastifyReply, config: { config?: config, meta?: meta}): Promise<requestValue>
}

export type Provider<
  path extends string,
	value extends any,
	config extends Record<string, any>,
	requestValue extends any = undefined,
	meta extends Record<string, any> = {}
> = [
	ValueProvider<path, value, config>,
	(meta: meta) => (req: FastifyRequest, rep: FastifyReply) => Promise<void>
]

export type inferMeta<T> = T extends Provider<infer Path, infer Value, infer Config, infer RequestValue, infer Meta> ? Record<Path, Meta> : never
export type inferPath<T> = T extends Provider<infer Path, infer Value, infer Config, infer RequestValue, infer Meta> ? Path : never
export type inferValue<T> = T extends Provider<infer Path, infer Value, infer Config, infer RequestValue, infer Meta> ? Record<Path, Value> : never

export function createProvider<
	path extends string,
	value extends any,
	options extends Record<string, any>,
	requestValue extends any,
	meta extends Record<string, any>
>(def: ProviderDef<path, value, options, requestValue, meta>): Provider<path, value, options, requestValue, meta> {

	if (!def.requestValue && !def.value) {
		throw new Error(`Invalid state in provider-${def.path}, must provide value or requestValue`)
	}

	const config = def.config?.(Zod).parse(def?.config)

	const provider = fp(async (f: FastifyInstance, opts: options) => {
		const instance: any = await def.value?.bind(f)(opts)
		f._provider[def.path] = instance
		f._config.set(def.path, config)
	}, {
		name: `provider-${def.path}`,
		dependencies: ['fastify-provider']
	})

	const requestProvider = (meta: meta) => async function (req: FastifyRequest, rep: FastifyReply) {
		if (def.requestValue) {
			const requestValue = await def.requestValue?.(req, rep, {config, meta})
			req._provider[def.path] = requestValue
		}
	}

	return [provider, requestProvider];
}

export const provider = fp(async (f: FastifyInstance) => {
	f.decorate('_provider', {})
	f.decorate('_config', new Map())
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
		_config: Map<string, any>
	}

	interface FastifyRequest {
		_provider: Record<string, any>
	}
}

export type AnyProviderDef = ProviderDef<any, any, any, any, any>

export class ProviderBuilder<
	path extends string,
	value extends any,
	config extends Record<string, any>,
	requestValue extends any = undefined,
	meta extends Record<string, any> = {}
> {
	private name: path

	private configFactory: AnyProviderDef['config']
	private metaFactory: AnyProviderDef['meta']
	private valueFactory: AnyProviderDef['value']
	private requestValueFactory: AnyProviderDef['requestValue']

	constructor(name: path) {
		this.name = name
	}

	static new<T extends string>(name: T) {
		return new ProviderBuilder<T, any, any, any, any>(name)
	}

	config<T extends Record<string, any>>(configFactory: Required<ProviderDef<path, value, T, requestValue, meta>>['config']) {
		this.configFactory = configFactory
		
		return this as unknown as Omit<ProviderBuilder<path, value, T, requestValue, meta>, 'config'>
	}

	meta<T extends Record<string, any>>(metaFactory: Required<ProviderDef<path, value, config, requestValue, T>>['meta']) {
		this.metaFactory = metaFactory
		return this as unknown as Omit<ProviderBuilder<path, value, config, requestValue, T>, 'meta'>
	}

	value<T>(valueFactory: Required<ProviderDef<path, T, config, requestValue, meta>>['value']) {
		this.valueFactory = valueFactory
		return this as unknown as Omit<ProviderBuilder<path, T, config, requestValue, meta>, 'value' | 'config'>
	}

	requestValue<T>(requestValueFactory: Required<ProviderDef<path, value, config, T, meta>>['requestValue']) {
		this.requestValueFactory = requestValueFactory
		return this as unknown as Omit<ProviderBuilder<path, value, config, T, meta>, 'requestValue' | 'meta'>
	}

	build(): Provider<path, value, config, requestValue, meta> {
		const provider = createProvider<path, value, config, requestValue, meta>({
			path: this.name,
			config: this.configFactory,
			meta: this.metaFactory,
			value: this.valueFactory,
			requestValue: this.requestValueFactory
		})

		return provider
	}
}