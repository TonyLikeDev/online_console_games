import { redirect } from "next/navigation";
import { isValidRoomCode, normalizeRoomCode } from "@/lib/room-code";
import { PlayView } from "@/components/controller/play-view";

export default async function PlayPage(props: PageProps<"/play/[code]">) {
  const { code: raw } = await props.params;
  const code = normalizeRoomCode(raw);
  if (!isValidRoomCode(code)) redirect("/");
  return <PlayView code={code} />;
}
