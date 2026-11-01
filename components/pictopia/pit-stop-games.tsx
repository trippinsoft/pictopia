import { useEffect, useRef, useState } from "react";
import { Pressable, View } from "react-native";
import { Button, Text } from "./ui";
import { MediaImage, type MediaSettled } from "./media-image";
import { type GuessRound, type OrderRound } from "@/lib/pictopia/pitstops";
import type { Media } from "@/lib/pictopia/types";

export interface GameResult { correct: number; total: number; skipped: number; ids: string[]; moves?: number }
export type Question = { kind: "year"; round: GuessRound } | { kind: "order"; round: OrderRound };

export function PhotoQuiz({ questions, photos, onFinish }: { questions: Question[]; photos: Media[]; onFinish: (result: GameResult) => void }) {
  const [index, setIndex] = useState(0);
  const result = useRef<GameResult>({ correct: 0, total: 0, skipped: 0, ids: [] });
  const question = questions[index];
  function next(correct: boolean | undefined, ids: string[]) {
    const r = result.current;
    result.current = { correct: r.correct + (correct ? 1 : 0), total: r.total + (correct === undefined ? 0 : 1), skipped: r.skipped + (correct === undefined ? 1 : 0), ids: [...new Set([...r.ids, ...ids])] };
    if (index + 1 === questions.length) onFinish(result.current);
    else setIndex(index + 1);
  }
  return <View>
    <Progress current={index + 1} total={questions.length} />
    <QuizRound key={index} question={question} photos={photos} onNext={next} last={index + 1 === questions.length} />
  </View>;
}
function QuizRound({ question, photos, onNext, last }: { question: Question; photos: Media[]; onNext: (correct: boolean | undefined, ids: string[]) => void; last: boolean }) {
  const [states, setStates] = useState<Record<string, MediaSettled>>({});
  const [selected, setSelected] = useState<string | number>();
  const [timedOut, setTimedOut] = useState(false);
  const advancing = useRef(false);
  const ids = question.kind === "year" ? [question.round.id] : question.round.ids;
  const answer = question.round.answer;
  const ready = ids.every(id => states[id] === "loaded");
  const failed = ids.some(id => states[id] === "failed") || (timedOut && !ready);
  const answered = selected !== undefined;
  useEffect(() => { const timer = setTimeout(() => setTimedOut(true), 12000); return () => clearTimeout(timer); }, []);
  const options: (string | number)[] = question.kind === "year" ? question.round.options : question.round.ids;
  function next() {
    if (advancing.current) return;
    advancing.current = true;
    onNext(answered ? selected === answer : undefined, ids.filter(id => states[id] === "loaded"));
  }
  return <View>
    <View className={`mt-5 gap-3 ${question.kind === "order" ? "flex-row" : ""}`}>
      {/* Only side-by-side photos share a row; a single photo in a scrolling column must keep
          its own height, or it collapses and draws over the question and answers. */}
      {ids.map((id, index) => <View key={id} className={question.kind === "order" ? "flex-1" : undefined}>
        <View className={`overflow-hidden rounded-2xl bg-secondary ${question.kind === "year" ? "h-72" : "h-52"}`}>
          <MediaImage media={photos.find(photo => photo.id === id)} className="h-full w-full" fit="contain" showLoading onSettled={state => setStates(old => ({ ...old, [id]: state }))} />
        </View>
        {question.kind === "order" && <Text className="mt-2 text-center text-h6 text-muted-foreground">{index === 0 ? "A" : "B"}</Text>}
      </View>)}
    </View>
    <Text accessibilityRole="header" className="mb-5 mt-6 text-center text-h2 text-foreground">{question.kind === "year" ? "Which year was this taken?" : "Which came first?"}</Text>
    <View className="flex-row flex-wrap justify-between gap-y-3">
      {options.map((option, index) => <Pressable key={option} accessibilityRole="button" accessibilityState={{ disabled: !ready || answered, selected: selected === option }}
        disabled={!ready || answered} onPress={() => setSelected(old => old ?? option)}
        className={`min-h-14 min-w-0 w-[48%] items-center justify-center rounded-2xl border px-3 py-3 ${answered && option === answer ? "border-primary bg-primary" : selected === option ? "border-destructive bg-secondary" : "border-transparent bg-secondary"}`}>
        <Text className={`text-button ${answered && option === answer ? "text-primary-foreground" : "text-foreground"}`}>{question.kind === "year" ? String(option) : `Photo ${index === 0 ? "A" : "B"}`}</Text>
      </Pressable>)}
    </View>
    <View className="mt-5 gap-4">
      {answered && <Text accessibilityLiveRegion="polite" className="text-center text-body text-muted-foreground">{selected === answer ? "That’s right." : question.kind === "year" ? `This one was taken in ${answer}.` : `Photo ${answer === ids[0] ? "A" : "B"} came first.`}{question.kind === "order" ? ` ${ids.map((id, i) => `${i === 0 ? "A" : "B"}: ${new Date(photos.find(photo => photo.id === id)!.created).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}`).join(" · ")}` : ""}</Text>}
      {!answered && failed && <Text accessibilityLiveRegion="polite" className="text-center text-body text-muted-foreground">This photo couldn’t load. Skip this round; it won’t count toward your score.</Text>}
      {answered ? <Button onPress={next}>{last ? "See how you did" : "Next photo"}</Button> : failed ? <Button secondary onPress={next}>Skip round</Button> : !ready ? <Text className="text-center text-caption text-muted-foreground">Loading your photo…</Text> : null}
    </View>
  </View>;
}
function Progress({ current, total, label }: { current: number; total: number; label?: string }) {
  return <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: total, now: current }}>
    <Text className="mb-3 text-center text-h6 text-foreground">{current} of {total}{label ? ` ${label}` : ""}</Text>
    <View className="h-1 overflow-hidden rounded-full bg-secondary"><View className="h-1 rounded-full bg-primary" style={{ width: `${total ? current / total * 100 : 0}%` }} /></View>
  </View>;
}
