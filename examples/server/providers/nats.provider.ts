import { createProvider } from "@silenteer/natsu-2";

export default createProvider({
	name: 'nats-provider',
	path: 'nats',
	async value() {
		return 'string'
	}
})