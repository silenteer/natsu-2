import { useQuery, useSubscribe } from "../natsu/browser"

export default function Home() {
	const data = useQuery("math.plus", {left: "1", right: "2"})
	useSubscribe('test', async (response) => {
		console.log(response)
	})
	return <>
		<div>{JSON.stringify(data?.data)}</div>
		<div></div>
	</>
}