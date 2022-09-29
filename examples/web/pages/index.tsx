import { useQuery } from "../natsu/browser"

export default function Home() {
	const data = useQuery("math.plus", {left: "1", right: "2"})
	return <>
		<div>{JSON.stringify(data?.data)}</div>
	</>
}