import fp from "fastify-plugin";

export type TimeoutConfig = {
	timeout: number
}

const defaultTimeoutConfig = {
	timeout: 5000
}

export default fp(async (f, config: TimeoutConfig = defaultTimeoutConfig) => {
	f.decorateRequest('_timeout', () => Object.create(null))
	f.addHook('preValidation', async (req, rep) => {
		req._timeout = setTimeout(() => {
			rep
				.code(504)
				.send('Timed out')
		}, config.timeout)
	})
	f.addHook('onSend', async (req, rep) => {
		clearTimeout(req._timeout)
	})
}, {
	name: 'fastify-timeout'
})

declare module 'fastify' {
	interface FastifyRequest {
		_timeout: NodeJS.Timeout
	}
}