import { AddressInfo } from "net"

export function getAddress(address: string | AddressInfo | null) {
	if (!address) {
		throw new Error("call the client on a yet started server")
	}

	let host: string
	let protocol: string = 'http://'
	let port: string = ''

	if (typeof address === 'string') {
		host = address
	} else {
		host = address.address
		port = `:${address.port}`
	}

	return `${protocol}${host}${port}`
}