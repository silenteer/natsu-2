import { RouteOptions } from "fastify";
import fp from "fastify-plugin";

export type TimeoutConfig = {
	timeout?: number
}

const defaultTimeoutConfig = {
	timeout: 5000
}

export default fp(async (f, config: TimeoutConfig = defaultTimeoutConfig) => {
	config = {...defaultTimeoutConfig, ...config}
	const timeoutCache = new WeakMap()
	const wsRoutes: RouteOptions[] = []
	const logger = f.log.child({ name: 'timeout-setter'})

	logger.info({ timeout: config.timeout }, 'setting up timeout plugin')

	f.addHook('onRoute', (routeOpts) => {
		if (routeOpts.websocket) {
			wsRoutes.push(routeOpts)
			logger.debug({ routeOpts }, 'ignoring route from setting timeout')
		}
	})

	f.addHook('onRequest', async function timeOutSetter(req, rep) {
		logger.debug({ req: req, wsRoutes }, 'checking ignore list')

		if (wsRoutes.findIndex(item => 
			item.url === req.url &&
			item.method === req.method
		) !== -1) {
			logger.debug({req}, "Ignoring")
			return
		}

		const timeout = setTimeout(() => {
			rep
				.code(504)
				.send({errors: 'Timed out'})
		}, config.timeout)

		req.log.debug({ duration: config.timeout }, "Setting timeout")
		timeoutCache.set(req, timeout)
	})

	f.addHook('onSend', async function timeoutCleaner (req, rep, payload) {
		if (timeoutCache.get(req))
			req.log.debug( "Clearing timeout")
			clearTimeout(timeoutCache.get(req))
		
	})
}, {
	name: 'fastify-timeout'
})