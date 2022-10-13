/**
 * This is a plugin to expose a client call without any serialization
 */
import fp from "fastify-plugin"
import { request } from "urllib"
import { getAddress } from "../utils"

type BridgeOpts = {}

export const BRIDGE_ID = 'bridge-id'
export const BRIDGE_HANDLER = 'nats'

function normalizeHeaders(headers: any) {
	const normalizedHeaders = {}
	if (!headers) return normalizedHeaders

	Object.keys(headers).forEach(header => {
		const headerValue = headers[header]

		if (typeof headerValue === 'string') {
			normalizedHeaders[header] = headerValue
		} else if (Array.isArray(headerValue)) {
			if (headerValue.length === 1) {
				normalizedHeaders[header] = headerValue[0]
			} else {
				normalizedHeaders[header] = headerValue
			}
		} else {
			throw new Error(`detected an abnormal header value ${header} - ${headerValue}`)
		}
	})
	
	return normalizedHeaders
}

export default fp(async function (f, opts: BridgeOpts) {
	const logger = f.log.child({ name: 'bridge'})
	// decorate
	f.decorate('bridge', Object.create(null));

	const bridge = new WeakMap<{id: string}, any>();
	let id = 0;
	const keyCache = new Map<string, {id: string}>()

	// register preValidate to inject the body in
	f.addHook('preValidation', async function bridgePreValidation (req, rep) {
		// skip if body is not empty
		if (req.body) return

		const bridgeId = req.headers[BRIDGE_ID]
		// skip if there's no special header
		if (!bridgeId) return

		if (Array.isArray(bridgeId)) {
			rep.code(400)
				.send({ errors: `${BRIDGE_ID} header must be a string, received array` })
			return rep;
		}

		if (!bridge.has(keyCache.get(bridgeId) as any)) {
			rep.code(404)
				.send({ errors: `BRIDGE_ID: ${bridgeId} not found` })
			return rep;
		}
		
		const bridger = bridge.get(keyCache.get(bridgeId) as any)
		if (!bridger) {
			rep.code(404)
				.send({ errors: `BRIDGE_ID: ${bridgeId} not found` })
			return rep;
		}

		req.body = bridger.data?.body
		req.headers = { ...normalizeHeaders(req.headers), ...normalizeHeaders(bridger.data?.headers)}
		req['bridged'] = keyCache.get(bridgeId)
		
		logger.info({ reqId: req.id, headers: req.headers, body: req.body }, 'bridge information')
	})

	// register onSend to skip sending back to client, only sending out code 200
	f.addHook('preSerialization', async function preSerialization (req, rep, payload) {
		if (req['bridged']) {
			const key = req['bridged'] as {id: string}
			
			if (payload?.['headers']) {
				payload['headers'] = normalizeHeaders(payload['headers'])
			}
			
			req.log.debug({ payload }, 'bridge steal sending')
			bridge.set(key, payload);

			// replace payload with null
			return null
		}
		
		return payload
	})

	f.addHook('onError', async function onError(req, rep, error) {
		if (req['bridged']) {
			req.log.error({ error }, 'caught an unexpected exception on a bridge route')
			bridge.set(req['bridged'], { code: 500, errors: error });
		}
	})

	f.addHook('onReady', async function () {
		f.bridge = async (path, input) => {
			
			const address = getAddress(f.server.address());
			const nextId = `bridge-${++id}`;

			const op = { id: nextId };

			logger.debug({ input }, "setting to bridge")
			bridge.set(op, input)
			keyCache.set(nextId, op)
			
			return await request(`${address}/${path}`, {
					headers: {
						[BRIDGE_ID]: nextId,
						reqId: input?.data?.headers?.['reqId'],
						'trace_id': input?.data?.headers?.['trace-id']
					}
				})
				.then(() => {
					logger.debug({ output: bridge.get(op) }, "setting result to bridge")
					return bridge.get(op)
				})
				.catch((error) => {
					logger.error({ error }, "caught an unhandled bridge exception")
					return bridge.get(op)
				})
				.finally(async () => {
					bridge.delete(op)
					keyCache.delete(nextId)
				})
		}
	})
}, {
	name: 'fastify-bridge'
})

type Bridger = {
	data: any
	payload?: any
}

declare module 'fastify' {
	interface FastifyInstance {
		bridge: <T = any>(path: string, input: Bridger) => Promise<T>
	}
}