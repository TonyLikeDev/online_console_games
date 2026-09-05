import { redirect } from "next/navigation";
import { isValidRoomCode, normalizeRoomCode } from "@/lib/room-code";
import { ScreenView } from "@/components/screen/screen-view";

export default async function ScreenPage(props: PageProps<"/screen/[code]">) {
  const { code: raw } = await props.params;
  const search = await props.searchParams;
  const code = normalizeRoomCode(raw);
  if (!isValidRoomCode(code)) redirect("/screen/new");
  const solo = search.solo === "1" || search.solo === "true";
  const lapsRaw = Number(Array.isArray(search.laps) ? search.laps[0] : search.laps);
  const laps = Number.isInteger(lapsRaw) && lapsRaw >= 1 && lapsRaw <= 10 ? lapsRaw : undefined;
  return <ScreenView code={code} solo={solo} laps={laps} />;
}
