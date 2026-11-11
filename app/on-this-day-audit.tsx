import { useState, type ReactNode } from "react";
import { Pressable, Share, TextInput, View } from "react-native";
import { Button, Page, Text } from "@/components/pictopia/ui";
import { usePictopia } from "@/components/pictopia/provider";
import { onThisDayAuditService } from "@/services/on-this-day-audit";
import { formatAudit, type AuditItem, type OnThisDayAudit as Audit } from "@/lib/pictopia/on-this-day-audit";
import { addDays, localDate } from "@/lib/pictopia/daily";
import { plural } from "@/lib/pictopia/text";

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));
const when = (t: number) => (typeof t === "number" && t > 0 ? new Date(t).toLocaleString() : "no date");

/** Developer-only: traces one On This Day date from the live library through Pictopia's index,
 * every eligibility step and the saved review, so a count that differs from another app has a
 * named reason. Reads identifiers and capture times only; never pictures, marks or deletions. */
export default function OnThisDayAudit() {
  const app = usePictopia();
  const today = localDate(Date.now());
  const [date, setDate] = useState(today);
  const [custom, setCustom] = useState("");
  const [audit, setAudit] = useState<Audit>();
  const [error, setError] = useState<string>();
  const [running, setRunning] = useState(false);
  const dates = Array.from({ length: 8 }, (_, i) => addDays(today, -i));
  async function run(target: string) {
    setRunning(true); setError(undefined); setAudit(undefined);
    try { setAudit(await onThisDayAuditService.run(target)); }
    catch (e) { setError(errorText(e)); }
    finally { setRunning(false); }
  }
  const customDate = /^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(custom) ? `${today.slice(0, 4)}-${custom}` : undefined;
  return (
    <Page fallback="/adventure-lab" title="On This Day audit" subtitle="Developer only. Everything stays on this phone; the report lists photo identifiers and capture times, never pictures.">
      <View className="flex-row flex-wrap gap-2">
        {dates.map((d, i) => (
          <Pressable key={d} accessibilityRole="button" onPress={() => setDate(d)} className={`rounded-full px-3 py-2 ${date === d ? "bg-primary" : "bg-card"} active:opacity-70`}>
            <Text className={`text-caption ${date === d ? "text-primary-foreground" : "text-foreground"}`}>{i === 0 ? "Today" : d.slice(5)}</Text>
          </Pressable>
        ))}
      </View>
      <View className="mt-3 flex-row items-center gap-2">
        <TextInput
          value={custom}
          onChangeText={setCustom}
          placeholder="Any day, MM-DD"
          autoCapitalize="none"
          autoCorrect={false}
          className="flex-1 rounded-2xl bg-card px-4 py-3 text-body text-foreground"
        />
        <Button secondary disabled={!customDate} onPress={() => { if (customDate) setDate(customDate); }}>Use</Button>
      </View>
      <View className="mt-4 gap-3">
        <Button disabled={running || !app.ready} onPress={() => void run(date)}>{running ? "Auditing…" : `Audit ${date === today ? "today" : date}`}</Button>
        {!!audit && <Button secondary onPress={() => void Share.share({ message: formatAudit(audit) })}>Share report</Button>}
      </View>
      {!!error && <Text className="mt-4 text-body text-destructive">{error}</Text>}
      {!!audit && (
        <View className="mt-6 gap-3">
          {audit.library ? <Card title="Complete library reconciliation">
            <Line>{`${audit.library.indexed.total} indexed: ${audit.library.indexed.photos} photos + ${audit.library.indexed.videos} videos. ${audit.library.indexed.screenshots} screenshots, ${audit.library.indexed.livePhotos} Live Photos (subsets); ${audit.library.indexed.undated} undated.`}</Line>
            <Line>{`Index status: ${audit.library.sync?.status ?? "not recorded on this build"}; discovered ${audit.library.sync?.discovered ?? "unknown"}, unique indexed ${audit.library.sync?.uniqueIndexed ?? "unknown"}.`}</Line>
            {audit.library.native ? <>
              <Line>{`PhotoKit: ${audit.library.native.total} = ${audit.library.native.photos} photos + ${audit.library.native.videos} videos + ${audit.library.native.other} other. ${audit.library.native.screenshots} screenshots; ${audit.library.native.livePhotos} Live Photos; ${audit.library.native.undated} undated. Production enumeration: ${audit.library.native.enumerable}.`}</Line>
              <Line>{`Outside enumeration by primary reason (counted once): ${JSON.stringify(audit.library.native.excluded)}`}</Line>
              <Items label="Enumerable but not indexed" items={audit.library.native.notIndexed} />
              <Items label="Outside production enumeration" items={audit.library.native.outsideEnumeration} />
              <Items label="Stale index rows" items={audit.library.native.stale} />
            </> : <Line>A new native build is needed for full-library reconciliation.</Line>}
            <Line>Cloud residency is unknown. Counting metadata does not download originals or prove playback.</Line>
          </Card> : null}
          <Card title={`Indexed on ${audit.day}`} ok={audit.reconciles}>
            <Line>{`${audit.onDate.total} rows: ${plural(audit.onDate.photos, "photo")}, ${plural(audit.onDate.videos, "video")}; ${audit.onDate.active} active; ${audit.onDate.withDates} with valid capture dates`}</Line>
            <Line>{`Whole index: ${audit.indexed.active} active (${audit.indexed.photos} photos, ${audit.indexed.videos} videos); ${audit.indexed.undated} without a capture date`}</Line>
            <Line>{audit.reconciles ? "Every row on this date is accounted for below." : "Some rows are not accounted for; see notes."}</Line>
          </Card>
          {audit.census ? (
            <Card title={`Live library on ${audit.day}`} ok={!audit.census.notIndexed.length && !audit.census.beyondReach.length}>
              <Line>{`${audit.census.onDate} assets (${audit.census.photos} photos, ${audit.census.videos} videos; ${audit.census.screenshots} screenshots, ${audit.census.livePhotos} Live Photos as subsets) on this date out of ${audit.census.total} (${audit.census.scope === "full" ? "all sources, hidden and bursts included" : "read with the same rules as sync"}); ${audit.census.undated} undated`}</Line>
              <Items label="Beyond Pictopia’s reach" items={audit.census.beyondReach} />
              <Items label="Not indexed (sync incomplete or stale)" items={audit.census.notIndexed} />
              <Items label="Indexed but not in the live library on this date" items={audit.census.notInLibrary} />
              <Items label="Calendar day differs in the current time zone" items={audit.census.dayMismatch} />
            </Card>
          ) : (
            <Card title="Live library"><Line>Not read on this platform or build.</Line></Card>
          )}
          {audit.steps.map(s => (
            <Card key={s.key} title={`− ${s.count} · ${s.label}`} muted={!s.count}>
              <Line>{s.purpose}</Line>
              <Items label="Removed" items={s.items} />
            </Card>
          ))}
          <Card title={`Eligible: ${audit.eligible.length}`} ok>
            <Line>{`Displayable after the library lookup: ${audit.displayable}`}</Line>
            <Items label="Photos" items={audit.eligible} />
          </Card>
          <Card title={audit.review ? `Saved review: ${audit.review.count}` : "No saved review for this date"} ok={audit.review ? audit.review.count === audit.eligible.length : undefined}>
            {audit.review ? <Line>{`${audit.review.feed} in the feed; ${audit.review.encountered} encountered; ${audit.review.unavailable} flagged unavailable. Encounters are saved evidence, not a playback test.`}</Line> : <Line>Open this date from Explore to create one, then audit again.</Line>}
            {audit.review ? <Items label="Eligible now but not in the review" items={audit.review.missing} /> : null}
            {audit.review?.extra.length ? <Line>{`In the review but no longer eligible: ${audit.review.extra.join(", ")}`}</Line> : null}
          </Card>
          <Card title="Notes">
            {audit.notes.map((n, i) => <Line key={i}>{`• ${n}`}</Line>)}
          </Card>
        </View>
      )}
    </Page>
  );
}
function Card({ title, ok, muted, children }: { title: string; ok?: boolean; muted?: boolean; children: ReactNode }) {
  return (
    <View className={`rounded-xl bg-card p-3 ${muted ? "opacity-60" : ""}`}>
      <Text className={`text-h6 ${ok === false ? "text-destructive" : "text-foreground"}`}>{`${ok === false ? "✗ " : ok ? "✓ " : ""}${title}`}</Text>
      <View className="mt-1 gap-1">{children}</View>
    </View>
  );
}
function Line({ children }: { children: string }) {
  return <Text className="text-caption leading-5 text-muted-foreground">{children}</Text>;
}
function Items({ label, items }: { label: string; items: AuditItem[] }) {
  const [open, setOpen] = useState(false);
  if (!items.length) return null;
  return (
    <View>
      <Pressable accessibilityRole="button" onPress={() => setOpen(o => !o)} className="active:opacity-70">
        <Text className="text-caption text-primary">{`${label}: ${items.length} ${open ? "(hide)" : "(show)"}`}</Text>
      </Pressable>
      {open ? items.slice(0, 80).map(i => (
        <Text key={i.id} className="text-caption leading-5 text-muted-foreground">{`${i.id} · ${when(i.created)} · ${i.type}${i.note ? ` · ${i.note}` : ""}`}</Text>
      )) : null}
      {open && items.length > 80 ? <Line>{`… ${items.length - 80} more in the shared report`}</Line> : null}
    </View>
  );
}
