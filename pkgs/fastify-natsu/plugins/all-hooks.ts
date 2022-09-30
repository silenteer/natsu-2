import fp from "fastify-plugin"

export default fp(async function(fastify) {
	const logger = fastify.log.child({ name: 'all-hooks' })

	fastify.addHook('onRequest', async function allHooksOnRequest(req) {
		logger.debug({ req }, 'onRequest called')
	})

	fastify.addHook('preParsing', async function allHooksPreParsing(req, rep, payload) {
		logger.debug({ id: req.id }, 'preParsing called')
	})
	
	fastify.addHook('preValidation', async function allHooksPreValidation (req, rep) {
		logger.debug({ id: req.id, body: req.body }, 'preValidation called')
	})

	fastify.addHook('preHandler', async function allHooksPreHandler (req, rep) {
		logger.debug({ id: req.id, body: req.body }, 'preHandler called')
	})

	fastify.addHook('preSerialization', async function allHooksPreSerialization (req, rep, payload) {
		if (req.routerPath !== '/_routes')
		logger.debug({ id: req.id, payload }, 'preHandler called')
	})

	fastify.addHook('onError', async function allHooksOnError (req, rep, error) {
		logger.debug({ id: req.id, error }, 'onError called')
	})

	fastify.addHook('onSend', async function allHooksOnSend (req, rep, payload) {
		if (req.routerPath !== '/_routes')
		logger.debug({ id: req.id, payload }, 'onSend called')
	})

	fastify.addHook('onResponse', async function allHooksOnResponse (req, rep) {
		logger.debug({ id: req.id }, 'onResponse called')
	})

	fastify.addHook('onTimeout', async function allHooksOnTimeout (req, rep) {
		logger.debug({ id: req.id }, 'onTimeout called')
	})

	fastify.get('/_routes', async (req, rep) => {
		rep.send(fastify.printRoutes({ includeHooks: true }))
	})
})