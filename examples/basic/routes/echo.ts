import { RouteBuilder } from "@silenteer/natsu-2";

import configProvider from "../providers/config.provider";

export default RouteBuilder
  .new("api.config")
  .depends(configProvider)
  .handle(async function(data, injection) {
    return {
      code: 'OK',
      body: injection.config.config
    }
  })
  .build()