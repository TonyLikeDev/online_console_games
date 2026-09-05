import { redirect } from "next/navigation";
import { isValidRoomCode, normalizeRoomCode } from "@/lib/room-code";
import { GameIdSchema } from "@/lib/protocol";
import { ScreenView } from "@/components/screen/screen-view";

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export default async function ScreenPage(props: PageProps<"/screen/[code]">) {
  const { code: raw } = await props.params;
  const search = await props.searchParams;
  const code = normalizeRoomCode(raw);
  if (!isValidRoomCode(code)) redirect("/screen/new");
  const solo = search.solo === "1" || search.solo === "true";
  const lapsRaw = Number(first(search.laps));
  const laps = Number.isInteger(lapsRaw) && lapsRaw >= 1 && lapsRaw <= 10 ? lapsRaw : undefined;
  const gameParsed = GameIdSchema.safeParse(first(search.game));
  const game = gameParsed.success ? gameParsed.data : undefined;
  return <ScreenView code={code} solo={solo} laps={laps} game={game} />;
}
