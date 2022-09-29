import { NatsuProvider } from "../natsu/browser"

export default function App({ Component, pageProps }) {
	return <>
		<NatsuProvider>
			<Component {...pageProps} />
		</NatsuProvider>
	</>
}