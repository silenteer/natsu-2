import { RouteBuilder, ProviderBuilder, Router } from '../'

const provider1 = ProviderBuilder
	.new('test')
	.config((z) => z.object({ testConfig: z.string().optional() }))
	.meta(z => z.object({ testMeta: z.boolean() }))
	.value(async (config) => {
		return `xyz ${config?.testConfig}`
	})
	.build();

const provider2 = ProviderBuilder
	.new('test2')
	.config((z) => z.object({ testConfig: z.string() }))
	.meta(z => z.object({ testMeta: z.boolean() }))
	.value(async (config) => {
		return `xyz ${config?.testConfig}`
	})
	.build();

const provider3 = ProviderBuilder
	.new('test3')
	.config((z) => z.object({ testConfig: z.string() }))
	.meta(z => z.object({ testMeta: z.boolean() }))
	.value(async (config) => {
		return `xyz ${config?.testConfig}`
	})
	.build();

const route = RouteBuilder
	.new('math.plus')
	.depends(provider1, { testMeta: false } )
	.depends(provider2, { testMeta: false } )
	.handle(async (data, injection) => {
		const testValue = injection.test
		const testValue2 = injection.test2
		return {
			code: 'OK'
		}
	})
	.build()

const router = new Router()
	.use(provider1, {})
	.use(provider2, { testConfig: 'test' })
	.use(provider3, { testConfig: 'test' })
	.route(route)
	// .start()
