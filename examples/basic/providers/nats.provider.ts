import { createProvider } from "@silenteer/natsu-2";

export default createProvider({
	path: 'nats',
	async value() {
		return 'string'
	}
})