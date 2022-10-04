import fp from "fastify-plugin";

export type TimeoutConfig = {
	timeout?: number
}

export default fp(async (f, config?: TimeoutConfig) => {
	const logger = f.log.child({ name: 'timeout-setter'})

	logger.info({ config }, 'setting up timeout plugin')

	f.decorateRequest('_timeout', () => Object.create(null))

	f.addHook('onRequest', async function timeOutSetter(req, rep) {
		if (req.ws) return

		const timeout = setTimeout(() => {
			!rep.sent && rep.requestTimeout()
		}, config?.timeout || 5000)

		req._timeout = timeout
	})

	f.addHook('onSend', async function timeoutCleaner (req, rep, payload) {
		if (req._timeout)
			req.log.debug( "Clearing timeout")
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