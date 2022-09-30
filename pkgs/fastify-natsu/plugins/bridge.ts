/**
 * This is a plugin to expose a client call without any serialization
 */
import fp from "fastify-plugin"
import { request } from "urllib"
import { getAddress } from "../utils"

type BridgeOpts = {}

export const BRIDGE_ID = 'bridge-id'
export const BRIDGE_HANDLER = 'nats'

export default fp(async function (f, opts: BridgeOpts) {

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
		
		req.log.debug('bridge prep')
		const bridger = bridge.get(keyCache.get(bridgeId) as any)
		if (!bridger) {
			rep.code(404)
				.send({ errors: `BRIDGE_ID: ${bridgeId} not found` })
			return rep;
		}

		const data = bridger.data
		if (data?.headers || data?.body) {
			Object.assign(req.headers, data?.headers)
			req.body = data?.body
		} else {
			req.body = bridger.data
		}

		req.log.info({ headers: req.headers, body: req.body }, 'bridge information')
	})

	// register onSend to skip sending back to client, only sending out code 200
	f.addHook('preSerialization', async function preSerialization (req, rep, payload) {
		const bridgeId = req.headers[BRIDGE_ID] as string
		if (keyCache.has(bridgeId)) {
			req.log.info({payload}, 'bridge steal sending')
			const key = keyCache.get(bridgeId) as {id: string}

			bridge.set(key, payload);

			// replace payload with null
			return null
		}
		return payload
	})

	f.addHook('onReady', async function () {
		f.bridge = async (path, input) => {
			
			const address = getAddress(f.server.address());
			const nextId = `bridge-${++id}`;

			const op = { id: nextId };
			bridge.set(op, input)
			keyCache.set(nextId, op)

			const result = await request(`${address}/${path}`, {
					headers: {
						[BRIDGE_ID]: nextId
					}
				})
				.then(() => {
					return bridge.get(op)
				})
				.finally(async () => {
					bridge.delete(op)
					keyCache.delete(nextId)
				})

			return result;
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