import * as openTelemetry from "@opentelemetry/sdk-node"

import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node"

import { ZipkinExporter } from "@opentelemetry/exporter-zipkin"

// Add your zipkin url (`http://localhost:9411/api/v2/spans` is used as
// default) and application name to the Zipkin options.
// You can also define your custom headers which will be added automatically.
const options = {
  headers: {
    'my-header': 'header-value',
  },
  // optional interceptor
  getExportRequestHeaders: () => {
    return {
      'my-header': 'header-value',
    }
  }
}

const zipkinExporter = new ZipkinExporter(options);

const sdk = new openTelemetry.NodeSDK({
	spanProcessor: new openTelemetry.tracing.BatchSpanProcessor(zipkinExporter),
	traceExporter: new openTelemetry.tracing.ConsoleSpanExporter(),
	instrumentations: [
		getNodeAutoInstrumentations({
			"@opentelemetry/instrumentation-pino": {},
			"@opentelemetry/instrumentation-http": {},
			"@opentelemetry/instrumentation-fastify": {},
		}), 
	]
})

sdk.start()