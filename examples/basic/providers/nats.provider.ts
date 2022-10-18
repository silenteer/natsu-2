import { createProvider, createRoute } from "@silenteer/natsu-2";

const provider = createProvider({
	path: 'nats',
	config(z) {
		return z.object({
			test: z.string()
		})
	},
	
	async value(config) {
		return 'string'
	},

	meta(z) {
		return z.object({
			other: z.string()
		})
	},

	async requestValue(req, rep, config) {
		return 'hello'
	},
})

export default provider
