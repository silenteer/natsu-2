const withTM = require('next-transpile-modules')([
	'basic',
	'@silenteer/natsu-port-2',
	'@silenteer/natsu-react-2'
])

/** @type {import('next').NextConfig} */
const nextConfig = {}

module.exports = withTM(nextConfig)