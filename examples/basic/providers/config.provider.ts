import { ProviderBuilder } from "@silenteer/natsu-2";

export default ProviderBuilder
	.new("config")
	.value(async () => {
		return { config: "value" }
	})
	.build()